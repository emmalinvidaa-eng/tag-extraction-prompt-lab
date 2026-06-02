"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: number; name: string; usage_type?: string; is_active?: number };

export default function NewRunPage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Option[]>([]);
  const [dictionaries, setDictionaries] = useState<Option[]>([]);
  const [prompts, setPrompts] = useState<Option[]>([]);
  const [models, setModels] = useState<Option[]>([]);
  const [form, setForm] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([
      fetch("/api/datasets").then((r) => r.json()),
      fetch("/api/dictionaries").then((r) => r.json()),
      fetch("/api/prompts").then((r) => r.json()),
      fetch("/api/models").then((r) => r.json()),
    ]).then(([d, td, p, m]) => { setDatasets(d); setDictionaries(td); setPrompts(p); setModels(m); });
  }, []);
  async function start() {
    setError("");
    const response = await fetch("/api/runs", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    router.push(`/runs/${result.id}`);
  }
  const select = (name: string, list: Option[], filter?: (item: Option) => boolean) =>
    <select value={form[name] || ""} onChange={(e) => setForm({ ...form, [name]: Number(e.target.value) })}><option value="">请选择</option>
      {list.filter(filter || (() => true)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
  return <section><h2>运行测试</h2><div className="card grid">
    <label>标签字典{select("dictionary_id", dictionaries)}</label>
    <label>测试集{select("dataset_id", datasets)}</label>
    <label>启用 Prompt{select("prompt_id", prompts, (item) => Boolean(item.is_active))}</label>
    <label>提取模型{select("extractor_model_config_id", models, (item) => item.usage_type === "extractor")}</label>
    <label>Judge 模型{select("judge_model_config_id", models, (item) => item.usage_type === "judge")}</label>
    <div><button onClick={start}>开始批量运行</button></div>
    {error && <p className="error">{error}</p>}
  </div></section>;
}
