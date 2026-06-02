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
`);

const judgePrompt = `你是招聘标签提取测试系统的评审助手。请对比测试用例预期和模型实际输出。
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
