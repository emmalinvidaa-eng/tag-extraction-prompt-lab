import { NextResponse } from "next/server";
import db from "@/lib/db";
import { executeRun } from "@/lib/run-service";

export async function GET() {
  return NextResponse.json(
    db
      .prepare(
        `SELECT r.*, d.name AS dataset_name, p.name AS prompt_name,
          e.name AS extractor_name, j.name AS judge_name
        FROM test_runs r
        JOIN datasets d ON d.id = r.dataset_id
        JOIN prompts p ON p.id = r.prompt_id
        JOIN model_configs e ON e.id = r.extractor_model_config_id
        JOIN model_configs j ON j.id = r.judge_model_config_id
        ORDER BY r.id DESC`,
      )
      .all(),
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const required = [
      "dataset_id",
      "dictionary_id",
      "prompt_id",
      "extractor_model_config_id",
      "judge_model_config_id",
    ];
    if (required.some((key) => !body[key])) throw new Error("请选择完整运行配置");
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM test_cases WHERE dataset_id = ?")
      .get(body.dataset_id) as { count: number };
    if (!count.count) throw new Error("测试集没有 case");

    const inserted = db
      .prepare(
        `INSERT INTO test_runs (
          dataset_id, dictionary_id, prompt_id, extractor_model_config_id,
          judge_model_config_id, total_cases
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.dataset_id,
        body.dictionary_id,
        body.prompt_id,
        body.extractor_model_config_id,
        body.judge_model_config_id,
        count.count,
      );
    const runId = Number(inserted.lastInsertRowid);
    void executeRun(runId);
    return NextResponse.json({ id: runId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
