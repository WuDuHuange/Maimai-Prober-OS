# Maimai-Prober-OS

> Maimai DX 底力量化与 AI 策略复盘系统 | Tauri + Vue 3 全栈桌面应用

---

## 项目简介

Maimai-Prober-OS 是一款基于 [水鱼计分器 (Diving-Fish)](https://www.diving-fish.com/) 开放接口的本地桌面端音游底力量化与 AI 策略复盘系统。

本工具定位于玩家每次出勤归来后的复盘场景, 通过深度挖掘水鱼沉淀的纵向时间轴历史战绩, 利用数据可视化与 Gemini API, 为玩家提供:

- **底力成长曲线图** -- 清晰复盘技术突破期
- **判定偏差收敛分析** -- 发现手法坏习惯
- **AI 补强练歌计划** -- 定制化下位替代练习曲推荐

---

## 技术栈

| 层级 | 技术 |
|-----|------|
| 应用外壳 | Tauri 2 (Rust / Webview) |
| 前端框架 | Vue 3 + Vite + TypeScript |
| 状态管理 | Pinia |
| 数据可视化 | ECharts |
| 样式方案 | Tailwind CSS |
| 动效表现 | GSAP |
| 本地数据库 | SQLite (rusqlite) |
| AI 服务 | Gemini API |
| 外部数据源 | 水鱼计分器 (Diving-Fish) API |

---

## 快速开始

### 环境要求

- Node.js >= 18
- Rust >= 1.75
- Windows 10/11 (WebView2 已内置)

### 安装与运行

```bash
# 1. 克隆项目
git clone <repo-url>
cd Maimai-Prober-OS

# 2. 安装前端依赖
npm install

# 3. 启动开发模式 (桌面窗口)
npm run tauri dev

# 4. 构建生产版本
npm run tauri build
```

### 初始配置

1. 启动应用后, 前往 **设置** 页面
2. 输入你的 [水鱼计分器 Token](https://www.diving-fish.com/maimaidx/prober) 并保存
3. 输入你的 [Gemini API Key](https://aistudio.google.com/apikey) 并保存
4. 返回首页, 点击 **同步数据** 按钮, 等待同步完成

---

## 项目文档

所有设计文档位于 `docs/` 目录:

| 文档 | 说明 |
|-----|------|
| [01-PRD.md](./docs/01-PRD.md) | 产品需求文档 (用户故事 / 功能清单 / MVP 边界) |
| [02-Architecture-Data-Flow.md](./docs/02-Architecture-Data-Flow.md) | 架构与数据流设计书 (进程通信 / 目录结构 / 技术决策) |
| [03-DB-Schema.md](./docs/03-DB-Schema.md) | 数据库 Schema 与接口规范 (DDL / 查询模板 / JSON Schema) |
| [04-AI-Prompt-Engineering.md](./docs/04-AI-Prompt-Engineering.md) | AI 教练提示词工程设计 (System Prompt / 上下文格式化 / 流式对话) |
| [05-Dev-Task-Breakdown.md](./docs/05-Dev-Task-Breakdown.md) | 原子化开发任务分解 (按周 / 按功能模块 / 供 AI 模型执行) |

---

## 项目结构

```
Maimai-Prober-OS/
  +-- src/                        # Vue 3 前端
  |   +-- components/             # 通用组件
  |   |   +-- ai/                 # AI 对话相关
  |   |   +-- b50/                # B50 列表相关
  |   |   +-- charts/             # ECharts 图表
  |   |   +-- layout/             # 布局组件
  |   |   +-- notes/              # Markdown 编辑器
  |   |   +-- sync/               # 同步相关
  |   |   +-- weekly/             # 周报相关
  |   +-- composables/            # 组合式 API (Hooks)
  |   +-- router/                 # 路由配置
  |   +-- stores/                 # Pinia 状态管理
  |   +-- types/                  # TypeScript 类型定义
  |   +-- utils/                  # 工具函数
  |   +-- views/                  # 页面组件
  +-- src-tauri/                  # Tauri Rust 后端
  |   +-- src/
  |   |   +-- api/                # 外部 API 客户端 (水鱼 / Gemini)
  |   |   +-- commands/           # Tauri Commands
  |   |   +-- db/                 # 数据库层 (SQLite)
  |   |   +-- models/             # 数据模型 (Serde)
  |   +-- sql/migrations/         # SQL 迁移文件
  +-- docs/                       # 项目文档
```

---

## 开发路线图

| 阶段 | 周期 | 主题 |
|-----|------|------|
| 第一阶段 | 第 1-4 周 | 接口通关与本地数仓 |
| 第二阶段 | 第 5-8 周 | 可视化大爆发与 AI 教练 |
| 第三阶段 | 第 9-12 周 | 代码重构与日常享用 |

详细任务分解见 [docs/05-Dev-Task-Breakdown.md](./docs/05-Dev-Task-Breakdown.md)

---

## 许可

MIT License

---

## 致谢

- [水鱼计分器 (Diving-Fish)](https://www.diving-fish.com/) -- 提供开放 API 的第三方 Maimai DX 计分器平台
- [Tauri](https://tauri.app/) -- 轻量级桌面应用框架
- [ECharts](https://echarts.apache.org/) -- 数据可视化图表库
- [Google Gemini](https://deepmind.google/technologies/gemini/) -- AI 大语言模型
