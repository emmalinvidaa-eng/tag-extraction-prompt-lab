import type { JsonObject, ModelConfig } from "@/lib/types";

type ChatMessage = { role: "system" | "user"; content: string };

export function completionUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function resolveApiKey(config: ModelConfig) {
  if (config.api_key) return config.api_key;
  if (config.provider_name === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (config.provider_name === "qwen") return process.env.DASHSCOPE_API_KEY;
  return undefined;
}

export async function chatCompletion(
  config: ModelConfig,
  messages: ChatMessage[],
) {
  const apiKey = resolveApiKey(config);
  if (!apiKey) throw new Error(`模型配置「${config.name}」缺少 API Key`);

  const response = await fetch(completionUrl(config.base_url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    }),
  });

  const payload = (await response.json()) as JsonObject;
  if (!response.ok) {
    throw new Error(
      `模型调用失败 (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  const choices = payload.choices as Array<{
    message?: { content?: string };
  }>;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new Error("模型响应缺少 choices[0].message.content");
  return content;
}

export function parseJsonOutput(raw: string) {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(unfenced) as JsonObject;
}
