import type { EdgeStripGeometry } from "../geometry/edgeStripGeometry";
import type { CaptureRootReadyResult } from "./captureRoot";
import { calculateVideoDrawMapping } from "./videoFrameGeometry";
import {
  frameIntersectsStrip,
  type VideoFrameSnapshot
} from "./videoFrames";

export type EdgeStripSourceDependencies = {
  canvas?: HTMLCanvasElement;
  context?: CanvasRenderingContext2D;
  createCanvas?: () => HTMLCanvasElement;
  createScratchSurface?: () => {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
  };
};

export type UpdateEdgeStripInput = {
  documentTexture: CaptureRootReadyResult;
  geometry: EdgeStripGeometry;
  videoFrames: readonly VideoFrameSnapshot[];
};

export type EdgeStripSource = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  resize(width: number, height: number): void;
  update(input: UpdateEdgeStripInput): { drewVideoFrame: boolean };
};

export function createEdgeStripSource(
  dependencies: EdgeStripSourceDependencies = {}
): EdgeStripSource {
  const canvas =
    dependencies.canvas ??
    dependencies.createCanvas?.() ??
    (typeof document === "undefined"
      ? undefined
      : document.createElement("canvas"));
  if (!canvas) {
    throw new Error(
      "A canvas or createCanvas dependency is required outside the browser"
    );
  }
  const context = dependencies.context ?? canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable for edge strip capture");
  }
  if ("canvas" in context && context.canvas !== canvas) {
    throw new Error("Canvas 2D context belongs to a different canvas");
  }

  const createScratchSurface =
    dependencies.createScratchSurface ??
    (() => {
      const scratchCanvas = canvas.ownerDocument.createElement("canvas");
      const scratchContext = scratchCanvas.getContext("2d");
      if (!scratchContext) {
        throw new Error("Canvas 2D is unavailable for isolated video");
      }
      return { canvas: scratchCanvas, context: scratchContext };
    });
  let scratchSurface:
    | {
        canvas: HTMLCanvasElement;
        context: CanvasRenderingContext2D;
      }
    | undefined;

  const resize = (width: number, height: number): void => {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
  };

  const update = ({
    documentTexture,
    geometry,
    videoFrames
  }: UpdateEdgeStripInput): { drewVideoFrame: boolean } => {
    resize(geometry.textureWidth, geometry.textureHeight);
    const dpr =
      geometry.cssWidth > 0
        ? geometry.textureWidth / geometry.cssWidth
        : 1;
    context.resetTransform?.();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const {
      canvas: documentCanvas,
      origin,
      pixelRatio: captureScale
    } = documentTexture;
    const sourceX = (0 - origin.x) * captureScale;
    const captureHeight = geometry.captureBottom - geometry.captureTop;
    if (captureHeight > 0) {
      context.drawImage(
        documentCanvas,
        sourceX,
        (geometry.captureTop - origin.y) * captureScale,
        geometry.cssWidth * captureScale,
        captureHeight * captureScale,
        0,
        geometry.paddingBefore,
        geometry.cssWidth,
        captureHeight
      );
    }

    if (geometry.paddingBefore > 0) {
      context.drawImage(
        documentCanvas,
        sourceX,
        Math.max(
          0,
          Math.min(
            documentCanvas.height - captureScale,
            (geometry.captureTop - origin.y) * captureScale
          )
        ),
        geometry.cssWidth * captureScale,
        captureScale,
        0,
        0,
        geometry.cssWidth,
        geometry.paddingBefore
      );
    }
    if (geometry.paddingAfter > 0) {
      context.drawImage(
        documentCanvas,
        sourceX,
        Math.max(
          0,
          Math.min(
            documentCanvas.height - captureScale,
            (geometry.captureBottom - origin.y - 1) * captureScale
          )
        ),
        geometry.cssWidth * captureScale,
        captureScale,
        0,
        geometry.cssHeight - geometry.paddingAfter,
        geometry.cssWidth,
        geometry.paddingAfter
      );
    }

    const stripDocumentRect = {
      x: 0,
      y: geometry.documentTop,
      width: geometry.cssWidth,
      height: geometry.cssHeight
    };
    let drewVideoFrame = false;

    for (const frame of videoFrames) {
      if (frame.compositeSafe !== true) continue;
      if (!frameIntersectsStrip(frame, stripDocumentRect)) continue;
      const video = frame.video;
      if (
        video.readyState < 2 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        continue;
      }
      const mapping = calculateVideoDrawMapping({
        intrinsicWidth: video.videoWidth,
        intrinsicHeight: video.videoHeight,
        elementRect: frame.rect,
        stripDocumentRect,
        objectFit: frame.objectFit,
        objectPosition: frame.objectPosition
      });
      if (!mapping) continue;

      let scratch:
        | {
            canvas: HTMLCanvasElement;
            context: CanvasRenderingContext2D;
          }
        | undefined;
      let saved = false;
      try {
        scratch = scratchSurface ??= createScratchSurface();
        const scratchWidth = Math.max(
          1,
          Math.ceil(mapping.destination.width * dpr)
        );
        const scratchHeight = Math.max(
          1,
          Math.ceil(mapping.destination.height * dpr)
        );
        scratch.canvas.width = scratchWidth;
        scratch.canvas.height = scratchHeight;
        scratch.context.drawImage(
          video,
          mapping.source.x,
          mapping.source.y,
          mapping.source.width,
          mapping.source.height,
          0,
          0,
          scratchWidth,
          scratchHeight
        );
        scratch.context.getImageData(0, 0, 1, 1);

        context.save();
        saved = true;
        context.globalAlpha = frame.opacity;
        const clips =
          frame.clips ??
          (frame.clip ? [frame.clip] : []);
        for (const clip of clips) {
          context.beginPath();
          context.roundRect(
            clip.x - stripDocumentRect.x,
            clip.y - stripDocumentRect.y,
            clip.width,
            clip.height,
            clip.radius
          );
          context.clip();
        }
        context.drawImage(
          scratch.canvas,
          0,
          0,
          scratch.canvas.width,
          scratch.canvas.height,
          mapping.destination.x,
          mapping.destination.y,
          mapping.destination.width,
          mapping.destination.height
        );
        drewVideoFrame = true;
      } catch {
        // A CORS-tainted or transient frame leaves the captured poster intact.
      } finally {
        if (saved) context.restore();
        context.globalAlpha = 1;
      }
    }

    return { drewVideoFrame };
  };

  return { canvas, context, resize, update };
}
