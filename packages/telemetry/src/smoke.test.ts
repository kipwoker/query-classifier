import { test, expect } from "bun:test";
import { Trace } from "./trace";

test("trace produces valid OTLP-shaped export with nested spans", async () => {
  const trace = new Trace();
  const root = trace.startSpan("classify");
  const child = trace.startSpan("entity", root.spanId);
  child.setAttribute("input", "test query").setAttribute("confidence", 0.9);
  child.end("ok");
  root.end("ok");

  const json = trace.toOtlpJson();
  const spans = json.resourceSpans[0]!.scopeSpans[0]!.spans;
  expect(spans).toHaveLength(2);
  expect(spans[0]!.name).toBe("entity");
  expect(spans[0]!.parentSpanId).toBe(root.spanId);
  expect(spans[1]!.name).toBe("classify");
  expect(spans[0]!.attributes).toEqual([
    { key: "input", value: { stringValue: "test query" } },
    { key: "confidence", value: { doubleValue: 0.9 } },
  ]);
});
