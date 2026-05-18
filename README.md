
# 🏗️ 智能监理日志 (Smart Supervisor Log) - 旁站功能版

![Version](https://img.shields.io/badge/version-1.1.0-blue) ![React](https://img.shields.io/badge/React-18-61DAFB) ![Node](https://img.shields.io/badge/Node-Express-green)

一款基于 AI 对话的工程监理辅助工具。通过语音、文字和图片交互，协助监理人员自动生成专业的《监理日报》，并提供混凝土浇筑旁站记录的数字化管理功能。

## ✨ 核心功能

### 🤖 AI 智能辅助
- **对话式记录**：像微信聊天一样汇报工作，AI 自动提取关键信息（工程动态、监理工作、安全检查）。
- **语音转写**：集成高精度 ASR 服务，支持长语音输入，自动过滤口语废话。
- **专业润色**：利用大模型（Qwen）将口语转化为标准的工程监理术语。

### 📋 旁站记录管理 (新功能)
- **数字化表单**：涵盖混凝土浇筑全过程（资质核查、机具配置、坍落度实测、见证取样等）。
- **自动保存**：支持“存草稿”及返回自动保存，防止现场数据丢失。
- **智能关联**：在对话中提到“浇筑”、“旁站”时，自动推荐创建关联记录。

### 📊 报表与导出
- **自动生成**：一键生成符合国标规范的 HTML/PDF 格式监理日志。
- **所见即所得**：支持 A4 打印预览，自适应排版。
- **天气集成**：基于高德地图 API，自动获取项目所在地的实时天气（温度、风力、风向）。

### 🛠️ 系统特性
- **多项目管理**：支持切换不同工程项目。
- **双模存储**：
  - **云端模式**：基于 Supabase/MemFire Cloud 的数据同步。
  - **开发者模式**：纯本地 LocalStorage 存储，无需后端即可体验。
- **PWA 支持**：针对移动端优化的 UI 设计，支持添加到主屏幕。

---

## 🛠️ 技术栈

- **前端**：React 18, TypeScript, Vite, Tailwind CSS, React Router v6
- **后端**：Node.js, Express (作为 API 代理和中间件)
- **数据库/Auth**：Supabase (或兼容的 MemFire Cloud)
- **AI 服务**：
  - 对话模型：阿里云通义千问 (Qwen-Plus/Max)
  - 语音转写：阿里云 DashScope (Paraformer-v1)
- **工具服务**：高德地图 API (天气与定位)

---

## 🚀 快速开始

### 1. 环境准备
确保您的环境已安装：
- Node.js (v18+)
- npm 或 yarn

### 2. 安装依赖

```bash
# 安装前端和后端所有依赖
npm install
```

### 3. 配置环境变量

在项目根目录创建一个 `.env` 文件，填入以下配置：

```env
# --- 服务端配置 (server.js) ---
# 默认端口为 3000，如需修改请同步修改 vite.config.ts 中的 proxy
PORT=3000

# 阿里通义千问 API Key (用于 Qwen-Max 对话 和 Paraformer 语音转写)
# 请前往阿里云百炼控制台获取
CHAT_API_KEY=sk-xxxxxxxxxxxxxxxx

# 语音 API Key (可选)
# 如果为空，系统会自动复用上面的 CHAT_API_KEY (推荐，因为通常是同一个账号)
AUDIO_API_KEY=

# 高德地图 API Key (Web服务类型，用于天气)
WEATHER_API_KEY=xxxxxxxxxxxxxxxx

# 数据库配置 (MemFire Cloud / Supabase)
MEMFIRE_URL=https://xxxxxxxx.memfiredb.com
MEMFIRE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# --- 前端构建配置 (Vite) ---
# 前端也需要读取数据库配置以进行 Auth 校验
VITE_MEMFIRE_URL=https://xxxxxxxx.memfiredb.com
VITE_MEMFIRE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. 本地开发运行

我们需要同时启动后端服务（处理 API 代理）和前端开发服务器。

**终端 1 (启动后端):**
```bash
npm run start
# 服务将在 http://localhost:3000 启动
```

**终端 2 (启动前端):**
```bash
npm run dev
# Vite 将在 http://localhost:5173 启动，并自动代理 /api 请求到 3000
```

打开浏览器访问 `http://localhost:5173` 即可。

---

## 📦 部署指南 (Linux/VPS)

### 1. 构建前端
```bash
npm run build
# 生成的文件位于 /dist 目录
```

### 2. 启动生产服务
生产环境下，`server.js` 会自动托管 `/dist` 目录下的静态文件。

**方式一：直接启动**
```bash
npm run start:prod
# 服务将在端口 3000 启动
```

**方式二：使用 PM2 (推荐)**
保持服务后台运行及自动重启。
```bash
npm install -g pm2
pm2 start npm --name "supervisor-app" -- run start:prod
```

### 3. Nginx 反向代理与 HTTPS
由于移动端浏览器对麦克风权限的严格限制，**必须配置 HTTPS** 才能正常使用语音录入功能。

**Nginx 配置示例 (Port 3000):**
```nginx
server {
    listen 80;
    server_name your-ip-or-domain;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-ip-or-domain;

    # 证书路径 (如果是自签名证书)
    ssl_certificate /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;

    location / {
        proxy_pass http://localhost:3000; # 转发到 Node 服务
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 📂 项目结构

```
.
├── dist/                # 构建后的静态文件
├── src/
│   ├── components/      # UI 组件 (Layout, etc.)
│   ├── pages/           # 页面 (Home, Recorder, Report, Forms...)
│   ├── services/        # API 服务 (Gemini, Storage, Weather)
│   └── types/           # TypeScript 类型定义
├── server.js            # Node.js 后端入口
├── vite.config.ts       # Vite 配置
├── tailwind.config.js   # Tailwind 配置
└── package.json
```

## 📝 开发者说明

- **开发者模式**：在登录页点击“开发者免密进入”，数据将存储在浏览器的 LocalStorage 中，不依赖后端数据库，方便 UI 调试。
- **重要提示**：在手机端使用时，如果没有购买正式域名证书，使用自签名证书访问时需在浏览器中点击“继续访问（不安全）”。部分浏览器（如 iOS Safari）可能需要安装根证书才能调用麦克风。

---

**License**
MIT
