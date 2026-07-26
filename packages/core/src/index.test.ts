import { describe, expect, it } from "vitest";

import * as publicCore from "./index";
import {
  DEFAULT_SOFT_OPTICS_CONFIG,
  SOFT_OPTICS_CONFIG_RANGES,
  SOFT_OPTICS_PRESETS,
  calculateVideoDrawMapping,
  captureRoot,
  collectVideoFrameSnapshots,
  computeOpticsTarget,
  createSoftOptics,
  createEdgeStripSource,
  createScrollOpticsState,
  createEdgeStripGeometry,
  decayImpulse,
  edgeStrength,
  frameIntersectsStrip,
  resolveConfig,
  stepScrollOptics,
  type EdgeStripGeometry,
  type EdgeStripGeometryInput,
  type OpticsDirection,
  type OpticsInput,
  type OpticsTarget,
  type ScrollOpticsState,
  type ScrollOpticsStepInput,
  type SoftOpticsConfig,
  type SoftOpticsConfigRange,
  type SoftOpticsController,
  type SoftOpticsEdge,
  type SoftOpticsStatus,
  type SoftOpticsPresetName
} from "./index";

describe("public core entrypoint", () => {
  it("exports configuration, geometry, and motion APIs", () => {
    expect(DEFAULT_SOFT_OPTICS_CONFIG.enabled).toBe(true);
    expect(SOFT_OPTICS_PRESETS.subtle.maxBlur).toBe(16);
    expect(SOFT_OPTICS_CONFIG_RANGES.maxBlur.min).toBe(0);
    expect(resolveConfig({ maxBlur: 12 }).maxBlur).toBe(12);
    expect(createEdgeStripGeometry).toBeTypeOf("function");
    expect(edgeStrength).toBeTypeOf("function");
    expect(computeOpticsTarget).toBeTypeOf("function");
    expect(createScrollOpticsState).toBeTypeOf("function");
    expect(decayImpulse).toBeTypeOf("function");
    expect(stepScrollOptics).toBeTypeOf("function");
    expect(captureRoot).toBeTypeOf("function");
    expect(createEdgeStripSource).toBeTypeOf("function");
    expect(calculateVideoDrawMapping).toBeTypeOf("function");
    expect(collectVideoFrameSnapshots).toBeTypeOf("function");
    expect(frameIntersectsStrip).toBeTypeOf("function");
    expect(createSoftOptics).toBeTypeOf("function");
  });

  it("exports its public types", () => {
    const edge: SoftOpticsEdge = "top";
    const config: SoftOpticsConfig = DEFAULT_SOFT_OPTICS_CONFIG;
    const configRange: SoftOpticsConfigRange =
      SOFT_OPTICS_CONFIG_RANGES.maxBlur;
    const presetName: SoftOpticsPresetName = "default";
    const geometryInput: EdgeStripGeometryInput = {
      edge,
      viewportWidth: 1,
      viewportHeight: 1,
      documentHeight: 1,
      scrollY: 0,
      zonePixels: 1,
      overscanPixels: 1,
      dpr: 1
    };
    const geometry: EdgeStripGeometry =
      createEdgeStripGeometry(geometryInput);
    const opticsInput: OpticsInput = {
      delta: 0,
      deltaTime: 16,
      scrollY: 0,
      maxScroll: 0,
      reducedMotion: false
    };
    const target: OpticsTarget = computeOpticsTarget(
      opticsInput,
      config
    );
    const state: ScrollOpticsState = createScrollOpticsState();
    const stepInput: ScrollOpticsStepInput = {
      timestampMs: 0,
      elapsedMs: 0,
      reducedMotion: false
    };
    const direction: OpticsDirection = target.direction;
    const controller: SoftOpticsController = createSoftOptics();
    const controllerStatus: SoftOpticsStatus = controller.getStatus();

    expect({
      configRange,
      controllerStatus,
      direction,
      geometry,
      presetName,
      state,
      stepInput
    }).toBeDefined();
  });

  it("keeps implementation shader strings out of the public root", () => {
    expect(publicCore).not.toHaveProperty("BLUR_FRAGMENT_SHADER");
    expect(publicCore).not.toHaveProperty("FULLSCREEN_VERTEX_SHADER");
    expect(publicCore).not.toHaveProperty("OPTICAL_FRAGMENT_SHADER");
  });
});
