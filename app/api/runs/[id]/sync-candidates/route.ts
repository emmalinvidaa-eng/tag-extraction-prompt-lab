import { NextResponse } from "next/server";
import { syncRunCandidates } from "@/lib/candidate-sync";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const runId = Number(id);
    if (!Number.isInteger(runId) || runId <= 0) {
      throw new Error("运行 ID 无效");
    }
    return NextResponse.json(await syncRunCandidates(runId));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
