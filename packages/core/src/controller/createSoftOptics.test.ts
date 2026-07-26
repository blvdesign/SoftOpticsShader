// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { CaptureRootResult } from "../capture/captureRoot";
import type { EdgeStripSource } from "../capture/createEdgeStripSource";
import type { VideoFrameSnapshot } from "../capture/videoFrames";
import type { EdgeStripGeometry } from "../geometry/edgeStripGeometry";
import type { OpticalRenderer } from "../render/types";
import {
  createScheduler as createActualScheduler,
  type Scheduler,
  type SchedulerOptions
} from "./createScheduler";
import {
  createSoftOpticsWithDependencies,
  type CreateSoftOpticsDependencies,
  type SoftOpticsStatus
} from "./createSoftOptics";

function geometry(edge: "top" | "bottom"): EdgeStripGeometry {
  return {
    edge,
    cssTop: edge === "top" ? -16 : 620,
    cssWidth: 1024,
    cssHeight: 64,
    visibleStart: 16,
    visibleEnd: 48,
    textureWidth: 1024,
    textureHeight: 64,
    documentTop: edge === "top" ? -16 : 620,
    documentBottom: edge === "top" ? 48 : 684,
    captureTop: edge === "top" ? 0 : 620,
    captureBottom: edge === "top" ? 48 : 684,
    paddingBefore: edge === "top" ? 16 : 0,
    paddingAfter: 0
  };
}

function createHarness(
  captureResult?: CaptureRootResult,
  options: {
    reducedMotion?: boolean;
    fallbackSupported?: boolean;
    deferredCapture?: Promise<CaptureRootResult>;
  } = {}
) {
  document.body.replaceChildren();
  const root = document.createElement("main");
  Object.defineProperties(root, {
    scrollHeight: { configurable: true, value: 1200 },
    scrollWidth: { configurable: true, value: 1024 }
  });
  document.body.append(root);
  Object.defineProperties(document.documentElement, {
    scrollHeight: { configurable: true, value: 1200 },
    scrollWidth: { configurable: true, value: 1024 }
  });
  Object.defineProperties(window, {
    innerHeight: { configurable: true, value: 700 },
    innerWidth: { configurable: true, value: 1024 },
    scrollY: { configurable: true, writable: true, value: 0 },
    scrollX: { configurable: true, writable: true, value: 0 },
    devicePixelRatio: { configurable: true, value: 1 }
  });

  const capturedCanvas = document.createElement("canvas");
  capturedCanvas.width = 1024;
  capturedCanvas.height = 1200;
  const ready: CaptureRootResult = captureResult ?? {
    status: "ready",
    canvas: capturedCanvas,
    pixelRatio: 1,
    origin: { x: 0, y: 0 },
    fontsPending: false,
    refreshRecommended: false
  };
  const capture = vi.fn(() =>
    options.deferredCapture ?? Promise.resolve(ready)
  );
  const renderers: OpticalRenderer[] = [];
  const rendererStatusCallbacks: Array<
    NonNullable<Parameters<CreateSoftOpticsDependencies["createRenderer"]>[1]>["onStatus"]
  > = [];
  const createRenderer = vi.fn<CreateSoftOpticsDependencies["createRenderer"]>(
    (_canvas: HTMLCanvasElement, rendererOptions) => {
      rendererStatusCallbacks.push(rendererOptions?.onStatus);
      const renderer: OpticalRenderer = {
        resize: vi.fn(),
        uploadSource: vi.fn(),
        render: vi.fn(),
        destroy: vi.fn()
      };
      renderers.push(renderer);
      rendererOptions?.onStatus?.({ state: "ready" });
      return renderer;
    }
  );
  const sources: EdgeStripSource[] = [];
  const createSource = vi.fn(() => {
    const canvas = document.createElement("canvas");
    const source = {
      canvas,
      context: {} as CanvasRenderingContext2D,
      resize: vi.fn((width: number, height: number) => {
        canvas.width = width;
        canvas.height = height;
      }),
      update: vi.fn(({ geometry: nextGeometry }) => {
        canvas.width = nextGeometry.textureWidth;
        canvas.height = nextGeometry.textureHeight;
        return { drewVideoFrame: false };
      })
    } satisfies EdgeStripSource;
    sources.push(source);
    return source;
  });
  let frameOptions: SchedulerOptions | undefined;
  const listeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];
  let refreshPromise: Promise<void> | null = null;
  const scheduler: Scheduler = {
    wake: vi.fn(),
    requestRefresh: vi.fn(() => {
      if (refreshPromise) return refreshPromise;
      refreshPromise = Promise.resolve()
        .then(() => frameOptions?.onRefresh())
        .then(() => undefined)
        .finally(() => {
          refreshPromise = null;
        });
      return refreshPromise;
    }),
    listen: vi.fn((target, type, listener) => {
      listeners.push({ target, type, listener });
      return vi.fn();
    }),
    destroy: vi.fn()
  };
  const createScheduler = vi.fn((nextOptions: SchedulerOptions) => {
    frameOptions = nextOptions;
    return scheduler;
  });
  const resizeCallbacks: ResizeObserverCallback[] = [];
  const resizeDisconnect = vi.fn();
  const createResizeObserver = vi.fn((callback: ResizeObserverCallback) => {
    resizeCallbacks.push(callback);
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: resizeDisconnect
    };
  });
  const mutationCallbacks: MutationCallback[] = [];
  const mutationDisconnect = vi.fn();
  const createMutationObserver = vi.fn((callback: MutationCallback) => {
    mutationCallbacks.push(callback);
    return {
      observe: vi.fn(),
      takeRecords: vi.fn(() => []),
      disconnect: mutationDisconnect
    };
  });
  const fallback = {
    supported: options.fallbackSupported ?? true,
    update: vi.fn(),
    setEnabled: vi.fn(),
    destroy: vi.fn()
  };
  const createFallback = vi.fn(() => fallback);
  const collectVideoFrames = vi.fn((): VideoFrameSnapshot[] => []);
  const statuses: SoftOpticsStatus[] = [];

  const dependencies: CreateSoftOpticsDependencies = {
    captureRoot: capture,
    createRenderer,
    createSource,
    createGeometry: ({ edge }) => geometry(edge),
    collectVideoFrames,
    createFallback,
    createScheduler,
    createResizeObserver,
    createMutationObserver,
    isReducedMotion: () => options.reducedMotion ?? false
  };

  return {
    root,
    capture,
    createRenderer,
    renderers,
    rendererStatusCallbacks,
    sources,
    scheduler,
    listeners,
    getFrameOptions: () => frameOptions,
    resizeCallbacks,
    resizeDisconnect,
    mutationCallbacks,
    mutationDisconnect,
    fallback,
    createFallback,
    collectVideoFrames,
    statuses,
    dependencies
  };
}

describe("createSoftOptics", () => {
  it("captures immediately and mounts exactly one marked fixed canvas per edge", async () => {
    const harness = createHarness();
    const controller = createSoftOpticsWithDependencies(
      {
        root: harness.root,
        onStatusChange: (status) => harness.statuses.push(status)
      },
      harness.dependencies
    );

    await controller.mount();
    await controller.mount();

    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-soft-optics-internal][data-soft-optics-edge]'
    );
    expect(harness.capture).toHaveBeenCalledTimes(1);
    expect(canvases).toHaveLength(2);
    expect([...canvases].map((canvas) => canvas.dataset.softOpticsEdge))
      .toEqual(["top", "bottom"]);
    expect([...canvases].every((canvas) =>
      canvas.style.position === "fixed" &&
      canvas.style.pointerEvents === "none" &&
      canvas.getAttribute("aria-hidden") === "true"
    )).toBe(true);
    expect(harness.renderers).toHaveLength(2);
    expect(controller.getStatus()).toEqual({ mode: "webgl" });
  });

  it("updates rendering config in place, refreshes explicitly, and hides output when disabled", async () => {
    const harness = createHarness();
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    await controller.mount();
    const initialRenderers = [...harness.renderers];

    controller.update({ maxBlur: 32, refraction: 6 });
    harness.getFrameOptions()?.onFrame(16);
    await controller.refresh();
    controller.setEnabled(false);

    expect(harness.renderers).toEqual(initialRenderers);
    expect(harness.capture).toHaveBeenCalledTimes(2);
    expect(initialRenderers.every((renderer) =>
      vi.mocked(renderer.render).mock.calls.some(([frame]) =>
        frame.maxBlur === 32 && frame.refraction === 6
      )
    )).toBe(true);
    expect(
      [...document.querySelectorAll<HTMLCanvasElement>(
        "[data-soft-optics-edge]"
      )].every((canvas) => canvas.hidden)
    ).toBe(true);
    expect(controller.getStatus()).toEqual({
      mode: "disabled",
      reason: "config-disabled"
    });
  });

  it("rebuilds resources only when edge topology changes", async () => {
    const harness = createHarness();
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    await controller.mount();

    controller.update({ edges: ["bottom"] });
    await Promise.resolve();

    expect(document.querySelectorAll("[data-soft-optics-edge]")).toHaveLength(1);
    expect(document.querySelector("[data-soft-optics-edge]")?.getAttribute(
      "data-soft-optics-edge"
    )).toBe("bottom");
    expect(harness.renderers.slice(0, 2).every((renderer) =>
      vi.mocked(renderer.destroy).mock.calls.length === 1
    )).toBe(true);
    expect(harness.renderers).toHaveLength(3);
  });

  it("applies topology updates made while loading or disabled before activation", async () => {
    let resolveCapture!: (result: CaptureRootResult) => void;
    const pending = new Promise<CaptureRootResult>((resolve) => {
      resolveCapture = resolve;
    });
    const loading = createHarness(undefined, { deferredCapture: pending });
    const loadingController = createSoftOpticsWithDependencies(
      { root: loading.root },
      loading.dependencies
    );
    const mounting = loadingController.mount();

    loadingController.update({ edges: ["bottom"] });
    expect(loading.capture).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("canvas[data-soft-optics-edge]"))
      .toHaveLength(1);
    expect(document.querySelector("canvas[data-soft-optics-edge]")
      ?.getAttribute("data-soft-optics-edge")).toBe("bottom");

    resolveCapture({
      status: "ready",
      canvas: document.createElement("canvas"),
      pixelRatio: 1,
      origin: { x: 0, y: 0 },
      fontsPending: false,
      refreshRecommended: false
    });
    await mounting;
    await vi.waitFor(() => {
      expect(loadingController.getStatus()).toEqual({ mode: "webgl" });
    });

    const disabled = createHarness();
    const disabledController = createSoftOpticsWithDependencies(
      {
        root: disabled.root,
        config: { enabled: false }
      },
      disabled.dependencies
    );
    await disabledController.mount();
    disabledController.update({ edges: ["bottom"] });
    disabledController.setEnabled(true);
    await vi.waitFor(() => {
      expect(disabledController.getStatus()).toEqual({ mode: "webgl" });
    });
    expect(document.querySelectorAll("canvas[data-soft-optics-edge]"))
      .toHaveLength(1);
    expect(document.querySelector("canvas[data-soft-optics-edge]")
      ?.getAttribute("data-soft-optics-edge")).toBe("bottom");
  });

  it("falls back coherently on capture failure and disables cleanly without backdrop support", async () => {
    const result: CaptureRootResult = {
      status: "fallback",
      reason: "security-error",
      detail: "tainted"
    };
    const supported = createHarness(result);
    const controller = createSoftOpticsWithDependencies(
      { root: supported.root },
      supported.dependencies
    );
    await controller.mount();

    expect(controller.getStatus()).toEqual({
      mode: "fallback",
      reason: "security-error",
      detail: "tainted"
    });
    expect(supported.createFallback).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("canvas[data-soft-optics-internal]"))
      .toHaveLength(0);
    controller.setEnabled(false);
    controller.setEnabled(true);
    expect(controller.getStatus()).toEqual({
      mode: "fallback",
      reason: "security-error",
      detail: "tainted"
    });

    const unsupported = createHarness(result, {
      fallbackSupported: false
    });
    const noEffect = createSoftOpticsWithDependencies(
      { root: unsupported.root },
      unsupported.dependencies
    );
    await noEffect.mount();
    expect(noEffect.getStatus()).toEqual({
      mode: "disabled",
      reason: "fallback-unavailable",
      detail: "security-error"
    });
  });

  it("creates one fallback and releases partial resources when renderer initialization fails", async () => {
    const harness = createHarness();
    const partialRenderer: OpticalRenderer = {
      resize: vi.fn(),
      uploadSource: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn()
    };
    harness.renderers.push(partialRenderer);
    harness.createRenderer
      .mockImplementationOnce((_canvas, rendererOptions) => {
        rendererOptions?.onStatus?.({ state: "ready" });
        return partialRenderer;
      })
      .mockImplementationOnce((_canvas, rendererOptions) => {
        rendererOptions?.onStatus?.({
          state: "fallback",
          reason: "initialization-failed",
          detail: "shader"
        });
        return null;
      });
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );

    await controller.mount();

    expect(controller.getStatus()).toEqual({
      mode: "fallback",
      reason: "initialization-failed",
      detail: "shader"
    });
    expect(harness.createFallback).toHaveBeenCalledTimes(1);
    expect(partialRenderer.destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("canvas[data-soft-optics-internal]"))
      .toHaveLength(0);
  });

  it("uses continuous fallback for reduced motion without starting capture or WebGL", async () => {
    const harness = createHarness(undefined, { reducedMotion: true });
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );

    await controller.mount();

    expect(harness.capture).not.toHaveBeenCalled();
    expect(harness.renderers).toHaveLength(0);
    expect(controller.getStatus()).toEqual({
      mode: "fallback",
      reason: "reduced-motion"
    });

    Object.defineProperty(harness.root, "scrollHeight", {
      configurable: true,
      value: 1400
    });
    harness.resizeCallbacks[0]?.([], {} as ResizeObserver);
    harness.mutationCallbacks[0]?.(
      [{
        type: "childList",
        target: harness.root,
        addedNodes: [document.createElement("p")],
        removedNodes: []
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    await controller.refresh();

    expect(harness.scheduler.requestRefresh).not.toHaveBeenCalled();
    expect(harness.capture).not.toHaveBeenCalled();
    expect(controller.getStatus()).toEqual({
      mode: "fallback",
      reason: "reduced-motion"
    });
  });

  it("invalidates a pending capture when a renderer fails and ignores its late success", async () => {
    let resolveCapture!: (result: CaptureRootResult) => void;
    const pending = new Promise<CaptureRootResult>((resolve) => {
      resolveCapture = resolve;
    });
    const harness = createHarness(undefined, { deferredCapture: pending });
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    const mounting = controller.mount();

    harness.rendererStatusCallbacks[0]?.({
      state: "fallback",
      reason: "context-lost",
      detail: "gpu reset"
    });
    resolveCapture({
      status: "ready",
      canvas: document.createElement("canvas"),
      pixelRatio: 1,
      origin: { x: 0, y: 0 },
      fontsPending: false,
      refreshRecommended: false
    });
    await mounting;

    expect(controller.getStatus()).toEqual({
      mode: "fallback",
      reason: "context-lost",
      detail: "gpu reset"
    });
    expect(harness.renderers.every((renderer) =>
      vi.mocked(renderer.render).mock.calls.length === 0
    )).toBe(true);
  });

  it.each(["setEnabled", "update"] as const)(
    "keeps a late capture disabled after %s(false)",
    async (disableWith) => {
      let resolveCapture!: (result: CaptureRootResult) => void;
      const pending = new Promise<CaptureRootResult>((resolve) => {
        resolveCapture = resolve;
      });
      const harness = createHarness(undefined, {
        deferredCapture: pending
      });
      const controller = createSoftOpticsWithDependencies(
        { root: harness.root },
        harness.dependencies
      );
      const mounting = controller.mount();

      if (disableWith === "setEnabled") {
        controller.setEnabled(false);
      } else {
        controller.update({ enabled: false });
      }
      expect(
        vi.mocked(harness.dependencies.captureRoot).mock
          .calls[0]?.[0].signal?.aborted
      ).toBe(true);
      resolveCapture({
        status: "ready",
        canvas: document.createElement("canvas"),
        pixelRatio: 1,
        origin: { x: 0, y: 0 },
        fontsPending: false,
        refreshRecommended: false
      });
      await mounting;

      expect(controller.getStatus()).toEqual({
        mode: "disabled",
        reason: "config-disabled"
      });
      expect(harness.renderers.every((renderer) =>
        vi.mocked(renderer.render).mock.calls.length === 0
      )).toBe(true);
    }
  );

  it("wires meaningful observers and events without recapturing its internal subtree", async () => {
    const harness = createHarness();
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    await controller.mount();

    harness.resizeCallbacks[0]?.([], {} as ResizeObserver);
    Object.defineProperty(harness.root, "scrollHeight", {
      configurable: true,
      value: 1300
    });
    harness.resizeCallbacks[0]?.([], {} as ResizeObserver);
    const external = document.createElement("p");
    harness.mutationCallbacks[0]?.(
      [{
        type: "attributes",
        target: external,
        addedNodes: [],
        removedNodes: []
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    const internal = document.querySelector("[data-soft-optics-internal]")!;
    harness.mutationCallbacks[0]?.(
      [{
        type: "childList",
        target: harness.root,
        addedNodes: [internal],
        removedNodes: []
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    const mixedExternal = document.createElement("span");
    harness.mutationCallbacks[0]?.(
      [{
        type: "childList",
        target: harness.root,
        addedNodes: [internal, mixedExternal],
        removedNodes: []
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    harness.mutationCallbacks[0]?.(
      [{
        type: "childList",
        target: harness.root,
        addedNodes: [],
        removedNodes: [internal]
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    harness.mutationCallbacks[0]?.(
      [{
        type: "childList",
        target: harness.root,
        addedNodes: [],
        removedNodes: [internal, mixedExternal]
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    harness.mutationCallbacks[0]?.(
      [{
        type: "attributes",
        target: internal,
        addedNodes: [],
        removedNodes: []
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    for (const { type, listener } of harness.listeners) {
      if (type === "scroll" || type === "wheel") {
        const callback = typeof listener === "function"
          ? listener
          : listener.handleEvent.bind(listener);
        callback(new Event(type));
      }
    }
    const loadListener = harness.listeners.find(
      ({ type }) => type === "load"
    )?.listener;
    const loadCallback = typeof loadListener === "function"
      ? loadListener
      : loadListener?.handleEvent.bind(loadListener);
    const image = document.createElement("img");
    harness.root.append(image);
    loadCallback?.({ target: image } as unknown as Event);
    const internalImage = document.createElement("img");
    internal.append(internalImage);
    loadCallback?.({ target: internalImage } as unknown as Event);
    const outsideImage = document.createElement("img");
    document.body.append(outsideImage);
    loadCallback?.({ target: outsideImage } as unknown as Event);

    expect(harness.scheduler.requestRefresh).toHaveBeenCalledTimes(5);
    expect(harness.scheduler.wake).toHaveBeenCalled();
  });

  it.each([
    {
      label: "attributes",
      createRecord: (ignored: HTMLElement) => ({
        type: "attributes",
        target: ignored.querySelector("span")!,
        attributeName: "aria-pressed",
        addedNodes: [],
        removedNodes: []
      })
    },
    {
      label: "characterData",
      createRecord: (ignored: HTMLElement) => ({
        type: "characterData",
        target: ignored.querySelector("span")!.firstChild!,
        addedNodes: [],
        removedNodes: []
      })
    },
    {
      label: "childList",
      createRecord: (ignored: HTMLElement) => ({
        type: "childList",
        target: ignored,
        addedNodes: [document.createElement("i")],
        removedNodes: []
      })
    }
  ])(
    "does not refresh for $label changes in selector-excluded subtrees",
    async ({ createRecord }) => {
      const harness = createHarness();
      const ignored = document.createElement("section");
      ignored.setAttribute("data-soft-optics-ignore", "");
      ignored.innerHTML = "<span>Control</span>";
      const visible = document.createElement("p");
      harness.root.append(ignored, visible);
      const controller = createSoftOpticsWithDependencies(
        {
          root: harness.root,
          exclude: "[data-soft-optics-ignore]"
        },
        harness.dependencies
      );
      await controller.mount();

      harness.mutationCallbacks[0]?.(
        [createRecord(ignored) as unknown as MutationRecord],
        {} as MutationObserver
      );
      expect(harness.scheduler.requestRefresh).not.toHaveBeenCalled();

      harness.mutationCallbacks[0]?.(
        [{
          type: "attributes",
          target: visible,
          attributeName: "class",
          addedNodes: [],
          removedNodes: []
        } as unknown as MutationRecord],
        {} as MutationObserver
      );
      expect(harness.scheduler.requestRefresh).toHaveBeenCalledTimes(1);
    }
  );

  it("does not refresh for mutations under function-excluded ancestors", async () => {
    const harness = createHarness();
    const ignored = document.createElement("section");
    const child = document.createElement("span");
    ignored.append(child);
    const visible = document.createElement("p");
    harness.root.append(ignored, visible);
    const exclude = vi.fn(
      (node: Node) => node === ignored
    );
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root, exclude },
      harness.dependencies
    );
    await controller.mount();

    harness.mutationCallbacks[0]?.(
      [{
        type: "attributes",
        target: child,
        attributeName: "aria-expanded",
        addedNodes: [],
        removedNodes: []
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    expect(harness.scheduler.requestRefresh).not.toHaveBeenCalled();

    harness.mutationCallbacks[0]?.(
      [{
        type: "childList",
        target: harness.root,
        addedNodes: [visible],
        removedNodes: []
      } as unknown as MutationRecord],
      {} as MutationObserver
    );
    expect(harness.scheduler.requestRefresh).toHaveBeenCalledTimes(1);
    expect(exclude).toHaveBeenCalledWith(child);
    expect(exclude).toHaveBeenCalledWith(ignored);
  });

  it("treats invalid exclusion selectors as no mutation exclusion", async () => {
    const harness = createHarness();
    const target = document.createElement("span");
    harness.root.append(target);
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root, exclude: "[invalid" },
      harness.dependencies
    );
    await controller.mount();

    expect(() =>
      harness.mutationCallbacks[0]?.(
        [{
          type: "attributes",
          target,
          attributeName: "class",
          addedNodes: [],
          removedNodes: []
        } as unknown as MutationRecord],
        {} as MutationObserver
      )
    ).not.toThrow();
    expect(harness.scheduler.requestRefresh).toHaveBeenCalledTimes(1);
  });

  it("requests one follow-up capture after pending fonts become ready", async () => {
    const harness = createHarness({
      status: "ready",
      canvas: document.createElement("canvas"),
      pixelRatio: 1,
      origin: { x: 0, y: 0 },
      fontsPending: true,
      refreshRecommended: true
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() }
    });
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );

    await controller.mount();
    await Promise.resolve();

    expect(harness.scheduler.requestRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not schedule the font follow-up after entering terminal fallback", async () => {
    let resolveFonts!: () => void;
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });
    const harness = createHarness({
      status: "ready",
      canvas: document.createElement("canvas"),
      pixelRatio: 1,
      origin: { x: 0, y: 0 },
      fontsPending: true,
      refreshRecommended: true
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: fontsReady }
    });
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    await controller.mount();
    harness.rendererStatusCallbacks[0]?.({
      state: "fallback",
      reason: "context-lost"
    });

    resolveFonts();
    await Promise.resolve();

    expect(harness.scheduler.requestRefresh).not.toHaveBeenCalled();
    expect(controller.getStatus()).toEqual({
      mode: "fallback",
      reason: "context-lost"
    });
  });

  it("keeps RAF alive only for motion or safe dynamic video frames", async () => {
    const harness = createHarness();
    const video = document.createElement("video");
    const unoptedVideo = document.createElement("video");
    harness.root.append(video, unoptedVideo);
    harness.collectVideoFrames.mockReturnValue([{
      video,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      objectFit: "cover",
      objectPosition: "50% 50%",
      opacity: 1,
      dynamic: true,
      compositeSafe: true
    }]);
    const allowLiveVideo = vi.fn(
      (candidate: HTMLVideoElement) => candidate === video
    );
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root, allowLiveVideo },
      harness.dependencies
    );
    await controller.mount();

    expect(harness.getFrameOptions()?.onFrame(16)).toBe(true);
    expect(harness.collectVideoFrames).toHaveBeenCalledWith(
      [video],
      expect.objectContaining({ allowLiveVideo })
    );
    expect(harness.sources.every((source) =>
      vi.mocked(source.update).mock.calls.some(([input]) =>
        input.videoFrames.every((frame) => frame.compositeSafe)
      )
    )).toBe(true);

    harness.collectVideoFrames.mockReturnValue([{
      video,
      rect: { x: 0, y: 300, width: 100, height: 100 },
      objectFit: "cover",
      objectPosition: "50% 50%",
      opacity: 1,
      dynamic: true,
      compositeSafe: true
    }]);
    expect(harness.getFrameOptions()?.onFrame(5_000)).toBe(false);
  });

  it("coalesces concurrent explicit refresh calls through the scheduler", async () => {
    const harness = createHarness();
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    await controller.mount();

    const first = controller.refresh();
    const second = controller.refresh();
    expect(harness.capture).toHaveBeenCalledTimes(1);
    await Promise.all([first, second]);

    expect(harness.scheduler.requestRefresh).toHaveBeenCalledTimes(2);
    expect(harness.capture).toHaveBeenCalledTimes(2);
  });

  it("resolves refresh only after its scheduled asynchronous capture completes", async () => {
    const harness = createHarness();
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    await controller.mount();
    let resolveCapture!: (result: CaptureRootResult) => void;
    const pending = new Promise<CaptureRootResult>((resolve) => {
      resolveCapture = resolve;
    });
    harness.capture.mockReturnValueOnce(pending);

    const refresh = controller.refresh();
    await Promise.resolve();
    expect(harness.capture).toHaveBeenCalledTimes(2);
    let resolved = false;
    void refresh.then(() => {
      resolved = true;
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(resolved).toBe(false);

    resolveCapture({
      status: "ready",
      canvas: document.createElement("canvas"),
      pixelRatio: 1,
      origin: { x: 0, y: 0 },
      fontsPending: false,
      refreshRecommended: false
    });
    await refresh;
    expect(resolved).toBe(true);
  });

  it("queues one non-overlapping follow-up for event and explicit refreshes during capture", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      harness.dependencies.createScheduler = (schedulerOptions) =>
        createActualScheduler({
          ...schedulerOptions,
          refreshDebounceMs: 0
        });
      const controller = createSoftOpticsWithDependencies(
        { root: harness.root },
        harness.dependencies
      );
      await controller.mount();
      let resolveFirst!: (result: CaptureRootResult) => void;
      let resolveSecond!: (result: CaptureRootResult) => void;
      const firstCapture = new Promise<CaptureRootResult>((resolve) => {
        resolveFirst = resolve;
      });
      const secondCapture = new Promise<CaptureRootResult>((resolve) => {
        resolveSecond = resolve;
      });
      let activeCaptures = 0;
      let maxActiveCaptures = 0;
      harness.capture
        .mockImplementationOnce(async () => {
          activeCaptures += 1;
          maxActiveCaptures = Math.max(
            maxActiveCaptures,
            activeCaptures
          );
          const result = await firstCapture;
          activeCaptures -= 1;
          return result;
        })
        .mockImplementationOnce(async () => {
          activeCaptures += 1;
          maxActiveCaptures = Math.max(
            maxActiveCaptures,
            activeCaptures
          );
          const result = await secondCapture;
          activeCaptures -= 1;
          return result;
        });

      const first = controller.refresh();
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.capture).toHaveBeenCalledTimes(2);
      Object.defineProperty(harness.root, "scrollHeight", {
        configurable: true,
        value: 1500
      });
      harness.resizeCallbacks[0]?.([], {} as ResizeObserver);
      const second = controller.refresh();
      const third = controller.refresh();
      expect(second).toBe(third);
      expect(second).not.toBe(first);
      expect(harness.capture).toHaveBeenCalledTimes(2);

      resolveFirst({
        status: "ready",
        canvas: document.createElement("canvas"),
        pixelRatio: 1,
        origin: { x: 0, y: 0 },
        fontsPending: false,
        refreshRecommended: false
      });
      await first;
      await Promise.resolve();
      expect(harness.capture).toHaveBeenCalledTimes(3);
      let followUpResolved = false;
      void second.then(() => {
        followUpResolved = true;
      });
      await Promise.resolve();
      expect(followUpResolved).toBe(false);

      resolveSecond({
        status: "ready",
        canvas: document.createElement("canvas"),
        pixelRatio: 1,
        origin: { x: 0, y: 0 },
        fontsPending: false,
        refreshRecommended: false
      });
      await Promise.all([second, third]);
      expect(maxActiveCaptures).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores late capture completion and releases every owned resource once", async () => {
    let resolveCapture!: (result: CaptureRootResult) => void;
    const pending = new Promise<CaptureRootResult>((resolve) => {
      resolveCapture = resolve;
    });
    const harness = createHarness(undefined, { deferredCapture: pending });
    const controller = createSoftOpticsWithDependencies(
      { root: harness.root },
      harness.dependencies
    );
    const mounting = controller.mount();

    controller.destroy();
    controller.destroy();
    resolveCapture({
      status: "ready",
      canvas: document.createElement("canvas"),
      pixelRatio: 1,
      origin: { x: 0, y: 0 },
      fontsPending: false,
      refreshRecommended: false
    });
    await mounting;

    expect(document.querySelectorAll("[data-soft-optics-internal]"))
      .toHaveLength(0);
    expect(harness.scheduler.destroy).toHaveBeenCalledTimes(1);
    expect(harness.resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(harness.mutationDisconnect).toHaveBeenCalledTimes(1);
    expect(harness.renderers.every((renderer) =>
      vi.mocked(renderer.destroy).mock.calls.length === 1
    )).toBe(true);
    expect(controller.getStatus()).toEqual({
      mode: "disabled",
      reason: "destroyed"
    });
  });
});
