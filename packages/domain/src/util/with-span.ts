import type { StageContext } from "../context";

interface SpanApi {
  setAttribute: (key: string, value: string | number | boolean) => void;
  ctx: StageContext;
}

// Every domain stage wraps its work in this instead of hand-rolling
// try/end/catch - one span per stage, attributes for input/output/
// confidence, nested via `api.ctx` if the stage needs its own child spans
// (e.g. self-consistency's multiple LLM samples).
export async function withSpan<T>(
  ctx: StageContext,
  name: string,
  fn: (api: SpanApi) => Promise<T>,
): Promise<T> {
  const span = ctx.trace.startSpan(name, ctx.parentSpanId);
  const childCtx: StageContext = { ...ctx, parentSpanId: span.spanId };
  try {
    const result = await fn({ setAttribute: (k, v) => span.setAttribute(k, v), ctx: childCtx });
    span.end("ok");
    return result;
  } catch (err) {
    span.end("error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
