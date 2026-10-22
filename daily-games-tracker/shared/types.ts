export type GameKey = "krillion" | "maptap";

export type CaptureSchema = "dgt.capture.v1";

export interface SafariVisibleNode {
  tag: string;
  id: string;
  class: string;
  text: string;
}

export interface SafariWebpageCapture {
  capture_schema: CaptureSchema;
  source_kind: "safari_webpage";
  source_url: string;
  page_title: string;
  visible_text: string;
  visible_nodes: SafariVisibleNode[];
}

export interface SharedTextCapture {
  capture_schema: CaptureSchema;
  source_kind: "shared_text";
  shared_text: string;
}

export type CaptureInput = SafariWebpageCapture | SharedTextCapture;

export interface NormalizedRoundResult {
  roundNumber: number;
  prompt?: string;
  answer?: string | null;
  rawScore: number;
  originalEmoji?: string | null;
}

export interface NormalizedGameResult {
  gameKey: GameKey;
  gameDate: string;
  externalPuzzleKey: string;
  finalScore: number;
  rounds: NormalizedRoundResult[];
  parserVersion: string;
}
