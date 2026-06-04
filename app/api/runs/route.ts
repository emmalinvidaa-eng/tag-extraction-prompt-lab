import { NextResponse } from "next/server";
import db from "@/lib/db";
import { executeRun } from "@/lib/run-service";
import type { ModelConfig } from "@/lib/types";

function hasApiKey(config: ModelConfig) {
  if (config.api_key) return true;
  if (config.provider_name === "deepseek") return Boolean(process.env.DEEPSEEK_API_KEY);
  if (config.provider_name === "qwen") return Boolean(process.env.DASHSCOPE_API_KEY);
  return false;
}

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
    const extractor = db
      .prepare("SELECT * FROM model_configs WHERE id = ?")
      .get(body.extractor_model_config_id) as ModelConfig | undefined;
    const judge = db
      .prepare("SELECT * FROM model_configs WHERE id = ?")
      .get(body.judge_model_config_id) as ModelConfig | undefined;
    if (!extractor) throw new Error("提取模型配置不存在");
    if (!judge) throw new Error("Judge 模型配置不存在");
    if (!hasApiKey(extractor)) {
      throw new Error(`提取模型「${extractor.name}」缺少 API Key，请先在模型配置页填写或设置环境变量`);
    }
    if (!hasApiKey(judge)) {
      throw new Error(`Judge 模型「${judge.name}」缺少 API Key，请先在模型配置页填写或设置环境变量`);
    }

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
