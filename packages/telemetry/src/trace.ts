import { newTraceId } from "./ids";
import { SpanHandle } from "./span";
import type { OtlpExport, OtlpSpan } from "./otlp";

const SERVICE_NAME = "query-classifier";

// One Trace per pipeline run (one classify() call). Spans nest via
// parentSpanId - the caller passes the parent's spanId when starting a
// child stage span, so the API's root span and each domain stage's span
// form one tree per request.
export class Trace {
  readonly traceId = newTraceId();
  // Sampled once per trace, not per span - see SpanHandle for why.
  private readonly epochAnchorNano = BigInt(Date.now()) * 1_000_000n;
  private readonly hrAnchorNano = process.hrtime.bigint();
  private readonly spans: OtlpSpan[] = [];

  // Optional live callback, fired as each span ends - lets a caller (the
  // API's SSE route) stream real progress to a client while classify() is
  // still running, instead of only getting the full trace at the end.
  constructor(private readonly onSpanEnd?: (span: OtlpSpan) => void) {}

  startSpan(name: string, parentSpanId?: string): SpanHandle {
    return new SpanHandle(this.traceId, name, parentSpanId, this.epochAnchorNano, this.hrAnchorNano, (span) => {
      this.spans.push(span);
      this.onSpanEnd?.(span);
    });
  }

  toOtlpJson(): OtlpExport {
    return {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: SERVICE_NAME } }] },
          scopeSpans: [{ scope: { name: SERVICE_NAME }, spans: this.spans }],
        },
      ],
    };
  }

  async writeToDisk(dir: string): Promise<string> {
    const path = `${dir}/${this.traceId}.json`;
    await Bun.write(path, JSON.stringify(this.toOtlpJson(), null, 2));
    return path;
  }
}
