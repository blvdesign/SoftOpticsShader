# Soft Optics Shader — Standalone Library Design

**Date:** 2026-07-25

**Status:** Approved

**Target release:** `v0.1.0`

## Summary

Extract the soft viewport optics effect from the portfolio into a standalone,
open-source project. The repository will provide a framework-agnostic
TypeScript core, a thin React adapter, an original editorial demo, npm
packages, and a GitHub Pages deployment.

The portfolio remains unchanged during extraction. The existing implementation
is source material, not a runtime dependency.

## Goals

- Reproduce the approved top and bottom viewport optics:
  progressive blur, refraction, restrained color dispersion, and
  scroll-velocity response.
- Provide a browser API that does not depend on React, Next.js, or the
  portfolio DOM.
- Provide an idiomatic React component and hook.
- Preserve live video playback when video intersects either optical edge.
- Keep navigation and other nominated elements above the effect.
- Degrade safely when WebGL2, page capture, or animation is unavailable.
- Publish installable npm packages and a public interactive demo.
- Document limitations, browser behavior, CORS requirements, and cleanup.

## Non-goals for `v0.1.0`

- Vue, Svelte, Angular, or Web Component adapters.
- Arbitrary shader authoring or a shader-node editor.
- Native support for iframes, cross-origin documents, or protected media.
- Perfect pixel equivalence across every browser and GPU.
- A server-side renderer.
- Changes to the production portfolio.

## Selected Architecture

Use a small pnpm workspace without an additional monorepo orchestrator.

```text
SoftOpticsShader/
├── apps/
│   └── demo/
├── packages/
│   ├── core/
│   └── react/
├── docs/
├── .changeset/
├── .github/workflows/
├── LICENSE
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Working package names:

- `@blvdesign/soft-optics`
- `@blvdesign/soft-optics-react`

Before publishing, verify that the npm scope exists and that the authenticated
npm account can publish to it. If it cannot, change only package metadata; the
source architecture remains the same.

## Core Package

`packages/core` owns all browser and rendering behavior:

- configuration and presets;
- edge-strip geometry and overscan;
- scroll velocity, peak hold, decay, and opposite-edge response;
- DOM raster capture;
- live video-frame compositing;
- WebGL2 resource creation and disposal;
- GLSL blur, refraction, and RGB dispersion;
- fixed top and bottom canvas layers;
- scheduling, resize handling, mutation refresh, and context recovery;
- CSS/backdrop fallback.

It must not import React or Next.js.

### Public API

```ts
import {
  createSoftOptics,
  DEFAULT_SOFT_OPTICS_CONFIG,
  type SoftOpticsConfig
} from "@blvdesign/soft-optics";

const optics = createSoftOptics({
  root: document.body,
  config: {
    ...DEFAULT_SOFT_OPTICS_CONFIG,
    maxBlur: 24
  },
  exclude: "[data-soft-optics-ignore]",
  layer: {
    parent: document.body,
    zIndex: 40
  }
});

await optics.mount();
optics.update({ refraction: 2 });
await optics.refresh();
optics.setEnabled(false);
optics.destroy();
```

`createSoftOptics()` is safe to import during SSR. Browser globals are read
only from lifecycle methods.

### Controller contract

```ts
export type SoftOpticsController = {
  mount(): Promise<void>;
  update(config: Partial<SoftOpticsConfig>): void;
  refresh(): Promise<void>;
  setEnabled(enabled: boolean): void;
  getStatus(): SoftOpticsStatus;
  destroy(): void;
};
```

`destroy()` is idempotent and releases RAF callbacks, observers, event
listeners, canvases, textures, framebuffers, programs, and WebGL contexts.

### Configuration

The default preset preserves the approved production values:

```ts
{
  enabled: true,
  edges: ["top", "bottom"],
  edgeHeight: 7,
  featherHeight: 2,
  maxBlur: 20,
  refraction: 3,
  chromaticAberration: 2,
  velocitySensitivity: 1.5,
  peakHoldMs: 100,
  decayMs: 800,
  oppositeEdgeResponse: 0.4,
  edgeFadeDistance: 36,
  presenceFloor: 0.68
}
```

Values are expressed in CSS pixels, viewport-height percentages, milliseconds,
or unitless response coefficients. Runtime validation clamps unsafe values and
reports invalid input in development builds.

## Rendering Pipeline

Two independent, fixed canvases render the top and bottom edges. Each canvas is
overscanned before clipping so the outermost viewport pixel remains blurred and
does not expose an unprocessed seam.

The pipeline for each edge is:

1. Capture the configured root into a static document texture.
2. Locate videos that intersect the source strip.
3. Draw current video frames into the strip source without pausing or replacing
   the original `<video>` elements.
4. Upload only the affected strip to WebGL2.
5. Run horizontal and vertical blur passes.
6. Run the optical composite pass with displacement, RGB offsets, and a
   continuous edge field.
7. Clip after processing and composite above page content.

The central part of the page is never drawn by the optical canvases.

### Capture refresh

- `ResizeObserver` refreshes after root or viewport size changes.
- A debounced `MutationObserver` refreshes meaningful DOM changes.
- Image `load`, font readiness, route-driven layout changes, and explicit
  `refresh()` calls schedule a new static capture.
- Video frames update only while a relevant video intersects an edge.
- Scroll rendering is RAF-driven and does not cause framework rerenders.

### Layering and exclusion

The compositor uses `pointer-events: none` and configurable `z-index`.

Elements matching `exclude`, plus the compositor itself and demo controls, are
omitted from capture. A navigation bar that must remain sharp uses
`data-soft-optics-ignore` and a higher stacking layer.

## Fallback Strategy

The library uses progressive enhancement:

1. Try the WebGL2 path.
2. On unsupported capabilities, context loss, security errors, capture errors,
   or `prefers-reduced-motion`, use a continuous CSS/backdrop-filter fallback.
3. If backdrop filtering is unavailable, render no effect and preserve the
   page.

The fallback keeps progressive blur but does not claim WebGL refraction or RGB
dispersion. It must not introduce visible stacked bands.

Status changes are observable:

```ts
type SoftOpticsStatus =
  | { mode: "loading" }
  | { mode: "webgl" }
  | { mode: "fallback"; reason: SoftOpticsFallbackReason }
  | { mode: "disabled"; reason?: SoftOpticsFallbackReason };
```

## React Package

`packages/react` is a thin adapter over the core controller.

```tsx
import { SoftOptics } from "@blvdesign/soft-optics-react";

export function App() {
  return (
    <>
      <header data-soft-optics-ignore>...</header>
      <main>...</main>
      <SoftOptics preset="default" />
    </>
  );
}
```

The package provides:

- `<SoftOptics />`;
- `useSoftOptics()`;
- forwarded status and error callbacks;
- Strict Mode-safe mount and cleanup;
- SSR-safe imports;
- config updates without recreating WebGL resources unnecessarily.

React is a peer dependency.

## Demo Application

The Vite/React demo is an original light editorial page, not a clone of a
third-party website.

It contains:

- long-form typography and dividers;
- several contrast-rich original or generated images;
- one local, muted, looping video;
- colored blocks and fine text that make refraction and dispersion legible;
- a fixed navigation bar excluded from the effect;
- enough vertical content to test sustained and rapid scrolling.

The compact `Tune optics` control is closed by default. It exposes:

- enabled state;
- `Default`, `Subtle`, and `Custom` presets;
- edge height and feather;
- blur, refraction, and dispersion;
- motion sensitivity, peak hold, decay, and opposite-edge response;
- compare/hold-to-disable;
- reset;
- optional debug boundaries.

The page also includes installation and Vanilla/React usage examples below the
visual demonstration.

## Repository Documentation

`README.md` includes:

- live demo and cover;
- short explanation and feature list;
- browser support;
- Vanilla and React installation;
- public API;
- presets and configuration table;
- exclusions and layering;
- dynamic content and video behavior;
- CORS and capture limitations;
- performance guidance;
- fallback behavior;
- accessibility and reduced motion;
- troubleshooting;
- contribution and release instructions;
- MIT license.

Additional pages:

- `docs/architecture.md`
- `docs/browser-support.md`
- `docs/troubleshooting.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

## Testing Strategy

### Unit tests

- configuration validation and merging;
- optical motion model;
- strip geometry and overscan;
- video intersection and frame geometry;
- shader source contracts;
- controller lifecycle and idempotent disposal;
- React Strict Mode behavior.

### Browser integration tests

- WebGL2 starts on supported browsers;
- the first rendered frame appears promptly;
- top and bottom outer viewport pixels are processed;
- navigation remains sharp and interactive above the effect;
- blur is progressive without visible bands;
- refraction and dispersion produce measurable pixel differences;
- live video continues advancing;
- resize, mutation, refresh, enable/disable, and destroy work;
- fallback activates without breaking the page;
- reduced motion is respected.

### Visual QA

Capture consistent desktop and mobile states at rest, slow scroll, fast scroll,
and video intersection. Compare against committed baselines with deliberate
tolerance for GPU differences.

## Release and Hosting

GitHub Actions run:

- lint;
- typecheck;
- unit tests;
- package builds;
- Playwright browser tests;
- demo build.

GitHub Pages deploys `apps/demo`. Changesets manage package versions and
changelog entries. npm publication uses a protected GitHub environment and
trusted publishing or a repository secret configured outside source control.

The initial release is tagged `v0.1.0`.

## Risks and Mitigations

- **CORS-tainted content:** document same-origin/CORS requirements and fall back
  without breaking the page.
- **Slow initial capture:** schedule capture immediately after mount, show no
  blocking loading UI, and measure first optical frame in Playwright.
- **Video stalling:** draw snapshots without mutating playback state and test
  `currentTime` advancement.
- **Visible edge seam:** preserve overscan through blur and clip only after the
  shader pass.
- **GPU variation:** keep deterministic math tests and use tolerant browser
  image assertions.
- **Large bundle:** keep React outside core, expose tree-shakeable ESM, and set a
  bundle-size budget before release.
- **Publishing access:** verify npm scope and GitHub authentication before the
  release task, without blocking local development.

## Acceptance Criteria

- Both packages build as ESM with declarations and sourcemaps.
- A clean Vanilla Vite app and a clean React Vite app can install and run the
  packages.
- The default preset visually matches the approved portfolio effect.
- Top and bottom outermost pixels remain processed.
- Refraction and dispersion are visible on contrast edges.
- Videos remain live.
- Excluded navigation stays sharp and above the canvases.
- Unsupported environments fail safely.
- GitHub Pages demo is public.
- npm packages and tag `v0.1.0` are published under MIT.
