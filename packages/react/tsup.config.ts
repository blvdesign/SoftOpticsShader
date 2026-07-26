import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  external: ["@blvdesign/soft-optics", "react", "react/jsx-runtime"],
  format: ["esm", "cjs"],
  sourcemap: true,
  splitting: false,
  treeshake: true
});
