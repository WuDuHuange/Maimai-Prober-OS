# Maimai-Prober-OS

> Maimai DX 底力量化与 AI 策略复盘系统 | 纯 Web SPA (Vue 3 + Vite)

---

## 项目简介

Maimai-Prober-OS 是一款基于[水鱼计分器 (Diving-Fish)](https://www.diving-fish.com/) 开放接口的纯 Web 端音游底力量化与 AI 策略复盘系统。

本工具定位于玩家每次出勤归来后的复盘场景, 通过深度挖掘水鱼沉淀的纵向时间轴历史战绩, 利用数据可视化与 AI 大语言模型, 为玩家提供:

- **底力成长曲线图** -- 清晰复盘技术突破期
- **判定偏差收敛分析** -- 发现手法坏习惯
- **AI 补强练歌计划** -- 定制化下位替代练习曲推荐

### 核心特性

- **零安装**: 浏览器打开即用, 无需任何桌面运行时
- **纯本地**: 所有数据存储在浏览器 IndexedDB, 不上传任何服务器
- **多 AI 接入**: 支持 Gemini / OpenAI / Claude 等多种 API, 用户自行选择
- **数据可视化**: ECharts 绘制 Rating 曲线、判定散点图等

---

## 技术栈

| 层级 | 技术 |
|-----|------|
| 前端框架 | Vue 3 + Vite + TypeScript |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| 数据可视化 | ECharts 5 |
| 样式方案 | Tailwind CSS 3 |
| 动效表现 | GSAP 3 |
| 本地数据库 | IndexedDB (Dexie.js) |
| AI 服务 | 多 API 接入 (Gemini / OpenAI / Claude 等) |
| 加密 | crypto-js (AES) |
| 外部数据 | 水鱼计分器 (Diving-Fish) API |

---

## 快速开始

### 环境要求

- Node.js >= 18
- 现代浏览器 (Chrome / Firefox / Edge 最新版)

### 安装与运行

```bash
# 1. 克隆项目
git clone https://github.com/WuDuHuange/Maimai-Prober-OS.git
cd Maimai-Prober-OS

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 打开浏览器 http://localhost:1420

# 5. 构建生产版本
npm run build
# 产物在 dist/ 目录, 可部署到任意静态托管服务
```

### 初始配置

1. 打开应用后, 前往 **设置** 页面
2. 输入你的[水鱼计分器 Token](https://www.diving-fish.com/maimaidx/prober) 并保存
3. 输入你的 [Gemini API Key](https://aistudio.google.com/apikey) 并保存
4. 返回首页, 点击 **同步数据** 按钮, 等待同步完成

---

## 部署

构建产物为纯静态文件:

```bash
npm run build
# 上传 dist/ 到 GitHub Pages / Vercel / Netlify / Cloudflare Pages
```

---

## 许可

MIT License

## 致谢

- [水鱼计分器 (Diving-Fish)](https://www.diving-fish.com/)
- [Dexie.js](https://dexie.org/)
- [ECharts](https://echarts.apache.org/)
- [GSAP](https://gsap.com/)
