import db from "@/lib/db";
import { chatCompletion, parseJsonOutput } from "@/lib/model-client";
import type { JsonObject, ModelConfig, TestCase } from "@/lib/types";

function getById<T>(table: string, id: number) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as T;
}

function selectDictionary(dictionaryId: number, ids: string[]) {
  if (!ids.length) {
    return db
      .prepare(
        "SELECT * FROM tag_definitions WHERE dictionary_id = ? AND COALESCE(tag_status, 'active') != 'archived'",
      )
      .all(dictionaryId);
  }
  const placeholders = ids.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT * FROM tag_definitions
       WHERE dictionary_id = ? AND tag_code IN (${placeholders})
       AND COALESCE(tag_status, 'active') != 'archived'`,
    )
    .all(dictionaryId, ...ids);
}

function resultValue(value: unknown) {
  return value === undefined || value === null ? null : String(value);
}

function judgeResult(judgeJson: JsonObject | null) {
  const result = judgeJson?.judge_result ?? judgeJson?.result;
  return result === "PASS" || result === "PARTIAL" || result === "FAIL"
    ? result
    : "FAIL";
}

function judgeReason(judgeJson: JsonObject | null) {
  if (!judgeJson) return null;
  if (typeof judgeJson.judge_reason === "string") return judgeJson.judge_reason;
  const failedChecks = Array.isArray(judgeJson.failed_checks)
    ? judgeJson.failed_checks.map(String)
    : [];
  if (failedChecks.length) return failedChecks.join("；");
  return typeof judgeJson.suggested_prompt_fix === "string"
    ? judgeJson.suggested_prompt_fix
    : null;
}

export async function executeRun(runId: number) {
  const run = db.prepare("SELECT * FROM test_runs WHERE id = ?").get(runId) as {
    dataset_id: number;
    dictionary_id: number;
    prompt_id: number;
    extractor_model_config_id: number;
    judge_model_config_id: number;
  };
  const prompt = getById<{ content: string }>("prompts", run.prompt_id);
  const extractor = getById<ModelConfig>(
    "model_configs",
    run.extractor_model_config_id,
  );
  const judge = getById<ModelConfig>(
    "model_configs",
    run.judge_model_config_id,
  );
  const judgePrompt = db
    .prepare("SELECT content FROM judge_prompts WHERE is_active = 1 LIMIT 1")
    .get() as { content: string };
  const cases = db
    .prepare("SELECT * FROM test_cases WHERE dataset_id = ? ORDER BY id")
    .all(run.dataset_id) as TestCase[];

  db.prepare(
    "UPDATE test_runs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(runId);

  try {
    for (const testCase of cases) {
      const started = Date.now();
      let actualRaw = "";
      let actualJson: JsonObject | null = null;
      let judgeRaw = "";
      let judgeJson: JsonObject | null = null;
      let errorMessage: string | null = null;

      try {
        const dictionaryIds = JSON.parse(testCase.tag_dictionary_ids_json);
        const dictionary = selectDictionary(run.dictionary_id, dictionaryIds);
        actualRaw = await chatCompletion(extractor, [
          { role: "system", content: prompt.content },
          {
            role: "user",
            content: JSON.stringify({
              ...JSON.parse(testCase.input_json),
              tag_dictionary: dictionary,
            }),
          },
        ]);
        try {
          actualJson = parseJsonOutput(actualRaw);
        } catch (error) {
          errorMessage = `提取输出 JSON 解析失败: ${(error as Error).message}`;
        }

        judgeRaw = await chatCompletion(judge, [
          { role: "system", content: judgePrompt.content },
          {
            role: "user",
            content: JSON.stringify({
              case_id: testCase.case_id,
              case_name: testCase.case_name,
              input: JSON.parse(testCase.input_json),
              expected: JSON.parse(testCase.expected_json),
              judge_focus: testCase.judge_focus,
              forbidden: JSON.parse(testCase.forbidden_json),
              actual_output: actualJson ?? actualRaw,
              extractor_json_parse_success: Boolean(actualJson),
            }),
          },
        ]);
        try {
          judgeJson = parseJsonOutput(judgeRaw);
        } catch (error) {
          errorMessage = [errorMessage, `Judge 输出 JSON 解析失败: ${(error as Error).message}`]
            .filter(Boolean)
            .join("; ");
        }
      } catch (error) {
        errorMessage = [errorMessage, (error as Error).message]
          .filter(Boolean)
          .join("; ");
      }

      const normalizedJudgeResult = judgeResult(judgeJson);
      db.prepare(
        `INSERT INTO test_run_results (
          run_id, test_case_id, actual_output_raw, actual_output_json,
          json_parse_success, judge_output_raw, judge_output_json, judge_result,
          score, judge_reason, latency_ms, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        runId,
        testCase.id,
        actualRaw,
        actualJson ? JSON.stringify(actualJson) : null,
        actualJson ? 1 : 0,
        judgeRaw,
        judgeJson ? JSON.stringify(judgeJson) : null,
        normalizedJudgeResult,
        typeof judgeJson?.score === "number" ? judgeJson.score : null,
        resultValue(judgeReason(judgeJson)),
        Date.now() - started,
        errorMessage,
      );

      db.prepare(
        `UPDATE test_runs SET
          completed_cases = completed_cases + 1,
          pass_count = pass_count + ?,
          partial_count = partial_count + ?,
          fail_count = fail_count + ?,
          parse_failed_count = parse_failed_count + ?
        WHERE id = ?`,
      ).run(
        normalizedJudgeResult === "PASS" ? 1 : 0,
        normalizedJudgeResult === "PARTIAL" ? 1 : 0,
        normalizedJudgeResult === "FAIL" ? 1 : 0,
        actualJson ? 0 : 1,
        runId,
      );
    }

    db.prepare(
      "UPDATE test_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(runId);
  } catch (error) {
    db.prepare(
      "UPDATE test_runs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run((error as Error).message, runId);
  }
}
