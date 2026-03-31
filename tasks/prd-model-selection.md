# PRD: 模型选择配置功能

## Introduction

为 LabSentinel 多模态实验室隐患识别系统新增模型选择配置功能。当前系统使用硬编码的模型常量（`HAZARD_MODEL` 和 `OMNI_MODEL`），用户无法灵活切换模型。本功能允许用户在设置界面中选择或自定义模型名称，以满足不同场景下对模型性能、成本或响应速度的需求。

图片安全隐患检测与实时安全检测共用同一模型（Vision 模型），多模态安全咨询使用独立模型（Omni 模型），保持与现有架构一致。

## Goals

- 用户可在设置中自由选择或输入模型名称
- 预设模型列表从后端动态获取，便于维护和扩展
- 提供预设模型列表作为快捷选项，同时支持自定义输入
- 模型切换成功后显示 Toast 提示，增强用户反馈
- 提供"重置为默认"按钮，便于用户快速恢复默认配置
- 模型配置持久化存储，重启应用后保持用户选择
- 后端在模型调用失败时提供明确的错误提示
- 保持现有三个功能模块正常运行，无兼容性问题

## User Stories

### US-001: 扩展设置数据结构
**Description:** 作为开发者，需要扩展 ApiSettings 类型以支持模型配置字段，为后续 UI 和逻辑开发提供数据基础。

**Acceptance Criteria:**
- [ ] 在 `ApiSettings` 类型中新增 `hazardModel: string` 字段
- [ ] 在 `ApiSettings` 类型中新增 `omniModel: string` 字段
- [ ] 默认值分别使用现有的 `HAZARD_MODEL` 和 `OMNI_MODEL` 常量
- [ ] Typecheck 通过

### US-002: 后端提供模型列表 API
**Description:** 作为开发者，需要新增后端接口返回可用的预设模型列表，前端据此动态渲染下拉选项。

**Acceptance Criteria:**
- [ ] 新增 `/api/models` GET 接口
- [ ] 返回 JSON 结构包含 `visionModels` 和 `omniModels` 两个数组
- [ ] 每个模型项包含 `name`（模型 ID）和 `label`（显示名称）
- [ ] 模型列表可从配置文件或环境变量读取，便于后续扩展
- [ ] 接口支持 CORS，前端可正常调用
- [ ] Typecheck 通过

### US-003: 设置界面新增模型选择区域
**Description:** 作为用户，我希望在设置弹窗中看到模型配置选项，以便选择或输入我想使用的模型。

**Acceptance Criteria:**
- [ ] 设置弹窗新增"模型配置"分组标题
- [ ] 新增"图片/实时检测模型"输入区域
- [ ] 新增"多模态咨询模型"输入区域
- [ ] 每个模型输入区域包含预设下拉列表和自定义文本输入框
- [ ] 预设列表从 `/api/models` 接口动态获取
- [ ] 选择预设后自动填充到输入框，用户可在此基础上修改
- [ ] 输入框显示当前选择的模型名称
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-004: 模型配置持久化
**Description:** 作为用户，我希望我的模型选择在刷新页面或重启应用后仍然保留，不必每次重新配置。

**Acceptance Criteria:**
- [ ] 模型配置与现有设置一起保存到 localStorage（key: `lab_safety_settings`）
- [ ] 应用启动时从 localStorage 读取并恢复模型配置
- [ ] 若 localStorage 中无模型配置，使用默认值
- [ ] 配置变更时立即保存，无需手动点击"保存"按钮
- [ ] Typecheck 通过

### US-005: 功能模块使用用户选择的模型
**Description:** 作为用户，我希望各个功能模块实际使用我配置的模型，而非硬编码的默认模型。

**Acceptance Criteria:**
- [x] 图片安全隐患检测模块使用 `settings.hazardModel`
- [x] 实时安全检测模块使用 `settings.hazardModel`
- [x] 多模态安全咨询模块使用 `settings.omniModel`
- [x] 顶部导航栏的模型徽章（engine-badge）显示当前使用的模型名称
- [x] 各功能模块的 model-chip 标签显示当前使用的模型名称
- [x] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-006: 模型切换成功 Toast 提示
**Description:** 作为用户，我希望在选择模型后看到成功提示，确认配置已生效。

**Acceptance Criteria:**
- [ ] 新增 Toast 组件，支持显示成功/警告/错误消息
- [ ] Toast 在页面顶部或右上角显示，3 秒后自动消失
- [ ] 模型配置变更后显示"模型配置已更新"成功提示
- [ ] Toast 样式与应用整体风格一致
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-007: 重置为默认按钮
**Description:** 作为用户，我希望有快捷按钮将模型恢复为默认配置，无需手动输入默认模型名。

**Acceptance Criteria:**
- [ ] 每个模型输入区域旁新增"重置"按钮
- [ ] 点击"重置"按钮，该模型恢复为环境变量定义的默认值
- [ ] 重置后触发 Toast 提示"已恢复默认模型"
- [ ] 重置操作立即保存到 localStorage
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

### US-008: 后端模型错误提示优化
**Description:** 作为用户，当我配置了一个无效或不可用的模型名称时，我希望得到清晰的错误提示，便于快速修正。

**Acceptance Criteria:**
- [ ] 后端 `/api/chat` 和 `/api/chat-stream` 接口在收到模型相关错误时，解析并返回具体错误信息
- [ ] 错误信息包含"模型不存在"或"模型不可用"等明确提示
- [ ] 前端在收到模型错误时，在错误框中显示"请检查模型名称是否正确"的建议
- [ ] Typecheck 通过
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: ApiSettings 类型扩展，新增 `hazardModel` 和 `omniModel` 字段
- FR-2: 后端新增 `/api/models` GET 接口，返回预设模型列表
- FR-3: 设置弹窗新增模型配置分组，包含两个模型的输入控件
- FR-4: 每个模型输入控件包含预设下拉选择器、自定义文本输入框和重置按钮
- FR-5: 预设模型列表从 `/api/models` 接口动态获取
- FR-6: 模型配置保存至 localStorage，与现有设置共用同一存储键
- FR-7: 应用初始化时读取并恢复 localStorage 中的模型配置
- FR-8: 图片检测和实时检测模块调用时使用 `settings.hazardModel` 作为 model 参数
- FR-9: 多模态咨询模块调用时使用 `settings.omniModel` 作为 model 参数
- FR-10: 顶部导航栏和各模块的模型显示标签实时反映当前配置
- FR-11: 模型配置变更后显示 Toast 成功提示
- FR-12: 每个模型输入区域提供"重置为默认"按钮
- FR-13: 后端代理接口返回模型相关的详细错误信息

## Non-Goals

- 不在前端主动验证模型名称有效性（不预先调用 API 检查）
- 不支持为每个功能模块独立选择不同模型（保持现有分组逻辑）
- 不新增模型管理后台或数据库持久化
- 不支持模型参数（如 temperature、max_tokens）的配置
- 不提供模型性能对比或推荐功能
- 不支持用户自定义添加预设模型到后端列表

## Design Considerations

### UI 设计

- 模型配置区域位于设置弹窗中，在"API Key"和"Base URL"之后
- 使用与现有设置字段一致的样式（label + input）
- 预设模型下拉选择器为紧凑型 select 控件，宽度约 200px
- 自定义输入框为标准 text input，支持任意模型名称输入
- "重置"按钮为小型文字按钮，位于输入框右侧，样式为灰色链接
- 组合控件布局：select（左）+ input（中）+ 重置按钮（右）
- Toast 组件位于页面顶部中央，带轻微阴影和圆角

### Toast 设计

- 背景：成功绿色、警告黄色、错误红色
- 文字：白色，居中显示
- 动画：从顶部滑入，停留 3 秒后滑出消失
- 内容：图标 + 文字消息
- 位置：固定在页面顶部，不遮挡主要内容区域

### 后端模型列表结构

```json
{
  "visionModels": [
    { "name": "Qwen/Qwen3-VL-32B-Instruct", "label": "Qwen3-VL-32B (高精度)" },
    { "name": "Qwen/Qwen2-VL-7B-Instruct", "label": "Qwen2-VL-7B (轻量快速)" },
    { "name": "Qwen/Qwen2-VL-72B-Instruct", "label": "Qwen2-VL-72B (最强性能)" }
  ],
  "omniModels": [
    { "name": "Qwen/Qwen3-Omni-30B-A3B-Instruct", "label": "Qwen3-Omni-30B (默认)" },
    { "name": "Qwen/Qwen2.5-Omni-7B-Instruct", "label": "Qwen2.5-Omni-7B (轻量)" }
  ],
  "defaults": {
    "vision": "Qwen/Qwen3-VL-32B-Instruct",
    "omni": "Qwen/Qwen3-Omni-30B-A3B-Instruct"
  }
}
```

## Technical Considerations

### 数据结构变更

```typescript
type ApiSettings = {
  apiKey: string;
  baseUrl: string;
  githubUrl: string;
  hazardModel: string;  // 新增
  omniModel: string;    // 新增
};

type ModelInfo = {
  name: string;
  label: string;
};

type ModelsResponse = {
  visionModels: ModelInfo[];
  omniModels: ModelInfo[];
  defaults: {
    vision: string;
    omni: string;
  };
};
```

### localStorage 存储

现有存储键 `lab_safety_settings` 保持不变，JSON 结构扩展：
```json
{
  "apiKey": "sk-...",
  "baseUrl": "https://...",
  "githubUrl": "https://...",
  "hazardModel": "Qwen/Qwen3-VL-32B-Instruct",
  "omniModel": "Qwen/Qwen3-Omni-30B-A3B-Instruct"
}
```

### 默认值处理

- 前端从 `/api/models` 接口获取 `defaults` 字段作为默认模型
- 若接口未返回或调用失败，使用环境变量 `VITE_HAZARD_MODEL` 和 `VITE_OMNI_MODEL`
- localStorage 中缺失字段时，使用默认值填充

### 后端实现

新增 `/api/models` 接口（`server/index.js`）：
- 可从配置文件 `server/models.json` 读取模型列表
- 或直接在代码中定义，后续可扩展为配置文件
- 返回结构包含 `visionModels`、`omniModels` 和 `defaults`

### 后端错误处理

现有 `server/index.js` 已返回 `payload.error.message`，需确保：
- 模型不存在时的错误信息能正确透传
- 错误信息格式：`{ error: "模型 xxx 不存在或不可用" }`

### Toast 实现

- 使用 React state 管理 Toast 队列
- 可使用简单的 `<div className="toast">` 实现，无需引入外部库
- 通过 `useEffect` 和 `setTimeout` 实现自动消失

## Success Metrics

- 用户可在设置界面完成模型选择，耗时不超过 30 秒
- 模型配置变更后，Toast 提示立即显示，用户确认操作成功
- 重置按钮可在 1 次点击内恢复默认模型
- 模型列表从后端获取，便于后续扩展无需修改前端代码
- 错误提示明确指出模型问题，用户能快速定位并修正
- 无兼容性问题，现有功能正常运行

## Open Questions

（已全部确认）
- ~~预设模型列表是否需要从后端动态获取？~~ **已确认：从后端动态获取**
- ~~是否需要在模型切换时显示 Toast 提示？~~ **已确认：需要 Toast 提示**
- ~~是否需要支持"重置为默认"按钮？~~ **已确认：需要重置按钮**