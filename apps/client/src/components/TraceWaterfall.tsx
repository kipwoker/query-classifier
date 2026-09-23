import { useRef, useState } from "react";
import { spanBackend } from "../spanMeta";
import type { OtlpAttribute, OtlpExport, OtlpSpan } from "../types";

function spanAttr(span: OtlpSpan, key: string): string {
  const attr = span.attributes.find((a) => a.key === key);
  if (!attr) return "";
  const v = attr.value;
  return v.stringValue ?? v.intValue ?? String(v.doubleValue ?? v.boolValue ?? "");
}

// Attribute values that hold JSON (messages, criteria, results, samples)
// get pretty-printed; anything else is shown as-is.
function formatAttrValue(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function BackendTag({ name }: { name: string }) {
  const backend = spanBackend(name);
  if (!backend) return null;
  return <span className={`tag tag-${backend}`}>{backend}</span>;
}

interface Row {
  span: OtlpSpan;
  depth: number;
}

// Rows are ordered strictly by start timestamp - the actual timeline,
// including how the parallel field/kind/limit branches under `classify`
// interleave with each other. Depth is still derived from parentSpanId (for
// indentation only) so nesting stays visible without reordering the rows
// into per-branch groups, which would hide that interleaving.
function toExecutionOrder(spans: OtlpSpan[]): Row[] {
  const bySpanId = new Map(spans.map((s) => [s.spanId, s]));
  function depthOf(span: OtlpSpan): number {
    let depth = 0;
    let current = span;
    const seen = new Set<string>();
    while (current.parentSpanId && bySpanId.has(current.parentSpanId) && !seen.has(current.spanId)) {
      seen.add(current.spanId);
      current = bySpanId.get(current.parentSpanId)!;
      depth += 1;
    }
    return depth;
  }

  return spans
    .map((span) => ({ span, depth: depthOf(span) }))
    .sort((a, b) => Number(BigInt(a.span.startTimeUnixNano) - BigInt(b.span.startTimeUnixNano)));
}

function downloadTrace(trace: OtlpExport, traceId: string) {
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trace-${traceId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function SpanDetail({ span }: { span: OtlpSpan }) {
  const durationMs = Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1_000_000;
  return (
    <div className="span-detail fade-in">
      <h4>
        <BackendTag name={span.name} /> {span.name}
      </h4>
      <table className="span-detail-meta">
        <tbody>
          <tr>
            <td>spanId</td>
            <td>{span.spanId}</td>
          </tr>
          <tr>
            <td>parentSpanId</td>
            <td>{span.parentSpanId ?? "(root)"}</td>
          </tr>
          <tr>
            <td>duration</td>
            <td>{durationMs.toFixed(1)}ms</td>
          </tr>
          <tr>
            <td>status</td>
            <td>{span.status.code === 2 ? "error" : "ok"}</td>
          </tr>
        </tbody>
      </table>
      {span.attributes.map((a: OtlpAttribute) => (
        <div key={a.key} className="span-detail-attr">
          <div className="span-detail-attr-key">{a.key}</div>
          <pre>{formatAttrValue(spanAttr(span, a.key))}</pre>
        </div>
      ))}
    </div>
  );
}

// Detail-pane width is user-adjustable (drag the resizer handle) - kept as
// component state rather than a CSS-only split, since the "right ratio"
// between list and detail depends on how long span names/attrs are for a
// given trace, which varies a lot query to query.
const MIN_DETAIL_WIDTH = 220;
const MAX_DETAIL_WIDTH = 720;
const DEFAULT_DETAIL_WIDTH = 340;

export function TraceWaterfall({ trace }: { trace: OtlpExport }) {
  const spans = trace.resourceSpans[0].scopeSpans[0].spans;
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL_WIDTH);
  const [resizing, setResizing] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  if (spans.length === 0) return null;

  const starts = spans.map((s) => BigInt(s.startTimeUnixNano));
  const ends = spans.map((s) => BigInt(s.endTimeUnixNano));
  const traceStart = starts.reduce((a, b) => (a < b ? a : b));
  const traceEnd = ends.reduce((a, b) => (a > b ? a : b));
  const totalNano = Number(traceEnd - traceStart) || 1;

  const rows = toExecutionOrder(spans);
  const selectedSpan = spans.find((s) => s.spanId === selectedSpanId) ?? null;
  const traceId = spans[0]?.traceId ?? "";

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const layout = layoutRef.current;
    if (!layout) return;
    setResizing(true);
    const onMove = (ev: PointerEvent) => {
      const rect = layout.getBoundingClientRect();
      const width = rect.right - ev.clientX;
      setDetailWidth(Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, width)));
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div>
      <div className="trace-toolbar">
        <h3>Trace</h3>
        <button type="button" onClick={() => downloadTrace(trace, traceId)}>
          Save trace as JSON
        </button>
      </div>
      <div className="trace-layout" ref={layoutRef}>
        <div className="trace-list">
          {rows.map(({ span, depth }) => {
            const offsetPct = (Number(BigInt(span.startTimeUnixNano) - traceStart) / totalNano) * 100;
            const widthPct = Math.max((Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / totalNano) * 100, 0.5);
            const durationMs = Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1_000_000;
            const attrsToShow = span.attributes.filter((a) => a.key !== "samples" && a.key !== "messages" && a.key !== "result" && a.key !== "criteria");
            const isSelected = span.spanId === selectedSpanId;
            return (
              <button
                type="button"
                className={`span-row${isSelected ? " selected" : ""}`}
                key={span.spanId}
                onClick={() => setSelectedSpanId(isSelected ? null : span.spanId)}
              >
                <span className="span-name" style={{ paddingLeft: depth * 14 }}>
                  <BackendTag name={span.name} /> {span.name}
                </span>
                <div style={{ flex: 1, position: "relative", height: 14 }}>
                  <div
                    className="span-bar"
                    style={{ position: "absolute", left: `${offsetPct}%`, width: `${widthPct}%` }}
                    title={`${durationMs.toFixed(0)}ms`}
                  />
                </div>
                <span>{durationMs.toFixed(0)}ms</span>
                <span className="span-attrs">
                  {attrsToShow.map((a) => `${a.key}=${spanAttr(span, a.key)}`).join(" ")}
                </span>
              </button>
            );
          })}
        </div>
        <div
          className={`trace-resizer${resizing ? " dragging" : ""}`}
          onPointerDown={startResize}
          title="Drag to resize"
        />
        <div className="trace-detail-pane" style={{ width: detailWidth }}>
          {selectedSpan ? <SpanDetail span={selectedSpan} /> : <div className="trace-detail-empty">Click a span to see its details here.</div>}
        </div>
      </div>
    </div>
  );
}
