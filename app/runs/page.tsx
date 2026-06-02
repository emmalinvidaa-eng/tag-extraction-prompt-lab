"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Run = { id: number; dataset_name: string; status: string; total_cases: number; completed_cases: number; pass_count: number; partial_count: number; fail_count: number; parse_failed_count: number; created_at: string };

export default function RunsPage() {
  const [items, setItems] = useState<Run[]>([]);
  useEffect(() => {
    const load = () => fetch("/api/runs").then((r) => r.json()).then(setItems);
    void load(); const timer = setInterval(load, 3000); return () => clearInterval(timer);
  }, []);
  return <section><h2>测试结果</h2><div className="card"><table><thead><tr><th>ID</th><th>测试集</th><th>状态</th><th>进度</th><th>PASS</th><th>PARTIAL</th><th>FAIL</th><th>解析失败</th><th>时间</th><th>操作</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.id}><td>#{item.id}</td><td>{item.dataset_name}</td><td>{item.status}</td><td>{item.completed_cases}/{item.total_cases}</td><td>{item.pass_count}</td><td>{item.partial_count}</td><td>{item.fail_count}</td><td>{item.parse_failed_count}</td><td>{item.created_at}</td><td><Link href={`/runs/${item.id}`}>查看详情</Link></td></tr>)}</tbody>
  </table></div></section>;
}
