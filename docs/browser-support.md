# Browser support

Soft Optics is progressive enhancement. Page content and interaction never
depend on the effect being available.

## Capability matrix

| Environment | WebGL optics | CSS fallback | Notes |
| --- | --- | --- | --- |
| Current Chromium / Edge with WebGL2 | Supported and covered by automated browser tests | Usually available | Reference implementation and visual regression target. |
| Current Safari with WebGL2 | Expected, not continuously regression-tested | `-webkit-backdrop-filter` path available on supported releases | Capture and GPU output can differ from Chromium. |
| Current Firefox with WebGL2 | Expected, not continuously regression-tested | Depends on release/settings | Verify capture and backdrop support for the target audience. |
| WebGL2 disabled, blocked, or context-lost | No | Used when `backdrop-filter` is supported | Blur only; no refraction or RGB dispersion. |
| `prefers-reduced-motion: reduce` | Not started | Used when supported | Avoids the velocity-driven shader path. |
| No WebGL2 and no backdrop filter | No | No | Status is `disabled`; the page is unchanged. |
| Server rendering / Node import | Import only | Not applicable | Imports are safe; `mount()` without a document reports `document-unavailable`. |

The test suite uses Playwright Chromium for first-frame timing, processed outer
pixels, refraction/dispersion difference, alpha, live video, lifecycle,
fallback, reduced motion, and visual states. “Expected” above means the runtime
uses standard APIs, not that every GPU/driver combination is certified.

## Required browser capabilities

The full path needs:

- WebGL2 and GLSL ES 3.00;
- Canvas 2D plus readable canvas pixels;
- `requestAnimationFrame`;
- standard DOM cloning, computed styles, and a same-document iframe;
- readable same-origin or CORS-enabled visual assets.

`ResizeObserver` and `MutationObserver` improve automatic refresh but are not
hard requirements. When absent, call the controller's `refresh()` after
relevant changes.

## Capture differences

Soft Optics rasterizes HTML into a texture. Browser engines may differ in text
antialiasing, font timing, CSS feature serialization, maximum canvas size, and
GPU filtering. A successful page render does not guarantee that every resource
is origin-clean for canvas use.

Test the exact deployment origin. CDN images or fonts that appear normally can
still taint capture when they omit `Access-Control-Allow-Origin`.

## Mobile and embedded browsers

Mobile GPU memory and maximum texture sizes vary widely. The package caps DPR
at 2 and rejects captures over its fixed safety budget, but long pages may
still choose fallback. Embedded webviews may disable WebGL2 or backdrop
filtering independently of the underlying OS browser.

For constrained devices:

- scope `root` to reduce cloned DOM/content complexity, but note that this does
  not reduce the document-sized physical canvas in v0.1.0;
- shorten or paginate very long documents to stay inside the capture budget;
- keep page dimensions and image decode sizes reasonable;
- test both portrait and landscape;
- verify fallback is visually acceptable.

Only direct users of the lower-level `captureRoot()` can request a lower
`pixelRatio`. The controller does not expose capture DPR or budget overrides.

## Accessibility

The optical layers are `aria-hidden`, non-selectable, and
`pointer-events: none`. They do not replace source content. Fixed controls that
must remain clear should be excluded and stacked above the effect.

Reduced-motion preference selects fallback. The library does not pause page
animations or videos; applications remain responsible for their own motion and
accessibility policies.
