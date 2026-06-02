"use client";

import { useEffect, useState } from "react";

type Config = {
  id: number; name: string; usage_type: string; provider_name: string; base_url: string;
  model: string; temperature: number; max_tokens: number; api_key_masked: string;
};

const presets = {
  deepseek: { base_url: "https://api.deepseek.com", model: "deepseek-v4-flash" },
  qwen: { base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3.6-plus" },
  custom: { base_url: "", model: "" },
};

const blank = {
  id: 0, name: "DeepSeek 提取模型", usage_type: "extractor", provider_name: "deepseek",
  base_url: presets.deepseek.base_url, api_key: "", model: presets.deepseek.model,
  temperature: 0, max_tokens: 4096,
};

export default function ModelsPage() {
  const [items, setItems] = useState<Config[]>([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const load = () => fetch("/api/models").then((r) => r.json()).then(setItems);
  useEffect(() => { void load(); }, []);
  function update(key: string, value: string | number) { setForm({ ...form, [key]: value }); }

  async function save() {
    setMessage("");
    const response = await fetch("/api/models", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error);
    setMessage("保存成功");
    setForm(blank);
    await load();
  }
  async function test(id: number) {
    setMessage("正在测试连接...");
    const response = await fetch("/api/models/test", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    const result = await response.json();
    setMessage(response.ok ? `连接成功：${result.output}` : result.error);
  }
  return <section>
    <h2>模型配置</h2>
    <div className="card grid two">
      <label>配置名称<input value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
      <label>用途<select value={form.usage_type} onChange={(e) => update("usage_type", e.target.value)}><option value="extractor">标签提取模型</option><option value="judge">AI Judge 模型</option></select></label>
      <label>供应商<select value={form.provider_name} onChange={(e) => {
        const provider = e.target.value as keyof typeof presets; setForm({ ...form, provider_name: provider, ...presets[provider] });
      }}><option value="deepseek">DeepSeek</option><option value="qwen">Qwen 百炼</option><option value="custom">自定义 OpenAI 兼容接口</option></select></label>
      <label>Base URL<input value={form.base_url} onChange={(e) => update("base_url", e.target.value)} /></label>
      <label>模型名<input value={form.model} onChange={(e) => update("model", e.target.value)} /></label>
      <label>API Key<input type="password" value={form.api_key} onChange={(e) => update("api_key", e.target.value)} placeholder={form.id ? "留空则保留原 Key" : "也可通过环境变量配置"} /></label>
      <label>Temperature<input type="number" step="0.1" value={form.temperature} onChange={(e) => update("temperature", Number(e.target.value))} /></label>
      <label>Max Tokens<input type="number" value={form.max_tokens} onChange={(e) => update("max_tokens", Number(e.target.value))} /></label>
      <div><button onClick={save}>保存模型配置</button></div>
      {message && <p className={message.includes("成功") ? "success" : "error"}>{message}</p>}
    </div>
    <div className="card"><table><thead><tr><th>名称</th><th>用途</th><th>供应商</th><th>模型</th><th>API Key</th><th>操作</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.usage_type}</td><td>{item.provider_name}</td><td>{item.model}</td><td>{item.api_key_masked || "环境变量 / 未配置"}</td>
        <td className="actions"><button className="secondary" onClick={() => setForm({ ...item, api_key: "" })}>编辑</button><button onClick={() => test(item.id)}>测试连接</button></td></tr>)}</tbody>
    </table></div>
  </section>;
}
