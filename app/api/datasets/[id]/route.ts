import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataset = db.prepare("SELECT * FROM datasets WHERE id = ?").get(id);
  const cases = db
    .prepare("SELECT * FROM test_cases WHERE dataset_id = ? ORDER BY id")
    .all(id);
  return NextResponse.json({ dataset, cases });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  db.prepare("DELETE FROM datasets WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
