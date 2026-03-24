# LabSentinel 工程文档

## 1. 项目概述

LabSentinel 是一个基于图像识别的**高校实验室安全检查**Web 应用。通过调用视觉大语言模型（VLM），对实验室现场照片进行自动安全隐患检测，并结合实验室安全条例（RAG 检索）给出专业的分析结果和整改建议。

核心能力：
- **图片安全隐患检测**：上传实验室图片，AI 自动识别安全隐患并在原图上框出违规区域
- **多模态安全咨询**：支持文本、图片、视频、音频多模态输入的安全问答
- **安全条例 RAG 检索**：基于本地安全条例 PDF 的轻量级检索增强生成，分析结果引用具体条款

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| 样式 | TailwindCSS 4 + 自定义 CSS |
| 后端代理 | Express 5 (Node.js ESM) |
| AI 模型 | SiliconFlow API — Qwen3-VL-32B-Instruct / Qwen3-Omni-30B |
| RAG 检索 | BM25 关键词检索（纯 JS 实现） |
| PDF 解析 | pdf-parse |
| 环境变量 | dotenv（后端）/ Vite 内置 .env（前端） |

## 3. 目录结构

```
LabSentinel/
├── data/                    # 数据文件
│   └── safe.pdf             # 实验室安全条例 PDF（用户自行放入）
├── doc/                     # 工程文档
│   └── project.md           # 本文件
├── example/                 # 示例图片
│   └── example1.jpg
├── logo/                    # Logo 资源
│   ├── i3c.png
│   └── seit.png
├── public/                  # 静态资源
│   ├── favicon.svg
│   └── icons.svg
├── server/                  # 后端服务
│   ├── index.js             # Express 主入口，API 代理
│   └── rag.js               # RAG 模块：PDF 解析 + BM25 检索
├── src/                     # 前端源码
│   ├── assets/              # 前端资源
│   ├── App.tsx              # 主应用组件
│   ├── App.css              # 样式
│   ├── index.css            # 全局样式
│   └── main.tsx             # 入口
├── .env                     # 环境变量（不提交）
├── .env.example             # 环境变量模板
├── package.json
├── vite.config.ts
└── tsconfig*.json
```

## 4. 功能模块

### 4.1 图片安全隐患检测（Hazard Detection）

- **入口**：首页「图片安全隐患」Tab
- **流程**：
  1. 用户上传/拖入/拍摄实验室图片
  2. **第一步**：调用 Qwen3-VL 模型，识别隐患并返回结构化 JSON（含归一化 bounding box 坐标）
  3. **第二步（RAG）**：提取隐患关键词 → 调用后端 `/api/rag-search` 检索安全条例 → 将条例片段注入二次 Prompt → 模型基于条例输出最终分析
  4. 前端 Canvas 在原图上绘制矩形框 + 编号标签，结果面板中每条隐患标注对应区域编号
- **模型**：`Qwen/Qwen3-VL-32B-Instruct`

### 4.2 多模态安全咨询（Omni）

- **入口**：首页「多模态安全咨询」Tab
- **支持输入**：文本 + 图片 + 视频（含摄像头录制） + 音频（含麦克风录制）
- **模型**：`Qwen/Qwen3-Omni-30B-A3B-Instruct`

### 4.3 RAG 安全条例检索

- **数据源**：`data/safe.pdf`
- **技术方案**：BM25 关键词检索
- **流程**：服务启动时解析 PDF → 文本分块建索引 → 接收关键词查询 → 返回最相关条例片段
- **端点**：`POST /api/rag-search`

### 4.4 Bounding Box 标注

- VLM 返回每个隐患的归一化坐标 `bbox: [x1, y1, x2, y2]`（值域 0~1）
- 前端使用 Canvas 叠加层绘制彩色矩形框 + 编号
- 隐患列表中标注「区域 1」「区域 2」等与画框对应

## 5. 环境配置

1. 复制 `.env.example` 为 `.env`，填入真实 API Key：
   ```bash
   cp .env.example .env
   ```

2. `.env` 关键字段：
   ```
   VITE_SILICONFLOW_API_KEY=sk-your-key
   VITE_SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1/chat/completions
   VITE_GITHUB_URL=https://github.com/your-org/lab-safety-app
   PORT=3001
   ```

3. 将实验室安全条例 PDF 放入 `data/safe.pdf`

## 6. 启动方式

```bash
# 安装依赖
npm install

# 同时启动前端 + 后端
npm run dev:full

# 或分别启动
npm run server   # 后端 http://localhost:3001
npm run dev      # 前端 http://localhost:5173
```

## 7. API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/chat` | 非流式对话代理 |
| POST | `/api/chat-stream` | 流式对话代理 |
| POST | `/api/rag-search` | RAG 条例检索 |

### `/api/rag-search` 请求格式

```json
{
  "keywords": ["化学品", "标签", "废液"],
  "topK": 5
}
```

### `/api/rag-search` 响应格式

```json
{
  "results": [
    { "text": "条例片段内容...", "score": 12.5 }
  ]
}
```

## 8. 更新日志

### v0.1.0（2026-03-24）
- 初始版本：图片隐患检测 + 多模态咨询双 Tab 布局
- API Key 硬编码在前端

### v0.2.0（2026-03-24）
- **环境变量改造**：API Key、Base URL 等改为从 `.env` 读取，移除硬编码
- **新增工程文档**：`doc/project.md`
- **新增 Bounding Box 标注**：VLM 返回坐标 + 前端 Canvas 画框 + 区域编号
- **新增 RAG 功能**：基于 `data/safe.pdf` 的 BM25 检索，两步法分析流程
