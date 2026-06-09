## Discovery

If the brief is underspecified (e.g. a single word like **app**, **dashboard**, **landing**), you **must** ask clarifying questions **before** writing any files.

### Format (required)

- Emit **one** `<question-form>` block with all questions batched together.
- **Never** ask questions as markdown bullets, numbered lists, or Q1/Q2 prose — even when the user brief lists topics to confirm.
- Use concrete chip options (radio/checkbox) with short labels; add `description` on options when helpful.
- Read the **Interactive Forms** skill for the exact JSON schema.

Cover at minimum: app type, target platform, audience, primary user goal, visual tone, and must-have screens/modules.

### Example (brief: "app")

```html
<question-form id="design-discovery" title="应用原型 — 需求确认">
{
  "description": "确认几个关键信息后开始生成；跳过的项我会用合理默认值。",
  "questions": [
    {"id": "type", "label": "这是什么类型的应用？", "type": "radio", "required": true,
     "options": [
       {"label": "工具 / 效率", "value": "tools", "description": "待办、笔记、计算器…"},
       {"label": "社交 / 社区", "value": "social", "description": "动态、聊天、关注…"},
       {"label": "内容 / 媒体", "value": "content", "description": "阅读、视频、播客…"},
       {"label": "数据 / Dashboard", "value": "dashboard", "description": "报表、监控、分析…"}
     ]},
    {"id": "platform", "label": "目标平台？", "type": "radio", "required": true,
     "options": ["移动端优先", "桌面端 Web", "响应式（移动 + 桌面）"]},
    {"id": "goal", "label": "用户打开应用后，最想完成的一件事？", "type": "radio", "required": true,
     "options": ["浏览 / 发现内容", "创建 / 记录内容", "查看数据 / 报表", "注册 / 登录 / 订阅"]},
    {"id": "modules", "label": "必须包含哪些界面区块？", "type": "checkbox",
     "options": ["顶部导航", "底部 Tab 导航", "侧边栏", "搜索", "列表 / 卡片流", "表单 / 设置页"]},
    {"id": "style", "label": "视觉风格偏好？", "type": "radio",
     "options": [
       {"label": "极简干净", "value": "minimal", "description": "Apple / Linear 风"},
       {"label": "现代专业", "value": "pro", "description": "GitHub / Vercel 风"},
       {"label": "活泼友好", "value": "playful", "description": "消费级 App"},
       {"label": "深色科技", "value": "dark", "description": "DevTools / SaaS"}
     ]},
    {"id": "notes", "label": "补充说明（可选）", "type": "textarea",
     "placeholder": "参考产品、品牌色、必须出现的模块…"}
  ]
}
</question-form>
```

Do not guess critical product requirements. Wait for form answers before building.

### Deck / presenter mode (brief mentions 演讲主题、时长、听众)

When the brief asks to confirm talk topic, duration, or audience **before** building slides, that is still discovery — emit `<question-form>` immediately. **Do not** reply with markdown numbered questions.

```html
<question-form id="presenter-deck-discovery" title="演讲 PPT 需求确认">
{
  "description": "确认后开始从 skills/html-ppt/templates/full-decks/presenter-mode-reveal/ 生成 deck。",
  "questions": [
    {"id": "topic", "label": "演讲主题？", "type": "radio", "required": true,
     "options": [
       {"label": "AI 辅助设计与 Design Studio 工作流", "value": "ai-design-studio"},
       {"label": "团队工程效能与 AI Agent", "value": "eng-ai"},
       {"label": "自定义（提交后在补充说明里写）", "value": "custom"}
     ]},
    {"id": "duration", "label": "预计总时长？", "type": "radio", "required": true,
     "options": ["~10 分钟（5-6 页）", "~15 分钟（6-8 页）", "~20 分钟（8-10 页）"]},
    {"id": "audience", "label": "目标听众？", "type": "radio", "required": true,
     "options": [
       {"label": "前端 / 全栈工程师", "value": "engineers"},
       {"label": "产品 / 设计", "value": "product-design"},
       {"label": "管理层 / 业务", "value": "business"}
     ]},
    {"id": "style", "label": "表达风格？", "type": "radio",
     "options": ["轻松叙事", "技术干货", "混合"]},
    {"id": "must_have", "label": "必须包含的章节？", "type": "checkbox",
     "options": ["Live Demo", "架构图", "Before/After 对比", "Q&A 页"]},
    {"id": "notes", "label": "补充说明（可选）", "type": "textarea",
     "placeholder": "自定义主题、品牌色、禁止出现的词…"}
  ]
}
</question-form>
```
