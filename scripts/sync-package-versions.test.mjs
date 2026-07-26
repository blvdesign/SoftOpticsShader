import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  syncPackageVersions,
  verifyPackageVersions
} from "./sync-package-versions.mjs";

test("synchronizes runtime exports deterministically from package manifests", () => {
  const root = mkdtempSync(join(tmpdir(), "soft-optics-version-sync-"));
  const packageDirectory = join(root, "packages/example");
  const sourceDirectory = join(packageDirectory, "src");
  const targets = [
    {
      exportName: "EXAMPLE_VERSION",
      manifestPath: "packages/example/package.json",
      sourcePath: "packages/example/src/version.ts"
    }
  ];

  try {
    mkdirSync(sourceDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, "package.json"),
      `${JSON.stringify(
        { name: "@example/package", version: "2.3.4" },
        null,
        2
      )}\n`
    );
    writeFileSync(
      join(sourceDirectory, "version.ts"),
      'export const EXAMPLE_VERSION = "0.1.0";\n'
    );

    assert.throws(
      () => verifyPackageVersions({ repositoryRoot: root, targets }),
      /out of sync/
    );
    syncPackageVersions({ repositoryRoot: root, targets });
    assert.equal(
      readFileSync(join(sourceDirectory, "version.ts"), "utf8"),
      'export const EXAMPLE_VERSION = "2.3.4";\n'
    );
    assert.doesNotThrow(() =>
      verifyPackageVersions({ repositoryRoot: root, targets })
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
