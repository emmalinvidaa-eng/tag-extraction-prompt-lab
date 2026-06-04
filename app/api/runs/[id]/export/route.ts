import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import db from "@/lib/db";

type RunExportRow = {
  id: number;
  status: string;
  total_cases: number;
  completed_cases: number;
  pass_count: number;
  partial_count: number;
  fail_count: number;
  parse_failed_count: number;
  dataset_name: string;
  dictionary_name: string;
  prompt_name: string;
  extractor_name: string;
  judge_name: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

type ResultExportRow = {
  id: number;
  case_id: string;
  case_name: string;
  priority: string | null;
  category: string | null;
  judge_result: string | null;
  score: number | null;
  json_parse_success: number;
  judge_reason: string | null;
  latency_ms: number | null;
  error_message: string | null;
  input_json: string;
  expected_json: string;
  actual_output_raw: string | null;
  actual_output_json: string | null;
  judge_output_raw: string | null;
  judge_output_json: string | null;
  judge_focus: string | null;
  forbidden_json: string;
  created_at: string;
};

const summaryColumns = [
  ["case_id", "Case ID", 16],
  ["case_name", "Case 名称", 42],
  ["judge_result", "Judge", 14],
  ["score", "分数", 10],
  ["json_parse_success", "JSON", 10],
  ["judge_reason", "原因", 80],
  ["latency_ms", "耗时(ms)", 12],
  ["error_message", "错误信息", 40],
] as const;

const detailColumns = [
  ["case_id", "Case ID", 16],
  ["case_name", "Case 名称", 42],
  ["priority", "优先级", 10],
  ["category", "分类", 20],
  ["judge_result", "Judge", 14],
  ["score", "分数", 10],
  ["json_parse_success", "JSON", 10],
  ["judge_reason", "原因", 80],
  ["latency_ms", "耗时(ms)", 12],
  ["error_message", "错误信息", 40],
  ["input_json", "输入", 80],
  ["expected_json", "预期", 80],
  ["actual_output_raw", "提取模型原始输出", 80],
  ["actual_output_json", "提取模型 JSON", 80],
  ["judge_output_raw", "Judge 原始输出", 80],
  ["judge_output_json", "Judge JSON", 80],
  ["judge_focus", "Judge Focus", 60],
  ["forbidden_json", "Forbidden", 60],
  ["created_at", "结果创建时间", 22],
] as const;

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = db
    .prepare(
      `SELECT r.*, d.name AS dataset_name, td.name AS dictionary_name,
        p.name AS prompt_name, e.name AS extractor_name, j.name AS judge_name
      FROM test_runs r
      JOIN datasets d ON d.id = r.dataset_id
      JOIN tag_dictionaries td ON td.id = r.dictionary_id
      JOIN prompts p ON p.id = r.prompt_id
      JOIN model_configs e ON e.id = r.extractor_model_config_id
      JOIN model_configs j ON j.id = r.judge_model_config_id
      WHERE r.id = ?`,
    )
    .get(id) as RunExportRow | undefined;
  if (!run) return NextResponse.json({ error: "运行不存在" }, { status: 404 });

  const results = db
    .prepare(
      `SELECT rr.*, tc.case_id, tc.case_name, tc.priority, tc.category,
        tc.input_json, tc.expected_json, tc.judge_focus, tc.forbidden_json
      FROM test_run_results rr
      JOIN test_cases tc ON tc.id = rr.test_case_id
      WHERE rr.run_id = ? ORDER BY rr.id`,
    )
    .all(id) as ResultExportRow[];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "tag-extraction-prompt-lab";
  workbook.created = new Date();

  addSummarySheet(workbook, run, results);
  addDetailSheet(workbook, results);

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `run-${run.id}-results.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  run: RunExportRow,
  results: ResultExportRow[],
) {
  const sheet = workbook.addWorksheet("general结果");
  sheet.addRow(["运行ID", run.id]);
  sheet.addRow(["状态", run.status]);
  sheet.addRow(["进度", `${run.completed_cases}/${run.total_cases}`]);
  sheet.addRow(["测试集", run.dataset_name]);
  sheet.addRow(["标签字典", run.dictionary_name]);
  sheet.addRow(["Prompt", run.prompt_name]);
  sheet.addRow(["模型", `${run.extractor_name} / ${run.judge_name}`]);
  sheet.addRow([
    "统计",
    `PASS ${run.pass_count} · PARTIAL ${run.partial_count} · FAIL ${run.fail_count} · JSON 解析失败 ${run.parse_failed_count}`,
  ]);
  if (run.error_message) sheet.addRow(["运行错误", run.error_message]);
  sheet.addRow([]);

  sheet.addRow(summaryColumns.map(([, title]) => title));
  for (const item of results) {
    sheet.addRow(
      summaryColumns.map(([key]) =>
        key === "json_parse_success"
          ? item.json_parse_success
            ? "合法"
            : "失败"
          : valueForCell(item[key]),
      ),
    );
  }
  formatSheet(sheet, summaryColumns.map(([, , width]) => width));
}

function addDetailSheet(workbook: ExcelJS.Workbook, results: ResultExportRow[]) {
  const sheet = workbook.addWorksheet("case详情");
  sheet.addRow(detailColumns.map(([, title]) => title));
  for (const item of results) {
    sheet.addRow(
      detailColumns.map(([key]) =>
        key === "json_parse_success"
          ? item.json_parse_success
            ? "合法"
            : "失败"
          : formatCellValue(item[key]),
      ),
    );
  }
  formatSheet(sheet, detailColumns.map(([, , width]) => width));
}

function valueForCell(value: unknown) {
  return value === null || value === undefined ? "" : value;
}

function formatCellValue(value: unknown) {
  if (typeof value !== "string") return valueForCell(value);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function formatSheet(sheet: ExcelJS.Worksheet, widths: readonly number[]) {
  sheet.columns = widths.map((width) => ({ width }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
}
