import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const scriptPath = fileURLToPath(import.meta.url);

export const PACKAGE_VERSION_TARGETS = Object.freeze([
  Object.freeze({
    exportName: "SOFT_OPTICS_VERSION",
    manifestPath: "packages/core/package.json",
    sourcePath: "packages/core/src/version.ts"
  }),
  Object.freeze({
    exportName: "SOFT_OPTICS_REACT_VERSION",
    manifestPath: "packages/react/package.json",
    sourcePath: "packages/react/src/version.ts"
  })
]);

function stableVersion(manifest, manifestPath) {
  assert.equal(
    typeof manifest.version,
    "string",
    `${manifestPath} must contain a stable semver version`
  );
  assert.match(
    manifest.version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    `${manifestPath} must contain a stable semver version`
  );
  return manifest.version;
}

function expectedSource(repositoryRoot, target) {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, target.manifestPath), "utf8")
  );
  const version = stableVersion(manifest, target.manifestPath);
  return `export const ${target.exportName} = ${JSON.stringify(version)};\n`;
}

export function syncPackageVersions({
  repositoryRoot = defaultRepositoryRoot,
  targets = PACKAGE_VERSION_TARGETS
} = {}) {
  for (const target of targets) {
    writeFileSync(
      resolve(repositoryRoot, target.sourcePath),
      expectedSource(repositoryRoot, target)
    );
  }
}

export function verifyPackageVersions({
  repositoryRoot = defaultRepositoryRoot,
  targets = PACKAGE_VERSION_TARGETS
} = {}) {
  for (const target of targets) {
    const expected = expectedSource(repositoryRoot, target);
    const actual = readFileSync(
      resolve(repositoryRoot, target.sourcePath),
      "utf8"
    );
    assert.equal(
      actual,
      expected,
      `${target.sourcePath} is out of sync with ${target.manifestPath}`
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  if (process.argv.includes("--check")) {
    verifyPackageVersions();
    console.log("Runtime package versions are synchronized.");
  } else {
    syncPackageVersions();
    console.log("Runtime package versions synchronized.");
  }
}
