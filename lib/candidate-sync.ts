import db from "@/lib/db";
import type { JsonObject } from "@/lib/types";

const DIRECT_TAG_CODES = new Set([
  "gender",
  "age",
  "hukou_location",
  "current_location",
  "height_cm",
  "driver_license_type",
  "driving_years",
  "marital_status",
  "work_experience_years",
  "education_level",
  "is_currently_employed",
]);

type SyncSummary = {
  total_results: number;
  eligible_results: number;
  matched_candidates: number;
  updated_candidates: number;
  skipped_no_external_userid: number;
  skipped_no_supabase_match: number;
  skipped_invalid_json: number;
  skipped_ineligible: number;
  errors: number;
};

type RunResultRow = {
  id: number;
  test_case_id: number;
  case_id: string;
  source_session_id: string | null;
  input_json: string;
  actual_output_json: string | null;
  json_parse_success: number;
  judge_result: string | null;
};

type ExtractedTag = JsonObject & {
  tag_code?: unknown;
  tag_value?: unknown;
  raw_value?: unknown;
  confidence?: unknown;
};

type CandidatePatch = {
  direct: JsonObject;
  candidateTags: JsonObject;
  resultIds: number[];
  caseIds: string[];
  externalUserid: string;
};

function emptySummary(): SyncSummary {
  return {
    total_results: 0,
    eligible_results: 0,
    matched_candidates: 0,
    updated_candidates: 0,
    skipped_no_external_userid: 0,
    skipped_no_supabase_match: 0,
    skipped_invalid_json: 0,
    skipped_ineligible: 0,
    errors: 0,
  };
}

function parseObject(raw: string | null): JsonObject | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function externalUserid(row: RunResultRow) {
  const input = parseObject(row.input_json) ?? {};
  return (
    textValue(row.source_session_id) ??
    textValue(input.source_session_id) ??
    textValue(input.conversation_id)
  );
}

function scalarValue(value: unknown) {
  if (Array.isArray(value)) {
    if (!value.length) return undefined;
    if (value.length === 1) return value[0];
    return value.map((item) => String(item)).join("、");
  }
  return value;
}

function extractedTags(actualOutput: JsonObject | null) {
  const tags = actualOutput?.extracted_tag_values;
  return Array.isArray(tags) ? (tags.filter((tag) => tag && typeof tag === "object") as ExtractedTag[]) : null;
}

function supabaseTableUrl() {
  const restUrl = process.env.SUPABASE_REST_URL;
  const projectUrl = process.env.SUPABASE_URL;
  const base = restUrl || (projectUrl ? `${projectUrl.replace(/\/$/, "")}/rest/v1/candidate_talent` : "");
  if (!base) throw new Error("缺少 SUPABASE_REST_URL 或 SUPABASE_URL");
  return base.endsWith("/candidate_talent")
    ? base
    : `${base.replace(/\/$/, "")}/candidate_talent`;
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function detail(
  syncRunId: number,
  row: Partial<RunResultRow>,
  status: string,
  reason: string,
  payload: JsonObject = {},
  errorMessage: string | null = null,
  externalUseridValue: string | null = null,
) {
  db.prepare(
    `INSERT INTO candidate_sync_results (
      sync_run_id, run_result_id, test_case_id, case_id, external_userid,
      status, reason, payload_json, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    syncRunId,
    row.id ?? null,
    row.test_case_id ?? null,
    row.case_id ?? null,
    externalUseridValue,
    status,
    reason,
    JSON.stringify(payload),
    errorMessage,
  );
}

async function fetchCandidate(url: string, headers: Record<string, string>, externalUseridValue: string) {
  const query = new URLSearchParams({
    select: "id,candidate_tags",
    external_userid: `eq.${externalUseridValue}`,
    limit: "1",
  });
  const response = await fetch(`${url}?${query.toString()}`, { headers });
  if (!response.ok) {
    throw new Error(`Supabase 查询失败 ${response.status}: ${await response.text()}`);
  }
  const rows = (await response.json()) as Array<{ id: number; candidate_tags?: unknown }>;
  return rows[0] ?? null;
}

async function patchCandidate(
  url: string,
  headers: Record<string, string>,
  externalUseridValue: string,
  payload: JsonObject,
) {
  const query = new URLSearchParams({ external_userid: `eq.${externalUseridValue}` });
  const response = await fetch(`${url}?${query.toString()}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Supabase 更新失败 ${response.status}: ${await response.text()}`);
  }
}

export async function syncRunCandidates(runId: number) {
  const run = db.prepare("SELECT id, status FROM test_runs WHERE id = ?").get(runId) as
    | { id: number; status: string }
    | undefined;
  if (!run) throw new Error("运行不存在");
  if (run.status !== "completed") throw new Error("只有 completed 状态的运行可以同步");

  const syncRun = db
    .prepare("INSERT INTO candidate_sync_runs (run_id, status) VALUES (?, 'running')")
    .run(runId);
  const syncRunId = Number(syncRun.lastInsertRowid);
  const summary = emptySummary();

  try {
    const url = supabaseTableUrl();
    const headers = supabaseHeaders();
    const rows = db
      .prepare(
        `SELECT rr.id, rr.test_case_id, rr.actual_output_json, rr.json_parse_success,
          rr.judge_result, tc.case_id, tc.source_session_id, tc.input_json
        FROM test_run_results rr
        JOIN test_cases tc ON tc.id = rr.test_case_id
        WHERE rr.run_id = ?
        ORDER BY rr.id`,
      )
      .all(runId) as RunResultRow[];
    summary.total_results = rows.length;

    const patches = new Map<string, CandidatePatch>();
    const eligibleRows: Array<{ row: RunResultRow; externalUseridValue: string }> = [];

    for (const row of rows) {
      if (
        row.json_parse_success !== 1 ||
        (row.judge_result !== "PASS" && row.judge_result !== "PARTIAL")
      ) {
        summary.skipped_ineligible += 1;
        detail(syncRunId, row, "skipped", "结果不是 JSON 合法的 PASS/PARTIAL");
        continue;
      }

      const actualOutput = parseObject(row.actual_output_json);
      const tags = extractedTags(actualOutput);
      if (!tags) {
        summary.skipped_invalid_json += 1;
        detail(syncRunId, row, "skipped", "提取输出缺少 extracted_tag_values 数组");
        continue;
      }
      if (!tags.length) {
        summary.skipped_ineligible += 1;
        detail(syncRunId, row, "skipped", "提取输出没有可同步标签");
        continue;
      }

      const externalUseridValue = externalUserid(row);
      if (!externalUseridValue) {
        summary.skipped_no_external_userid += 1;
        detail(syncRunId, row, "skipped", "缺少 source_session_id / conversation_id");
        continue;
      }

      summary.eligible_results += 1;
      eligibleRows.push({ row, externalUseridValue });
      const patch = patches.get(externalUseridValue) ?? {
        direct: {},
        candidateTags: {},
        resultIds: [],
        caseIds: [],
        externalUserid: externalUseridValue,
      };

      for (const tag of tags) {
        const tagCode = textValue(tag.tag_code);
        if (!tagCode) continue;
        if (DIRECT_TAG_CODES.has(tagCode)) {
          const value = scalarValue(tag.tag_value);
          if (value !== undefined) patch.direct[tagCode] = value;
          continue;
        }
        patch.candidateTags[tagCode] = {
          value: tag.tag_value,
          raw_value: tag.raw_value,
          confidence: tag.confidence,
          run_id: runId,
          case_id: row.case_id,
          source_session_id: externalUseridValue,
          synced_at: new Date().toISOString(),
        };
      }
      patch.resultIds.push(row.id);
      patch.caseIds.push(row.case_id);
      patches.set(externalUseridValue, patch);
    }

    for (const patch of patches.values()) {
      try {
        const candidate = await fetchCandidate(url, headers, patch.externalUserid);
        if (!candidate) {
          summary.skipped_no_supabase_match += patch.resultIds.length;
          for (const item of eligibleRows.filter((entry) => entry.externalUseridValue === patch.externalUserid)) {
            detail(syncRunId, item.row, "skipped", "Supabase 未找到 external_userid", {}, null, patch.externalUserid);
          }
          continue;
        }

        const existingTags =
          candidate.candidate_tags && typeof candidate.candidate_tags === "object" && !Array.isArray(candidate.candidate_tags)
            ? (candidate.candidate_tags as JsonObject)
            : {};
        const payload: JsonObject = {
          ...patch.direct,
          candidate_tags: { ...existingTags, ...patch.candidateTags },
        };
        await patchCandidate(url, headers, patch.externalUserid, payload);
        summary.matched_candidates += 1;
        summary.updated_candidates += 1;
        for (const item of eligibleRows.filter((entry) => entry.externalUseridValue === patch.externalUserid)) {
          detail(syncRunId, item.row, "updated", "已同步到 Supabase", payload, null, patch.externalUserid);
        }
      } catch (error) {
        summary.errors += patch.resultIds.length;
        for (const item of eligibleRows.filter((entry) => entry.externalUseridValue === patch.externalUserid)) {
          detail(
            syncRunId,
            item.row,
            "error",
            "同步 Supabase 失败",
            {},
            (error as Error).message,
            patch.externalUserid,
          );
        }
      }
    }

    db.prepare(
      "UPDATE candidate_sync_runs SET status = 'completed', summary_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(JSON.stringify(summary), syncRunId);
    return { sync_run_id: syncRunId, summary };
  } catch (error) {
    summary.errors += 1;
    db.prepare(
      `UPDATE candidate_sync_runs
       SET status = 'failed', summary_json = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(JSON.stringify(summary), (error as Error).message, syncRunId);
    throw error;
  }
}
