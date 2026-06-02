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
git clone https://github.com/<your-account>/tag-extraction-prompt-lab.git
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

## 测试数据

仓库附带示例数据：

- `C标签表-一期 (1).xlsx`
- `tag_extraction_test_cases.jsonl`
- `tag_extraction_test_cases.json`
- `tag_extraction_test_cases.xlsx`
- `tag_extraction_inputs_only.jsonl`

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
