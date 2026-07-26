import type { SoftOpticsConfig, SoftOpticsEdge } from "./types";

type NumericConfigKey = Exclude<
  keyof SoftOpticsConfig,
  "enabled" | "edges"
>;

export type SoftOpticsConfigRange = Readonly<{
  min: number;
  max: number;
}>;

export type SoftOpticsPresetName = "default" | "subtle";

function range(min: number, max: number): SoftOpticsConfigRange {
  return Object.freeze({ min, max });
}

export const SOFT_OPTICS_CONFIG_RANGES = Object.freeze({
  edgeHeight: range(0, 20),
  featherHeight: range(0, 10),
  maxBlur: range(0, 64),
  refraction: range(0, 16),
  chromaticAberration: range(0, 8),
  velocitySensitivity: range(0.1, 10),
  peakHoldMs: range(0, 2_000),
  decayMs: range(1, 10_000),
  oppositeEdgeResponse: range(0, 1),
  edgeFadeDistance: range(1, 10_000),
  presenceFloor: range(0, 1)
}) satisfies Readonly<
  Record<NumericConfigKey, SoftOpticsConfigRange>
>;

const DEFAULT_EDGES = Object.freeze([
  "top",
  "bottom"
] satisfies SoftOpticsEdge[]);

function freezeConfig(
  config: Omit<SoftOpticsConfig, "edges"> & {
    edges: readonly SoftOpticsEdge[];
  }
): Readonly<SoftOpticsConfig> {
  return Object.freeze({
    ...config,
    edges: Object.freeze([...config.edges])
  });
}

const DEFAULT_PRESET = freezeConfig({
  enabled: true,
  edges: DEFAULT_EDGES,
  edgeHeight: 7,
  featherHeight: 2,
  maxBlur: 20,
  refraction: 3,
  chromaticAberration: 2,
  velocitySensitivity: 1.5,
  peakHoldMs: 100,
  decayMs: 800,
  oppositeEdgeResponse: 0.4,
  edgeFadeDistance: 36,
  presenceFloor: 0.68
});

const SUBTLE_PRESET = freezeConfig({
  enabled: true,
  edges: DEFAULT_EDGES,
  edgeHeight: 5,
  featherHeight: 2,
  maxBlur: 16,
  refraction: 0.5,
  chromaticAberration: 0.22,
  velocitySensitivity: 0.75,
  peakHoldMs: 70,
  decayMs: 650,
  oppositeEdgeResponse: 0.3,
  edgeFadeDistance: 48,
  presenceFloor: 0.56
});

export const SOFT_OPTICS_PRESETS = Object.freeze({
  default: DEFAULT_PRESET,
  subtle: SUBTLE_PRESET
}) satisfies Readonly<
  Record<SoftOpticsPresetName, Readonly<SoftOpticsConfig>>
>;

export const DEFAULT_SOFT_OPTICS_CONFIG = DEFAULT_PRESET;

function clampNumber(
  value: number | undefined,
  fallback: number,
  range: SoftOpticsConfigRange
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(range.max, Math.max(range.min, value));
}

function resolveEdges(edges: unknown): readonly SoftOpticsEdge[] {
  if (!Array.isArray(edges)) {
    return [...DEFAULT_EDGES];
  }

  const validEdges: SoftOpticsEdge[] = [];
  for (const edge of edges) {
    if (
      (edge === "top" || edge === "bottom") &&
      !validEdges.includes(edge)
    ) {
      validEdges.push(edge);
    }
  }

  return validEdges.length > 0 ? validEdges : [...DEFAULT_EDGES];
}

export function resolveConfig(
  partial: Partial<SoftOpticsConfig> = {}
): Readonly<SoftOpticsConfig> {
  return freezeConfig({
    enabled:
      typeof partial.enabled === "boolean"
        ? partial.enabled
        : DEFAULT_PRESET.enabled,
    edges: resolveEdges(partial.edges),
    edgeHeight: clampNumber(
      partial.edgeHeight,
      DEFAULT_PRESET.edgeHeight,
      SOFT_OPTICS_CONFIG_RANGES.edgeHeight
    ),
    featherHeight: clampNumber(
      partial.featherHeight,
      DEFAULT_PRESET.featherHeight,
      SOFT_OPTICS_CONFIG_RANGES.featherHeight
    ),
    maxBlur: clampNumber(
      partial.maxBlur,
      DEFAULT_PRESET.maxBlur,
      SOFT_OPTICS_CONFIG_RANGES.maxBlur
    ),
    refraction: clampNumber(
      partial.refraction,
      DEFAULT_PRESET.refraction,
      SOFT_OPTICS_CONFIG_RANGES.refraction
    ),
    chromaticAberration: clampNumber(
      partial.chromaticAberration,
      DEFAULT_PRESET.chromaticAberration,
      SOFT_OPTICS_CONFIG_RANGES.chromaticAberration
    ),
    velocitySensitivity: clampNumber(
      partial.velocitySensitivity,
      DEFAULT_PRESET.velocitySensitivity,
      SOFT_OPTICS_CONFIG_RANGES.velocitySensitivity
    ),
    peakHoldMs: clampNumber(
      partial.peakHoldMs,
      DEFAULT_PRESET.peakHoldMs,
      SOFT_OPTICS_CONFIG_RANGES.peakHoldMs
    ),
    decayMs: clampNumber(
      partial.decayMs,
      DEFAULT_PRESET.decayMs,
      SOFT_OPTICS_CONFIG_RANGES.decayMs
    ),
    oppositeEdgeResponse: clampNumber(
      partial.oppositeEdgeResponse,
      DEFAULT_PRESET.oppositeEdgeResponse,
      SOFT_OPTICS_CONFIG_RANGES.oppositeEdgeResponse
    ),
    edgeFadeDistance: clampNumber(
      partial.edgeFadeDistance,
      DEFAULT_PRESET.edgeFadeDistance,
      SOFT_OPTICS_CONFIG_RANGES.edgeFadeDistance
    ),
    presenceFloor: clampNumber(
      partial.presenceFloor,
      DEFAULT_PRESET.presenceFloor,
      SOFT_OPTICS_CONFIG_RANGES.presenceFloor
    )
  });
}
