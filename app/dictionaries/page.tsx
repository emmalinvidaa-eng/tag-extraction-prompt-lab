"use client";

import { useEffect, useState } from "react";

type Dictionary = { id: number; name: string; file_name: string; tag_count: number; created_at: string };

export default function DictionariesPage() {
  const [items, setItems] = useState<Dictionary[]>([]);
  const [error, setError] = useState("");
  const load = () => fetch("/api/dictionaries").then((r) => r.json()).then(setItems);
  useEffect(() => { void load(); }, []);

  async function upload(formData: FormData) {
    setError("");
    const response = await fetch("/api/dictionaries", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    await load();
  }

  async function remove(id: number) {
    if (!confirm("确认删除该标签字典版本？")) return;
    await fetch(`/api/dictionaries/${id}`, { method: "DELETE" });
    await load();
  }

  return <section>
    <h2>标签字典</h2>
    <div className="card">
      <form action={upload} className="grid two">
        <label>字典名称<input name="name" placeholder="默认使用文件名" /></label>
        <label>Excel 文件<input name="file" type="file" accept=".xlsx" required /></label>
        <div><button type="submit">导入标签字典</button></div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
    <div className="card">
      <table><thead><tr><th>名称</th><th>文件</th><th>标签数</th><th>导入时间</th><th>操作</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td>{item.name}</td><td>{item.file_name}</td><td>{item.tag_count}</td><td>{item.created_at}</td>
          <td className="actions"><a href={`/api/dictionaries/${item.id}`}>查看 JSON</a><button className="danger" onClick={() => remove(item.id)}>删除</button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
