
import { Message, ReportSchemaResponse, Sender } from '../types';
import { supabase, isDevMode } from './storageService'; // Updated Import

// ============================================================================
// CONFIGURATION
// ============================================================================

// Helper to get auth headers
const getAuthHeaders = async (): Promise<Record<string, string>> => {
  if (isDevMode()) {
      return { "Authorization": "Bearer dev-token" };
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { "Authorization": `Bearer ${token}` } : {};
};

// ============================================================================
// PROMPTS (提示词配置)
// ============================================================================

/**
 * 提示词 1: 聊天助手 (Copilot)
 * 作用: 在对话界面引导用户输入，并在用户遗漏关键信息时进行追问。
 */
const CHAT_SYSTEM_INSTRUCTION = `
你是一名“工程监理 Copilot”。你的目标是协助用户（监理员）通过对话方式收集《监理日志》的原始素材。

**你的性格与行为准则：**
1. **引导者**：不要一次性问所有问题。根据用户的输入，自然地引导话题。
2. **专业敏锐**：当用户描述模糊时（例如只说“打了混凝土”），你必须追问关键技术指标（如：部位、方量、标号、浇筑方式）。
3. **极简主义**：回复要像微信聊天一样简短、干练，不要长篇大论。
4. **分类引导**：时刻维护心理清单，确保收集到以下三类信息：
   - **工程动态**（施工进度、人机料情况、开停工状态）
   - **监理工作**（旁站、巡视验收、工程量统计、会议、资料签批）
   - **安全监理**（人员/机械安全状态、隐患排查整改）

**示例对话：**
用户：今天浇筑了二层柱。
你：收到。具体的混凝土标号是多少？大约浇筑了多少方？旁站记录做了吗？
`;

/**
 * 提示词 2: 日报生成器 (Report Generator)
 * 作用: 将凌乱的对话记录，整理成结构化、专业化的监理日志 JSON 数据。
 */
const REPORT_SYSTEM_INSTRUCTION = `
你是一位拥有20年经验的**资深注册监理工程师**。
任务：读取一段监理员的现场零散对话记录，将其润色并整理成标准的《监理日志》内容。

**核心原则（必须严格遵守）：**
1. **专业化润色**：将口语转化为标准的工程监理书面用语。
   - "打灰" -> "混凝土浇筑"
   - "查了钢筋" -> "进行钢筋隐蔽工程验收"
   - "工人没戴帽" -> "发现施工人员未佩戴安全帽，已下发整改通知单"
2. **信息完整性**：保留所有具体的数据（方量、标号、人数）、具体部位和具体问题。严禁随意删减有效信息。
3. **事实导向**：如果对话中未提及某方面（如未提及安全问题），则对应的字段留空或填入"无特殊情况"，不要编造。

**分类标准（严格执行）：**

**一、工程动态 (engineering)**
包含：承包单位投入的人员/机械/材料情况；工程实体进展（具体部位、工序）；开工/复工/暂停令情况。

**二、监理工作情况 (supervisor)**
包含：旁站、巡视、平行检验、隐蔽工程验收；监理资料/报验单审批；会议纪要；签证索赔处理。

**三、安全监理情况 (safety)**
包含：安全文明施工检查；安全隐患排查（发现的问题、整改要求、闭合情况）；安全教育。

**四、一句话总结 (summary)**
简要概括当日核心生产内容（如：完成xx部位浇筑）和安全状况，不超过50字。

**输出格式要求：**
1. 必须输出为 **纯 JSON 格式**。
2. **严禁**包含 Markdown 标记（如 \`\`\`json ... \`\`\`）。
3. **严禁**包含任何解释性文字，只输出 JSON 字符串。

JSON 结构模板：
{
  "engineering": ["条目1", "条目2"],
  "supervisor": ["条目1", "条目2"],
  "safety": ["条目1", "条目2"],
  "summary": "一句话总结"
}
`;

// ============================================================================
// SERVICES
// ============================================================================

// --- Task C: Transcribe Audio ---
export const transcribeAudio = async (audioBase64: string): Promise<string> => {
    try {
        const authHeaders = await getAuthHeaders();
        const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...authHeaders
            },
            body: JSON.stringify({ audioBase64 })
        });

        if (!response.ok) {
            console.error("ASR Error Status:", response.status);
            
            // Try to get JSON error message from backend
            let errorMessage = "转写服务暂时不可用";
            try {
                const errJson = await response.json();
                if (errJson.error) {
                    errorMessage = `错误: ${errJson.error}`;
                }
            } catch (e) {
                // If parsing fails, fall back to status codes
                if (response.status === 401) errorMessage = "登录已过期，请重新登录";
                else if (response.status === 429) errorMessage = "请求过于频繁，请稍后";
                else if (response.status === 500) errorMessage = "服务器错误";
            }
            
            return `（${errorMessage}）`;
        }

        const data = await response.json();
        let text = data.text || "";
        
        // Clean up text tags if model returns them
        text = text.replace(/<\|.*?\|>/g, "").trim();
        console.log("[Transcribe] Result:", text);

        if (!text) return "（未识别到有效声音）";
        return text;

    } catch (error: any) {
        console.error("Transcription Network Error:", error);
        return `（网络连接失败: ${error.message}）`;
    }
};

// --- Task A: Chat (Conversation) ---
export const sendMessageToGemini = async (history: Message[], newMessage: string, imageBase64?: string): Promise<string> => {
  try {
    const hasImageInHistory = history.some(msg => !!msg.imageUrl);
    // Text chat uses the backend default fast model; image chat still requests the vision model.
    const model = (imageBase64 || hasImageInHistory) ? "qwen-vl-max" : undefined;

    const apiMessages: any[] = [{ role: "system", content: CHAT_SYSTEM_INSTRUCTION }];
    
    // Rebuild history
    history
      .filter(msg => msg.sender !== Sender.SYSTEM)
      .forEach(msg => {
          const role = msg.sender === Sender.USER ? 'user' : 'assistant';
          
          if (msg.imageUrl) {
              apiMessages.push({
                  role: role,
                  content: [
                      { type: "text", text: msg.text || " " }, 
                      { type: "image_url", image_url: { url: msg.imageUrl } }
                  ]
              });
          } else {
              let cleanText = msg.text;
              if (cleanText === '正在识别...' || cleanText === '正在转文字...' || cleanText === '（语音内容）' || cleanText === '正在转写...' || cleanText?.startsWith('（错误') || cleanText?.startsWith('（网络')) {
                  return; 
              }
              apiMessages.push({ role: role, content: cleanText || " " });
          }
      });
    
    const authHeaders = await getAuthHeaders();
    // Send to our backend function instead of Alibaba directly
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({ messages: apiMessages, model })
    });

    if (!response.ok) {
       if (response.status === 401) return "登录验证失败，请刷新页面重新登录。";
       throw new Error(`Backend responded with ${response.status}`);
    }
    
    const data = await response.json();
    return data.content || "收到。";

  } catch (error) {
    console.error("Chat Error:", error);
    return "系统繁忙或配置错误，请稍后再试。";
  }
};

// --- Task B: Generate Report (JSON) ---
export const generateReportFromHistory = async (messages: Message[], date: string, weather: string, location: string): Promise<ReportSchemaResponse> => {
  try {
    const contextText = messages
      .filter(m => m.sender !== Sender.SYSTEM)
      .map(m => `${m.sender.toUpperCase()}: ${m.text}`)
      .join('\n');

    const prompt = `
      【基本信息】日期: ${date}, 天气: ${weather}, 地点: ${location}
      【对话记录】
      ${contextText}
      
      请根据上述对话记录，严格按照系统指令中的分类标准生成JSON。
      只输出JSON，不要输出任何其他内容。
    `;

    const authHeaders = await getAuthHeaders();
    // Use the same backend function
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({ 
            messages: [
                { role: "system", content: REPORT_SYSTEM_INSTRUCTION },
                { role: "user", content: prompt }
            ], 
            model: "report" 
        })
    });

    if (!response.ok) return null as any;

    const data = await response.json();
    if (data.content) {
        let jsonStr = data.content.trim();
        
        // 1. Robust JSON Extraction (Regex)
        // Look for JSON block inside markdown code fence
        const jsonBlockMatch = jsonStr.match(/```json\n([\s\S]*?)\n```/) || jsonStr.match(/```([\s\S]*?)```/);
        
        if (jsonBlockMatch) {
            jsonStr = jsonBlockMatch[1];
        } else {
            // Fallback: Find the first '{' and the last '}'
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }
        }

        try {
            return JSON.parse(jsonStr) as ReportSchemaResponse;
        } catch (e) {
            console.error("JSON Parse Error. Raw content:", data.content);
            throw e;
        }
    }
    throw new Error("Empty response");
  } catch (error) {
    console.error("Report Generation Error:", error);
    // @ts-ignore
    return null;
  }
};
