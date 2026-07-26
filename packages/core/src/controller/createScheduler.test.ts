import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScheduler } from "./createScheduler";

type FrameCallback = (timestamp: number) => void;

function createFrameHarness() {
  let nextId = 1;
  const callbacks = new Map<number, FrameCallback>();
  const requestFrame = vi.fn((callback: FrameCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancelFrame = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  const runNextFrame = (browserTimestamp = 0) => {
    const entry = callbacks.entries().next().value as
      | [number, FrameCallback]
      | undefined;
    if (!entry) throw new Error("No frame is scheduled.");
    callbacks.delete(entry[0]);
    entry[1](browserTimestamp);
  };

  return { callbacks, requestFrame, cancelFrame, runNextFrame };
}

describe("createScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces wake requests and uses the injected clock", () => {
    const frames = createFrameHarness();
    const onFrame = vi.fn(() => false);
    const scheduler = createScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 42,
      onFrame,
      onRefresh: vi.fn()
    });

    scheduler.wake();
    scheduler.wake();
    frames.runNextFrame(9_999);

    expect(frames.requestFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(42);
    expect(frames.callbacks).toHaveLength(0);
  });

  it("continues while frames report work and wakes again after becoming idle", () => {
    const frames = createFrameHarness();
    const onFrame = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);
    const scheduler = createScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 10,
      onFrame,
      onRefresh: vi.fn()
    });

    scheduler.wake();
    frames.runNextFrame();
    expect(frames.callbacks).toHaveLength(1);

    frames.runNextFrame();
    expect(frames.callbacks).toHaveLength(0);

    scheduler.wake();
    frames.runNextFrame();
    expect(onFrame).toHaveBeenCalledTimes(3);
  });

  it("coalesces refresh promises and resolves them after the scheduled capture", async () => {
    const frames = createFrameHarness();
    let finishRefresh!: () => void;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => {
      finishRefresh = resolve;
    }));
    const scheduler = createScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
      onFrame: () => false,
      onRefresh,
      refreshDebounceMs: 80
    });

    const first = scheduler.requestRefresh();
    vi.advanceTimersByTime(50);
    const second = scheduler.requestRefresh();
    expect(second).toBe(first);
    vi.advanceTimersByTime(79);
    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    const duringFlight = scheduler.requestRefresh();
    const alsoDuringFlight = scheduler.requestRefresh();
    expect(duringFlight).not.toBe(first);
    expect(alsoDuringFlight).toBe(duringFlight);
    vi.advanceTimersByTime(800);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    let firstResolved = false;
    let followUpResolved = false;
    void first.then(() => {
      firstResolved = true;
    });
    void duringFlight.then(() => {
      followUpResolved = true;
    });
    await Promise.resolve();
    expect(firstResolved).toBe(false);
    expect(followUpResolved).toBe(false);
    finishRefresh();
    await expect(first).resolves.toBeUndefined();
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(followUpResolved).toBe(false);
    finishRefresh();
    await expect(duringFlight).resolves.toBeUndefined();

    const third = scheduler.requestRefresh();
    expect(third).not.toBe(first);
    vi.advanceTimersByTime(80);
    expect(onRefresh).toHaveBeenCalledTimes(3);
    finishRefresh();
    await third;
  });

  it("owns event listener cleanup and ignores all work after destroy", async () => {
    const frames = createFrameHarness();
    const target = new EventTarget();
    const listener = vi.fn();
    const onFrame = vi.fn(() => true);
    const onRefresh = vi.fn();
    const scheduler = createScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
      onFrame,
      onRefresh,
      refreshDebounceMs: 20
    });

    scheduler.listen(target, "scroll", listener);
    scheduler.wake();
    const lateFrame = [...frames.callbacks.values()][0];
    const refresh = scheduler.requestRefresh();
    scheduler.destroy();
    scheduler.destroy();

    target.dispatchEvent(new Event("scroll"));
    lateFrame?.(0);
    vi.runAllTimers();
    scheduler.wake();
    scheduler.requestRefresh();

    expect(listener).not.toHaveBeenCalled();
    expect(onFrame).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    await expect(refresh).resolves.toBeUndefined();
    expect(frames.cancelFrame).toHaveBeenCalledTimes(1);
    expect(frames.callbacks).toHaveLength(0);
  });
});
