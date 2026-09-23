// Minimal OTLP/JSON shapes (https://opentelemetry.io/docs/specs/otlp/) - just
// enough structure for the fields this project's spans actually use.
export type AttributeValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

export interface OtlpAttribute {
  key: string;
  value: AttributeValue;
}

export const SpanStatusCode = { UNSET: 0, OK: 1, ERROR: 2 } as const;

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number; message?: string };
}

export interface OtlpExport {
  resourceSpans: [
    {
      resource: { attributes: OtlpAttribute[] };
      scopeSpans: [{ scope: { name: string }; spans: OtlpSpan[] }];
    },
  ];
}

export function toAttributeValue(value: string | number | boolean): AttributeValue {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: value };
}
