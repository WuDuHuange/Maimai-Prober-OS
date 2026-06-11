# Maimai-Prober-OS

> Maimai DX 底力量化与 AI 策略复盘系统 | 纯 Web SPA (Vue 3 + Vite)

---

## 项目简介

Maimai-Prober-OS 是一款基于[水鱼计分器 (Diving-Fish)](https://www.diving-fish.com/) 开放接口的纯 Web 端音游底力量化与 AI 策略复盘系统。

本工具定位于玩家每次出勤归来后的复盘场景, 通过深度挖掘水鱼沉淀的纵向时间轴历史战绩, 利用数据可视化与 Google Gemini API, 为玩家提供:

- **底力成长曲线图** -- 清晰复盘技术突破期
- **判定偏差收敛分析** -- 发现手法坏习惯
- **AI 补强练歌计划** -- 定制化下位替代练习曲推荐

### 核心特性

- **零安装**: 浏览器打开即用, 无需任何桌面运行时
- **纯本地**: 所有数据存储在浏览器 IndexedDB, 不上传任何服务器
- **AI 驱动**: Gemini API 提供个性化音游教练分析
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
| AI 服务 | Google Gemini API |
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

## 项目文档

所有设计文档位于 `docs/` 目录 (不入库):

| 文档 | 说明 |
|-----|------|
| [01-PRD.md](./docs/01-PRD.md) | 产品需求文档 |
| [02-Architecture-Data-Flow.md](./docs/02-Architecture-Data-Flow.md) | 架构与数据流设计书 |
| [03-DB-Schema.md](./docs/03-DB-Schema.md) | 数据库 Schema (IndexedDB/Dexie.js) |
| [04-AI-Prompt-Engineering.md](./docs/04-AI-Prompt-Engineering.md) | AI 教练提示词工程设计 |
| [05-Dev-Task-Breakdown.md](./docs/05-Dev-Task-Breakdown.md) | 原子化开发任务分解 (30 个任务) |

---

## 项目结构

```
Maimai-Prober-OS/
  +-- src/
  |   +-- main.ts
  |   +-- App.vue
  |   +-- router/index.ts
  |   +-- stores/                 # Pinia (8 个 Store)
  |   +-- services/               # DB / API / 同步引擎
  |   +-- composables/            # useProberSync / useECharts / useAICoach ...
  |   +-- views/                  # 6 个页面
  |   +-- components/             # layout / charts / b50 / ai / sync / notes ...
  |   +-- types/                  # TypeScript 类型
  |   +-- utils/                  # 工具函数
  |   +-- assets/styles/          # CSS
  +-- docs/                       # 设计文档 (不入库)
  +-- index.html / package.json / vite.config.ts / tsconfig.json
```

---

## 部署

构建产物为纯静态文件:

```bash
npm run build
# 上传 dist/ 到 GitHub Pages / Vercel / Netlify / Cloudflare Pages
```

---

## 开发路线

| 阶段 | 内容 | 任务数 |
|-----|------|-------|
| 第一阶段 | 基础架构 + 数据层 + AI 对话 | T01-T14 |
| 第二阶段 | ECharts 可视化 + AI 教练 | T15-T23 |
| 第三阶段 | GSAP 动效 + 重构优化 | T24-T30 |

---

## 许可

MIT License

## 致谢

- [水鱼计分器 (Diving-Fish)](https://www.diving-fish.com/)
- [Google Gemini API](https://aistudio.google.com/)
- [Dexie.js](https://dexie.org/)
- [ECharts](https://echarts.apache.org/)
- [GSAP](https://gsap.com/)
