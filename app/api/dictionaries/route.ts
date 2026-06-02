import { NextResponse } from "next/server";
import db from "@/lib/db";
import { parseDictionaryXlsx } from "@/lib/importers";

export const runtime = "nodejs";

export async function GET() {
  const dictionaries = db
    .prepare(
      `SELECT d.*, COUNT(t.id) AS tag_count
       FROM tag_dictionaries d
       LEFT JOIN tag_definitions t ON t.dictionary_id = d.id
       GROUP BY d.id ORDER BY d.id DESC`,
    )
    .all();
  return NextResponse.json(dictionaries);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择标签字典 Excel 文件");
    if (!file.name.endsWith(".xlsx")) throw new Error("标签字典仅支持 .xlsx");

    const definitions = await parseDictionaryXlsx(Buffer.from(await file.arrayBuffer()));
    if (!definitions.length) throw new Error("没有读取到标签定义");

    const insert = db.transaction(() => {
      const dictionary = db
        .prepare("INSERT INTO tag_dictionaries (name, file_name) VALUES (?, ?)")
        .run(String(form.get("name") || file.name), file.name);
      const statement = db.prepare(
        `INSERT INTO tag_definitions (
          dictionary_id, definition_type, tag_code, tag_name, tag_description,
          industry_scope, visibility_scope, owner_user_id, tag_type,
          business_category, usage_hint, data_type, enum_values,
          normalization_rule, update_policy, tag_status, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of definitions) {
        statement.run(
          dictionary.lastInsertRowid,
          item.definition_type,
          item.tag_code,
          item.tag_name,
          item.tag_description,
          item.industry_scope,
          item.visibility_scope,
          item.owner_user_id,
          item.tag_type,
          item.business_category,
          item.usage_hint,
          item.data_type,
          item.enum_values,
          item.normalization_rule,
          item.update_policy,
          item.tag_status,
          item.raw_json,
        );
      }
      return dictionary.lastInsertRowid;
    });
    return NextResponse.json({ id: insert(), count: definitions.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
