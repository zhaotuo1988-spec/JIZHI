
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import FormData from 'form-data';
import OpenAI from 'openai'; 
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const isDevAuthEnabled = !isProduction || process.env.ENABLE_DEV_AUTH === 'true';
const bodyLimit = process.env.API_BODY_LIMIT || '25mb';
const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
    : (isProduction ? false : true);

// --- CRITICAL FOR DEPLOYMENT ---
// 信任 Nginx 反向代理传递的 X-Forwarded-For 头
app.set('trust proxy', 1); 

// 初始化 Supabase 客户端
const SUPABASE_URL = process.env.MEMFIRE_URL || process.env.VITE_MEMFIRE_URL;
const SUPABASE_ANON_KEY = process.env.MEMFIRE_ANON_KEY || process.env.VITE_MEMFIRE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("✅ Supabase/MemFire Client Initialized on Backend");
    } catch (e) {
        console.warn("⚠️ Failed to initialize Supabase client:", e.message);
    }
} else {
    console.warn("⚠️ Warning: MEMFIRE_URL/KEY not found in env. Auth middleware might fail unless using Dev Mode.");
}

// --------------------------------------------------------
// Feature: Rate Limiter
// --------------------------------------------------------
const requestCounts = new Map();

const rateLimiter = (req, res, next) => {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userId = req.user ? req.user.id : 'anonymous';
    const key = `${clientIp}:${userId}`;

    const now = Date.now();
    const WINDOW_MS = 60 * 1000; 
    const MAX_REQUESTS = 30;

    let record = requestCounts.get(key);
    if (!record || now - record.startTime > WINDOW_MS) {
        record = { startTime: now, count: 0 };
    }

    if (record.count >= MAX_REQUESTS) {
        console.warn(`⚠️ Rate Limit Exceeded for ${key}`);
        return res.status(429).json({ 
            error: "请求过于频繁，请稍后重试 (Rate limit exceeded)" 
        });
    }

    record.count += 1;
    requestCounts.set(key, record);
    
    if (requestCounts.size > 5000) {
        requestCounts.clear(); 
    }

    next();
};


// --------------------------------------------------------
// Middleware: Verify Auth Token
// --------------------------------------------------------
const verifyAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Missing Authorization Header" });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: "Invalid Authorization Format" });
    }

    if (token === 'dev-token') {
        if (!isDevAuthEnabled) {
            return res.status(401).json({ error: "Developer auth is disabled" });
        }
        req.user = { id: 'dev-user-id', email: 'dev@local.host' };
        req.isDevUser = true;
        return next();
    }

    if (!supabase) {
        console.error("Backend Auth Client Not Configured");
        return res.status(500).json({ error: "Backend Auth Client Not Configured" });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error("Auth Validation Failed:", error?.message);
            return res.status(401).json({ error: "Invalid or Expired Token" });
        }

        req.user = user;
        next();

    } catch (err) {
        console.error("Auth Middleware Error:", err);
        return res.status(500).json({ error: "Internal Auth Error" });
    }
};


app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: bodyLimit }));

// --------------------------------------------------------
// API Routes
// --------------------------------------------------------

// 1. Chat API (OpenAI Compatible Interface)
app.post('/api/chat', verifyAuth, rateLimiter, async (req, res) => {
  try {
    const { messages, model } = req.body;
    const apiKey = process.env.CHAT_API_KEY;
    const baseURL = process.env.CHAT_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
    const defaultModel = process.env.CHAT_MODEL || "qwen3.6-flash";
    const reportModel = process.env.CHAT_REPORT_MODEL || "qwen3.6-plus";
    const selectedModel = model === "report" ? reportModel : (model || defaultModel);

    if (!apiKey) {
      if (req.isDevUser) {
          return res.json({ content: "【开发者模式】后端未配置 CHAT_API_KEY，这是模拟回复。" });
      }
      return res.status(500).json({ error: "Server API Key not configured" });
    }

    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    });

    const completion = await client.chat.completions.create({
      model: selectedModel, 
      messages: messages,
      response_format: messages[0]?.content?.includes("JSON") ? { type: "json_object" } : undefined
    });

    const content = completion.choices[0].message.content;
    res.json({ content });

  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Transcribe API (DashScope Qwen ASR)
app.post('/api/transcribe', verifyAuth, rateLimiter, async (req, res) => {
  try {
    const { audioBase64 } = req.body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: "Missing audioBase64" });
    }

    const apiKey = process.env.CHAT_API_KEY || process.env.AUDIO_API_KEY || process.env.DASHSCOPE_API_KEY;

    if (!apiKey) {
      if (req.isDevUser) {
          return res.json({ text: "【开发者模式】模拟语音转写文本" });
      }
      return res.status(500).json({ error: "未配置 CHAT_API_KEY / AUDIO_API_KEY / DASHSCOPE_API_KEY" });
    }

    const serviceUrl = process.env.AUDIO_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const modelName = process.env.AUDIO_MODEL || "qwen3-asr-flash";
    const language = process.env.AUDIO_LANGUAGE || "zh";
    const enableItn = process.env.AUDIO_ENABLE_ITN === 'true';

    console.log(`[Transcribe] Sending to DashScope ASR: ${modelName}`);

    const response = await fetch(serviceUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_audio",
                            input_audio: {
                                data: audioBase64
                            }
                        }
                    ]
                }
            ],
            stream: false,
            asr_options: {
                language,
                enable_itn: enableItn
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("DashScope ASR API Error:", errorText);

        let errorMsg = `API Error ${response.status}`;
        try {
            const errJson = JSON.parse(errorText);
            if (errJson.error && errJson.error.message) {
                errorMsg = errJson.error.message;
            } else if (errJson.message) {
                errorMsg = errJson.message;
            } else if (errJson.error) {
                errorMsg = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
            }
        } catch(e) {
            if (errorText) errorMsg = errorText.slice(0, 300);
        }

        throw new Error(errorMsg);
    }

    const result = await response.json();
    console.log("[Transcribe] Success:", result);

    const text = result.choices?.[0]?.message?.content || result.output?.text || result.text || "";
    res.json({ text });

  } catch (error) {
    console.error("Transcribe Server Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Transcribe API (Exclusively SiliconFlow - FunAudioLLM/SenseVoiceSmall)
app.post('/api/transcribe-legacy-siliconflow', verifyAuth, rateLimiter, async (req, res) => {
  try {
    const { audioBase64 } = req.body;
    
    // 强制使用 AUDIO_API_KEY (硅基流动 Key)
    const apiKey = process.env.AUDIO_API_KEY;
    
    if (!apiKey) {
      if (req.isDevUser) {
          return res.json({ text: "【开发者模式】模拟语音转写文本。" });
      }
      // 明确提示用户需要配置 AUDIO_API_KEY
      return res.status(500).json({ error: "未配置 AUDIO_API_KEY (需要硅基流动 API Key)" });
    }

    // 1. Extract MIME type and filename
    let mimeType = 'audio/webm'; // default fallback
    let filename = 'audio.webm'; // default fallback
    
    // Robust MIME detection
    if (audioBase64.startsWith('data:')) {
        const matches = audioBase64.match(/^data:(.+);base64,/);
        if (matches && matches[1]) {
            mimeType = matches[1];
        }
    }

    // STRICT Mapping
    if (mimeType === 'audio/mp4') {
        filename = 'audio.mp4';
    } else if (mimeType === 'audio/x-m4a' || mimeType.includes('m4a')) {
        filename = 'audio.m4a';
    } else if (mimeType.includes('wav')) {
        filename = 'audio.wav';
    } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
        filename = 'audio.mp3';
    } else if (mimeType.includes('ogg') || mimeType.includes('opus')) {
        filename = 'audio.ogg';
    } else if (mimeType.includes('webm')) {
        filename = 'audio.webm';
    }

    // 2. Convert Base64 to Buffer
    const base64Data = audioBase64.replace(/^data:.+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 3. Construct FormData
    const formData = new FormData();
    formData.append('file', buffer, { 
        filename: filename, 
        contentType: mimeType,
        knownLength: buffer.length 
    });
    
    // 4. Configure SiliconFlow
    const serviceUrl = process.env.AUDIO_BASE_URL || "https://api.siliconflow.cn/v1/audio/transcriptions";
    // 指定您要求的模型
    const modelName = process.env.AUDIO_MODEL || "FunAudioLLM/SenseVoiceSmall"; 

    formData.append('model', modelName); 

    console.log(`[Transcribe] Sending to SiliconFlow: ${modelName}`);

    // 5. POST Request
    const response = await fetch(serviceUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            ...formData.getHeaders()
        },
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("SiliconFlow API Error:", errorText); 
        
        let errorMsg = `API Error ${response.status}`;
        try {
            const errJson = JSON.parse(errorText);
            if (errJson.error && errJson.error.message) {
                errorMsg = errJson.error.message;
            } else if (errJson.message) {
                errorMsg = errJson.message;
            }
        } catch(e) {}
        
        throw new Error(errorMsg);
    }

    const result = await response.json();
    console.log("[Transcribe] Success:", result);

    res.json({ text: result.text || "" });

  } catch (error) {
    console.error("Transcribe Server Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Weather API (Enhanced Error Logging)
app.post('/api/weather', verifyAuth, rateLimiter, async (req, res) => {
  try {
    const { lat, lon } = req.body;
    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey) {
      return res.json({ weatherStr: "（开发模式-无Key）", locationStr: "本地模拟位置" });
    }

    let adcode = "";
    let fullLocation = "";
    let amapError = null; // Store debug info

    // 1. Try Reverse Geocoding (if lat/lon provided)
    if (lat && lon) {
        const locationStr = `${Number(lon).toFixed(6)},${Number(lat).toFixed(6)}`;
        const regeoUrl = `https://restapi.amap.com/v3/geocode/regeo?location=${locationStr}&key=${apiKey}&extensions=base`;
        try {
            const regeoRes = await fetch(regeoUrl);
            const regeoData = await regeoRes.json();

            if (regeoData.status === "1") {
                const ac = regeoData.regeocode.addressComponent;
                adcode = ac.adcode;
                if (typeof ac.province === 'string') fullLocation += ac.province;
                if (typeof ac.city === 'string' && ac.city !== ac.province) fullLocation += ac.city;
                if (typeof ac.district === 'string') fullLocation += ac.district;
                if (typeof ac.township === 'string') fullLocation += " " + ac.township;
            } else {
                console.warn(`[Weather] Regeo API Failed: ${regeoData.info} (Code: ${regeoData.infocode})`);
                amapError = `Regeo Error: ${regeoData.info}`;
            }
        } catch (e) {
            console.error("[Weather] Regeo Network Failed:", e.message);
        }
    }

    // 2. Fallback to IP Geolocation
    if (!adcode) {
        let clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        if (typeof clientIp === 'string' && clientIp.includes(',')) {
            clientIp = clientIp.split(',')[0].trim();
        }
        if (clientIp === '::1') clientIp = '127.0.0.1'; 
        
        console.log(`[Weather] Using IP Location for: ${clientIp}`);

        let ipUrl = `https://restapi.amap.com/v3/ip?key=${apiKey}`;
        if (clientIp && clientIp !== '127.0.0.1') {
            ipUrl += `&ip=${clientIp}`;
        }

        try {
            const ipRes = await fetch(ipUrl);
            const ipData = await ipRes.json();

            if (ipData.status === "1") {
                adcode = ipData.adcode;
                fullLocation = `${ipData.province || ''} ${ipData.city || ''}`.trim();
            } else {
                console.warn(`[Weather] IP API Failed: ${ipData.info} (Code: ${ipData.infocode})`);
                if (!amapError) amapError = `IP Error: ${ipData.info}`;
            }
        } catch (e) {
            console.error("[Weather] IP Network Failed:", e.message);
        }
    }

    if (!adcode || typeof adcode !== 'string') {
         console.warn("[Weather] Failed to get adcode via Geo or IP.");
         // Return debug info to frontend if available
         return res.json({ 
             weatherStr: "天气：无法定位", 
             locationStr: "定位失败", 
             debug: amapError || "No ADCODE" 
         });
    }

    console.log(`[Weather] Fetching weather for ADCODE: ${adcode} (${fullLocation})`);

    // 3. Fetch Weather Data
    let weatherStr = "";
    
    // Strategy A: Forecast
    try {
        const forecastUrl = `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&key=${apiKey}&extensions=all`;
        const forecastRes = await fetch(forecastUrl);
        const forecastData = await forecastRes.json();

        if (forecastData.status === "1" && forecastData.forecasts?.length > 0) {
            const today = forecastData.forecasts[0].casts[0];
            weatherStr = `天气：${today.dayweather}  气温：${today.nighttemp}°C-${today.daytemp}°C  风向：${today.daywind}风  风力：${today.daypower}级`;
        } else if (forecastData.status !== "1") {
            console.warn(`[Weather] Forecast API Failed: ${forecastData.info} (Code: ${forecastData.infocode})`);
        }
    } catch (e) {
        console.warn("[Weather] Forecast Strategy Failed:", e.message);
    }

    // Strategy B: Live
    if (!weatherStr) {
        try {
            const liveUrl = `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&key=${apiKey}&extensions=base`;
            const liveRes = await fetch(liveUrl);
            const liveData = await liveRes.json();

            if (liveData.status === "1" && liveData.lives?.length > 0) {
                const live = liveData.lives[0];
                weatherStr = `天气：${live.weather}  实时气温：${live.temperature}°C  风向：${live.winddirection}风  风力：${live.windpower}级`;
            } else if (liveData.status !== "1") {
                console.warn(`[Weather] Live API Failed: ${liveData.info} (Code: ${liveData.infocode})`);
            }
        } catch (e) {
            console.error("[Weather] Live Strategy Failed:", e.message);
        }
    }

    if (weatherStr) {
        res.json({ weatherStr, locationStr: fullLocation });
    } else {
        res.json({ weatherStr: "天气：数据暂不可用", locationStr: fullLocation });
    }

  } catch (error) {
    console.error("Weather Server Error:", error);
    res.json({ weatherStr: "天气：获取失败", locationStr: "", debug: error.message });
  }
});

// --------------------------------------------------------
// API Route: Export supervisor log as a real DOCX template
// --------------------------------------------------------

const DOCX_TEMPLATE_PATH = path.join(__dirname, 'templates', 'supervisor-log-template.docx');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const xmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}[char]));

const readDocxEntries = (buffer) => {
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65558);
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Invalid DOCX: missing ZIP directory');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid DOCX: bad ZIP central directory');
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameBuffer = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const name = nameBuffer.toString((flags & 0x0800) ? 'utf8' : 'utf8');

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;

    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported DOCX compression method: ${method}`);
    }

    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const buildDocxBuffer = (entries) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
};

const paragraphXml = (text, options = {}) => {
  const font = options.font || '楷体_GB2312';
  const size = options.size || 21;
  const align = options.align || 'both';
  const preservedText = xmlEscape(text);
  const space = /^\s|\s$|\s{2,}/.test(String(text ?? '')) ? ' xml:space="preserve"' : '';

  return `<w:p><w:pPr><w:snapToGrid w:val="0"/><w:jc w:val="${align}"/><w:rPr><w:rFonts w:hint="eastAsia" w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:hint="eastAsia" w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t${space}>${preservedText}</w:t></w:r></w:p>`;
};

const sectionParagraphsXml = (title, text) => {
  const lines = String(text || '无特殊情况。')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  return [
    paragraphXml(title, { font: '宋体', align: 'both' }),
    ...lines.map(line => paragraphXml(line, { font: '楷体_GB2312', align: 'both' }))
  ].join('');
};

const replaceCellParagraphs = (cellXml, paragraphsXml) => {
  const tcPrMatch = cellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  return `<w:tc>${tcPrMatch ? tcPrMatch[0] : ''}${paragraphsXml}</w:tc>`;
};

const replaceCellAt = (rowXml, cellIndex, paragraphsXml) => {
  const cells = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
  if (!cells[cellIndex]) return rowXml;
  return rowXml.replace(cells[cellIndex], replaceCellParagraphs(cells[cellIndex], paragraphsXml));
};

const formatReportDate = (dateValue) => {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return String(dateValue || '');
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日      ${date.toLocaleDateString('zh-CN', { weekday: 'long' })}`;
};

const parseWeather = (weather) => {
  const text = String(weather || '');
  const matchValue = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  };

  return {
    condition: matchValue([/天气[:：]\s*([^\s]+)/, /weather[:：]\s*([^\s]+)/i]) || text,
    temperature: matchValue([/(?:气温|实时气温)[:：]\s*([^\s]+)/]),
    windDirection: matchValue([/风向[:：]\s*([^\s]+)/]),
    windPower: matchValue([/风力[:：]\s*([^\s]+)/])
  };
};

const fillSupervisorLogDocx = (payload) => {
  if (!fs.existsSync(DOCX_TEMPLATE_PATH)) throw new Error('DOCX template not found');

  const entries = readDocxEntries(fs.readFileSync(DOCX_TEMPLATE_PATH));
  const documentEntry = entries.find(entry => entry.name === 'word/document.xml');
  if (!documentEntry) throw new Error('DOCX template missing word/document.xml');

  const weather = parseWeather(payload.weather);
  const weatherText = `天气：${weather.condition || ' '}     气温：${weather.temperature || ' '}      风向：${weather.windDirection || ' '}          风力：${weather.windPower || ' '}`;

  const xml = documentEntry.data.toString('utf8');
  const tableMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  if (!tableMatch) throw new Error('DOCX template table not found');

  const tableXml = tableMatch[0];
  const rows = tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  if (rows.length < 5) throw new Error('DOCX template table has unexpected structure');

  const nextRows = [...rows];
  nextRows[0] = replaceCellAt(rows[0], 1, paragraphXml(formatReportDate(payload.date), { font: '楷体_GB2312', align: 'left' }));
  nextRows[1] = replaceCellAt(rows[1], 1, paragraphXml(weatherText, { font: '楷体_GB2312', align: 'left' }));
  nextRows[2] = replaceCellAt(rows[2], 0, sectionParagraphsXml('工程动态：', payload.engineering));
  nextRows[3] = replaceCellAt(rows[3], 0, sectionParagraphsXml('监理工作情况：', payload.supervisor));
  nextRows[4] = replaceCellAt(rows[4], 0, sectionParagraphsXml('安全监理工作情况：', payload.safety));

  let nextTableXml = tableXml;
  rows.forEach((row, index) => {
    nextTableXml = nextTableXml.replace(row, nextRows[index]);
  });

  const nextDocumentXml = xml.replace(tableXml, nextTableXml);
  const nextEntries = entries.map(entry => (
    entry.name === 'word/document.xml'
      ? { ...entry, data: Buffer.from(nextDocumentXml, 'utf8') }
      : entry
  ));

  return buildDocxBuffer(nextEntries);
};

app.post('/api/export/report-docx', verifyAuth, (req, res) => {
  try {
    const docxBuffer = fillSupervisorLogDocx(req.body || {});
    const filename = `监理日志_${req.body?.date || new Date().toISOString().slice(0, 10)}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(docxBuffer);
  } catch (error) {
    console.error('DOCX export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export DOCX' });
  }
});

// --------------------------------------------------------
// Static Files
// --------------------------------------------------------
app.use(express.static(path.join(__dirname, 'dist'), {
    maxAge: '1d',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --------------------------------------------------------
// Start Server
// --------------------------------------------------------
const DEFAULT_PORT = parseInt(process.env.PORT || '3000');

export const startServer = (port = DEFAULT_PORT) => {
  const server = app.listen(port, () => {
    console.log(`\n✅ 服务启动成功! (Server started successfully)`);
    console.log(`➜  Running on Port: ${port}`);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`\n⚠️  端口 ${port} 被占用，尝试端口 ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(e);
      process.exit(1);
    }
  });

  return server;
};

export { app };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer(DEFAULT_PORT);
}
