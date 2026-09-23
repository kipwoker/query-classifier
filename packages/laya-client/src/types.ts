export type LayaState = Record<string, unknown>;

export interface LayaChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface LayaNoulAnswer {
  noul: number;
  confidence: number;
}
