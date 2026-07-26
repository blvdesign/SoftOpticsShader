# Architecture

Soft Optics is split into a framework-independent runtime, a React lifecycle
adapter, and an original demo. The portfolio implementation that inspired the
project is not a dependency and no portfolio selectors or content are present
in the packages.

## Workspace boundaries

```text
packages/core   configuration, capture, motion, WebGL2, fallback, controller
packages/react  React component and hook over the core controller
apps/demo       editorial test page and tuning UI
examples        clean Vanilla and React Vite consumers
tests           browser, fallback, live-video, alpha, and visual coverage
```

`@blvdesign/soft-optics` has no React dependency. It imports safely in Node or
another SSR runtime because browser globals are resolved only when the
controller is mounted. `@blvdesign/soft-optics-react` keeps React and React DOM
as peers and externalizes the core package in its build.

## Controller lifecycle

`createSoftOptics(options)` creates inert state. `mount()` resolves the root and
layer parent, installs lifecycle observers/listeners, selects WebGL or fallback,
captures the root, and renders the first optical frame. Multiple mount calls
share one promise.

A scheduler owns:

- one RAF at a time for scroll motion and relevant live-video updates;
- an 80 ms debounced capture refresh;
- one active capture and at most one queued follow-up invalidation;
- listener cleanup.

Resize and mutation observers are optional. Image loads, font readiness, and
explicit `refresh()` calls request a new capture. Disable or destroy aborts an
active capture so stale results cannot restore the effect.

`destroy()` is idempotent. It cancels scheduling and capture work, disconnects
observers, removes listeners and DOM layers, destroys sources and fallbacks,
and deletes WebGL textures, framebuffers, shaders, programs, and contexts.

## Static capture

The capture system constructs a hidden same-document iframe mirror:

1. clone the selected root while stripping scripts, event-handler attributes,
   compositor internals, and user exclusions;
2. replace video, iframe, object, and embed content with inert placeholders;
3. copy and rebase readable stylesheets and wait for linked stylesheets within
   a bounded timeout;
4. wait up to 750 ms for source and mirror fonts;
5. rasterize with `modern-screenshot`;
6. verify dimensions, non-empty pixels, and origin-clean readback;
7. dispose the mirror.

The output represents document coordinates with origin `{ x: 0, y: 0 }`.
Capture DPR is capped at 2. Hard defaults reject either physical dimension over
16,384 or a total over 64 million pixels. Capture and security failures are
values in the fallback state machine, not uncaught page failures.

For a non-body custom root, the mirror can contain less cloned content, but its
stabilized output still uses full document-coordinate dimensions. This keeps
edge sampling coordinates consistent, and means a custom root does not reduce
the physical canvas or capture-budget calculation in v0.1.0.

## Edge geometry

Top and bottom use independent fixed canvases. The visible optical zone is
`edgeHeight + featherHeight` viewport-height units. Geometry includes
overscan derived from blur, refraction, and dispersion. The top canvas extends
above zero and the bottom strip extends around the lower viewport boundary;
only the processed visible area is clipped. Document capture bounds are
clamped and missing source area is padded.

Texture DPR is clamped to 1–2. The outer physical pixel remains inside the
processed field, preventing the clear seam that a non-overscanned backdrop
layer can expose.

## Three-pass renderer

Each edge renderer allocates one source texture and two ping-pong framebuffer
textures:

1. horizontal Gaussian blur;
2. vertical Gaussian blur;
3. final optical composite.

The final shader evaluates a continuous edge field per fragment, applies
directional refraction, and samples red, green, and blue at separate offsets.
Output is premultiplied alpha. Source UVs clamp inside the overscanned texture;
clipping happens only after processing.

`resize()` reuses allocations when physical dimensions are unchanged.
Compilation, allocation, upload, source-size, and context-loss errors
permanently transition that renderer to fallback.

## Scroll response

Scroll delta is normalized by elapsed time and `velocitySensitivity`, then
shaped into a 0–1 impulse. Direction selects the leading edge; the other edge
receives `oppositeEdgeResponse`. Near the document start or end, presence moves
between `presenceFloor` and full strength over `edgeFadeDistance`.

New peaks are held for `peakHoldMs`; idle frames decay exponentially to about
5% over `decayMs`. A direction reversal replaces the prior directional peak.
Reduced-motion mode bypasses the model and chooses fallback before rendering.

## Live-video compositing

The static capture never snapshots the real video element. At render time,
opted-in videos are inspected. A frame is admitted only if it is ready,
origin-clean, topmost at sampled points, and uses compositing states the
renderer can reproduce. Mapping covers supported `object-fit` and
`object-position` behavior plus rounded/overflow clips.

Only admitted frames intersecting an edge source strip are drawn into that
strip before upload. Dynamic video keeps the RAF active while it intersects an
edge. The source video's playback state is read-only.

## Fallback

The fallback creates one fixed layer per configured edge using a continuous
CSS mask and `backdrop-filter`. It shares height, edge selection, enabled state,
parent, and z-index with the controller. It intentionally omits displacement
and dispersion. With neither WebGL2 nor backdrop-filter, no visual layer is
left behind.

## React adapter

`useSoftOptics()` stores the controller in a stable ref. An effect owns
construction, mount, and destroy. A second effect forwards preset/config
changes through `update()`. Creation-time option changes recreate the
controller. Callback indirection keeps `onStatusChange` fresh without
recreating runtime resources.

`<SoftOptics />` only invokes the hook and returns `null`.
