import type { Rect, VideoObjectFit } from "./videoFrameGeometry";

export const SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE =
  "data-soft-optics-live";

export type VideoFrameClip = Rect & { radius: number };

export type VideoFrameSnapshot = {
  video: HTMLVideoElement;
  rect: Rect;
  objectFit: VideoObjectFit;
  objectPosition: string;
  opacity: number;
  dynamic: boolean;
  compositeSafe: boolean;
  clips?: VideoFrameClip[];
  /** @deprecated Use `clips`; retained for source compatibility. */
  clip?: VideoFrameClip;
};

export type CollectVideoFrameOptions = {
  ownerWindow?: Window;
  readStyle?: (element: Element) => CSSStyleDeclaration;
  scrollX?: number;
  scrollY?: number;
  hitTest?: (x: number, y: number) => Element | null;
  /**
   * Explicitly opts a video into live compositing. Returning `true` asserts
   * that the caller knows the page's paint order is safe; viewport hit-test,
   * compositing-state, and CORS checks still apply.
   *
   * By default only videos with `data-soft-optics-live` are opted in.
   */
  allowLiveVideo?: (video: HTMLVideoElement) => boolean;
  /** @deprecated Additional veto only; use `allowLiveVideo` for opt-in. */
  isCompositeSafe?: (video: HTMLVideoElement) => boolean;
};

function finiteCoordinate(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

function finiteOpacity(value: string): number {
  const opacity = Number.parseFloat(value);
  return Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, opacity))
    : 1;
}

function radiusFromStyle(style: CSSStyleDeclaration): number {
  return Math.max(
    0,
    ...[
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius
    ].map((value) => Number.parseFloat(value) || 0)
  );
}

function clipsContent(style: CSSStyleDeclaration): boolean {
  return [style.overflow, style.overflowX, style.overflowY].some(
    (value) => value === "hidden" || value === "clip"
  );
}

function collectClips(
  video: HTMLVideoElement,
  videoRect: Rect,
  videoStyle: CSSStyleDeclaration,
  scrollX: number,
  scrollY: number,
  readStyle: (element: Element) => CSSStyleDeclaration
): VideoFrameClip[] {
  const clips: VideoFrameClip[] = [];
  const ownRadius = radiusFromStyle(videoStyle);
  if (ownRadius > 0) {
    clips.push({ ...videoRect, radius: ownRadius });
  }
  const ownerBody = video.ownerDocument.body;
  let ancestor = video.parentElement;
  while (ancestor && ancestor !== ownerBody) {
    const style = readStyle(ancestor);
    if (clipsContent(style)) {
      const rect = ancestor.getBoundingClientRect();
      if (
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height) &&
        rect.width > 0 &&
        rect.height > 0
      ) {
        clips.push({
          x: rect.left + scrollX,
          y: rect.top + scrollY,
          width: rect.width,
          height: rect.height,
          radius: radiusFromStyle(style)
        });
      }
    }
    ancestor = ancestor.parentElement;
  }
  return clips;
}

function normalizeObjectFit(value: string): VideoObjectFit {
  if (
    value === "contain" ||
    value === "fill" ||
    value === "none" ||
    value === "scale-down"
  ) {
    return value;
  }
  return "cover";
}

function isFrameCompositeSafe(
  video: HTMLVideoElement,
  rect: DOMRect,
  options: CollectVideoFrameOptions,
  ownerWindow: Window | undefined,
  readStyle: (element: Element) => CSSStyleDeclaration
): boolean {
  const liveVideoAllowed =
    options.allowLiveVideo?.(video) ??
    video.hasAttribute(SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE);
  if (!liveVideoAllowed) return false;
  if (
    options.isCompositeSafe &&
    !options.isCompositeSafe(video)
  ) {
    return false;
  }
  const hitTest =
    options.hitTest ??
    video.ownerDocument.elementFromPoint?.bind(video.ownerDocument);
  if (!hitTest) return false;

  let element: Element | null = video;
  while (element) {
    const style = readStyle(element);
    const opacity = Number.parseFloat(style.opacity);
    if (Number.isFinite(opacity) && opacity !== 1) return false;
    const unsupportedValues = [
      style.filter,
      style.backdropFilter,
      (style as CSSStyleDeclaration & {
        webkitBackdropFilter?: string;
      }).webkitBackdropFilter,
      style.maskImage,
      (style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
      }).webkitMaskImage,
      style.clipPath,
      style.transform,
      style.perspective
    ];
    if (
      unsupportedValues.some(
        (value) => Boolean(value && value !== "none")
      ) ||
      Boolean(
        style.mixBlendMode &&
        style.mixBlendMode !== "normal"
      )
    ) {
      return false;
    }
    element = element.parentElement;
  }

  const viewportWidth =
    ownerWindow?.innerWidth ??
    video.ownerDocument.documentElement.clientWidth;
  const viewportHeight =
    ownerWindow?.innerHeight ??
    video.ownerDocument.documentElement.clientHeight;
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return false;
  }
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.right);
  const bottom = Math.min(viewportHeight, rect.bottom);
  if (right <= left || bottom <= top) return false;

  const insetX = Math.min(2, (right - left) / 4);
  const insetY = Math.min(2, (bottom - top) / 4);
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const points = [
    [centerX, centerY],
    [left + insetX, top + insetY],
    [right - insetX, top + insetY],
    [left + insetX, bottom - insetY],
    [right - insetX, bottom - insetY],
    [centerX, top + insetY],
    [centerX, bottom - insetY],
    [left + insetX, centerY],
    [right - insetX, centerY]
  ];
  try {
    return points.every(([x, y]) => {
      const topElement = hitTest(x!, y!);
      return (
        topElement === video ||
        (topElement !== null && video.contains(topElement))
      );
    });
  } catch {
    return false;
  }
}

export function collectVideoFrameSnapshots(
  videos: readonly HTMLVideoElement[],
  options: CollectVideoFrameOptions = {}
): VideoFrameSnapshot[] {
  const ownerWindow =
    options.ownerWindow ??
    videos[0]?.ownerDocument.defaultView ??
    undefined;
  const readStyle =
    options.readStyle ??
    (ownerWindow
      ? ownerWindow.getComputedStyle.bind(ownerWindow)
      : undefined);
  if (!readStyle) return [];
  const scrollX = finiteCoordinate(options.scrollX ?? ownerWindow?.scrollX);
  const scrollY = finiteCoordinate(options.scrollY ?? ownerWindow?.scrollY);
  const snapshots: VideoFrameSnapshot[] = [];

  for (const video of videos) {
    if (
      video.readyState < 2 ||
      !Number.isFinite(video.videoWidth) ||
      !Number.isFinite(video.videoHeight) ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      continue;
    }

    const rect = video.getBoundingClientRect();
    const style = readStyle(video);
    const opacity = finiteOpacity(style.opacity);
    if (
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      opacity <= 0
    ) {
      continue;
    }

    const documentRect = {
      x: rect.left + scrollX,
      y: rect.top + scrollY,
      width: rect.width,
      height: rect.height
    };
    const snapshot: VideoFrameSnapshot = {
      video,
      rect: documentRect,
      objectFit: normalizeObjectFit(style.objectFit),
      objectPosition: style.objectPosition || "50% 50%",
      opacity,
      dynamic: !video.paused && !video.ended,
      compositeSafe: isFrameCompositeSafe(
        video,
        rect,
        options,
        ownerWindow,
        readStyle
      )
    };
    const clips = collectClips(
      video,
      documentRect,
      style,
      scrollX,
      scrollY,
      readStyle
    );
    if (clips.length > 0) {
      snapshot.clips = clips;
      snapshot.clip = clips[0]!;
    }
    snapshots.push(snapshot);
  }

  return snapshots;
}

export function frameIntersectsStrip(
  frame: Pick<VideoFrameSnapshot, "rect">,
  strip: Rect
): boolean {
  if (
    !Number.isFinite(strip.x) ||
    !Number.isFinite(strip.y) ||
    !Number.isFinite(strip.width) ||
    !Number.isFinite(strip.height) ||
    strip.width <= 0 ||
    strip.height <= 0
  ) {
    return false;
  }
  return (
    frame.rect.x < strip.x + strip.width &&
    frame.rect.x + frame.rect.width > strip.x &&
    frame.rect.y < strip.y + strip.height &&
    frame.rect.y + frame.rect.height > strip.y
  );
}
