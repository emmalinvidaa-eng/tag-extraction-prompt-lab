"use client";

import { useEffect, useState } from "react";

type Prompt = { id: number; name: string; version: number; content: string; is_active: number; created_at: string };

export default function PromptsPage() {
  const [items, setItems] = useState<Prompt[]>([]);
  const [name, setName] = useState("标签提取 Prompt");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const load = () => fetch("/api/prompts").then((r) => r.json()).then(setItems);
  useEffect(() => { void load(); }, []);

  async function save() {
    setError("");
    const response = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content, is_active: true }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    setContent("");
    await load();
  }

  return <section>
    <h2>Prompt 管理</h2>
    <div className="card grid">
      <label>Prompt 名称<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>系统提示词<textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="填写标签提取系统提示词。保存后自动设为当前启用版本。" /></label>
      <div><button onClick={save}>保存新版本并启用</button></div>
      {error && <p className="error">{error}</p>}
    </div>
    <div className="card"><table><thead><tr><th>名称</th><th>版本</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>v{item.version}</td><td>{item.is_active ? <span className="badge PASS">启用</span> : "历史版本"}</td><td>{item.created_at}</td>
        <td><button className="secondary" onClick={() => { setName(item.name); setContent(item.content); }}>基于此版本编辑</button></td></tr>)}</tbody>
    </table></div>
  </section>;
}
