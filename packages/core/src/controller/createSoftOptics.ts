import {
  captureRoot,
  SOFT_OPTICS_INTERNAL_ATTRIBUTE,
  type CaptureRootFallbackReason,
  type CaptureRootOptions,
  type CaptureRootResult
} from "../capture/captureRoot";
import {
  createEdgeStripSource,
  type EdgeStripSource
} from "../capture/createEdgeStripSource";
import {
  collectVideoFrameSnapshots,
  frameIntersectsStrip,
  SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE,
  type CollectVideoFrameOptions,
  type VideoFrameSnapshot
} from "../capture/videoFrames";
import { resolveConfig } from "../config";
import {
  createEdgeStripGeometry,
  type EdgeStripGeometry,
  type EdgeStripGeometryInput
} from "../geometry/edgeStripGeometry";
import {
  computeOpticsTarget,
  createScrollOpticsState,
  stepScrollOptics,
  type ScrollOpticsState
} from "../motion/scrollOptics";
import { createOpticalRenderer } from "../render/createOpticalRenderer";
import type {
  OpticalRenderer,
  OpticalRendererFallbackReason,
  OpticalRendererOptions
} from "../render/types";
import {
  createFallback,
  type CreateFallbackOptions,
  type SoftOpticsFallback
} from "../fallback/createFallback";
import type { SoftOpticsConfig, SoftOpticsEdge } from "../types";
import {
  createScheduler,
  type Scheduler,
  type SchedulerOptions
} from "./createScheduler";

export type SoftOpticsDisabledReason =
  | "unmounted"
  | "config-disabled"
  | "fallback-unavailable"
  | "document-unavailable"
  | "destroyed";

export type SoftOpticsFallbackReason =
  | CaptureRootFallbackReason
  | OpticalRendererFallbackReason
  | "source-error"
  | "reduced-motion";

export type SoftOpticsStatus =
  | { mode: "loading" }
  | { mode: "webgl" }
  | {
      mode: "fallback";
      reason: SoftOpticsFallbackReason;
      detail?: unknown;
    }
  | {
      mode: "disabled";
      reason: SoftOpticsDisabledReason;
      detail?: unknown;
    };

export type CreateSoftOpticsOptions = {
  root?: HTMLElement;
  config?: Partial<SoftOpticsConfig>;
  exclude?: string | ((node: Node) => boolean);
  layer?: {
    parent?: HTMLElement;
    zIndex?: number;
  };
  allowLiveVideo?:
    | boolean
    | ((video: HTMLVideoElement) => boolean);
  onStatusChange?: (status: SoftOpticsStatus) => void;
};

export type SoftOpticsController = {
  mount(): Promise<void>;
  update(partial: Partial<SoftOpticsConfig>): void;
  refresh(): Promise<void>;
  setEnabled(enabled: boolean): void;
  getStatus(): SoftOpticsStatus;
  destroy(): void;
};

type ResizeObserverLike = Pick<
  ResizeObserver,
  "observe" | "unobserve" | "disconnect"
>;
type MutationObserverLike = Pick<
  MutationObserver,
  "observe" | "takeRecords" | "disconnect"
>;

export type CreateSoftOpticsDependencies = {
  captureRoot(options: CaptureRootOptions): Promise<CaptureRootResult>;
  createRenderer(
    canvas: HTMLCanvasElement,
    options?: OpticalRendererOptions
  ): OpticalRenderer | null;
  createSource(): EdgeStripSource;
  createGeometry(input: EdgeStripGeometryInput): EdgeStripGeometry;
  collectVideoFrames(
    videos: readonly HTMLVideoElement[],
    options?: CollectVideoFrameOptions
  ): VideoFrameSnapshot[];
  createFallback(options: CreateFallbackOptions): SoftOpticsFallback;
  createScheduler(options: SchedulerOptions): Scheduler;
  createResizeObserver(
    callback: ResizeObserverCallback
  ): ResizeObserverLike | null;
  createMutationObserver(
    callback: MutationCallback
  ): MutationObserverLike | null;
  isReducedMotion(ownerWindow: Window): boolean;
};

type EdgeResource = {
  edge: SoftOpticsEdge;
  canvas: HTMLCanvasElement;
  renderer: OpticalRenderer;
  source: EdgeStripSource;
  geometry?: EdgeStripGeometry;
};

function defaultResizeObserver(
  callback: ResizeObserverCallback
): ResizeObserverLike | null {
  return typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(callback);
}

function defaultMutationObserver(
  callback: MutationCallback
): MutationObserverLike | null {
  return typeof MutationObserver === "undefined"
    ? null
    : new MutationObserver(callback);
}

const DEFAULT_DEPENDENCIES: CreateSoftOpticsDependencies = {
  captureRoot,
  createRenderer: createOpticalRenderer,
  createSource: createEdgeStripSource,
  createGeometry: createEdgeStripGeometry,
  collectVideoFrames: collectVideoFrameSnapshots,
  createFallback,
  createScheduler,
  createResizeObserver: defaultResizeObserver,
  createMutationObserver: defaultMutationObserver,
  isReducedMotion: (ownerWindow) =>
    ownerWindow.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false
};

function sameEdges(
  first: readonly SoftOpticsEdge[],
  second: readonly SoftOpticsEdge[]
): boolean {
  return first.length === second.length &&
    first.every((edge, index) => edge === second[index]);
}

function internalNode(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (
      current.nodeType === 1 &&
      (current as Element).hasAttribute(
        SOFT_OPTICS_INTERNAL_ATTRIBUTE
      )
    ) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function userExcludedNode(
  node: Node,
  exclude: CreateSoftOpticsOptions["exclude"],
  observationRoot: Node
): boolean {
  if (!exclude) return false;

  let current: Node | null = node;
  while (current) {
    if (typeof exclude === "string") {
      if (current.nodeType === 1) {
        try {
          if ((current as Element).matches(exclude)) {
            return true;
          }
        } catch {
          return false;
        }
      }
    } else {
      try {
        if (exclude(current)) return true;
      } catch {
        // A failing predicate excludes nothing at this node.
      }
    }
    if (current === observationRoot) break;
    current = current.parentNode;
  }

  return false;
}

function mutationNodeIsIgnored(
  node: Node,
  exclude: CreateSoftOpticsOptions["exclude"],
  observationRoot: Node
): boolean {
  return (
    internalNode(node) ||
    userExcludedNode(node, exclude, observationRoot)
  );
}

function mutationIsIgnored(
  record: MutationRecord,
  exclude: CreateSoftOpticsOptions["exclude"],
  observationRoot: Node
): boolean {
  if (
    mutationNodeIsIgnored(
      record.target,
      exclude,
      observationRoot
    )
  ) {
    return true;
  }
  if (record.type !== "childList") return false;

  const changedNodes = [
    ...record.addedNodes,
    ...record.removedNodes
  ];
  return changedNodes.length > 0
    ? changedNodes.every((node) =>
        mutationNodeIsIgnored(
          node,
          exclude,
          observationRoot
        )
      )
    : false;
}

function isImageTarget(
  target: EventTarget | null
): target is HTMLImageElement {
  return target !== null &&
    "nodeType" in target &&
    (target as Node).nodeType === 1 &&
    (target as Element).localName === "img";
}

function safeZIndex(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : 40;
}

function documentHeight(root: HTMLElement): number {
  const documentRef = root.ownerDocument;
  return Math.max(
    1,
    root.scrollHeight,
    documentRef.body?.scrollHeight ?? 0,
    documentRef.documentElement.scrollHeight
  );
}

function videoPredicate(
  option: CreateSoftOpticsOptions["allowLiveVideo"]
): ((video: HTMLVideoElement) => boolean) | undefined {
  if (typeof option === "function") return option;
  if (typeof option === "boolean") return () => option;
  return undefined;
}

function statusWithDetail<
  T extends SoftOpticsFallbackReason
>(
  reason: T,
  detail: unknown
): SoftOpticsStatus {
  return detail === undefined
    ? { mode: "fallback", reason }
    : { mode: "fallback", reason, detail };
}

export function createSoftOpticsWithDependencies(
  options: CreateSoftOpticsOptions = {},
  overrides: Partial<CreateSoftOpticsDependencies> = {}
): SoftOpticsController {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let config = resolveConfig(options.config);
  let status: SoftOpticsStatus = {
    mode: "disabled",
    reason: "unmounted"
  };
  let mounted = false;
  let destroyed = false;
  let mountPromise: Promise<void> | null = null;
  let root: HTMLElement | null = null;
  let ownerWindow: Window | null = null;
  let parent: HTMLElement | null = null;
  let scheduler: Scheduler | null = null;
  let resizeObserver: ResizeObserverLike | null = null;
  let mutationObserver: MutationObserverLike | null = null;
  let fallback: SoftOpticsFallback | null = null;
  let fallbackStatus:
    | Extract<SoftOpticsStatus, { mode: "fallback" }>
    | null = null;
  let capturedTexture:
    | Extract<CaptureRootResult, { status: "ready" }>
    | null = null;
  let resources = new Map<SoftOpticsEdge, EdgeResource>();
  let captureSequence = 0;
  let lifecycleSequence = 0;
  let previousScrollY = 0;
  let previousSampleTime = 0;
  let lastFrameTime = 0;
  let motionState: ScrollOpticsState = createScrollOpticsState();
  let fontRefreshScheduled = false;
  let activeCaptureController: AbortController | null = null;

  const cancelActiveCapture = () => {
    activeCaptureController?.abort();
    activeCaptureController = null;
  };

  const notify = (nextStatus: SoftOpticsStatus) => {
    status = nextStatus;
    try {
      options.onStatusChange?.(nextStatus);
    } catch {
      // Consumer callbacks do not own renderer lifecycle.
    }
  };

  const setCanvasEnabled = (enabled: boolean) => {
    for (const resource of resources.values()) {
      resource.canvas.hidden = !enabled;
    }
    fallback?.setEnabled(enabled);
  };

  const releaseResources = () => {
    const previous = resources;
    resources = new Map();
    for (const resource of previous.values()) {
      resource.renderer.destroy();
      resource.canvas.remove();
    }
  };

  const ensureFallback = (
    reason: SoftOpticsFallbackReason,
    detail?: unknown
  ) => {
    if (destroyed || !root || !parent) return;
    cancelActiveCapture();
    captureSequence += 1;
    lifecycleSequence += 1;
    releaseResources();
    capturedTexture = null;
    fallback?.destroy();
    fallback = dependencies.createFallback({
      config,
      parent,
      document: root.ownerDocument,
      ...(options.layer?.zIndex !== undefined
        ? { zIndex: options.layer.zIndex }
        : {})
    });
    if (fallback.supported) {
      fallback.setEnabled(config.enabled);
      const nextStatus = statusWithDetail(reason, detail) as Extract<
        SoftOpticsStatus,
        { mode: "fallback" }
      >;
      fallbackStatus = nextStatus;
      notify(nextStatus);
    } else {
      fallback.destroy();
      fallback = null;
      fallbackStatus = null;
      notify({
        mode: "disabled",
        reason: "fallback-unavailable",
        detail: reason
      });
    }
  };

  const positionCanvas = (
    canvas: HTMLCanvasElement,
    geometry: EdgeStripGeometry
  ) => {
    canvas.style.top = `${geometry.cssTop}px`;
    canvas.style.width = `${geometry.cssWidth}px`;
    canvas.style.height = `${geometry.cssHeight}px`;
  };

  const buildGeometry = (edge: SoftOpticsEdge): EdgeStripGeometry => {
    if (!root || !ownerWindow) {
      throw new Error("Soft Optics is not mounted");
    }
    const overscanPixels = Math.ceil(
      config.maxBlur * 1.75 +
      Math.max(config.refraction, config.chromaticAberration) * 2 +
      4
    );
    return dependencies.createGeometry({
      edge,
      viewportWidth: ownerWindow.innerWidth,
      viewportHeight: ownerWindow.innerHeight,
      documentHeight: documentHeight(root),
      scrollY: ownerWindow.scrollY,
      zonePixels:
        ownerWindow.innerHeight *
        ((config.edgeHeight + config.featherHeight) / 100),
      overscanPixels,
      dpr: ownerWindow.devicePixelRatio || 1
    });
  };

  const rebuildResources = (): boolean => {
    if (!root || !parent) return false;
    releaseResources();
    fallback?.destroy();
    fallback = null;
    fallbackStatus = null;
    const sequence = lifecycleSequence;
    const nextResources = new Map<SoftOpticsEdge, EdgeResource>();
    try {
      for (const edge of config.edges) {
        const canvas = root.ownerDocument.createElement("canvas");
        canvas.setAttribute(SOFT_OPTICS_INTERNAL_ATTRIBUTE, "canvas");
        canvas.setAttribute("data-soft-optics-edge", edge);
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.position = "fixed";
        canvas.style.left = "0px";
        canvas.style.display = "block";
        canvas.style.pointerEvents = "none";
        canvas.style.userSelect = "none";
        canvas.style.zIndex = String(safeZIndex(options.layer?.zIndex));
        parent.append(canvas);
        const renderer = dependencies.createRenderer(canvas, {
          onStatus: (rendererStatus) => {
            if (
              rendererStatus.state === "fallback" &&
              !destroyed &&
              sequence === lifecycleSequence
            ) {
              ensureFallback(
                rendererStatus.reason,
                rendererStatus.detail
              );
            }
          }
        });
        if (!renderer) {
          canvas.remove();
          for (const resource of nextResources.values()) {
            resource.renderer.destroy();
            resource.canvas.remove();
          }
          if (
            status.mode !== "fallback" &&
            !(
              status.mode === "disabled" &&
              status.reason === "fallback-unavailable"
            )
          ) {
            ensureFallback("webgl2-unavailable");
          }
          return false;
        }
        nextResources.set(edge, {
          edge,
          canvas,
          renderer,
          source: dependencies.createSource()
        });
      }
    } catch (error) {
      for (const resource of nextResources.values()) {
        resource.renderer.destroy();
        resource.canvas.remove();
      }
      ensureFallback("source-error", error);
      return false;
    }
    resources = nextResources;
    return true;
  };

  const currentVideos = (): HTMLVideoElement[] => {
    if (!root) return [];
    const videos = [...root.querySelectorAll("video")];
    if (root.localName === "video") {
      videos.unshift(root as unknown as HTMLVideoElement);
    }
    const allowLiveVideo = videoPredicate(options.allowLiveVideo);
    return videos.filter((video) =>
      allowLiveVideo
        ? allowLiveVideo(video)
        : video.hasAttribute(SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE)
    );
  };

  const renderFrame = (timestamp: number): boolean => {
    if (
      destroyed ||
      !root ||
      !ownerWindow ||
      !capturedTexture ||
      status.mode !== "webgl" ||
      !config.enabled
    ) {
      return false;
    }
    const elapsed = Math.min(
      100,
      Math.max(0, timestamp - lastFrameTime)
    );
    const scrollY = ownerWindow.scrollY;
    const delta = scrollY - previousScrollY;
    const target = delta === 0
      ? undefined
      : computeOpticsTarget(
          {
            delta,
            deltaTime: Math.max(1, timestamp - previousSampleTime),
            scrollY,
            maxScroll: Math.max(
              0,
              documentHeight(root) - ownerWindow.innerHeight
            ),
            reducedMotion: false
          },
          config
        );
    motionState = stepScrollOptics(
      motionState,
      {
        timestampMs: timestamp,
        elapsedMs: elapsed,
        reducedMotion: false,
        ...(target ? { target } : {})
      },
      config
    );
    if (delta !== 0) {
      previousScrollY = scrollY;
      previousSampleTime = timestamp;
    }
    lastFrameTime = timestamp;

    const allowLiveVideo = videoPredicate(options.allowLiveVideo);
    const frames = dependencies.collectVideoFrames(currentVideos(), {
      ownerWindow,
      scrollX: ownerWindow.scrollX,
      scrollY,
      ...(allowLiveVideo ? { allowLiveVideo } : {})
    }).filter((frame) => frame.compositeSafe === true);

    try {
      for (const resource of resources.values()) {
        const geometry = buildGeometry(resource.edge);
        positionCanvas(resource.canvas, geometry);
        resource.renderer.resize(geometry);
        resource.geometry = geometry;
      }
      if (status.mode !== "webgl") return false;
      const dynamicVideo = frames.some(
        (frame) =>
          frame.dynamic &&
          [...resources.values()].some((resource) => {
            const geometry = resource.geometry;
            return geometry
              ? frameIntersectsStrip(frame, {
                  x: 0,
                  y:
                    geometry.documentTop +
                    geometry.visibleStart,
                  width: geometry.cssWidth,
                  height: Math.max(
                    0,
                    geometry.visibleEnd -
                    geometry.visibleStart
                  )
                })
              : false;
          })
      );
      for (const resource of resources.values()) {
        const geometry = resource.geometry!;
        resource.source.update({
          documentTexture: capturedTexture,
          geometry,
          videoFrames: frames
        });
        resource.renderer.uploadSource(resource.source.canvas);
        if (status.mode !== "webgl") return false;
        resource.renderer.render({
          enabled: true,
          maxBlur: config.maxBlur,
          refraction: config.refraction,
          chromaticAberration: config.chromaticAberration,
          impulse:
            resource.edge === "top"
              ? motionState.top
              : motionState.bottom
        });
      }
      return dynamicVideo ||
        motionState.top > 0 ||
        motionState.bottom > 0 ||
        timestamp < motionState.topPeakUntilMs ||
        timestamp < motionState.bottomPeakUntilMs;
    } catch (error) {
      ensureFallback("source-error", error);
      return false;
    }
  };

  const runCapture = async (): Promise<void> => {
    if (
      destroyed ||
      !mounted ||
      !root ||
      (status.mode !== "loading" && status.mode !== "webgl")
    ) {
      return;
    }
    const sequence = ++captureSequence;
    const lifecycle = lifecycleSequence;
    cancelActiveCapture();
    const captureController = new AbortController();
    activeCaptureController = captureController;
    let result: CaptureRootResult;
    try {
      result = await dependencies.captureRoot({
        root,
        signal: captureController.signal,
        pixelRatio: ownerWindow?.devicePixelRatio || 1,
        ...(options.exclude !== undefined
          ? { exclude: options.exclude }
          : {})
      });
    } finally {
      if (activeCaptureController === captureController) {
        activeCaptureController = null;
      }
    }
    if (
      destroyed ||
      !mounted ||
      !config.enabled ||
      sequence !== captureSequence ||
      lifecycle !== lifecycleSequence ||
      (status.mode !== "loading" && status.mode !== "webgl")
    ) {
      return;
    }
    if (result.status === "fallback") {
      ensureFallback(result.reason, result.detail);
      return;
    }
    capturedTexture = result;
    notify({ mode: "webgl" });
    renderFrame(
      ownerWindow?.performance?.now?.() ??
      Date.now()
    );
    scheduler?.wake();
    if (
      result.refreshRecommended &&
      !fontRefreshScheduled
    ) {
      fontRefreshScheduled = true;
      const fonts = (root.ownerDocument as Document & {
        fonts?: { ready?: Promise<unknown> };
      }).fonts;
      void fonts?.ready?.then(() => {
        if (
          !destroyed &&
          mounted &&
          status.mode === "webgl"
        ) {
          void scheduler?.requestRefresh();
        }
      });
    }
  };

  const startPrimary = async (): Promise<void> => {
    if (destroyed || !mounted || !ownerWindow) return;
    notify({ mode: "loading" });
    if (dependencies.isReducedMotion(ownerWindow)) {
      ensureFallback("reduced-motion");
      return;
    }
    if (!rebuildResources()) return;
    await runCapture();
  };

  const setupLifecycle = () => {
    if (!root || !ownerWindow) return;
    scheduler = dependencies.createScheduler({
      requestFrame: ownerWindow.requestAnimationFrame.bind(ownerWindow),
      cancelFrame: ownerWindow.cancelAnimationFrame.bind(ownerWindow),
      now: () => ownerWindow?.performance?.now?.() ?? Date.now(),
      onFrame: renderFrame,
      onRefresh: () => runCapture()
    });
    const wake = () => scheduler?.wake();
    const requestRefresh = () => {
      if (status.mode !== "webgl") return;
      void scheduler?.requestRefresh();
      scheduler?.wake();
    };
    scheduler.listen(ownerWindow, "scroll", wake, { passive: true });
    scheduler.listen(ownerWindow, "wheel", wake, { passive: true });
    scheduler.listen(ownerWindow, "resize", requestRefresh);
    scheduler.listen(
      root.ownerDocument,
      "load",
      (event) => {
        const target = event.target;
        if (
          isImageTarget(target) &&
          root?.contains(target) &&
          !internalNode(target)
        ) {
          requestRefresh();
        }
      },
      true
    );
    for (const eventName of [
      "play",
      "pause",
      "seeked",
      "loadeddata",
      "canplay"
    ]) {
      scheduler.listen(root.ownerDocument, eventName, wake, true);
    }
    let observedWidth = root.scrollWidth;
    let observedHeight = root.scrollHeight;
    resizeObserver = dependencies.createResizeObserver(() => {
      if (!root) return;
      const nextWidth = root.scrollWidth;
      const nextHeight = root.scrollHeight;
      if (
        nextWidth === observedWidth &&
        nextHeight === observedHeight
      ) {
        return;
      }
      observedWidth = nextWidth;
      observedHeight = nextHeight;
      requestRefresh();
    });
    resizeObserver?.observe(root);
    const observedRoot = root;
    mutationObserver = dependencies.createMutationObserver((records) => {
      if (
        records.every((record) =>
          mutationIsIgnored(
            record,
            options.exclude,
            observedRoot
          )
        )
      ) {
        return;
      }
      requestRefresh();
    });
    mutationObserver?.observe(root, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });
  };

  const mount = (): Promise<void> => {
    if (destroyed) return Promise.resolve();
    if (mountPromise) return mountPromise;
    mounted = true;
    notify({ mode: "loading" });
    const documentRef =
      options.root?.ownerDocument ??
      (typeof document === "undefined" ? undefined : document);
    root = options.root ?? documentRef?.body ?? null;
    ownerWindow = root?.ownerDocument.defaultView ?? null;
    parent = options.layer?.parent ?? root?.ownerDocument.body ?? null;
    if (!root || !ownerWindow || !parent) {
      notify({ mode: "disabled", reason: "document-unavailable" });
      mountPromise = Promise.resolve();
      return mountPromise;
    }
    lifecycleSequence += 1;
    previousScrollY = ownerWindow.scrollY;
    previousSampleTime = ownerWindow.performance?.now?.() ?? Date.now();
    lastFrameTime = previousSampleTime;
    setupLifecycle();
    if (!config.enabled) {
      notify({ mode: "disabled", reason: "config-disabled" });
      mountPromise = Promise.resolve();
      return mountPromise;
    }
    mountPromise = startPrimary();
    return mountPromise;
  };

  const update = (partial: Partial<SoftOpticsConfig>) => {
    if (destroyed) return;
    const previousConfig = config;
    config = resolveConfig({ ...config, ...partial });
    if (!mounted) return;
    const topologyChanged = !sameEdges(
      previousConfig.edges,
      config.edges
    );
    if (!config.enabled) {
      cancelActiveCapture();
      captureSequence += 1;
      if (topologyChanged) {
        lifecycleSequence += 1;
        capturedTexture = null;
        releaseResources();
      }
      setCanvasEnabled(false);
      notify({ mode: "disabled", reason: "config-disabled" });
      return;
    }
    if (fallback) {
      fallback.update(config, {
        ...(parent ? { parent } : {}),
        ...(options.layer?.zIndex !== undefined
          ? { zIndex: options.layer.zIndex }
          : {})
      });
      if (!previousConfig.enabled) setEnabled(true);
      return;
    }
    if (topologyChanged) {
      lifecycleSequence += 1;
      captureSequence += 1;
      capturedTexture = null;
      notify({ mode: "loading" });
      if (rebuildResources()) void runCapture();
      return;
    }
    if (!previousConfig.enabled) {
      setEnabled(true);
      return;
    }
    scheduler?.wake();
  };

  const refresh = (): Promise<void> => {
    if (
      destroyed ||
      !mounted ||
      status.mode === "fallback" ||
      status.mode === "disabled"
    ) {
      return Promise.resolve();
    }
    return scheduler?.requestRefresh() ?? Promise.resolve();
  };

  const setEnabled = (enabled: boolean) => {
    if (destroyed) return;
    if (config.enabled !== enabled) {
      config = resolveConfig({ ...config, enabled });
    }
    if (!mounted) return;
    if (!enabled) {
      cancelActiveCapture();
      captureSequence += 1;
      setCanvasEnabled(false);
      motionState = createScrollOpticsState();
      notify({ mode: "disabled", reason: "config-disabled" });
      return;
    }
    setCanvasEnabled(true);
    if (resources.size > 0 && capturedTexture) {
      notify({ mode: "webgl" });
      scheduler?.wake();
      return;
    }
    if (fallback?.supported) {
      fallback.update(config, {
        ...(parent ? { parent } : {}),
        ...(options.layer?.zIndex !== undefined
          ? { zIndex: options.layer.zIndex }
          : {})
      });
      fallback.setEnabled(true);
      notify(
        fallbackStatus ??
        { mode: "fallback", reason: "source-error" }
      );
      return;
    }
    void startPrimary();
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    mounted = false;
    lifecycleSequence += 1;
    captureSequence += 1;
    cancelActiveCapture();
    scheduler?.destroy();
    scheduler = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    mutationObserver?.disconnect();
    mutationObserver = null;
    releaseResources();
    fallback?.destroy();
    fallback = null;
    fallbackStatus = null;
    capturedTexture = null;
    notify({ mode: "disabled", reason: "destroyed" });
  };

  return {
    mount,
    update,
    refresh,
    setEnabled,
    getStatus: () => status,
    destroy
  };
}

export function createSoftOptics(
  options: CreateSoftOpticsOptions = {}
): SoftOpticsController {
  return createSoftOpticsWithDependencies(options);
}
