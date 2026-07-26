# Troubleshooting

Observe the controller before changing visual parameters:

```ts
const optics = createSoftOptics({
  onStatusChange(status) {
    console.log("[soft-optics]", status);
  }
});

await optics.mount();
console.log(optics.getStatus());
```

## Status and fallback reasons

| Status/reason | Meaning | Action |
| --- | --- | --- |
| `loading` | Resources or the static page capture are being prepared. | If persistent, inspect pending fonts/styles and capture cost. |
| `webgl` | The full optical renderer is active. | No action. |
| `fallback: reduced-motion` | The user requests reduced motion. | Keep fallback, or disable the effect in app policy. Do not override the preference silently. |
| `fallback: webgl2-unavailable` | A WebGL2 context could not be created. | Check browser, GPU policy, remote desktop, or webview settings. |
| `fallback: initialization-failed` | Shader/program setup failed. | Capture browser/GPU details and open an issue. |
| `fallback: allocation-failed` | GPU textures/framebuffers could not be allocated. | Reduce page/viewport pressure and test another GPU. |
| `fallback: upload-failed` | The strip texture could not be uploaded. | Check canvas origin cleanliness and GPU limits. |
| `fallback: source-size-mismatch` | A source did not match the current physical strip geometry. | Reproduce with resize details and open an issue. |
| `fallback: context-lost` | The browser lost the WebGL context. | Fallback is deliberate; remount the controller if the app wants a later retry. |
| `fallback: capture-error` | DOM rasterization threw or was aborted unexpectedly. | Inspect unsupported content and browser console. |
| `fallback: security-error` | Canvas readback or drawing was blocked by origin security. | Fix CORS or remove the resource from the captured root. |
| `fallback: canvas-unavailable` | Canvas 2D could not be created. | Use fallback/no effect in this environment. |
| `fallback: capture-too-large` | Physical capture dimensions exceed 16,384 on one axis or 64M pixels total. | Shorten or paginate the document, use lower-level `captureRoot()` with a lower DPR, or accept fallback. |
| `fallback: capture-invalid` | Capture dimensions or visible/readable pixels failed validation. | Check hidden/empty root, layout, and capture support. |
| `fallback: source-error` | Edge source assembly or frame rendering failed. | Check drawable media, CORS, and console detail. |
| `disabled: unmounted` | Controller exists but has not mounted. | Call and await `mount()`. |
| `disabled: config-disabled` | `enabled` is false. | Call `setEnabled(true)` or update config. |
| `disabled: fallback-unavailable` | Neither full renderer nor backdrop fallback is available. | Leave the page unchanged or provide an app-specific alternative. |
| `disabled: document-unavailable` | `mount()` ran without a usable browser document/root/parent. | Mount client-side and pass connected elements. |
| `disabled: destroyed` | Cleanup completed. | Create a new controller to run again. |

`detail` is intentionally `unknown`; log it for diagnosis but do not depend on
its shape.

## The effect appears late

The first full frame waits for a bounded font check, stylesheet readiness,
page mirroring, rasterization, validation, and WebGL upload. It should not wait
indefinitely. Large page dimensions and many CSS/image resources increase
capture time.

- mount after the content structure exists;
- preload critical fonts and same-origin imagery;
- reduce custom-root content complexity and shorten/paginate the document when
  its physical dimensions are large;
- avoid blocking stylesheets that never settle;
- watch the status transition and browser performance timeline.

Fonts have a 750 ms wait per source/mirror stage. If still pending, the first
capture proceeds and a later font-ready refresh is scheduled.

A smaller custom root does not reduce this document-sized physical canvas in
v0.1.0. It can reduce cloning work, but the controller still captures at
device DPR (capped at 2) and exposes no DPR or capture-budget override. A lower
`pixelRatio` is available only on the exported lower-level `captureRoot()` API.

## Blur is missing at the physical edge

Confirm status is `webgl`, not an app overlay covering the canvas. The renderer
already overscans and places the physical top/bottom pixel inside its processed
field. Custom UI above it can make the area appear sharp by design.

Check:

- the desired edge is present in `config.edges`;
- `enabled` and `maxBlur` are non-zero;
- another fixed element has not been stacked above the optical layer;
- the viewport is not being simulated by a transformed ancestor.

## Refraction or dispersion is not visible

CSS fallback has blur only. Confirm `status.mode === "webgl"`. Refraction and
dispersion are most legible where fine text, a hard contrast boundary, or color
crosses the edge. At rest the presence field remains, while the stronger motion
response requires scrolling.

Increase `refraction` or `chromaticAberration` within documented ranges only
after confirming the renderer mode and suitable source contrast.

## Visible navigation becomes blurred

Exclusion and stacking are separate:

1. match the navigation with `exclude`;
2. make it positioned;
3. give it a z-index above `layer.zIndex`.

Mutations in a correctly excluded subtree are ignored by capture refresh.

## Dynamic content is stale

Image loads, meaningful mutations, root scroll-size changes, and viewport
resize refresh automatically when the corresponding browser APIs are
available. For router transitions, canvas drawing, stylesheet swaps, or
application-managed timing, call:

```ts
await optics.refresh();
```

Refresh does nothing while fallback/disabled/destroyed. To retry a terminal
fallback condition, destroy the controller, fix the cause, and create/mount a
new one.

## Video keeps playing but is static in the optical edge

This is safe fallback behavior for that frame. Verify:

- `data-soft-optics-live` is present, or `allowLiveVideo` opts it in;
- `readyState >= 2` and intrinsic video dimensions are available;
- the video source is same-origin/CORS-enabled for canvas drawing;
- the video is topmost across sampled points;
- it and its ancestors have full opacity;
- no transform, filter, backdrop-filter, mask, clip-path, perspective, or
  non-normal blend mode is involved.

The package never pauses or replaces the source video. Unsafe videos retain
normal playback outside the optical layer.

## CORS/security fallback

Every image-like resource used by capture must be canvas-readable. For a CDN
resource, configure an appropriate `Access-Control-Allow-Origin` response and
the matching element request mode where applicable. A browser cache can retain
a response fetched without CORS; retest with a clean cache after correcting
headers.

Cross-origin iframe contents, protected media, DRM content, and authenticated
resources that cannot be rasterized are outside v0.1.0 scope. Exclude them or
accept fallback.

## React creates or destroys twice in development

React Strict Mode intentionally runs an extra effect lifecycle in development.
The adapter destroys the first controller and keeps the active controller in
its stable ref. This is expected and should not leave duplicate layers.

Avoid inline creation-time objects/functions if you do not intend to recreate
the controller:

```tsx
const layer = { zIndex: 40 };
const exclude = "[data-soft-optics-ignore]";

<SoftOptics layer={layer} exclude={exclude} />;
```

Config changes are forwarded through `update()` and do not require controller
recreation.

## Reporting a renderer issue

Include:

- browser/version, OS, GPU, and whether hardware acceleration is enabled;
- current status and reason/detail;
- viewport, DPR, root scroll dimensions, and relevant config;
- whether the clean examples reproduce it;
- a minimal same-origin page without private media.

Do not attach credentials, protected content, or production page captures.
