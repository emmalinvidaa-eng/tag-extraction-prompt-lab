export type JsonObject = Record<string, unknown>;

export type ModelConfig = {
  id: number;
  name: string;
  usage_type: "extractor" | "judge";
  provider_name: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
};

export type TestCase = {
  id: number;
  case_id: string;
  case_name: string;
  priority: string | null;
  category: string | null;
  tag_dictionary_ids_json: string;
  input_json: string;
  expected_json: string;
  judge_focus: string | null;
  forbidden_json: string;
};
