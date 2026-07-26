export type SoftOpticsEdge = "top" | "bottom";

export type SoftOpticsConfig = {
  enabled: boolean;
  edges: readonly SoftOpticsEdge[];
  edgeHeight: number;
  featherHeight: number;
  maxBlur: number;
  refraction: number;
  chromaticAberration: number;
  velocitySensitivity: number;
  peakHoldMs: number;
  decayMs: number;
  oppositeEdgeResponse: number;
  edgeFadeDistance: number;
  presenceFloor: number;
};
