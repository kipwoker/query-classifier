import { useRef, useState } from "react";
import { phaseLabel, spanBackend, type Backend } from "./spanMeta";
import type { ClassifyResponse, OtlpSpan } from "./types";

export interface Progress {
  percent: number;
  label: string;
  backend: Backend;
}

// Percent climbs toward 100 with every real span that completes, but never
// reaches it until the "done" event actually arrives - honest in the sense
// that it's driven by real server-sent events, not a canned timer, but the
// exact total span count varies per query (branching conditions, ranges),
// so there's no fixed denominator to divide by. This asymptotic curve
// (1 - 1/(1+n)) climbs fast at first, then slows down, which reads as
// "real progress" regardless of how many stages the query ends up needing.
function percentForCount(n: number): number {
  return Math.round(100 * (1 - 1 / (1 + n)));
}

export function useClassifyStream() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [response, setResponse] = useState<ClassifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seenRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const closedCleanlyRef = useRef(false);

  function start(query: string, domain: string) {
    esRef.current?.close();
    seenRef.current = 0;
    closedCleanlyRef.current = false;
    setLoading(true);
    setError(null);
    setResponse(null);
    setProgress({ percent: 2, label: "Starting", backend: null });

    const url = `/api/classify/stream?query=${encodeURIComponent(query)}&domain=${encodeURIComponent(domain)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("span", (e) => {
      const span = JSON.parse((e as MessageEvent).data) as OtlpSpan;
      seenRef.current += 1;
      setProgress({ percent: percentForCount(seenRef.current), label: phaseLabel(span.name), backend: spanBackend(span.name) });
    });

    es.addEventListener("done", (e) => {
      closedCleanlyRef.current = true;
      const data = JSON.parse((e as MessageEvent).data) as ClassifyResponse;
      setProgress({ percent: 100, label: "Done", backend: null });
      setResponse(data);
      setLoading(false);
      es.close();
    });

    es.addEventListener("failed", (e) => {
      closedCleanlyRef.current = true;
      const data = JSON.parse((e as MessageEvent).data) as { message: string };
      setError(data.message);
      setLoading(false);
      es.close();
    });

    // The server always ends the stream itself (done/failed above already
    // closed it) - a real onerror only means the connection dropped before
    // either of those arrived.
    es.onerror = () => {
      if (closedCleanlyRef.current) return;
      setError("Lost connection to the API");
      setLoading(false);
      es.close();
    };
  }

  return { start, progress, response, error, loading };
}
