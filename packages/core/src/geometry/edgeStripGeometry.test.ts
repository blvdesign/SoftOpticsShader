import { describe, expect, it } from "vitest";

import {
  createEdgeStripGeometry,
  edgeStrength
} from "./edgeStripGeometry";

const baseInput = {
  viewportWidth: 1_440,
  viewportHeight: 1_000,
  documentHeight: 5_000,
  scrollY: 800,
  zonePixels: 75,
  overscanPixels: 32,
  dpr: 1
};

describe("createEdgeStripGeometry", () => {
  it("adds symmetric overscan around the top visible zone", () => {
    expect(
      createEdgeStripGeometry({ ...baseInput, edge: "top", dpr: 2 })
    ).toEqual({
      edge: "top",
      cssTop: -32,
      cssWidth: 1_440,
      cssHeight: 139,
      visibleStart: 32,
      visibleEnd: 107,
      textureWidth: 2_880,
      textureHeight: 278,
      documentTop: 768,
      documentBottom: 907,
      captureTop: 768,
      captureBottom: 907,
      paddingBefore: 0,
      paddingAfter: 0
    });
  });

  it("positions the bottom strip around the physical bottom edge", () => {
    expect(
      createEdgeStripGeometry({ ...baseInput, edge: "bottom" })
    ).toMatchObject({
      cssTop: 893,
      visibleStart: 32,
      visibleEnd: 107,
      documentTop: 1_693,
      documentBottom: 1_832
    });
  });

  it("keeps the outermost viewport pixels inside the processed strip", () => {
    const top = createEdgeStripGeometry({
      ...baseInput,
      edge: "top"
    });
    const bottom = createEdgeStripGeometry({
      ...baseInput,
      edge: "bottom"
    });

    expect(top.visibleStart).toBeGreaterThan(0);
    expect(top.visibleEnd).toBeLessThan(top.cssHeight);
    expect(bottom.visibleStart).toBeGreaterThan(0);
    expect(bottom.visibleEnd).toBeLessThan(bottom.cssHeight);
  });

  it("reports source padding at both document boundaries", () => {
    const top = createEdgeStripGeometry({
      ...baseInput,
      edge: "top",
      viewportHeight: 800,
      documentHeight: 1_600,
      scrollY: 0,
      zonePixels: 40,
      overscanPixels: 24
    });
    const bottom = createEdgeStripGeometry({
      ...baseInput,
      edge: "bottom",
      viewportHeight: 800,
      documentHeight: 1_600,
      scrollY: 800,
      zonePixels: 40,
      overscanPixels: 24
    });

    expect(top).toMatchObject({
      documentTop: -24,
      captureTop: 0,
      paddingBefore: 24,
      paddingAfter: 0
    });
    expect(bottom).toMatchObject({
      documentBottom: 1_624,
      captureBottom: 1_600,
      paddingBefore: 0,
      paddingAfter: 24
    });
  });

  it("clamps device pixel ratio to the safe one-to-two range", () => {
    expect(
      createEdgeStripGeometry({
        ...baseInput,
        edge: "top",
        viewportWidth: 100,
        dpr: 8
      }).textureWidth
    ).toBe(200);
    expect(
      createEdgeStripGeometry({
        ...baseInput,
        edge: "top",
        viewportWidth: 100,
        dpr: 0.5
      }).textureWidth
    ).toBe(100);
  });

  it("sanitizes non-finite dimensions and scrolling inputs", () => {
    const geometry = createEdgeStripGeometry({
      edge: "top",
      viewportWidth: Number.NaN,
      viewportHeight: Number.POSITIVE_INFINITY,
      documentHeight: Number.NaN,
      scrollY: Number.NEGATIVE_INFINITY,
      zonePixels: Number.NaN,
      overscanPixels: Number.POSITIVE_INFINITY,
      dpr: Number.NaN
    });

    expect(geometry).toEqual({
      edge: "top",
      cssTop: 0,
      cssWidth: 1,
      cssHeight: 0,
      visibleStart: 0,
      visibleEnd: 0,
      textureWidth: 1,
      textureHeight: 1,
      documentTop: 0,
      documentBottom: 0,
      captureTop: 0,
      captureBottom: 0,
      paddingBefore: 0,
      paddingAfter: 0
    });
  });

  it("clamps overscroll to the document maximum", () => {
    const geometry = createEdgeStripGeometry({
      ...baseInput,
      edge: "bottom",
      viewportHeight: 800,
      documentHeight: 1_600,
      scrollY: 5_000,
      zonePixels: 40,
      overscanPixels: 24
    });

    expect(geometry).toMatchObject({
      documentTop: 1_536,
      documentBottom: 1_624,
      captureTop: 1_536,
      captureBottom: 1_600,
      paddingBefore: 0,
      paddingAfter: 24
    });
    expect(
      geometry.captureBottom -
        geometry.captureTop +
        geometry.paddingBefore +
        geometry.paddingAfter
    ).toBe(geometry.cssHeight);
  });

  it("normalizes short documents to at least the viewport height", () => {
    const geometry = createEdgeStripGeometry({
      ...baseInput,
      edge: "bottom",
      viewportHeight: 800,
      documentHeight: 500,
      scrollY: 200,
      zonePixels: 40,
      overscanPixels: 24
    });

    expect(geometry).toMatchObject({
      documentTop: 736,
      documentBottom: 824,
      captureTop: 736,
      captureBottom: 800,
      paddingBefore: 0,
      paddingAfter: 24
    });
    expect(geometry.captureBottom - geometry.captureTop).toBeGreaterThan(
      0
    );
    expect(
      geometry.captureBottom -
        geometry.captureTop +
        geometry.paddingBefore +
        geometry.paddingAfter
    ).toBe(geometry.cssHeight);
  });
});

describe("edgeStrength", () => {
  it("is full at the physical edge and zero at the inner boundary", () => {
    expect(edgeStrength(0, 75)).toBe(1);
    expect(edgeStrength(75, 75)).toBe(0);
    expect(edgeStrength(300, 75)).toBe(0);
  });

  it("decreases smoothly and monotonically toward the page", () => {
    const samples = [0, 15, 30, 45, 60, 75].map((distance) =>
      edgeStrength(distance, 75)
    );

    expect(samples).toEqual([...samples].sort((a, b) => b - a));
    expect(samples[2]).toBeGreaterThan(0);
    expect(samples[2]).toBeLessThan(1);
  });

  it("returns zero for invalid inputs or a non-positive zone", () => {
    expect(edgeStrength(Number.NaN, 75)).toBe(0);
    expect(edgeStrength(10, Number.POSITIVE_INFINITY)).toBe(0);
    expect(edgeStrength(0, 0)).toBe(0);
  });
});
