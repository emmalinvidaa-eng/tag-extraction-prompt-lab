"use client";

import { useEffect, useState } from "react";

type Dataset = { id: number; name: string; file_name: string; case_count: number; created_at: string };

export default function DatasetsPage() {
  const [items, setItems] = useState<Dataset[]>([]);
  const [error, setError] = useState("");
  const load = () => fetch("/api/datasets").then((r) => r.json()).then(setItems);
  useEffect(() => { void load(); }, []);
  async function upload(formData: FormData) {
    setError("");
    const response = await fetch("/api/datasets", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    await load();
  }
  async function remove(id: number) {
    if (!confirm("确认删除测试集？")) return;
    await fetch(`/api/datasets/${id}`, { method: "DELETE" });
    await load();
  }
  return <section>
    <h2>测试集</h2>
    <div className="card">
      <form action={upload} className="grid two">
        <label>测试集名称<input name="name" placeholder="默认使用文件名" /></label>
        <label>测试集文件<input name="file" type="file" accept=".jsonl,.json,.xlsx" required /></label>
        <div><button type="submit">导入测试集</button></div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
    <div className="card"><table><thead><tr><th>名称</th><th>文件</th><th>Case 数</th><th>导入时间</th><th>操作</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.file_name}</td><td>{item.case_count}</td><td>{item.created_at}</td>
        <td className="actions"><a href={`/api/datasets/${item.id}`}>查看 JSON</a><button className="danger" onClick={() => remove(item.id)}>删除</button></td></tr>)}</tbody>
    </table></div>
  </section>;
}
