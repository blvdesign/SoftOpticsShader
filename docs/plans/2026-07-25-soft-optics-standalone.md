# Soft Optics Shader Standalone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish the approved viewport-edge blur, refraction, and dispersion effect as a framework-agnostic TypeScript package, a React adapter, and an interactive GitHub Pages demo.

**Architecture:** A pnpm workspace separates the browser/WebGL controller from React. The core owns capture, live video compositing, scroll dynamics, two overscanned edge renderers, and fallback behavior; the React package only manages controller lifecycle. A Vite application provides the original editorial demo and tuning panel.

**Tech Stack:** TypeScript, pnpm workspaces, WebGL2/GLSL ES 3.00, Canvas 2D, `modern-screenshot`, React, Vite, tsup, Vitest, Testing Library, Playwright, Changesets, GitHub Actions.

---

## Preconditions

- Work in branch `codex/standalone-foundation`.
- The maintainer-provided source implementation is read-only during this plan
  and remains outside this repository.
- Never copy portfolio content, personal data, navigation, or route-specific
  selectors into the public package.
- Before npm publication, confirm ownership of the intended npm scope. Do not
  place npm or GitHub tokens in repository files.

### Task 1: Establish the workspace and repository contract

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/tsup.config.ts`
- Create: `packages/react/src/index.ts`
- Create: `apps/demo/package.json`
- Create: `apps/demo/tsconfig.json`
- Create: `apps/demo/vite.config.ts`
- Create: `apps/demo/index.html`
- Create: `apps/demo/src/main.tsx`
- Modify: `README.md`

**Step 1: Verify package naming**

Run:

```bash
npm view @blvdesign/soft-optics name version
npm view @blvdesign/soft-optics-react name version
```

Expected: either `E404` for unused names or the existing packages owned by the
same publisher. If the npm scope is unavailable, pause only publication naming
and use private workspace names until the owner chooses an accessible scope.

**Step 2: Create the root workspace metadata**

Use:

```json
{
  "name": "soft-optics-shader-workspace",
  "private": true,
  "packageManager": "pnpm@10.14.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --filter @soft-optics/demo dev",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:run": "pnpm -r test:run",
    "test:e2e": "playwright test",
    "check": "pnpm lint && pnpm typecheck && pnpm test:run && pnpm build"
  },
  "devDependencies": {
    "@changesets/cli": "^2.29.0",
    "@eslint/js": "^9.0.0",
    "@playwright/test": "^1.54.0",
    "@types/node": "^24.0.0",
    "eslint": "^9.0.0",
    "playwright": "^1.54.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.2.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

**Step 3: Add package entrypoints**

Start with intentionally empty, buildable exports:

```ts
// packages/core/src/index.ts
export const SOFT_OPTICS_VERSION = "0.1.0";
```

```ts
// packages/react/src/index.ts
export { SOFT_OPTICS_REACT_VERSION } from "./version";
```

**Step 4: Install and verify the empty workspace**

Run:

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all commands exit `0`.

**Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.js \
  .gitignore .npmrc LICENSE CONTRIBUTING.md README.md packages apps pnpm-lock.yaml
git commit -m "chore: scaffold soft optics workspace"
```

### Task 2: Extract configuration, geometry, and scroll dynamics

**Files:**
- Create: `packages/core/src/config.ts`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/geometry/edgeStripGeometry.ts`
- Create: `packages/core/src/motion/scrollOptics.ts`
- Create: `packages/core/src/config.test.ts`
- Create: `packages/core/src/geometry/edgeStripGeometry.test.ts`
- Create: `packages/core/src/motion/scrollOptics.test.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Write failing configuration tests**

Cover default values, partial merge, edge selection, and clamping:

```ts
it("preserves the approved default preset", () => {
  expect(DEFAULT_SOFT_OPTICS_CONFIG).toMatchObject({
    edgeHeight: 7,
    featherHeight: 2,
    maxBlur: 20,
    refraction: 3,
    chromaticAberration: 2,
    velocitySensitivity: 1.5,
    peakHoldMs: 100,
    decayMs: 800,
    oppositeEdgeResponse: 0.4
  });
});

it("clamps unsafe user values", () => {
  expect(resolveConfig({ maxBlur: -1 }).maxBlur).toBe(0);
  expect(resolveConfig({ presenceFloor: 4 }).presenceFloor).toBe(1);
});
```

**Step 2: Run tests and confirm RED**

```bash
pnpm --filter @blvdesign/soft-optics test:run -- config.test.ts
```

Expected: FAIL because the config module does not exist.

**Step 3: Implement types and configuration**

Export:

```ts
export type SoftOpticsEdge = "top" | "bottom";

export type SoftOpticsConfig = {
  enabled: boolean;
  edges: readonly SoftOpticsEdge[];
  edgeHeight: number;
  featherHeight: number;
  maxBlur: number;
  refraction: number;
  chromaticAberration: number;
  velocitySensitivity: number;
  peakHoldMs: number;
  decayMs: number;
  oppositeEdgeResponse: number;
  edgeFadeDistance: number;
  presenceFloor: number;
};
```

Implement immutable defaults and `resolveConfig(partial)`.

**Step 4: Write geometry and motion tests**

Port behavior, not portfolio imports. Verify:

- top and bottom document coordinates;
- DPR scaling;
- overscan on the outer viewport boundary;
- clamping near document limits;
- velocity normalization;
- peak hold and exponential decay;
- opposite-edge response.

**Step 5: Implement minimal pure functions**

Port and rename only:

- `createEdgeStripGeometry()`;
- `createScrollOpticsState()`;
- `stepScrollOptics()`.

Both modules must be deterministic and browser-global free.

**Step 6: Verify GREEN**

```bash
pnpm --filter @blvdesign/soft-optics test:run
pnpm --filter @blvdesign/soft-optics typecheck
```

Expected: all core tests pass.

**Step 7: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add optics configuration and motion model"
```

### Task 3: Build the WebGL2 optical renderer

**Files:**
- Create: `packages/core/src/render/types.ts`
- Create: `packages/core/src/render/shaders.ts`
- Create: `packages/core/src/render/shaders.test.ts`
- Create: `packages/core/src/render/createOpticalRenderer.ts`
- Create: `packages/core/src/render/createOpticalRenderer.test.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Write failing shader contract tests**

Assert the shader sources include:

- WebGL2 version declaration;
- source texture and texel-size uniforms;
- horizontal and vertical blur directions;
- edge field;
- refraction displacement;
- separate red, green, and blue samples;
- premultiplied-alpha output.

```ts
expect(OPTICAL_FRAGMENT_SHADER).toContain("#version 300 es");
expect(OPTICAL_FRAGMENT_SHADER).toContain("u_refraction");
expect(OPTICAL_FRAGMENT_SHADER).toContain("u_chromaticAberration");
```

**Step 2: Confirm RED**

```bash
pnpm --filter @blvdesign/soft-optics test:run -- shaders.test.ts
```

**Step 3: Port the three-pass renderer**

Create two ping-pong framebuffers:

1. horizontal Gaussian blur;
2. vertical Gaussian blur;
3. final refraction and RGB composite.

The final edge mask must be evaluated continuously per pixel. Clamp source UVs
inside the overscanned texture; clip only the final canvas.

Expose:

```ts
export type OpticalRenderer = {
  resize(geometry: EdgeStripGeometry): void;
  uploadSource(source: TexImageSource): void;
  render(frame: OpticalRenderFrame): void;
  loseContextForTest?(): void;
  destroy(): void;
};
```

**Step 4: Test resource lifecycle**

Mock a minimal WebGL2 context. Assert shader compilation, texture allocation,
resize, render uniforms, idempotent destroy, and fallback on compilation or
context errors.

**Step 5: Verify**

```bash
pnpm --filter @blvdesign/soft-optics test:run -- render
pnpm --filter @blvdesign/soft-optics typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/core/src/render packages/core/src/index.ts
git commit -m "feat(core): render progressive WebGL edge optics"
```

### Task 4: Extract document capture and live video compositing

**Files:**
- Create: `packages/core/src/capture/captureRoot.ts`
- Create: `packages/core/src/capture/captureRoot.test.ts`
- Create: `packages/core/src/capture/createEdgeStripSource.ts`
- Create: `packages/core/src/capture/createEdgeStripSource.test.ts`
- Create: `packages/core/src/capture/videoFrameGeometry.ts`
- Create: `packages/core/src/capture/videoFrameGeometry.test.ts`
- Create: `packages/core/src/capture/videoFrames.ts`
- Create: `packages/core/src/capture/videoFrames.test.ts`
- Modify: `packages/core/package.json`

**Step 1: Add the capture dependency**

```bash
pnpm --filter @blvdesign/soft-optics add modern-screenshot@^4.7.0
```

**Step 2: Write failing capture tests**

Test:

- the compositor and `exclude` matches are skipped;
- capture returns a typed fallback result instead of throwing;
- root offsets are preserved;
- delayed image/font readiness can schedule refresh;
- no portfolio selectors appear in source.

**Step 3: Implement `captureRoot()`**

```ts
export type CaptureRootOptions = {
  root: HTMLElement;
  exclude?: string | ((node: Node) => boolean);
  pixelRatio?: number;
};

export type CaptureRootResult =
  | { status: "ready"; canvas: HTMLCanvasElement }
  | { status: "fallback"; reason: "capture-error" | "security-error" };
```

Combine user exclusion with the internal
`[data-soft-optics-internal]` marker.

**Step 4: Write and implement video tests**

Verify geometry for `object-fit: cover`, `contain`, and `fill`. Verify that
snapshot collection never calls `pause()`, changes `currentTime`, replaces
`src`, or alters autoplay state.

The live source update accepts:

```ts
source.update({
  documentTexture,
  geometry,
  videoFrames
});
```

**Step 5: Verify**

```bash
pnpm --filter @blvdesign/soft-optics test:run -- capture
pnpm --filter @blvdesign/soft-optics typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/core package.json pnpm-lock.yaml
git commit -m "feat(core): capture pages and preserve live video"
```

### Task 5: Implement the framework-agnostic controller and fallback

**Files:**
- Create: `packages/core/src/controller/createSoftOptics.ts`
- Create: `packages/core/src/controller/createSoftOptics.test.ts`
- Create: `packages/core/src/controller/createScheduler.ts`
- Create: `packages/core/src/controller/createScheduler.test.ts`
- Create: `packages/core/src/fallback/createFallback.ts`
- Create: `packages/core/src/fallback/createFallback.test.ts`
- Create: `packages/core/src/styles.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Write failing lifecycle tests**

Use fake timers and DOM mocks. Assert:

- import does not require `window`;
- `mount()` creates exactly two marked canvases;
- repeat `mount()` is safe;
- `update()` reuses render resources;
- `refresh()` schedules capture;
- `setEnabled(false)` hides output;
- `destroy()` twice is safe;
- every observer, listener, RAF, canvas, and renderer is released.

**Step 2: Confirm RED**

```bash
pnpm --filter @blvdesign/soft-optics test:run -- createSoftOptics.test.ts
```

**Step 3: Implement controller orchestration**

Public options:

```ts
export type CreateSoftOpticsOptions = {
  root?: HTMLElement;
  config?: Partial<SoftOpticsConfig>;
  exclude?: string | ((node: Node) => boolean);
  layer?: {
    parent?: HTMLElement;
    zIndex?: number;
  };
  onStatusChange?: (status: SoftOpticsStatus) => void;
};
```

The controller owns two renderers and sources. It uses `ResizeObserver`,
debounced `MutationObserver`, scroll/wheel listeners, and one shared RAF loop.

**Step 4: Implement continuous fallback**

Create one fixed layer per enabled edge with:

- `backdrop-filter: blur(...)`;
- a smooth alpha mask;
- outer-edge coverage;
- no stacked bands;
- `pointer-events: none`.

Return no-op mode if backdrop filtering is unavailable.

**Step 5: Verify all core tests and build**

```bash
pnpm --filter @blvdesign/soft-optics test:run
pnpm --filter @blvdesign/soft-optics typecheck
pnpm --filter @blvdesign/soft-optics build
```

Expected: PASS and generated ESM, declarations, sourcemaps.

**Step 6: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): expose standalone soft optics controller"
```

### Task 6: Add the React adapter

**Files:**
- Create: `packages/react/src/SoftOptics.tsx`
- Create: `packages/react/src/useSoftOptics.ts`
- Create: `packages/react/src/types.ts`
- Create: `packages/react/src/SoftOptics.test.tsx`
- Create: `packages/react/src/useSoftOptics.test.tsx`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/package.json`

**Step 1: Add React test dependencies**

```bash
pnpm --filter @blvdesign/soft-optics-react add \
  @blvdesign/soft-optics@workspace:* react@^19 react-dom@^19
pnpm --filter @blvdesign/soft-optics-react add -D \
  @testing-library/react @types/react @types/react-dom jsdom
```

Mark `react` and `react-dom` as peer dependencies before publishing.

**Step 2: Write failing Strict Mode tests**

Mock `createSoftOptics`. Verify one live controller after Strict Mode settles,
prop updates call `update()`, unmount calls `destroy()`, and SSR import does not
touch the DOM.

**Step 3: Implement the hook and component**

```tsx
export function SoftOptics(props: SoftOpticsProps) {
  useSoftOptics(props);
  return null;
}
```

`useSoftOptics()` mounts inside `useEffect`, stores the controller in a ref,
updates config separately, and forwards status.

**Step 4: Verify**

```bash
pnpm --filter @blvdesign/soft-optics-react test:run
pnpm --filter @blvdesign/soft-optics-react typecheck
pnpm --filter @blvdesign/soft-optics-react build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/react pnpm-lock.yaml
git commit -m "feat(react): add soft optics component and hook"
```

### Task 7: Build the original editorial demo

**Files:**
- Create: `apps/demo/src/App.tsx`
- Create: `apps/demo/src/styles.css`
- Create: `apps/demo/src/content.ts`
- Create: `apps/demo/src/components/OpticsControls.tsx`
- Create: `apps/demo/src/components/OpticsControls.test.tsx`
- Create: `apps/demo/src/components/CodeExample.tsx`
- Create: `apps/demo/public/media/editorial-hero.webp`
- Create: `apps/demo/public/media/editorial-detail.webp`
- Create: `apps/demo/public/media/optical-motion.webm`
- Modify: `apps/demo/src/main.tsx`
- Modify: `apps/demo/vite.config.ts`

**Step 1: Create or source project-safe assets**

Generate original images using ImageGen or use clearly licensed CC0 assets.
Create a short local WebM with no trademarks, people requiring consent, or
third-party branding. Record asset provenance in `apps/demo/public/media/README.md`.

**Step 2: Write failing controls tests**

Verify:

- panel is closed initially;
- `Tune optics` opens it;
- presets update every control;
- editing a control switches to `Custom`;
- compare disables only while active;
- reset restores default;
- debug boundaries are off initially.

**Step 3: Build the editorial surface**

Use a responsive light page with long-form text, images, dividers, colored
details, and the local video. The fixed navigation and controls use
`data-soft-optics-ignore` and a z-index above the optical canvases.

**Step 4: Connect the React adapter**

Keep config state in the demo only:

```tsx
<SoftOptics
  config={config}
  exclude="[data-soft-optics-ignore]"
  onStatusChange={setStatus}
/>
```

Do not expose lab controls from either published package.

**Step 5: Verify demo tests and build**

```bash
pnpm --filter @soft-optics/demo test:run
pnpm --filter @soft-optics/demo build
```

Expected: PASS; built assets use the GitHub Pages base path.

**Step 6: Commit**

```bash
git add apps/demo
git commit -m "feat(demo): showcase soft optics on an editorial page"
```

### Task 8: Add browser and visual regression coverage

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/demo.spec.ts`
- Create: `tests/e2e/video.spec.ts`
- Create: `tests/e2e/fallback.spec.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/visual/soft-optics.spec.ts`
- Create: `tests/visual/soft-optics.spec.ts-snapshots/`

**Step 1: Write failing browser tests**

Test Chromium first:

- optical mode becomes `webgl` within a bounded startup time;
- two canvases exist;
- scroll changes the optical output;
- the outermost top and bottom rows differ from disabled mode;
- video `currentTime` continues increasing;
- navigation remains sharp and clickable;
- compare and reset work;
- resize and DOM mutation refresh the capture;
- destroy removes internal nodes.

**Step 2: Confirm RED**

```bash
pnpm exec playwright test tests/e2e
```

Expected: failures until test instrumentation and status hooks are complete.

**Step 3: Add non-production diagnostics**

Expose status and diagnostics as `data-*` only in the demo. Do not add test-only
globals to the core package.

**Step 4: Add fallback coverage**

Launch a context with WebGL2 disabled and one with reduced motion. Assert the
page remains usable, fallback has no band boundaries, and navigation/video are
unchanged.

**Step 5: Add visual states**

Capture:

- desktop rest;
- desktop fast scroll;
- video intersecting bottom edge;
- mobile rest and scroll;
- controls open;
- fallback.

Use a documented pixel threshold that tolerates GPU differences but catches
missing blur and seams.

**Step 6: Verify**

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: all browser and visual tests pass.

**Step 7: Commit**

```bash
git add playwright.config.ts tests apps/demo
git commit -m "test: cover browser optics and fallback behavior"
```

### Task 9: Complete documentation and package verification

**Files:**
- Modify: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/browser-support.md`
- Create: `docs/troubleshooting.md`
- Create: `CHANGELOG.md`
- Create: `.changeset/config.json`
- Create: `.changeset/soft-optics-initial-release.md`
- Create: `examples/vanilla-vite/package.json`
- Create: `examples/vanilla-vite/src/main.ts`
- Create: `examples/react-vite/package.json`
- Create: `examples/react-vite/src/App.tsx`

**Step 1: Document the public contract**

Include installation, live demo, API, configuration table, exclusions,
layering, video, CORS, fallback, reduced motion, cleanup, performance, and
troubleshooting.

**Step 2: Add clean consumer examples**

Examples consume package exports only. They must not use relative imports into
package source.

**Step 3: Pack and install tarballs locally**

```bash
pnpm --filter @blvdesign/soft-optics pack --pack-destination ../../artifacts
pnpm --filter @blvdesign/soft-optics-react pack --pack-destination ../../artifacts
```

Install the resulting tarballs into both examples and run:

```bash
pnpm --dir examples/vanilla-vite build
pnpm --dir examples/react-vite build
```

Expected: both clean consumer builds pass.

**Step 4: Inspect package contents**

```bash
npm pack --dry-run --workspace packages/core
npm pack --dry-run --workspace packages/react
```

Expected: only dist, README, license, and package metadata; no tests, sources
with secrets, demo assets, or portfolio files.

**Step 5: Commit**

```bash
git add README.md docs CHANGELOG.md .changeset examples
git commit -m "docs: document standalone integration and release"
```

### Task 10: Configure CI, Pages, and npm release

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `.github/workflows/release.yml`
- Modify: `apps/demo/vite.config.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/react/package.json`

**Step 1: Add CI**

On pull requests and `main`, run Node 20 and:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm exec playwright test
```

Cache pnpm store and upload Playwright reports only on failure.

**Step 2: Add GitHub Pages**

Build the demo with base `/SoftOpticsShader/`, upload `apps/demo/dist`, and
deploy only from `main`.

**Step 3: Add release workflow**

Use Changesets to open version PRs. Publish packages only from a protected
`npm` environment with provenance. Repository setup outside code:

- grant Actions `contents: write`, `pull-requests: write`, and
  `id-token: write` as narrowly as possible;
- configure npm trusted publisher or `NPM_TOKEN`;
- protect the release environment;
- confirm package scope ownership.

**Step 4: Validate workflows locally**

Run:

```bash
pnpm check
pnpm test:e2e
pnpm --filter @soft-optics/demo build
```

Expected: every command exits `0`.

**Step 5: Commit**

```bash
git add .github packages apps/demo
git commit -m "ci: publish packages and GitHub Pages demo"
```

### Task 11: Perform release QA and publish `v0.1.0`

**Files:**
- Modify: package versions through Changesets
- Modify: `CHANGELOG.md`

**Step 1: Run the complete local gate**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e
git status --short
```

Expected: all checks pass; only intentional release files are modified.

**Step 2: Perform manual visual QA**

Inspect Chromium desktop and mobile:

- page-load startup;
- slow and rapid scrolling;
- top and bottom seams;
- stationary and moving video;
- controls closed and open;
- compare;
- fallback;
- navigation above blur.

Record results in the release PR.

**Step 3: Push and open a draft PR**

```bash
git push -u origin codex/standalone-foundation
```

Open a draft PR describing architecture, test evidence, demo URL, package names,
known fallback limitations, and npm setup still required.

**Step 4: Merge only after CI and review**

Do not bypass required checks. Merge through the repository's normal protected
branch workflow.

**Step 5: Publish**

After the Changesets release PR merges:

- publish both packages;
- create tag and GitHub release `v0.1.0`;
- verify GitHub Pages deployment;
- install both packages from npm in clean temporary Vite projects.

**Step 6: Verify public artifacts**

```bash
npm view @blvdesign/soft-optics version dist-tags.latest
npm view @blvdesign/soft-optics-react version dist-tags.latest
```

Expected: both report `0.1.0`.

Open the GitHub Pages URL and verify the production build, not the local dev
server.

## Final Definition of Done

- `pnpm check` passes.
- Playwright browser and visual tests pass.
- Core and React tarballs work in clean consumer projects.
- Live video remains live.
- Outermost viewport pixels are processed without seams.
- Navigation remains above the effect.
- GitHub Pages demo is reachable.
- Both npm packages report `0.1.0`.
- GitHub release `v0.1.0` exists.
- Repository is MIT licensed and contains no portfolio-specific content.
