import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS tag_dictionaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tag_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dictionary_id INTEGER NOT NULL REFERENCES tag_dictionaries(id) ON DELETE CASCADE,
    definition_type TEXT,
    tag_code TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    tag_description TEXT,
    industry_scope TEXT,
    visibility_scope TEXT,
    owner_user_id TEXT,
    tag_type TEXT,
    business_category TEXT,
    usage_hint TEXT,
    data_type TEXT,
    enum_values TEXT,
    normalization_rule TEXT,
    update_policy TEXT,
    tag_status TEXT,
    raw_json TEXT NOT NULL,
    UNIQUE(dictionary_id, tag_code)
  );

  CREATE TABLE IF NOT EXISTS datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL,
    case_name TEXT NOT NULL,
    source_session_id TEXT,
    priority TEXT,
    category TEXT,
    tag_dictionary_ids_json TEXT NOT NULL DEFAULT '[]',
    input_json TEXT NOT NULL,
    expected_json TEXT NOT NULL,
    judge_focus TEXT,
    forbidden_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(dataset_id, case_id)
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS judge_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS model_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    usage_type TEXT NOT NULL CHECK(usage_type IN ('extractor', 'judge')),
    provider_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id INTEGER NOT NULL REFERENCES datasets(id),
    dictionary_id INTEGER NOT NULL REFERENCES tag_dictionaries(id),
    prompt_id INTEGER NOT NULL REFERENCES prompts(id),
    extractor_model_config_id INTEGER NOT NULL REFERENCES model_configs(id),
    judge_model_config_id INTEGER NOT NULL REFERENCES model_configs(id),
    status TEXT NOT NULL DEFAULT 'pending',
    total_cases INTEGER NOT NULL DEFAULT 0,
    completed_cases INTEGER NOT NULL DEFAULT 0,
    pass_count INTEGER NOT NULL DEFAULT 0,
    partial_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    parse_failed_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS test_run_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    test_case_id INTEGER NOT NULL REFERENCES test_cases(id),
    actual_output_raw TEXT,
    actual_output_json TEXT,
    json_parse_success INTEGER NOT NULL DEFAULT 0,
    judge_output_raw TEXT,
    judge_output_json TEXT,
    judge_result TEXT,
    score REAL,
    judge_reason TEXT,
    latency_ms INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS candidate_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    summary_json TEXT NOT NULL DEFAULT '{}',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS candidate_sync_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id INTEGER NOT NULL REFERENCES candidate_sync_runs(id) ON DELETE CASCADE,
    run_result_id INTEGER REFERENCES test_run_results(id) ON DELETE SET NULL,
    test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
    case_id TEXT,
    external_userid TEXT,
    status TEXT NOT NULL,
    reason TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

ensureColumn("test_cases", "source_session_id", "TEXT");

const judgePrompt = `你是招聘标签提取测试系统的评审助手。请评估模型是否从输入对话中正确提取了候选人标签。

核心评测边界：
1. 只评估输入对话里已经明确出现的信息，尤其是候选人/用户消息中的事实、偏好、意向、异议和最终态度。
2. 不要按照岗位、业务流程或 agent 应追问/应收集的必填项来扣分。expected.must_include_tags 里如果某个标签在候选人/用户消息中没有明确证据，即使它是岗位必填项，也不能算“缺失标签”。
3. assistant_message 只能作为上下文，不能把助手提供的岗位信息、推断、建议或复述反向当成候选人事实。只有用户明确确认、接受、拒绝、补充的信息才算候选人信息。
4. scope、current_job_id、visibility_scope、owner_user_id 属于标签权限/可见范围或系统归属字段，不是标签提取质量本身。除非用例 judge_focus 明确要求评测权限字段，否则不要因为这些字段缺失或取值不同判 FAIL/PARTIAL。
5. raw_value_contains 只用于核对证据是否能回到原文。允许原始片段有等价截取，例如 gender 用“女”、age 用“57”分别命中时，不要因为没有合并成“女57”而判主错误；最多记为次要建议。
6. must_include_tags 的正确评测方式：先判断 expected 中的标签是否有明确对话证据；有证据但 actual_output 没提、提错标签值、提错标准化结果，才算 missing_expected_tags 或 field_errors。
7. must_not_include_tags 和 forbidden 仍需严格评估：如果模型把对话没有表达的信息、助手信息、或被禁止的信息写成标签，应扣分。
8. 如果实际输出不是合法 JSON，或无法找到标签数组，优先判 FAIL 并说明 JSON/结构问题。

判分必须体现提取完整度差异，不要把所有 PARTIAL 都给 70 分。

先做错误分级：
- 关键标签：本 case 的核心事实、核心求职意向、核心当前职位反馈、明确风险/异议、必须用于业务判断的标签。
- 次要标签：辅助事实、弱偏好、非核心标准化细节、raw_value/evidence 轻微偏差。
- 严重错误：JSON 不可用、输出为空但有多项明确信息、把助手/岗位要求当候选人事实、虚构关键标签、违反 forbidden。

分数规则：
- 95-100：PASS。全部关键标签和主要次要标签正确，仅允许极轻微措辞差异。
- 90-94：PASS。关键标签全对，有 1 个很轻微的非核心字段/证据问题。
- 80-89：PARTIAL 偏高。关键标签基本完整，只遗漏 1 个次要标签，或 1 个非核心标准化/证据问题。
- 70-79：PARTIAL 中等。主要信息已提取，但遗漏 1 个关键标签，或遗漏 2 个次要标签，且没有虚构/误抽关键标签。
- 60-69：PARTIAL 偏低。提取了一部分主要信息，但遗漏多个有明确证据的标签，或遗漏 1 个关键标签并伴随若干次要错误。
- 50-59：PARTIAL 临界。只提取到少量信息，多个关键标签缺失，但仍有一些正确标签可用，且没有严重虚构或 forbidden 违规。
- 30-49：FAIL 偏高。提取到少量正确信息，但关键标签大面积缺失，或存在明显误抽。
- 1-29：FAIL。几乎不可用、输出为空但对话有明确标签信息、严重虚构、严重违反 forbidden、或 JSON/结构不可用。
- 0：仅用于完全无法评测或输出彻底不可用的情况。

分数必须与 judge_result 一致：
- judge_result=PASS 时，score 必须在 90-100。
- judge_result=PARTIAL 时，score 必须在 50-89。
- judge_result=FAIL 时，score 必须在 0-49。
- 如果只有 1 个有明确证据的次要标签缺失，通常应给 80-89，不要给 70。
- 如果多个有明确证据的关键标签缺失，通常应给 50-69；必要时判 FAIL。
- judge_reason 必须说明扣分来自哪些关键/次要问题，避免只写“整体尚可”。

只输出 JSON，不要输出 Markdown。
输出格式：
{
  "judge_result": "PASS/PARTIAL/FAIL",
  "score": 0,
  "judge_reason": "整体判断原因",
  "missing_expected_tags": [],
  "unexpected_tags": [],
  "forbidden_violations": [],
  "field_errors": [],
  "action_errors": [],
  "json_format_errors": [],
  "ignored_expected_items": [],
  "improvement_suggestion": ""
}`;

if (
  !db.prepare("SELECT id FROM judge_prompts WHERE is_active = 1 LIMIT 1").get()
) {
  db.prepare(
    "INSERT INTO judge_prompts (name, content, is_active) VALUES (?, ?, 1)",
  ).run("默认 Judge Prompt", judgePrompt);
}

export default db;
