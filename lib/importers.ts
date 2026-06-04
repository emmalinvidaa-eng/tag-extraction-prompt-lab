import ExcelJS, { type Worksheet } from "exceljs";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

type TestCaseInput = {
  case_id: string;
  case_name: string;
  source_session_id?: string;
  priority?: string;
  category?: string;
  tag_dictionary_ids?: string[];
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  judge_focus?: string;
  forbidden?: unknown[];
};

const dictionaryColumnMap: Record<string, string> = {
  类型: "definition_type",
  标签id: "tag_code",
  标签名称: "tag_name",
  标签说明: "tag_description",
  关联行业类目: "industry_scope",
  可见范围: "visibility_scope",
  标签定义人: "owner_user_id",
  标签类型: "tag_type",
  业务分类: "business_category",
  使用提示: "usage_hint",
  数据类型: "data_type",
  枚举值: "enum_values",
  标准化规则: "normalization_rule",
  更新策略: "update_policy",
  标签状态: "tag_status",
};

function cleanValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\u3000/g, " ").trim();
  return text || null;
}

function worksheetRows(worksheet: Worksheet) {
  const headers = (worksheet.getRow(1).values as unknown[])
    .slice(1)
    .map((value) => String(value || "").trim());
  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    const item: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) item[header] = values[index] ?? null;
    });
    if (Object.values(item).some((value) => value !== null && value !== "")) {
      rows.push(item);
    }
  });
  return rows;
}

async function loadWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  // exceljs still exposes the pre-generic Node Buffer type.
  await workbook.xlsx.load(buffer as never);
  return workbook;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/)?.[0] || "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function fallbackWorkbookRows(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: false,
  });
  const readXml = async (name: string) => {
    const file = zip.file(name);
    if (!file) throw new Error(`Excel 缺少 ${name}`);
    return parser.parse(await file.async("text"));
  };
  const workbookXml = await readXml("xl/workbook.xml");
  const relationshipsXml = await readXml("xl/_rels/workbook.xml.rels");
  const sheets = asArray<{ name: string; id: string }>(workbookXml.workbook.sheets.sheet);
  const relationships = asArray<{ Id: string; Target: string; Type: string }>(
    relationshipsXml.Relationships.Relationship,
  );
  const worksheetTargets = new Map(
    relationships
      .filter((item) => item.Type.endsWith("/worksheet"))
      .map((item) => [item.Id, item.Target.replace(/^\//, "")]),
  );
  const sharedStringsXml = zip.file("xl/sharedStrings.xml")
    ? await readXml("xl/sharedStrings.xml")
    : null;
  const sharedStrings = asArray<{ t?: string; r?: Array<{ t?: string }> }>(
    sharedStringsXml?.sst?.si,
  ).map((item) => item.t ?? asArray(item.r).map((part) => part.t ?? "").join(""));
  const result = new Map<string, Record<string, unknown>[]>();

  for (const sheet of sheets) {
    const target = worksheetTargets.get(sheet.id);
    if (!target) continue;
    const worksheetXml = await readXml(target);
    const rawRows = asArray<{ c?: Array<{ r: string; t?: string; v?: string; is?: { t?: string } }> }>(
      worksheetXml.worksheet.sheetData?.row,
    );
    const values = rawRows.map((row) => {
      const cells: unknown[] = [];
      for (const cell of asArray(row.c)) {
        const index = columnIndex(cell.r);
        cells[index] =
          cell.t === "s" ? sharedStrings[Number(cell.v)] : cell.is?.t ?? cell.v ?? null;
      }
      return cells;
    });
    const headers = (values[0] || []).map((value) => String(value || "").trim());
    result.set(
      sheet.name,
      values.slice(1).map((row) =>
        Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])),
      ),
    );
  }
  return result;
}

async function workbookRows(buffer: Buffer) {
  try {
    const workbook = await loadWorkbook(buffer);
    return new Map(workbook.worksheets.map((sheet) => [sheet.name, worksheetRows(sheet)]));
  } catch {
    return fallbackWorkbookRows(buffer);
  }
}

export async function parseDictionaryXlsx(buffer: Buffer) {
  const sheets = await workbookRows(buffer);
  const rows = sheets.values().next().value as Record<string, unknown>[] | undefined;
  if (!rows) throw new Error("Excel 没有工作表");

  return rows
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const [source, target] of Object.entries(dictionaryColumnMap)) {
        mapped[target] = cleanValue(row[source]);
      }
      mapped.raw_json = JSON.stringify(row);
      return mapped;
    })
    .filter((row) => row.tag_code && row.tag_name);
}

function expectedForbidden(expected: Record<string, unknown>) {
  return [
    ...(Array.isArray(expected.must_not_include_tag_codes)
      ? expected.must_not_include_tag_codes
      : []),
    ...(Array.isArray(expected.must_not_include_tags)
      ? expected.must_not_include_tags
      : []),
    ...(Array.isArray(expected.must_not_include_tag_values)
      ? expected.must_not_include_tag_values
      : []),
    ...(Array.isArray(expected.must_not_resolve_tag_codes)
      ? expected.must_not_resolve_tag_codes
      : []),
  ];
}

function normalizeCase(raw: Record<string, unknown>): TestCaseInput {
  const expected =
    typeof raw.expected_json === "string"
      ? JSON.parse(raw.expected_json)
      : ((raw.expected ?? {}) as Record<string, unknown>);
  const input =
    typeof raw.input_json === "string"
      ? JSON.parse(raw.input_json)
      : ((raw.input ?? {}) as Record<string, unknown>);
  const tagDictionaryIds =
    typeof raw.tag_dictionary_ids === "string"
      ? raw.tag_dictionary_ids
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : Array.isArray(raw.tag_dictionary_ids)
        ? raw.tag_dictionary_ids.map(String)
        : [];

  if (!raw.case_id || !raw.case_name) {
    throw new Error("测试 case 缺少 case_id 或 case_name");
  }

  return {
    case_id: String(raw.case_id),
    case_name: String(raw.case_name),
    source_session_id:
      cleanValue(raw.source_session_id) ??
      cleanValue(input.source_session_id) ??
      cleanValue(input.conversation_id) ??
      undefined,
    priority: raw.priority ? String(raw.priority) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    tag_dictionary_ids: tagDictionaryIds,
    input,
    expected,
    judge_focus: raw.judge_focus ? String(raw.judge_focus) : undefined,
    forbidden: Array.isArray(raw.forbidden)
      ? raw.forbidden
      : expectedForbidden(expected),
  };
}

export async function parseTestCases(
  fileName: string,
  buffer: Buffer,
): Promise<{ cases: TestCaseInput[]; judgePrompt?: string }> {
  if (fileName.endsWith(".jsonl")) {
    const lines = buffer
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim());
    return { cases: lines.map((line) => normalizeCase(JSON.parse(line))) };
  }

  if (fileName.endsWith(".json")) {
    const parsed = JSON.parse(buffer.toString("utf8"));
    if (!Array.isArray(parsed)) throw new Error("JSON 测试集必须是数组");
    return { cases: parsed.map(normalizeCase) };
  }

  if (fileName.endsWith(".xlsx")) {
    const sheets = await workbookRows(buffer);
    const rows = sheets.get("TestCases");
    if (!rows) throw new Error("Excel 缺少 TestCases sheet");
    const judgeRows = sheets.get("JudgePrompt");
    const judgePrompt = judgeRows
      ? judgeRows
          .map((row) => row.judge_prompt)
          .filter((line) => line !== null && line !== undefined)
          .join("\n")
      : undefined;
    return { cases: rows.map(normalizeCase), judgePrompt };
  }

  throw new Error("仅支持 .jsonl、.json 和 .xlsx 测试集");
}
