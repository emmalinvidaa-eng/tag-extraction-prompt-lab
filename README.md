# 标签提取 Prompt 测试系统

本项目是一个本地运行的招聘标签提取 Prompt 测试工具。它用于批量执行测试 case，调用标签提取模型，再由 AI Judge 自动评审结果。

支持：

- 标签字典 Excel 导入；
- 测试集 JSONL、JSON、Excel 导入；
- 标签提取 Prompt 版本管理；
- DeepSeek、Qwen 百炼和自定义 OpenAI Chat Completions 兼容接口；
- 标签提取模型和 Judge 模型分别配置；
- 批量运行、进度查看、PASS / PARTIAL / FAIL 汇总；
- 每条 case 的输入、预期、模型原始输出和 Judge 结果详情。

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本

## 安装

```bash
git clone https://github.com/emmalinvidaa-eng/tag-extraction-prompt-lab.git
cd tag-extraction-prompt-lab
npm install
```

## 启动

```bash
npm run dev
```

浏览器访问：

```text
http://localhost:3000
```

## API Key 配置

有两种配置方式。

### 方式一：在页面中配置

打开：

```text
http://localhost:3000/models
```

分别创建标签提取模型和 AI Judge 模型。API Key 只保存在本地 SQLite 数据库，页面不会回显完整值。

### 方式二：使用本地环境变量

复制示例配置：

```bash
cp .env.example .env.local
```

填写：

```bash
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
```

`.env.local` 和本地 SQLite 数据库已加入 `.gitignore`，不会提交到仓库。

## 模型接口

系统调用 OpenAI Chat Completions 兼容接口：

```text
POST {base_url}/chat/completions
```

页面预置：

- DeepSeek：`https://api.deepseek.com`
- Qwen 百炼：`https://dashscope.aliyuncs.com/compatible-mode/v1`

模型名称和 Base URL 均可修改。

## 使用步骤

1. 打开「标签字典」，上传标签字典 Excel。
2. 打开「测试集」，上传 JSONL、JSON 或 Excel 测试集。
3. 打开「Prompt」，新增标签提取系统提示词并保存启用。
4. 打开「模型配置」，分别新增标签提取模型和 Judge 模型。
5. 点击「测试连接」，确认 API Key 和模型名称有效。
6. 打开「运行测试」，选择字典、测试集、Prompt 和两个模型。
7. 点击「开始批量运行」。
8. 打开「测试结果」，查看汇总和单条 case 详情。

## 同步评测标签到 Supabase 人才库

运行完成后，运行详情页会显示「同步到人才库」按钮。点击后，系统会把本次 run 中 JSON 合法且 Judge 为 `PASS` / `PARTIAL` 的提取结果写入 Supabase `candidate_talent` 表。

需要在 `.env.local` 配置：

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

也可以直接配置完整 REST 地址：

```bash
SUPABASE_REST_URL=https://your-project.supabase.co/rest/v1/candidate_talent
SUPABASE_SERVICE_ROLE_KEY=
```

同步匹配规则：

- 优先使用测试 case 的 `source_session_id` 匹配 `candidate_talent.external_userid`。
- 历史已导入测试集如果没有单独保存 `source_session_id`，会回退使用 `input_json.source_session_id`，再回退使用 `input_json.conversation_id`。
- `gender`、`age`、`hukou_location`、`current_location`、`height_cm`、`driver_license_type`、`driving_years`、`marital_status`、`work_experience_years`、`education_level`、`is_currently_employed` 会直接写入同名字段。
- 其他标签会按 `tag_code` 合并写入 `candidate_tags` JSON 对象，并保留 `value`、`raw_value`、`confidence`、`run_id`、`case_id`、`source_session_id` 和 `synced_at`。
- 本次未提取到的字段不会被清空；重复点击会覆盖本次涉及的字段和 `candidate_tags` 中相同 `tag_code`。

`SUPABASE_SERVICE_ROLE_KEY` 权限很高，只能放在本地 `.env.local`，不要提交到仓库或写到前端代码里。

## 测试数据

仓库不包含任何测试数据、示例数据、评测结果或业务文档。请在本地页面上传自己的标签字典和测试集。

Excel 测试集会读取 `TestCases` sheet。若包含 `JudgePrompt` sheet，系统会同步导入并启用该评审提示词。

## 数据存储

应用使用本地 SQLite，数据库文件位于：

```text
data/app.db
```

本地数据库不会提交到仓库。新环境首次启动时会自动创建数据库表。

## 验证命令

```bash
npm run lint
npm run build
npm audit --omit=dev
```
