export { SOFT_OPTICS_VERSION } from "./version";

export {
  createSoftOptics,
  type CreateSoftOpticsOptions,
  type SoftOpticsController,
  type SoftOpticsDisabledReason,
  type SoftOpticsFallbackReason,
  type SoftOpticsStatus
} from "./controller/createSoftOptics";
export {
  DEFAULT_CAPTURE_LIMITS,
  DEFAULT_FONT_TIMEOUT_MS,
  captureRoot,
  type CaptureLimits,
  type CaptureFunction,
  type CaptureRootFallbackReason,
  type CaptureRootOptions,
  type CaptureRootReadyResult,
  type CaptureRootResult
} from "./capture/captureRoot";
export {
  createEdgeStripSource,
  type EdgeStripSource,
  type EdgeStripSourceDependencies,
  type UpdateEdgeStripInput
} from "./capture/createEdgeStripSource";
export {
  calculateVideoDrawMapping,
  type Rect,
  type VideoDrawMapping,
  type VideoDrawMappingInput,
  type VideoObjectFit
} from "./capture/videoFrameGeometry";
export {
  collectVideoFrameSnapshots,
  frameIntersectsStrip,
  SOFT_OPTICS_LIVE_VIDEO_ATTRIBUTE,
  type CollectVideoFrameOptions,
  type VideoFrameClip,
  type VideoFrameSnapshot
} from "./capture/videoFrames";
export {
  DEFAULT_SOFT_OPTICS_CONFIG,
  SOFT_OPTICS_CONFIG_RANGES,
  SOFT_OPTICS_PRESETS,
  resolveConfig,
  type SoftOpticsConfigRange,
  type SoftOpticsPresetName
} from "./config";
export {
  createEdgeStripGeometry,
  edgeStrength,
  type EdgeStripGeometry,
  type EdgeStripGeometryInput
} from "./geometry/edgeStripGeometry";
export {
  computeOpticsTarget,
  createScrollOpticsState,
  decayImpulse,
  stepScrollOptics,
  type OpticsDirection,
  type OpticsInput,
  type OpticsTarget,
  type ScrollOpticsState,
  type ScrollOpticsStepInput
} from "./motion/scrollOptics";
export { createOpticalRenderer } from "./render/createOpticalRenderer";
export type {
  OpticalRenderFrame,
  OpticalRenderer,
  OpticalRendererFallbackReason,
  OpticalRendererOptions,
  OpticalRendererStatus
} from "./render/types";
export type { SoftOpticsConfig, SoftOpticsEdge } from "./types";
