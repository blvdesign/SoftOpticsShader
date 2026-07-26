# @blvdesign/soft-optics-react

React bindings for the Soft Optics Shader framework-agnostic core.

```sh
pnpm add @blvdesign/soft-optics @blvdesign/soft-optics-react
```

```tsx
import { SoftOptics } from "@blvdesign/soft-optics-react";

export function App() {
  return (
    <>
      <header data-soft-optics-ignore>Navigation</header>
      <main>Page content</main>
      <SoftOptics
        preset="default"
        exclude="[data-soft-optics-ignore]"
      />
    </>
  );
}
```

Choose `preset="default"` or `preset="subtle"`. Values supplied through
`config` override the selected preset. The component renders `null`, mounts the
core controller in an effect, updates config in place, and destroys the
controller on unmount. `useSoftOptics()` returns a stable ref for imperative
`refresh()`, `setEnabled()`, or status access.

React and React DOM 19 are peer dependencies. Imports and server rendering are
safe; the effect begins only in the client effect.

See the
[complete integration guide](https://github.com/blvdesign/SoftOpticsShader#readme)
and
[troubleshooting](https://github.com/blvdesign/SoftOpticsShader/blob/main/docs/troubleshooting.md).

Licensed under the MIT License.
