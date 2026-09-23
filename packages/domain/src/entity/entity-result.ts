import type { EntityName } from "../schema";

export interface InScopeEntity {
  inScope: true;
  entity: EntityName;
  confidence: number;
}

export interface OutOfScopeEntity {
  inScope: false;
  reason: "irrelevant" | "unclear";
  confidence: number;
}

export type EntityDetection = InScopeEntity | OutOfScopeEntity;
