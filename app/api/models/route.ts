import { NextResponse } from "next/server";
import db from "@/lib/db";

function masked(row: Record<string, unknown>) {
  const key = String(row.api_key || "");
  return {
    ...row,
    api_key: undefined,
    has_api_key: Boolean(key),
    api_key_masked: key ? `${key.slice(0, 3)}***${key.slice(-3)}` : "",
  };
}

export async function GET() {
  return NextResponse.json(
    (db.prepare("SELECT * FROM model_configs ORDER BY id DESC").all() as Record<
      string,
      unknown
    >[]).map(masked),
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.usage_type || !body.base_url || !body.model) {
      throw new Error("名称、用途、Base URL 和模型名不能为空");
    }
    if (body.id) {
      const previous = db
        .prepare("SELECT api_key FROM model_configs WHERE id = ?")
        .get(body.id) as { api_key: string };
      db.prepare(
        `UPDATE model_configs SET name = ?, usage_type = ?, provider_name = ?,
          base_url = ?, api_key = ?, model = ?, temperature = ?, max_tokens = ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(
        body.name,
        body.usage_type,
        body.provider_name || "custom",
        body.base_url,
        body.api_key || previous.api_key,
        body.model,
        Number(body.temperature ?? 0),
        Number(body.max_tokens ?? 4096),
        body.id,
      );
      return NextResponse.json({ id: body.id });
    }
    const inserted = db
      .prepare(
        `INSERT INTO model_configs (
          name, usage_type, provider_name, base_url, api_key, model, temperature, max_tokens
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.name,
        body.usage_type,
        body.provider_name || "custom",
        body.base_url,
        body.api_key || "",
        body.model,
        Number(body.temperature ?? 0),
        Number(body.max_tokens ?? 4096),
      );
    return NextResponse.json({ id: inserted.lastInsertRowid });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
