import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOFT_OPTICS_CONFIG,
  SOFT_OPTICS_CONFIG_RANGES,
  SOFT_OPTICS_PRESETS,
  resolveConfig
} from "./config";

describe("soft optics configuration", () => {
  it("preserves the approved default preset", () => {
    expect(DEFAULT_SOFT_OPTICS_CONFIG).toEqual({
      enabled: true,
      edges: ["top", "bottom"],
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
  });

  it("provides the approved subtle preset", () => {
    expect(SOFT_OPTICS_PRESETS.subtle).toEqual({
      enabled: true,
      edges: ["top", "bottom"],
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
  });

  it("merges a partial configuration into a fresh resolved value", () => {
    const resolved = resolveConfig({
      enabled: false,
      edgeHeight: 9,
      edges: ["bottom"]
    });

    expect(resolved).toMatchObject({
      enabled: false,
      edgeHeight: 9,
      edges: ["bottom"],
      maxBlur: 20
    });
    expect(resolved).not.toBe(DEFAULT_SOFT_OPTICS_CONFIG);
    expect(resolved.edges).not.toBe(DEFAULT_SOFT_OPTICS_CONFIG.edges);
  });

  it("clamps unsafe numeric values to the documented safe ranges", () => {
    const resolved = resolveConfig({
      edgeHeight: -1,
      featherHeight: Number.POSITIVE_INFINITY,
      maxBlur: -1,
      refraction: 1_000,
      chromaticAberration: Number.NaN,
      velocitySensitivity: 0,
      peakHoldMs: -20,
      decayMs: 1_000_000,
      oppositeEdgeResponse: -1,
      edgeFadeDistance: 0,
      presenceFloor: 4
    });

    expect(resolved).toMatchObject({
      edgeHeight: SOFT_OPTICS_CONFIG_RANGES.edgeHeight.min,
      featherHeight: DEFAULT_SOFT_OPTICS_CONFIG.featherHeight,
      maxBlur: 0,
      refraction: SOFT_OPTICS_CONFIG_RANGES.refraction.max,
      chromaticAberration:
        DEFAULT_SOFT_OPTICS_CONFIG.chromaticAberration,
      velocitySensitivity:
        SOFT_OPTICS_CONFIG_RANGES.velocitySensitivity.min,
      peakHoldMs: 0,
      decayMs: SOFT_OPTICS_CONFIG_RANGES.decayMs.max,
      oppositeEdgeResponse: 0,
      edgeFadeDistance:
        SOFT_OPTICS_CONFIG_RANGES.edgeFadeDistance.min,
      presenceFloor: 1
    });
  });

  it("deduplicates valid edges while preserving their order", () => {
    expect(
      resolveConfig({
        edges: ["bottom", "bottom", "top", "bottom"]
      }).edges
    ).toEqual(["bottom", "top"]);
  });

  it("preserves at least one valid edge", () => {
    const runtimeInput = ["side"] as unknown as readonly (
      | "top"
      | "bottom"
    )[];

    expect(resolveConfig({ edges: [] }).edges).toEqual([
      "top",
      "bottom"
    ]);
    expect(resolveConfig({ edges: runtimeInput }).edges).toEqual([
      "top",
      "bottom"
    ]);
  });

  it("sanitizes malformed runtime edge values without throwing", () => {
    const malformedValues = [
      null,
      "top",
      { edge: "bottom" }
    ] as unknown as readonly (readonly ("top" | "bottom")[])[];

    for (const edges of malformedValues) {
      expect(
        resolveConfig({
          edges: edges as unknown as readonly ("top" | "bottom")[]
        }).edges
      ).toEqual(["top", "bottom"]);
    }

    const mixedRuntimeEdges = [
      "bottom",
      "side",
      "bottom",
      "top"
    ] as unknown as readonly ("top" | "bottom")[];
    expect(resolveConfig({ edges: mixedRuntimeEdges }).edges).toEqual([
      "bottom",
      "top"
    ]);
  });

  it("does not expose mutable default or resolved edge arrays", () => {
    expect(Object.isFrozen(DEFAULT_SOFT_OPTICS_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SOFT_OPTICS_CONFIG.edges)).toBe(true);
    expect(Object.isFrozen(SOFT_OPTICS_CONFIG_RANGES.maxBlur)).toBe(
      true
    );

    const resolved = resolveConfig();
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.edges)).toBe(true);
  });
});
