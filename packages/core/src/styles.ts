import type { SoftOpticsEdge } from "./types";

export const SOFT_OPTICS_FALLBACK_ATTRIBUTE =
  "data-soft-optics-fallback";
export const SOFT_OPTICS_EDGE_ATTRIBUTE = "data-soft-optics-edge";

const TOP_MASK =
  "linear-gradient(to bottom, black 0%, rgba(0, 0, 0, 0.98) 18%, rgba(0, 0, 0, 0.88) 38%, rgba(0, 0, 0, 0.58) 64%, rgba(0, 0, 0, 0.22) 84%, transparent 100%)";
const BOTTOM_MASK =
  "linear-gradient(to top, black 0%, rgba(0, 0, 0, 0.98) 18%, rgba(0, 0, 0, 0.88) 38%, rgba(0, 0, 0, 0.58) 64%, rgba(0, 0, 0, 0.22) 84%, transparent 100%)";

export function fallbackMask(edge: SoftOpticsEdge): string {
  return edge === "top" ? TOP_MASK : BOTTOM_MASK;
}
