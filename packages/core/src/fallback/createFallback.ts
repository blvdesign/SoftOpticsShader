import {
  fallbackMask,
  SOFT_OPTICS_EDGE_ATTRIBUTE,
  SOFT_OPTICS_FALLBACK_ATTRIBUTE
} from "../styles";
import { SOFT_OPTICS_INTERNAL_ATTRIBUTE } from "../capture/captureRoot";
import type { SoftOpticsConfig, SoftOpticsEdge } from "../types";

export type FallbackLayerOptions = {
  parent?: HTMLElement;
  zIndex?: number;
};

export type CreateFallbackOptions = FallbackLayerOptions & {
  config: Readonly<SoftOpticsConfig>;
  document?: Document;
  supportsBackdropFilter?: () => boolean;
};

export type SoftOpticsFallback = {
  readonly supported: boolean;
  update(
    config: Readonly<SoftOpticsConfig>,
    layer?: FallbackLayerOptions
  ): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
};

function defaultCapability(documentRef: Document): boolean {
  const css = documentRef.defaultView?.CSS;
  return Boolean(
    css?.supports("backdrop-filter", "blur(1px)") ||
      css?.supports("-webkit-backdrop-filter", "blur(1px)")
  );
}

function safeZIndex(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : 40;
}

function noOpFallback(): SoftOpticsFallback {
  return {
    supported: false,
    update: () => undefined,
    setEnabled: () => undefined,
    destroy: () => undefined
  };
}

export function createFallback(
  options: CreateFallbackOptions
): SoftOpticsFallback {
  const documentRef =
    options.document ??
    options.parent?.ownerDocument ??
    (typeof document === "undefined" ? undefined : document);
  if (!documentRef) return noOpFallback();

  const isSupported =
    options.supportsBackdropFilter?.() ?? defaultCapability(documentRef);
  if (!isSupported) return noOpFallback();

  let destroyed = false;
  let enabled = options.config.enabled;
  let config = options.config;
  let parent = options.parent ?? documentRef.body;
  let zIndex = safeZIndex(options.zIndex);
  const layers = new Map<SoftOpticsEdge, HTMLDivElement>();

  const applyLayerStyle = (
    layer: HTMLDivElement,
    edge: SoftOpticsEdge
  ) => {
    const blur = `blur(${config.maxBlur}px)`;
    const mask = fallbackMask(edge);
    layer.style.position = "fixed";
    layer.style.left = "0px";
    layer.style.right = "0px";
    layer.style.width = "auto";
    layer.style.height = `${config.edgeHeight + config.featherHeight}vh`;
    layer.style.pointerEvents = "none";
    layer.style.userSelect = "none";
    layer.style.zIndex = String(zIndex);
    layer.style.setProperty("backdrop-filter", blur);
    layer.style.setProperty("-webkit-backdrop-filter", blur);
    layer.style.maskImage = mask;
    layer.style.setProperty("-webkit-mask-image", mask);
    layer.hidden = !enabled;
    if (edge === "top") {
      layer.style.top = "0px";
      layer.style.bottom = "";
    } else {
      layer.style.bottom = "0px";
      layer.style.top = "";
    }
  };

  const createLayer = (edge: SoftOpticsEdge): HTMLDivElement => {
    const layer = documentRef.createElement("div");
    layer.setAttribute(SOFT_OPTICS_FALLBACK_ATTRIBUTE, "");
    layer.setAttribute(SOFT_OPTICS_EDGE_ATTRIBUTE, edge);
    layer.setAttribute(SOFT_OPTICS_INTERNAL_ATTRIBUTE, "fallback");
    layer.setAttribute("aria-hidden", "true");
    applyLayerStyle(layer, edge);
    parent.append(layer);
    return layer;
  };

  const reconcile = () => {
    if (destroyed) return;
    const expectedEdges = new Set(config.edges);
    for (const [edge, layer] of layers) {
      if (!expectedEdges.has(edge)) {
        layer.remove();
        layers.delete(edge);
      }
    }
    for (const edge of config.edges) {
      const layer = layers.get(edge) ?? createLayer(edge);
      layers.set(edge, layer);
      if (layer.parentElement !== parent) parent.append(layer);
      applyLayerStyle(layer, edge);
    }
  };

  const update: SoftOpticsFallback["update"] = (nextConfig, layer) => {
    if (destroyed) return;
    config = nextConfig;
    enabled = nextConfig.enabled;
    parent = layer?.parent ?? parent;
    zIndex = safeZIndex(layer?.zIndex ?? zIndex);
    reconcile();
  };

  const setEnabled = (nextEnabled: boolean) => {
    if (destroyed) return;
    enabled = nextEnabled;
    for (const layer of layers.values()) layer.hidden = !enabled;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const layer of layers.values()) layer.remove();
    layers.clear();
  };

  reconcile();

  return { supported: true, update, setEnabled, destroy };
}
