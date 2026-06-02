import { NextResponse } from "next/server";
import db from "@/lib/db";
import { parseTestCases } from "@/lib/importers";

export const runtime = "nodejs";

export async function GET() {
  const datasets = db
    .prepare(
      `SELECT d.*, COUNT(t.id) AS case_count
       FROM datasets d LEFT JOIN test_cases t ON t.dataset_id = d.id
       GROUP BY d.id ORDER BY d.id DESC`,
    )
    .all();
  return NextResponse.json(datasets);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择测试集文件");
    const parsed = await parseTestCases(file.name, Buffer.from(await file.arrayBuffer()));
    if (!parsed.cases.length) throw new Error("没有读取到测试 case");

    const insert = db.transaction(() => {
      const dataset = db
        .prepare("INSERT INTO datasets (name, file_name) VALUES (?, ?)")
        .run(String(form.get("name") || file.name), file.name);
      const statement = db.prepare(
        `INSERT INTO test_cases (
          dataset_id, case_id, case_name, priority, category,
          tag_dictionary_ids_json, input_json, expected_json, judge_focus, forbidden_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of parsed.cases) {
        statement.run(
          dataset.lastInsertRowid,
          item.case_id,
          item.case_name,
          item.priority ?? null,
          item.category ?? null,
          JSON.stringify(item.tag_dictionary_ids ?? []),
          JSON.stringify(item.input),
          JSON.stringify(item.expected),
          item.judge_focus ?? null,
          JSON.stringify(item.forbidden ?? []),
        );
      }
      if (parsed.judgePrompt) {
        db.prepare("UPDATE judge_prompts SET is_active = 0").run();
        db.prepare(
          "INSERT INTO judge_prompts (name, content, is_active) VALUES (?, ?, 1)",
        ).run(`${file.name} / JudgePrompt`, parsed.judgePrompt);
      }
      return dataset.lastInsertRowid;
    });

    return NextResponse.json({ id: insert(), count: parsed.cases.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
