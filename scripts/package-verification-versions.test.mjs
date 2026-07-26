import assert from "node:assert/strict";
import test from "node:test";

import {
  addPackedArchivesToConsumerLockfile,
  createConsumerLockfile,
  pinImporterVersions,
  pinnedWorkspaceDependencyOverrides
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

test("creates a minimal consumer lockfile with external resolutions", () => {
  const workspaceLock = {
    lockfileVersion: "9.0",
    settings: { autoInstallPeers: true },
    importers: {
      "examples/vanilla-vite": {}
    },
    packages: {
      "vite@7.3.6": {
        resolution: { integrity: "sha512-example" }
      }
    },
    snapshots: {
      "vite@7.3.6": {}
    }
  };
  const importer = {
    dependencies: {
      "@blvdesign/soft-optics": {
        specifier: "workspace:^",
        version: "link:../../packages/core"
      }
    },
    devDependencies: {
      vite: {
        specifier: "^7.3.6",
        version: "7.3.6"
      }
    }
  };
  const manifest = {
    dependencies: {
      "@blvdesign/soft-optics": "file:/tmp/soft-optics.tgz"
    },
    devDependencies: {
      vite: "7.3.6"
    }
  };

  const consumerLock = createConsumerLockfile(
    workspaceLock,
    importer,
    manifest,
    new Set(["@blvdesign/soft-optics"])
  );

  assert.deepEqual(consumerLock.importers, {
    ".": {
      dependencies: {},
      devDependencies: {
        vite: {
          specifier: "7.3.6",
          version: "7.3.6"
        }
      }
    }
  });
  assert.equal(
    consumerLock.packages["vite@7.3.6"].resolution.integrity,
    "sha512-example"
  );
  assert.notEqual(consumerLock, workspaceLock);
});

test("pins publishable package dependencies from their lockfile importers", () => {
  const overrides = pinnedWorkspaceDependencyOverrides(
    {
      importers: {
        "packages/core": {
          dependencies: {
            "modern-screenshot": {
              specifier: "^4.7.0",
              version: "4.7.0"
            }
          }
        },
        "packages/react": {
          dependencies: {
            "@blvdesign/soft-optics": {
              specifier: "workspace:^",
              version: "link:../core"
            }
          }
        }
      }
    },
    [
      {
        directory: "packages/core",
        manifest: {
          dependencies: {
            "modern-screenshot": "^4.7.0"
          }
        }
      },
      {
        directory: "packages/react",
        manifest: {
          dependencies: {
            "@blvdesign/soft-optics": "workspace:^"
          }
        }
      }
    ],
    new Set(["@blvdesign/soft-optics"])
  );

  assert.deepEqual(overrides, {
    "modern-screenshot": "4.7.0"
  });
});

test("adds local tarball packages and peer snapshots without registry metadata", () => {
  const lockfile = {
    lockfileVersion: "9.0",
    importers: {
      ".": {
        dependencies: {
          react: { specifier: "19.2.8", version: "19.2.8" },
          "react-dom": {
            specifier: "19.2.8",
            version: "19.2.8(react@19.2.8)"
          }
        }
      }
    },
    packages: {},
    snapshots: {}
  };
  const manifest = {
    dependencies: {
      "@blvdesign/soft-optics": "file:../artifacts/core.tgz",
      "@blvdesign/soft-optics-react":
        "file:../artifacts/react.tgz",
      react: "19.2.8",
      "react-dom": "19.2.8"
    },
    pnpm: {
      overrides: {
        "@blvdesign/soft-optics":
          "file:../artifacts/core.tgz",
        "modern-screenshot": "4.7.0"
      }
    }
  };
  const archives = [
    {
      fileSpecifier: "file:../artifacts/core.tgz",
      integrity: "sha512-core",
      manifest: {
        dependencies: { "modern-screenshot": "^4.7.0" },
        engines: { node: ">=20.19.0" },
        name: "@blvdesign/soft-optics",
        version: "0.1.0"
      }
    },
    {
      fileSpecifier: "file:../artifacts/react.tgz",
      integrity: "sha512-react",
      manifest: {
        dependencies: {
          "@blvdesign/soft-optics": "^0.1.0"
        },
        engines: { node: ">=20.19.0" },
        name: "@blvdesign/soft-optics-react",
        peerDependencies: {
          react: ">=19.0.0 <20",
          "react-dom": ">=19.0.0 <20"
        },
        version: "0.1.0"
      }
    }
  ];

  addPackedArchivesToConsumerLockfile(
    lockfile,
    manifest,
    archives
  );

  const coreKey =
    "@blvdesign/soft-optics@file:../artifacts/core.tgz";
  const reactKey =
    "@blvdesign/soft-optics-react@file:../artifacts/react.tgz";
  const reactSnapshotKey =
    `${reactKey}(react-dom@19.2.8(react@19.2.8))` +
    "(react@19.2.8)";
  assert.equal(
    lockfile.importers["."].dependencies[
      "@blvdesign/soft-optics-react"
    ].version,
    "file:../artifacts/react.tgz" +
      "(react-dom@19.2.8(react@19.2.8))(react@19.2.8)"
  );
  assert.deepEqual(lockfile.packages[coreKey], {
    engines: { node: ">=20.19.0" },
    resolution: {
      integrity: "sha512-core",
      tarball: "file:../artifacts/core.tgz"
    },
    version: "0.1.0"
  });
  assert.deepEqual(lockfile.snapshots[coreKey], {
    dependencies: {
      "modern-screenshot": "4.7.0"
    }
  });
  assert.deepEqual(lockfile.snapshots[reactSnapshotKey], {
    dependencies: {
      "@blvdesign/soft-optics":
        "file:../artifacts/core.tgz",
      react: "19.2.8",
      "react-dom": "19.2.8(react@19.2.8)"
    }
  });
  assert.deepEqual(lockfile.overrides, manifest.pnpm.overrides);
});
