import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const workspaceSource = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base:
    process.env["VITE_BASE_PATH"] ??
    (process.env["GITHUB_ACTIONS"] ? "/SoftOpticsShader/" : "/"),
  plugins: [react()],
  resolve: {
    alias: {
      "@blvdesign/soft-optics": workspaceSource(
        "../../packages/core/src/index.ts"
      ),
      "@blvdesign/soft-optics-react": workspaceSource(
        "../../packages/react/src/index.ts"
      )
    }
  }
});
