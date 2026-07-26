import { describe, expect, it } from "vitest";

import { DEFAULT_SOFT_OPTICS_CONFIG } from "../config";
import {
  computeOpticsTarget,
  createScrollOpticsState,
  decayImpulse,
  stepScrollOptics,
  type OpticsTarget
} from "./scrollOptics";

const baseInput = {
  deltaTime: 16,
  scrollY: 500,
  maxScroll: 2_000,
  reducedMotion: false
};

describe("computeOpticsTarget", () => {
  it("sends the primary impulse to the top while scrolling down", () => {
    const target = computeOpticsTarget(
      { ...baseInput, delta: 14 },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(target.direction).toBe(1);
    expect(target.top).toBeGreaterThan(target.bottom);
    expect(target.bottom).toBeCloseTo(
      target.top *
        DEFAULT_SOFT_OPTICS_CONFIG.oppositeEdgeResponse,
      5
    );
  });

  it("sends the primary impulse to the bottom while scrolling up", () => {
    const target = computeOpticsTarget(
      { ...baseInput, delta: -14 },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(target.direction).toBe(-1);
    expect(target.bottom).toBeGreaterThan(target.top);
    expect(target.top).toBeCloseTo(
      target.bottom *
        DEFAULT_SOFT_OPTICS_CONFIG.oppositeEdgeResponse,
      5
    );
  });

  it("clamps trackpad spikes", () => {
    const target = computeOpticsTarget(
      { ...baseInput, delta: 1_000, deltaTime: 4 },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(target.speed).toBe(1);
    expect(target.top).toBe(1);
  });

  it("keeps ordinary low-delta trackpad movement visible", () => {
    const target = computeOpticsTarget(
      { ...baseInput, delta: 2 },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(target.speed).toBeGreaterThan(0.2);
    expect(target.speed).toBeLessThan(1);
  });

  it("caps idle delta time so the first gesture stays visible", () => {
    const target = computeOpticsTarget(
      { ...baseInput, delta: 24, deltaTime: 2_000 },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(target.speed).toBeGreaterThan(0.5);
  });

  it("keeps both edges present at document boundaries", () => {
    const atStart = computeOpticsTarget(
      { ...baseInput, delta: 14, scrollY: 0 },
      DEFAULT_SOFT_OPTICS_CONFIG
    );
    const atEnd = computeOpticsTarget(
      { ...baseInput, delta: -14, scrollY: 2_000 },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(atStart.topPresence).toBe(
      DEFAULT_SOFT_OPTICS_CONFIG.presenceFloor
    );
    expect(atStart.top).toBeGreaterThan(0);
    expect(atEnd.bottomPresence).toBe(
      DEFAULT_SOFT_OPTICS_CONFIG.presenceFloor
    );
    expect(atEnd.bottom).toBeGreaterThan(0);
  });

  it("removes only the dynamic impulse for reduced motion", () => {
    const target = computeOpticsTarget(
      { ...baseInput, delta: 14, reducedMotion: true },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(target).toMatchObject({
      speed: 0,
      direction: 0,
      top: 0,
      bottom: 0,
      topPresence: 1,
      bottomPresence: 1
    });
  });

  it("returns a resting target for invalid motion samples", () => {
    const target = computeOpticsTarget(
      {
        ...baseInput,
        delta: Number.NaN,
        deltaTime: Number.POSITIVE_INFINITY
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(target).toMatchObject({
      speed: 0,
      direction: 0,
      top: 0,
      bottom: 0
    });
  });
});

describe("decayImpulse", () => {
  it("uses decayMs as the practical fade-to-five-percent duration", () => {
    const faded = decayImpulse(1, 800, 800);
    const settled = decayImpulse(faded, 2_000, 800);

    expect(faded).toBeCloseTo(0.05, 5);
    expect(settled).toBe(0);
  });

  it("decays smoothly and never grows for invalid negative elapsed time", () => {
    expect(decayImpulse(0.8, 0, 800)).toBe(0.8);
    expect(decayImpulse(0.8, -100, 800)).toBe(0.8);
    expect(decayImpulse(0.8, 100, 800)).toBeLessThan(0.8);
  });
});

const downTarget: OpticsTarget = {
  speed: 0.6,
  direction: 1,
  top: 0.6,
  bottom: 0.24,
  topPresence: 1,
  bottomPresence: 1
};

describe("stepScrollOptics", () => {
  it("creates a deterministic resting state", () => {
    expect(createScrollOpticsState()).toEqual({
      top: 0,
      bottom: 0,
      speed: 0,
      direction: 0,
      topPeakUntilMs: 0,
      bottomPeakUntilMs: 0
    });
  });

  it("holds both impulses through the configured peak window", () => {
    const moving = stepScrollOptics(
      createScrollOpticsState(),
      {
        timestampMs: 10,
        elapsedMs: 10,
        target: downTarget,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );
    const held = stepScrollOptics(
      moving,
      {
        timestampMs: 90,
        elapsedMs: 80,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(moving.topPeakUntilMs).toBe(110);
    expect(moving.bottomPeakUntilMs).toBe(110);
    expect(held.top).toBe(moving.top);
    expect(held.bottom).toBe(moving.bottom);
    expect(held.speed).toBe(moving.speed);
  });

  it("decays only the elapsed portion after peak hold", () => {
    const moving = stepScrollOptics(
      createScrollOpticsState(),
      {
        timestampMs: 10,
        elapsedMs: 10,
        target: downTarget,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );
    const decaying = stepScrollOptics(
      moving,
      {
        timestampMs: 160,
        elapsedMs: 150,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(decaying.top).toBeCloseTo(
      decayImpulse(
        moving.top,
        50,
        DEFAULT_SOFT_OPTICS_CONFIG.decayMs
      ),
      8
    );
    expect(decaying.bottom).toBeCloseTo(
      decayImpulse(
        moving.bottom,
        50,
        DEFAULT_SOFT_OPTICS_CONFIG.decayMs
      ),
      8
    );
  });

  it("replaces a stronger impulse and extends its peak window", () => {
    const moving = stepScrollOptics(
      createScrollOpticsState(),
      {
        timestampMs: 10,
        elapsedMs: 10,
        target: downTarget,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );
    const strongerTarget: OpticsTarget = {
      ...downTarget,
      speed: 0.9,
      top: 0.9,
      bottom: 0.36
    };
    const replaced = stepScrollOptics(
      moving,
      {
        timestampMs: 80,
        elapsedMs: 70,
        target: strongerTarget,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(replaced).toMatchObject({
      top: 0.9,
      bottom: 0.36,
      speed: 0.9,
      direction: 1,
      topPeakUntilMs: 180,
      bottomPeakUntilMs: 180
    });
  });

  it("preserves the last useful direction while impulses decay", () => {
    const moving = stepScrollOptics(
      createScrollOpticsState(),
      {
        timestampMs: 0,
        elapsedMs: 0,
        target: downTarget,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );
    const decaying = stepScrollOptics(
      moving,
      {
        timestampMs: 300,
        elapsedMs: 300,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(decaying.speed).toBeGreaterThan(0);
    expect(decaying.direction).toBe(1);
  });

  it("clears held impulses immediately for reduced motion", () => {
    const moving = stepScrollOptics(
      createScrollOpticsState(),
      {
        timestampMs: 10,
        elapsedMs: 10,
        target: downTarget,
        reducedMotion: false
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );
    const reduced = stepScrollOptics(
      moving,
      {
        timestampMs: 20,
        elapsedMs: 10,
        target: downTarget,
        reducedMotion: true
      },
      DEFAULT_SOFT_OPTICS_CONFIG
    );

    expect(reduced).toEqual(createScrollOpticsState());
  });
});
