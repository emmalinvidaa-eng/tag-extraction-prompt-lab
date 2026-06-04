"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Run = { id: number; status: string; total_cases: number; completed_cases: number; pass_count: number; partial_count: number; fail_count: number; parse_failed_count: number; dataset_name: string; dictionary_name: string; prompt_name: string; extractor_name: string; judge_name: string; error_message?: string };
type Result = { id: number; case_id: string; case_name: string; judge_result: string; score: number; json_parse_success: number; judge_reason: string; latency_ms: number; error_message: string; input_json: string; expected_json: string; actual_output_raw: string; actual_output_json: string; judge_output_json: string };
type SyncSummary = {
  total_results: number;
  eligible_results: number;
  matched_candidates: number;
  updated_candidates: number;
  skipped_no_external_userid: number;
  skipped_no_supabase_match: number;
  skipped_invalid_json: number;
  skipped_ineligible: number;
  errors: number;
};
type SyncResponse = { sync_run_id: number; summary: SyncSummary };

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ run: Run; results: Result[] }>();
  const [detail, setDetail] = useState<Result>();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResponse>();
  const [syncError, setSyncError] = useState<string>();
  useEffect(() => {
    const load = () => fetch(`/api/runs/${params.id}`).then((r) => r.json()).then(setData);
    void load(); const timer = setInterval(load, 2500); return () => clearInterval(timer);
  }, [params.id]);
  if (!data) return <p>加载中...</p>;
  const { run, results } = data;
  async function syncCandidates() {
    if (!window.confirm("确认把本次评测中 JSON 合法且 Judge 为 PASS/PARTIAL 的标签写入远端 Supabase 人才库？")) return;
    setSyncing(true);
    setSyncError(undefined);
    setSyncResult(undefined);
    try {
      const response = await fetch(`/api/runs/${run.id}/sync-candidates`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "同步失败");
      setSyncResult(payload);
    } catch (error) {
      setSyncError((error as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return <section><div className="actions"><h2>运行 #{run.id}</h2>
    <a className="button secondary" href={`/api/runs/${run.id}/export`}>导出结果</a>
    <button className="secondary" disabled={run.status !== "completed" || syncing} onClick={syncCandidates}>
      {syncing ? "同步中..." : "同步到人才库"}
    </button>
  </div>
    <div className="card"><div className="grid two">
      <div><b>状态：</b>{run.status}，进度 {run.completed_cases}/{run.total_cases}</div>
      <div><b>测试集：</b>{run.dataset_name}</div><div><b>标签字典：</b>{run.dictionary_name}</div>
      <div><b>Prompt：</b>{run.prompt_name}</div><div><b>模型：</b>{run.extractor_name} / {run.judge_name}</div>
    </div><p>PASS {run.pass_count} · PARTIAL {run.partial_count} · FAIL {run.fail_count} · JSON 解析失败 {run.parse_failed_count}</p>
    {run.error_message && <p className="error">{run.error_message}</p>}</div>
    {(syncResult || syncError) && <div className="card">
      <h3>人才库同步结果</h3>
      {syncError && <p className="error">{syncError}</p>}
      {syncResult && <div className="grid two">
        <div><b>同步记录：</b>#{syncResult.sync_run_id}</div>
        <div><b>总结果数：</b>{syncResult.summary.total_results}</div>
        <div><b>符合同步条件：</b>{syncResult.summary.eligible_results}</div>
        <div><b>匹配候选人数：</b>{syncResult.summary.matched_candidates}</div>
        <div><b>成功更新数：</b>{syncResult.summary.updated_candidates}</div>
        <div><b>无 external_userid 跳过：</b>{syncResult.summary.skipped_no_external_userid}</div>
        <div><b>Supabase 无匹配跳过：</b>{syncResult.summary.skipped_no_supabase_match}</div>
        <div><b>JSON/结构异常跳过：</b>{syncResult.summary.skipped_invalid_json}</div>
        <div><b>非 PASS/PARTIAL 跳过：</b>{syncResult.summary.skipped_ineligible}</div>
        <div><b>错误数：</b>{syncResult.summary.errors}</div>
      </div>}
    </div>}
    <div className="card"><table><thead><tr><th>Case</th><th>Judge</th><th>分数</th><th>JSON</th><th>原因</th><th>耗时</th><th>操作</th></tr></thead>
      <tbody>{results.map((item) => <tr key={item.id}><td>{item.case_id}<br />{item.case_name}</td><td><span className={`badge ${item.judge_result}`}>{item.judge_result}</span></td><td>{item.score ?? "-"}</td><td>{item.json_parse_success ? "合法" : "失败"}</td><td>{item.judge_reason || item.error_message}</td><td>{item.latency_ms}ms</td><td><button className="secondary" onClick={() => setDetail(item)}>详情</button></td></tr>)}</tbody>
    </table></div>
    {detail && <div className="card"><div className="actions"><h3>{detail.case_id} 详情</h3><button className="secondary" onClick={() => setDetail(undefined)}>关闭</button></div>
      {detail.error_message && <p className="error">{detail.error_message}</p>}
      <h4>输入</h4><pre>{format(detail.input_json)}</pre><h4>预期</h4><pre>{format(detail.expected_json)}</pre>
      <h4>提取模型原始输出</h4><pre>{detail.actual_output_raw}</pre><h4>Judge 结果</h4><pre>{format(detail.judge_output_json)}</pre>
    </div>}
  </section>;
}

function format(raw: string) {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw || ""; }
}
