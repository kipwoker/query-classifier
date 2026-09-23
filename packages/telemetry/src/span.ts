import { newSpanId } from "./ids";
import { SpanStatusCode, toAttributeValue, type OtlpSpan } from "./otlp";

export class SpanHandle {
  readonly spanId = newSpanId();
  private readonly startHrNano = process.hrtime.bigint();
  private readonly attributes: Record<string, string | number | boolean> = {};
  private ended = false;
  private raw: OtlpSpan | null = null;

  constructor(
    private readonly traceId: string,
    private readonly name: string,
    private readonly parentSpanId: string | undefined,
    // One shared epoch/hrtime anchor pair per trace (see Trace), not
    // resampled per span - every span's timestamp is this same epoch anchor
    // plus its own hrtime delta, so ordering between spans is decided
    // entirely by hrtime (monotonic, nanosecond-resolution), never by
    // independently re-sampling Date.now() (millisecond-resolution) at
    // each span's own end() call. That per-span resampling was the actual
    // bug behind spans looking out of order / a child appearing to start
    // before its own parent - not a UI sorting bug.
    private readonly epochAnchorNano: bigint,
    private readonly hrAnchorNano: bigint,
    private readonly onEnd: (span: OtlpSpan) => void,
  ) {}

  setAttribute(key: string, value: string | number | boolean): this {
    this.attributes[key] = value;
    return this;
  }

  end(status: "ok" | "error" = "ok", message?: string): void {
    if (this.ended) return;
    this.ended = true;
    const endHrNano = process.hrtime.bigint();
    this.raw = {
      traceId: this.traceId,
      spanId: this.spanId,
      ...(this.parentSpanId ? { parentSpanId: this.parentSpanId } : {}),
      name: this.name,
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: String(this.epochAnchorNano + (this.startHrNano - this.hrAnchorNano)),
      endTimeUnixNano: String(this.epochAnchorNano + (endHrNano - this.hrAnchorNano)),
      attributes: Object.entries(this.attributes).map(([key, value]) => ({
        key,
        value: toAttributeValue(value),
      })),
      status: {
        code: status === "ok" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        ...(message ? { message } : {}),
      },
    };
    this.onEnd(this.raw);
  }
}
