import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = db
    .prepare(
      `SELECT r.*, d.name AS dataset_name, td.name AS dictionary_name,
        p.name AS prompt_name, e.name AS extractor_name, j.name AS judge_name
      FROM test_runs r
      JOIN datasets d ON d.id = r.dataset_id
      JOIN tag_dictionaries td ON td.id = r.dictionary_id
      JOIN prompts p ON p.id = r.prompt_id
      JOIN model_configs e ON e.id = r.extractor_model_config_id
      JOIN model_configs j ON j.id = r.judge_model_config_id
      WHERE r.id = ?`,
    )
    .get(id);
  if (!run) return NextResponse.json({ error: "运行不存在" }, { status: 404 });
  const results = db
    .prepare(
      `SELECT rr.*, tc.case_id, tc.case_name, tc.input_json, tc.expected_json,
        tc.judge_focus, tc.forbidden_json
      FROM test_run_results rr
      JOIN test_cases tc ON tc.id = rr.test_case_id
      WHERE rr.run_id = ? ORDER BY rr.id`,
    )
    .all(id);
  return NextResponse.json({ run, results });
}
