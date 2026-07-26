import type { SoftOpticsEdge } from "../types";

export type EdgeStripGeometryInput = {
  edge: SoftOpticsEdge;
  viewportWidth: number;
  viewportHeight: number;
  documentHeight: number;
  scrollY: number;
  zonePixels: number;
  overscanPixels: number;
  dpr: number;
};

export type EdgeStripGeometry = {
  edge: SoftOpticsEdge;
  cssTop: number;
  cssWidth: number;
  cssHeight: number;
  visibleStart: number;
  visibleEnd: number;
  textureWidth: number;
  textureHeight: number;
  documentTop: number;
  documentBottom: number;
  captureTop: number;
  captureBottom: number;
  paddingBefore: number;
  paddingAfter: number;
};

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function createEdgeStripGeometry({
  edge,
  viewportWidth,
  viewportHeight,
  documentHeight,
  scrollY,
  zonePixels,
  overscanPixels,
  dpr
}: EdgeStripGeometryInput): EdgeStripGeometry {
  const width = finitePositive(viewportWidth, 1);
  const height = finitePositive(viewportHeight, 1);
  const pageHeight = Math.max(
    height,
    finitePositive(documentHeight, height)
  );
  const maxScroll = Math.max(0, pageHeight - height);
  const scroll = Math.min(finiteNonNegative(scrollY), maxScroll);
  const zone = finiteNonNegative(zonePixels);
  const overscan = finiteNonNegative(overscanPixels);
  const pixelRatio = Math.min(2, Math.max(1, finitePositive(dpr, 1)));
  const cssHeight = zone + overscan * 2;
  const cssTop =
    edge === "top"
      ? overscan === 0
        ? 0
        : -overscan
      : height - zone - overscan;
  const documentTop = scroll + cssTop;
  const documentBottom = documentTop + cssHeight;
  const captureTop = Math.min(pageHeight, Math.max(0, documentTop));
  const captureBottom = Math.min(
    pageHeight,
    Math.max(captureTop, documentBottom)
  );

  return {
    edge,
    cssTop,
    cssWidth: width,
    cssHeight,
    visibleStart: overscan,
    visibleEnd: overscan + zone,
    textureWidth: Math.max(1, Math.round(width * pixelRatio)),
    textureHeight: Math.max(1, Math.round(cssHeight * pixelRatio)),
    documentTop,
    documentBottom,
    captureTop,
    captureBottom,
    paddingBefore: Math.max(0, captureTop - documentTop),
    paddingAfter: Math.max(0, documentBottom - captureBottom)
  };
}

export function edgeStrength(
  distanceFromPhysicalEdge: number,
  zone: number
): number {
  if (
    !Number.isFinite(distanceFromPhysicalEdge) ||
    !Number.isFinite(zone) ||
    zone <= 0
  ) {
    return 0;
  }
  if (distanceFromPhysicalEdge <= 0) return 1;
  if (distanceFromPhysicalEdge >= zone) return 0;

  const progress = 1 - distanceFromPhysicalEdge / zone;
  return progress * progress * (3 - 2 * progress);
}
