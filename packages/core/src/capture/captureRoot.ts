import type { Options as ModernScreenshotOptions } from "modern-screenshot";

export const SOFT_OPTICS_INTERNAL_ATTRIBUTE =
  "data-soft-optics-internal";

export type CaptureLimits = {
  maxDimension: number;
  maxPixels: number;
};

export const DEFAULT_CAPTURE_LIMITS: Readonly<CaptureLimits> = {
  maxDimension: 16_384,
  maxPixels: 64_000_000
};

export const DEFAULT_FONT_TIMEOUT_MS = 750;

export type CaptureRootFallbackReason =
  | "capture-error"
  | "security-error"
  | "canvas-unavailable"
  | "capture-too-large"
  | "capture-invalid";

export type CaptureRootReadyResult = {
  status: "ready";
  canvas: HTMLCanvasElement;
  pixelRatio: number;
  /**
   * Document-space origin represented by the canvas. Stable captures use
   * `{ x: 0, y: 0 }`; the field makes source-coordinate semantics explicit.
   */
  origin: { x: number; y: number };
  fontsPending: boolean;
  refreshRecommended: boolean;
};

export type CaptureRootResult =
  | CaptureRootReadyResult
  | {
      status: "fallback";
      reason: CaptureRootFallbackReason;
      detail?: unknown;
    };

export type CaptureFunction = (
  root: HTMLElement,
  options: ModernScreenshotOptions
) => Promise<HTMLCanvasElement>;

export type CaptureRootOptions = {
  root: HTMLElement;
  signal?: AbortSignal;
  exclude?: string | ((node: Node) => boolean);
  pixelRatio?: number;
  capture?: CaptureFunction;
  fontsReady?: Promise<unknown>;
  mirrorFontsReady?: (document: Document) => Promise<unknown>;
  createCanvas?: () => HTMLCanvasElement;
  styleSheets?: readonly CSSStyleSheet[];
  waitForStylesheet?: (link: HTMLLinkElement) => Promise<unknown>;
  stylesheetTimeoutMs?: number;
  fontTimeoutMs?: number;
  captureLimits?: Partial<CaptureLimits>;
};

type CaptureMirror = {
  root: HTMLElement;
  stylesReady: Promise<void>;
  dispose(): void;
};

function abortError(): DOMException {
  return new DOMException("Capture aborted", "AbortError");
}

function abortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function predicateExcludes(
  node: Node,
  exclude?: CaptureRootOptions["exclude"]
): boolean {
  if (typeof exclude !== "function") return false;
  try {
    return exclude(node);
  } catch {
    // Consumer predicates do not own capture lifecycle.
    return false;
  }
}

function isSecurityError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "SecurityError"
  );
}

function shouldInclude(
  node: Node,
  exclude?: CaptureRootOptions["exclude"]
): boolean {
  if (!isElement(node)) {
    return !predicateExcludes(node, exclude);
  }
  const tag = node.localName.toLowerCase();
  if (
    tag === "script" ||
    tag === "noscript" ||
    tag === "video" ||
    node.hasAttribute(SOFT_OPTICS_INTERNAL_ATTRIBUTE)
  ) {
    return false;
  }
  if (typeof exclude === "string") {
    try {
      if (node.matches(exclude)) return false;
    } catch {
      // Invalid selectors are treated as no user exclusion.
    }
  } else if (predicateExcludes(node, exclude)) {
    return false;
  }
  return true;
}

function isUserExcluded(
  node: Node,
  exclude?: CaptureRootOptions["exclude"]
): boolean {
  if (typeof exclude === "function") {
    return predicateExcludes(node, exclude);
  }
  if (typeof exclude === "string" && isElement(node)) {
    try {
      return node.matches(exclude);
    } catch {
      return false;
    }
  }
  return false;
}

function copySafeVideoAttributes(
  source: HTMLVideoElement,
  target: HTMLElement
): void {
  const unsafe = new Set([
    "src",
    "poster",
    "autoplay",
    "controls",
    "loop",
    "muted",
    "playsinline",
    "preload"
  ]);
  for (const attribute of Array.from(source.attributes)) {
    const name = attribute.name.toLowerCase();
    if (!name.startsWith("on") && !unsafe.has(name)) {
      target.setAttribute(attribute.name, attribute.value);
    }
  }
  const rect = source.getBoundingClientRect();
  if (!target.style.width && rect.width > 0) {
    target.style.width = `${rect.width}px`;
  }
  if (!target.style.height && rect.height > 0) {
    target.style.height = `${rect.height}px`;
  }
}

function createVideoPlaceholder(
  video: HTMLVideoElement,
  targetDocument: Document
): HTMLElement {
  if (video.poster) {
    const image = targetDocument.createElement("img");
    copySafeVideoAttributes(video, image);
    image.src = video.poster;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.setAttribute("data-soft-optics-video-poster", "");
    return image;
  }
  const placeholder = targetDocument.createElement("div");
  copySafeVideoAttributes(video, placeholder);
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.setAttribute("data-soft-optics-video-placeholder", "");
  return placeholder;
}

function copyInertLayoutAttributes(
  source: HTMLElement,
  target: HTMLElement
): void {
  for (const attribute of Array.from(source.attributes)) {
    if (!attribute.name.toLowerCase().startsWith("on")) {
      target.setAttribute(attribute.name, attribute.value);
    }
  }
  const rect = source.getBoundingClientRect();
  if (!target.style.width && rect.width > 0) {
    target.style.width = `${rect.width}px`;
  }
  if (!target.style.height && rect.height > 0) {
    target.style.height = `${rect.height}px`;
  }
}

function createEmbedPlaceholder(
  embed: HTMLElement,
  targetDocument: Document
): HTMLElement {
  const placeholder = targetDocument.createElement("div");
  copyInertLayoutAttributes(embed, placeholder);
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.setAttribute(
    "data-soft-optics-embed-placeholder",
    embed.id || embed.localName.toLowerCase()
  );
  return placeholder;
}

function cloneFilteredNode(
  node: Node,
  targetDocument: Document,
  exclude?: CaptureRootOptions["exclude"]
): Node | null {
  if (isElement(node) && node.localName.toLowerCase() === "video") {
    if (
      node.hasAttribute(SOFT_OPTICS_INTERNAL_ATTRIBUTE) ||
      isUserExcluded(node, exclude)
    ) {
      return null;
    }
    return createVideoPlaceholder(
      node as HTMLVideoElement,
      targetDocument
    );
  }
  if (
    isElement(node) &&
    ["iframe", "object", "embed"].includes(
      node.localName.toLowerCase()
    )
  ) {
    if (
      node.hasAttribute(SOFT_OPTICS_INTERNAL_ATTRIBUTE) ||
      isUserExcluded(node, exclude)
    ) {
      return null;
    }
    return createEmbedPlaceholder(
      node as HTMLElement,
      targetDocument
    );
  }
  if (!shouldInclude(node, exclude)) return null;
  const clone = targetDocument.importNode(node, false);
  if (isElement(clone)) {
    for (const attribute of Array.from(clone.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        clone.removeAttribute(attribute.name);
      }
    }
  }
  for (const child of node.childNodes) {
    const childClone = cloneFilteredNode(child, targetDocument, exclude);
    if (childClone) clone.appendChild(childClone);
  }
  return clone;
}

function copyAttributes(source: Element, target: Element): void {
  for (const attribute of Array.from(source.attributes)) {
    if (!attribute.name.toLowerCase().startsWith("on")) {
      target.setAttribute(attribute.name, attribute.value);
    }
  }
}

function stripEventHandlerAttributes(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.toLowerCase().startsWith("on")) {
      element.removeAttribute(attribute.name);
    }
  }
}

export function rebaseCssUrls(css: string, baseUrl: string): string {
  return css.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/g,
    (match, quote: string, rawUrl: string) => {
      const url = rawUrl.trim();
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(url)) {
        return match;
      }
      try {
        return `url(${quote}${new URL(url, baseUrl).href}${quote})`;
      } catch {
        return match;
      }
    }
  );
}

function copyStyleSheets(
  sourceDocument: Document,
  targetDocument: Document,
  styleSheets: readonly CSSStyleSheet[],
  waitForStylesheet: (link: HTMLLinkElement) => Promise<unknown>,
  timeoutMs: number
): Promise<void> {
  const readiness: Promise<void>[] = [];
  for (const styleSheet of styleSheets) {
    const ownerNode = styleSheet.ownerNode;
    if (ownerNode) {
      try {
        const clone = targetDocument.importNode(ownerNode, true);
        if (isElement(clone)) stripEventHandlerAttributes(clone);
        targetDocument.head.append(clone);
        if (
          clone.nodeType === 1 &&
          (clone as Element).localName === "link"
        ) {
          const link = clone as HTMLLinkElement;
          link.disabled = styleSheet.disabled;
          if (
            link.rel.toLowerCase().split(/\s+/).includes("stylesheet")
          ) {
            readiness.push(
              waitAtMost(waitForStylesheet(link), timeoutMs)
            );
          }
        } else if (
          clone.nodeType === 1 &&
          (clone as Element).localName === "style"
        ) {
          const style = clone as HTMLStyleElement;
          if (styleSheet.media.mediaText) {
            style.media = styleSheet.media.mediaText;
          }
          if (style.sheet) style.sheet.disabled = styleSheet.disabled;
        }
      } catch {
        // A non-cloneable owner node is optional.
      }
      continue;
    }
    try {
      const style = targetDocument.createElement("style");
      style.textContent = Array.from(styleSheet.cssRules)
        .map((rule) =>
          rebaseCssUrls(
            rule.cssText,
            styleSheet.href ?? sourceDocument.baseURI
          )
        )
        .join("\n");
      if (styleSheet.media.mediaText) {
        style.media = styleSheet.media.mediaText;
      }
      targetDocument.head.append(style);
      if (style.sheet) style.sheet.disabled = styleSheet.disabled;
    } catch {
      // An inaccessible ownerless/adopted stylesheet is optional.
    }
  }
  return Promise.all(readiness).then(() => undefined);
}

function waitForStylesheetEvent(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      link.removeEventListener("load", finish);
      link.removeEventListener("error", finish);
      resolve();
    };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
  });
}

function waitAtMost(
  readiness: Promise<unknown>,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    readiness.then(finish, finish);
  });
}

function settleWithin(
  readiness: Promise<unknown>,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(ready);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    readiness.then(() => finish(true), () => finish(true));
  });
}

function finiteStylesheetTimeout(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.min(10_000, Math.max(0, value as number))
    : 3_000;
}

function finiteFontTimeout(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.min(5_000, Math.max(0, value as number))
    : DEFAULT_FONT_TIMEOUT_MS;
}

function createCaptureMirror(
  root: HTMLElement,
  exclude: CaptureRootOptions["exclude"],
  styleSheets: readonly CSSStyleSheet[] | undefined,
  waitForStylesheet: (link: HTMLLinkElement) => Promise<unknown>,
  stylesheetTimeoutMs: number,
  signal?: AbortSignal
): CaptureMirror {
  const ownerDocument = root.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const frame = ownerDocument.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute(SOFT_OPTICS_INTERNAL_ATTRIBUTE, "");
  frame.setAttribute("inert", "");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    zIndex: "-2147483648",
    top: "0",
    left: "0",
    width: `${Math.max(1, ownerWindow?.innerWidth ?? root.clientWidth)}px`,
    height: `${Math.max(1, ownerWindow?.innerHeight ?? root.clientHeight)}px`,
    border: "0",
    opacity: "0",
    pointerEvents: "none"
  });
  ownerDocument.body.append(frame);
  const abort = () => frame.remove();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    if (signal?.aborted) {
      abort();
      throw abortError();
    }
    const mirrorDocument = frame.contentDocument;
    if (!mirrorDocument) {
      throw new Error("Capture frame document is unavailable");
    }
    copyAttributes(ownerDocument.documentElement, mirrorDocument.documentElement);
    const base = mirrorDocument.createElement("base");
    base.href = ownerDocument.baseURI;
    mirrorDocument.head.append(base);
    const stylesReady = copyStyleSheets(
      ownerDocument,
      mirrorDocument,
      styleSheets ?? Array.from(ownerDocument.styleSheets),
      waitForStylesheet,
      stylesheetTimeoutMs
    );

    copyAttributes(ownerDocument.body, mirrorDocument.body);
    const mirrorRoot = mirrorDocument.body;
    for (const child of Array.from(ownerDocument.body.childNodes)) {
      const clone = cloneFilteredNode(child, mirrorDocument, exclude);
      if (clone) mirrorRoot.append(clone);
    }
    mirrorRoot.setAttribute(SOFT_OPTICS_INTERNAL_ATTRIBUTE, "mirror");
    return {
      root: mirrorRoot,
      stylesReady,
      dispose: () => {
        signal?.removeEventListener("abort", abort);
        frame.remove();
      }
    };
  } catch (error) {
    signal?.removeEventListener("abort", abort);
    frame.remove();
    throw error;
  }
}

function finitePixelRatio(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.min(2, value as number)
    : 1;
}

function finiteNonNegative(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? (value as number)
    : 0;
}

function documentDimensions(root: HTMLElement): {
  width: number;
  height: number;
} {
  const document = root.ownerDocument;
  const ownerWindow = document.defaultView;
  const rect = root.getBoundingClientRect();
  const scrollX = finiteNonNegative(ownerWindow?.scrollX);
  const scrollY = finiteNonNegative(ownerWindow?.scrollY);
  return {
    width: Math.max(
      1,
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
      ownerWindow?.innerWidth ?? 0,
      rect.left + scrollX + root.scrollWidth
    ),
    height: Math.max(
      1,
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0,
      ownerWindow?.innerHeight ?? 0,
      rect.top + scrollY + root.scrollHeight
    )
  };
}

function captureLimits(
  override: Partial<CaptureLimits> | undefined
): CaptureLimits {
  const maxDimension =
    Number.isFinite(override?.maxDimension) &&
    (override?.maxDimension ?? 0) > 0
      ? Math.min(
          DEFAULT_CAPTURE_LIMITS.maxDimension,
          override!.maxDimension!
        )
      : DEFAULT_CAPTURE_LIMITS.maxDimension;
  const maxPixels =
    Number.isFinite(override?.maxPixels) &&
    (override?.maxPixels ?? 0) > 0
      ? Math.min(DEFAULT_CAPTURE_LIMITS.maxPixels, override!.maxPixels!)
      : DEFAULT_CAPTURE_LIMITS.maxPixels;
  return { maxDimension, maxPixels };
}

function exceedsCaptureBudget(
  width: number,
  height: number,
  limits: CaptureLimits
): boolean {
  return (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > limits.maxDimension ||
    height > limits.maxDimension ||
    width * height > limits.maxPixels
  );
}

function validateCaptureOutput(
  canvas: HTMLCanvasElement,
  expectedWidth: number,
  expectedHeight: number
):
  | { valid: true }
  | {
      valid: false;
      reason: "capture-invalid" | "security-error";
      detail?: unknown;
    } {
  if (
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    Math.abs(canvas.width - expectedWidth) > 1 ||
    Math.abs(canvas.height - expectedHeight) > 1
  ) {
    return { valid: false, reason: "capture-invalid" };
  }
  try {
    const context = canvas.getContext("2d");
    if (!context?.getImageData) {
      return {
        valid: false,
        reason: "capture-invalid",
        detail: new Error("Capture canvas readback is unavailable")
      };
    }
    const points = [
      [0, 0],
      [canvas.width - 1, 0],
      [0, canvas.height - 1],
      [canvas.width - 1, canvas.height - 1],
      [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)]
    ];
    const visible = points.some(([x, y]) => {
      const data = context.getImageData(x!, y!, 1, 1).data;
      return data[3] !== 0;
    });
    return visible
      ? { valid: true }
      : { valid: false, reason: "capture-invalid" };
  } catch (error) {
    return {
      valid: false,
      reason: isSecurityError(error)
        ? "security-error"
        : "capture-invalid",
      detail: error
    };
  }
}

function documentFontsReady(document: Document): Promise<unknown> {
  const fonts = (document as Document & {
    fonts?: { ready?: Promise<unknown> };
  }).fonts;
  return fonts?.ready ?? Promise.resolve();
}

export async function captureRoot(
  options: CaptureRootOptions
): Promise<CaptureRootResult> {
  const { root } = options;
  const isBodyRoot = root === root.ownerDocument.body;
  const pixelRatio = finitePixelRatio(options.pixelRatio);
  const dimensions = isBodyRoot
    ? {
        width: Math.max(1, root.scrollWidth),
        height: Math.max(1, root.scrollHeight)
      }
    : documentDimensions(root);
  const physicalWidth = Math.max(
    1,
    Math.round(dimensions.width * pixelRatio)
  );
  const physicalHeight = Math.max(
    1,
    Math.round(dimensions.height * pixelRatio)
  );
  if (
    exceedsCaptureBudget(
      physicalWidth,
      physicalHeight,
      captureLimits(options.captureLimits)
    )
  ) {
    return {
      status: "fallback",
      reason: "capture-too-large",
      detail: { width: physicalWidth, height: physicalHeight }
    };
  }

  let mirror: CaptureMirror | null = null;
  let fontsPending = false;

  try {
    const fontTimeoutMs = finiteFontTimeout(options.fontTimeoutMs);
    const sourceFontsReady = await abortable(
      settleWithin(
        options.fontsReady ?? documentFontsReady(root.ownerDocument),
        fontTimeoutMs
      ),
      options.signal
    );
    fontsPending ||= !sourceFontsReady;
    mirror = createCaptureMirror(
      root,
      options.exclude,
      options.styleSheets,
      options.waitForStylesheet ?? waitForStylesheetEvent,
      finiteStylesheetTimeout(options.stylesheetTimeoutMs),
      options.signal
    );
    await abortable(mirror.stylesReady, options.signal);
    const mirrorFontsReady = await abortable(
      settleWithin(
        options.mirrorFontsReady?.(mirror.root.ownerDocument) ??
          documentFontsReady(mirror.root.ownerDocument),
        fontTimeoutMs
      ),
      options.signal
    );
    fontsPending ||= !mirrorFontsReady;
    const capture =
      options.capture ??
      (await import("modern-screenshot")).domToCanvas;
    const capturedCanvas = await abortable(
      capture(mirror.root, {
        backgroundColor: "#ffffff",
        filter: (node) => shouldInclude(node, options.exclude),
        height: dimensions.height,
        scale: pixelRatio,
        style: { transform: "none" },
        timeout: 8_000,
        width: dimensions.width
      }),
      options.signal
    );

    const validation = validateCaptureOutput(
      capturedCanvas,
      physicalWidth,
      physicalHeight
    );
    if (!validation.valid) {
      return {
        status: "fallback",
        reason: validation.reason,
        detail: validation.detail ?? {
          actualWidth: capturedCanvas.width,
          actualHeight: capturedCanvas.height,
          expectedWidth: physicalWidth,
          expectedHeight: physicalHeight
        }
      };
    }

    if (
      isBodyRoot &&
      capturedCanvas.ownerDocument === root.ownerDocument
    ) {
      return {
        status: "ready",
        canvas: capturedCanvas,
        pixelRatio,
        origin: { x: 0, y: 0 },
        fontsPending,
        refreshRecommended: fontsPending
      };
    }
    const canvas =
      options.createCanvas?.() ??
      root.ownerDocument.createElement("canvas");
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return {
        status: "fallback",
        reason: "canvas-unavailable",
        detail: new Error("Canvas 2D is unavailable")
      };
    }
    try {
      if (isBodyRoot) {
        context.drawImage(capturedCanvas, 0, 0);
      } else {
        const ownerWindow = root.ownerDocument.defaultView;
        const rect = root.getBoundingClientRect();
        const documentX =
          rect.left + finiteNonNegative(ownerWindow?.scrollX);
        const documentY =
          rect.top + finiteNonNegative(ownerWindow?.scrollY);
        const targetWidth =
          (rect.width > 0 ? rect.width : root.scrollWidth) * pixelRatio;
        const targetHeight =
          (rect.height > 0 ? rect.height : root.scrollHeight) * pixelRatio;
        if (targetWidth <= 0 || targetHeight <= 0) {
          return {
            status: "fallback",
            reason: "capture-invalid",
            detail: new Error("Capture target has no drawable area")
          };
        }
        const targetX = documentX * pixelRatio;
        const targetY = documentY * pixelRatio;
        context.drawImage(
          capturedCanvas,
          targetX,
          targetY,
          targetWidth,
          targetHeight,
          targetX,
          targetY,
          targetWidth,
          targetHeight
        );
      }
    } catch (error) {
      return {
        status: "fallback",
        reason: isSecurityError(error) ? "security-error" : "capture-error",
        detail: error
      };
    }
    return {
      status: "ready",
      canvas,
      pixelRatio,
      origin: { x: 0, y: 0 },
      fontsPending,
      refreshRecommended: fontsPending
    };
  } catch (error) {
    return {
      status: "fallback",
      reason: isSecurityError(error) ? "security-error" : "capture-error",
      detail: error
    };
  } finally {
    mirror?.dispose();
  }
}
