import type { SoftOpticsConfig } from "../types";

export type OpticsInput = {
  delta: number;
  deltaTime: number;
  scrollY: number;
  maxScroll: number;
  reducedMotion: boolean;
};

export type OpticsDirection = -1 | 0 | 1;

export type OpticsTarget = {
  speed: number;
  direction: OpticsDirection;
  top: number;
  bottom: number;
  topPresence: number;
  bottomPresence: number;
};

export type ScrollOpticsState = {
  top: number;
  bottom: number;
  speed: number;
  direction: OpticsDirection;
  topPeakUntilMs: number;
  bottomPeakUntilMs: number;
};

export type ScrollOpticsStepInput = {
  timestampMs: number;
  elapsedMs: number;
  target?: Readonly<OpticsTarget>;
  reducedMotion: boolean;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function computeOpticsTarget(
  input: OpticsInput,
  config: Readonly<SoftOpticsConfig>
): OpticsTarget {
  const maxScroll = finiteNonNegative(input.maxScroll);
  const scrollY = clamp(
    finiteNonNegative(input.scrollY),
    0,
    maxScroll
  );
  const presenceFloor = clamp(config.presenceFloor);
  const presenceRange = 1 - presenceFloor;
  const fadeDistance =
    Number.isFinite(config.edgeFadeDistance) &&
    config.edgeFadeDistance > 0
      ? config.edgeFadeDistance
      : 1;
  const topPresence =
    presenceFloor +
    presenceRange * clamp(scrollY / fadeDistance);
  const bottomPresence =
    presenceFloor +
    presenceRange *
      clamp((maxScroll - scrollY) / fadeDistance);
  const delta = Number.isFinite(input.delta) ? input.delta : 0;
  const requestedDirection = Math.sign(delta) as OpticsDirection;
  const deltaTime = Number.isNaN(input.deltaTime)
    ? 1
    : clamp(input.deltaTime, 1, 48);
  const sensitivity =
    Number.isFinite(config.velocitySensitivity) &&
    config.velocitySensitivity > 0
      ? config.velocitySensitivity
      : 1;
  const rawSpeed = Math.abs(delta) / deltaTime / sensitivity;
  const normalizedSpeed = clamp(rawSpeed);
  const speed = input.reducedMotion
    ? 0
    : clamp(
        Math.sqrt(normalizedSpeed) *
          (0.86 + 0.14 * normalizedSpeed)
      );
  const direction = speed === 0 ? 0 : requestedDirection;
  const oppositeEdgeResponse = clamp(
    config.oppositeEdgeResponse
  );
  const topWeight =
    direction > 0 ? 1 : oppositeEdgeResponse;
  const bottomWeight =
    direction < 0 ? 1 : oppositeEdgeResponse;

  return {
    speed,
    direction,
    top: speed * topWeight * topPresence,
    bottom: speed * bottomWeight * bottomPresence,
    topPresence,
    bottomPresence
  };
}

export function decayImpulse(
  current: number,
  elapsedMs: number,
  decayMs: number
): number {
  if (!Number.isFinite(current) || current <= 0) {
    return 0;
  }

  const elapsed =
    Number.isNaN(elapsedMs) || elapsedMs < 0 ? 0 : elapsedMs;
  const duration =
    Number.isFinite(decayMs) && decayMs > 0 ? decayMs : 1;
  const next =
    current *
    Math.exp((Math.log(0.05) * elapsed) / duration);

  return next < 0.001 ? 0 : next;
}

export function createScrollOpticsState(): ScrollOpticsState {
  return {
    top: 0,
    bottom: 0,
    speed: 0,
    direction: 0,
    topPeakUntilMs: 0,
    bottomPeakUntilMs: 0
  };
}

function safeImpulse(value: number): number {
  return Number.isFinite(value) ? clamp(value) : 0;
}

export function stepScrollOptics(
  state: Readonly<ScrollOpticsState>,
  input: Readonly<ScrollOpticsStepInput>,
  config: Readonly<SoftOpticsConfig>
): ScrollOpticsState {
  if (input.reducedMotion || !config.enabled) {
    return createScrollOpticsState();
  }

  const timestampMs = finiteNonNegative(input.timestampMs);
  const elapsedMs = finiteNonNegative(input.elapsedMs);
  const peakHoldMs = finiteNonNegative(config.peakHoldMs);
  const target = input.target;
  const hasImpulse =
    target !== undefined &&
    target.direction !== 0 &&
    target.speed > 0;
  let top = safeImpulse(state.top);
  let bottom = safeImpulse(state.bottom);
  let topPeakUntilMs = finiteNonNegative(state.topPeakUntilMs);
  let bottomPeakUntilMs = finiteNonNegative(
    state.bottomPeakUntilMs
  );
  let direction = state.direction;

  if (hasImpulse) {
    const targetTop = safeImpulse(target.top);
    const targetBottom = safeImpulse(target.bottom);
    const directionChanged =
      direction !== 0 && direction !== target.direction;

    if (directionChanged) {
      top = targetTop;
      bottom = targetBottom;
      topPeakUntilMs = timestampMs + peakHoldMs;
      bottomPeakUntilMs = timestampMs + peakHoldMs;
    } else {
      if (targetTop >= top) {
        top = targetTop;
        topPeakUntilMs = timestampMs + peakHoldMs;
      }
      if (targetBottom >= bottom) {
        bottom = targetBottom;
        bottomPeakUntilMs = timestampMs + peakHoldMs;
      }
    }

    direction = target.direction;
  } else {
    if (timestampMs > topPeakUntilMs) {
      top = decayImpulse(
        top,
        Math.min(elapsedMs, timestampMs - topPeakUntilMs),
        config.decayMs
      );
    }
    if (timestampMs > bottomPeakUntilMs) {
      bottom = decayImpulse(
        bottom,
        Math.min(elapsedMs, timestampMs - bottomPeakUntilMs),
        config.decayMs
      );
    }
  }

  const speed = Math.max(top, bottom);

  return {
    top,
    bottom,
    speed,
    direction: speed > 0 ? direction : 0,
    topPeakUntilMs,
    bottomPeakUntilMs
  };
}
