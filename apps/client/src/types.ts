export interface FilterCondition {
  field: string;
  kind: string;
  terms: string[];
  type: string;
}

export interface ClassifyResult {
  entity: string;
  filters: FilterCondition[];
  combinators: ("and" | "or")[];
  pagination: { limit: number };
}

export interface OutOfScopeResult {
  inScope: false;
  reason: "irrelevant" | "unclear";
  message: string;
}

export interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean };
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number };
}

export interface OtlpExport {
  resourceSpans: [{ scopeSpans: [{ spans: OtlpSpan[] }] }];
}

export interface ClassifyResponse {
  result: ClassifyResult | OutOfScopeResult;
  trace: OtlpExport;
}

export interface DomainInfo {
  name: string;
  entityListLabel: string;
}

export interface Example {
  query: string;
  // The expected filter shape for this example - optional, since not every
  // example needs one spelled out to be useful as a quick-pick suggestion.
  schema?: ClassifyResult;
}

export interface Settings {
  layaUrl: string;
  ollamaUrl: string;
  ollamaModel: string;
}

export interface SettingsStatus {
  laya: boolean;
  ollama: boolean;
  ready: boolean;
}
