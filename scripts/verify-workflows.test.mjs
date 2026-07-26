import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  assertNoJobLevelUses,
  assertPublishablePackageManifest,
  assertTrustedActionReference,
  normalizeCondition
} from "./verify-workflows.mjs";

test("rejects mutable action tags", () => {
  assert.throws(
    () => assertTrustedActionReference("actions/checkout@v7", "fixture.yml"),
    /approved immutable action/
  );
});

test("rejects an unknown SHA for an approved action", () => {
  assert.throws(
    () =>
      assertTrustedActionReference(
        `actions/checkout@${"0".repeat(40)}`,
        "fixture.yml"
      ),
    /approved immutable action/
  );
});

test("normalizes multiline workflow conditions without weakening semantics", () => {
  assert.equal(
    normalizeCondition(`
      \${{ github.event_name == 'workflow_dispatch' &&
      github.ref == 'refs/heads/main' &&
      inputs.confirm == true }}
    `),
    "github.event_name == 'workflow_dispatch' && github.ref == " +
      "'refs/heads/main' && inputs.confirm == true"
  );
});

test("accepts stable semver package versions without pinning a release number", () => {
  assert.doesNotThrow(() =>
    assertPublishablePackageManifest(
      {
        name: "@blvdesign/example",
        version: "2.3.4",
        publishConfig: { access: "public", provenance: true }
      },
      "fixture/package.json"
    )
  );
});

test("rejects invalid or prerelease publishable package versions", () => {
  for (const version of [
    "next",
    "1.2",
    "01.2.3",
    "1.2.3-beta.1",
    "1.2.3+."
  ]) {
    assert.throws(
      () =>
        assertPublishablePackageManifest(
          {
            name: "@blvdesign/example",
            version,
            publishConfig: { access: "public", provenance: true }
          },
          "fixture/package.json"
        ),
      /stable semver/
    );
  }
});

test("rejects job-level reusable workflow references", () => {
  assert.throws(
    () =>
      assertNoJobLevelUses(
        {
          jobs: {
            publish: {
              uses: "owner/repository/.github/workflows/release.yml@main"
            }
          }
        },
        "fixture.yml"
      ),
    /job-level uses/
  );
});

test("GitHub workflows satisfy the repository security and release contract", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-workflows.mjs"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8"
    }
  );

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n")
  );
});
