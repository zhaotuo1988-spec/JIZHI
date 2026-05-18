
import { supabase, isDevMode } from './storageService';

// 获取当前经纬度，增加超时控制
const getPosition = (timeout = 5000): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("浏览器不支持地理定位"));
      return;
    }
    
    // 增加一个额外的超时计时器，防止某些浏览器在无GPS信号时无限挂起
    const timer = setTimeout(() => {
        reject(new Error("定位超时，自动降级为IP定位"));
    }, timeout);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve(pos);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
      {
        enableHighAccuracy: true, // 尝试高精度
        timeout: timeout - 500,   // 传递给 API 的超时略短于计时器
        maximumAge: 60000         // 允许缓存60秒
      }
    );
  });
};

export interface WeatherResult {
  weather: string;
  locationHint?: string;
  success: boolean;
}

// 主函数：获取定位并查询天气
export const fetchRealWeather = async (): Promise<WeatherResult> => {
  let coords: { lat: number; lon: number } | null = null;
  
  try {
    // 1. 尝试获取经纬度 (3秒超时，快速失败以便降级)
    console.log("[Weather] 尝试浏览器定位...");
    const position = await getPosition(3000);
    coords = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
    };
    console.log(`[Weather] 定位成功: ${coords.lat}, ${coords.lon}`);
  } catch (error) {
    console.warn("[Weather] 浏览器定位失败或超时，将尝试服务端 IP 定位:", error);
    // 定位失败不抛出错误，而是让 coords 为 null，后续后端会处理 IP 定位
  }

  try {
    // 2. 获取 Auth Token (修复：增加开发者模式支持)
    let token = null;
    
    if (isDevMode()) {
        // 如果是开发者模式，使用特定的 bypass token
        token = "dev-token";
    } else {
        // 如果是正式模式，从 Supabase 获取 Session
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
    }
    
    // 如果没有 Token，后端会返回 401
    const authHeaders: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};

    // 3. 调用后端 API (传 coords 或空)
    const payload = coords ? { lat: coords.lat, lon: coords.lon } : {};
    
    const response = await fetch("/api/weather", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...authHeaders // 注入 Header
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        if (response.status === 401) {
             // 如果是正式用户且 Token 过期，提示重新登录
             // 如果是开发者模式，理论上不应该进这里，除非 server.js 没重启
             return {
                weather: "天气：获取失败（登录已过期）",
                success: false
             };
        }
        throw new Error(`Weather API Error: ${response.status}`);
    }

    const resData = await response.json();
    
    return {
        weather: resData.weatherStr || "天气：获取失败",
        locationHint: resData.locationStr,
        success: true
    };

  } catch (error) {
    console.error("Fetch Weather Failed:", error);
    return {
        weather: "天气：获取失败（网络错误）",
        success: false
    };
  }
};
