import { NextResponse } from "next/server";
import db from "@/lib/db";
import { chatCompletion } from "@/lib/model-client";
import type { ModelConfig } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = db
      .prepare("SELECT * FROM model_configs WHERE id = ?")
      .get(body.id) as ModelConfig;
    if (!config) throw new Error("模型配置不存在");
    const output = await chatCompletion(config, [
      { role: "system", content: "只回复 OK。" },
      { role: "user", content: "测试连接" },
    ]);
    return NextResponse.json({ ok: true, output });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
