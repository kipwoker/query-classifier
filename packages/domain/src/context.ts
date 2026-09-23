import type { Trace } from "@query-classifier/telemetry";
import type { DomainSchema } from "./schema-core";

export interface StageContext {
  trace: Trace;
  parentSpanId?: string;
  domain: DomainSchema;
}
