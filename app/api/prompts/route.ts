import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  return NextResponse.json(
    db.prepare("SELECT * FROM prompts ORDER BY id DESC").all(),
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.content) throw new Error("Prompt 名称和内容不能为空");
    const current = db
      .prepare("SELECT MAX(version) AS version FROM prompts WHERE name = ?")
      .get(body.name) as { version: number | null };
    if (body.is_active) db.prepare("UPDATE prompts SET is_active = 0").run();
    const inserted = db
      .prepare(
        "INSERT INTO prompts (name, content, version, is_active) VALUES (?, ?, ?, ?)",
      )
      .run(body.name, body.content, (current.version ?? 0) + 1, body.is_active ? 1 : 0);
    return NextResponse.json({ id: inserted.lastInsertRowid });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
