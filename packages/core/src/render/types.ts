import type { EdgeStripGeometry } from "../geometry/edgeStripGeometry";

export type OpticalRenderFrame = {
  enabled: boolean;
  maxBlur: number;
  refraction: number;
  chromaticAberration: number;
  impulse: number;
};

export type OpticalRendererFallbackReason =
  | "webgl2-unavailable"
  | "initialization-failed"
  | "allocation-failed"
  | "upload-failed"
  | "source-size-mismatch"
  | "context-lost";

export type OpticalRendererStatus =
  | { state: "ready" }
  | {
      state: "fallback";
      reason: OpticalRendererFallbackReason;
      detail?: string;
    };

export type OpticalRendererOptions = {
  onStatus?: (status: OpticalRendererStatus) => void;
};

export type OpticalRenderer = {
  /**
   * Allocates all three renderer textures to the geometry's physical pixel
   * dimensions. Call before the first source upload.
   */
  resize(geometry: EdgeStripGeometry): void;
  /**
   * Uploads a frame whose intrinsic pixel size must exactly match the latest
   * geometry texture size. A mismatch permanently transitions this renderer
   * to fallback; resize the source before uploading rather than scaling here.
   */
  uploadSource(source: TexImageSource): void;
  render(frame: OpticalRenderFrame): void;
  destroy(): void;
};
