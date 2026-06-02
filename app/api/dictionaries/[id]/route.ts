import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dictionary = db.prepare("SELECT * FROM tag_dictionaries WHERE id = ?").get(id);
  const definitions = db
    .prepare("SELECT * FROM tag_definitions WHERE dictionary_id = ? ORDER BY id")
    .all(id);
  return NextResponse.json({ dictionary, definitions });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  db.prepare("DELETE FROM tag_dictionaries WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
