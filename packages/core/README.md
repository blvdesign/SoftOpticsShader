# @blvdesign/soft-optics

Framework-agnostic viewport-edge blur, refraction, and color dispersion.

```sh
pnpm add @blvdesign/soft-optics
```

```ts
import { createSoftOptics } from "@blvdesign/soft-optics";

const optics = createSoftOptics({
  exclude: "[data-soft-optics-ignore]",
  layer: { zIndex: 40 }
});

await optics.mount();

// Later:
optics.update({ maxBlur: 24 });
await optics.refresh();
optics.destroy();
```

The package is safe to import during SSR. Browser work begins only at
`mount()`. WebGL2 provides the full effect; unsupported or reduced-motion
environments use a continuous CSS blur fallback when available.

See the
[complete integration guide](https://github.com/blvdesign/SoftOpticsShader#readme),
[browser support](https://github.com/blvdesign/SoftOpticsShader/blob/main/docs/browser-support.md),
and
[troubleshooting](https://github.com/blvdesign/SoftOpticsShader/blob/main/docs/troubleshooting.md).

Licensed under the MIT License.
