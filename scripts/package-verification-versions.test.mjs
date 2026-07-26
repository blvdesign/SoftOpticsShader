import assert from "node:assert/strict";
import test from "node:test";

import {
  pinImporterVersions
} from "./package-verification-versions.mjs";

test("pins external consumer dependencies to exact lockfile versions", () => {
  const manifest = {
    dependencies: {
      "@blvdesign/soft-optics": "workspace:^",
      react: "^19.2.8",
      "react-dom": "^19.2.8"
    },
    devDependencies: {
      "@types/node": "^20.19.43",
      "@vitejs/plugin-react": "^5.2.0",
      vite: "^7.3.6"
    }
  };
  const importer = {
    dependencies: {
      "@blvdesign/soft-optics": {
        specifier: "workspace:^",
        version: "link:../../packages/core"
      },
      react: { specifier: "^19.2.8", version: "19.2.8" },
      "react-dom": {
        specifier: "^19.2.8",
        version: "19.2.8(react@19.2.8)"
      }
    },
    devDependencies: {
      "@types/node": {
        specifier: "^20.19.43",
        version: "20.19.43"
      },
      "@vitejs/plugin-react": {
        specifier: "^5.2.0",
        version:
          "5.2.0(vite@7.3.6(@types/node@20.19.43)(yaml@2.9.0))"
      },
      vite: {
        specifier: "^7.3.6",
        version: "7.3.6(@types/node@20.19.43)(yaml@2.9.0)"
      }
    }
  };

  pinImporterVersions(
    manifest,
    importer,
    new Set(["@blvdesign/soft-optics"])
  );

  assert.deepEqual(manifest, {
    dependencies: {
      "@blvdesign/soft-optics": "workspace:^",
      react: "19.2.8",
      "react-dom": "19.2.8"
    },
    devDependencies: {
      "@types/node": "20.19.43",
      "@vitejs/plugin-react": "5.2.0",
      vite: "7.3.6"
    }
  });
});

test("fails when an external manifest dependency is absent from the importer", () => {
  assert.throws(
    () =>
      pinImporterVersions(
        { dependencies: { vite: "^7.3.6" } },
        { dependencies: {} },
        new Set()
      ),
    /vite is missing from the committed lockfile importer/
  );
});

test("fails when an external dependency has no immutable registry version", () => {
  assert.throws(
    () =>
      pinImporterVersions(
        { dependencies: { react: "^19.2.8" } },
        {
          dependencies: {
            react: {
              specifier: "^19.2.8",
              version: "link:../../react"
            }
          }
        },
        new Set()
      ),
    /react does not resolve to an immutable registry version/
  );
});
