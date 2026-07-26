import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const scriptPath = fileURLToPath(import.meta.url);

const workflowPaths = {
  ci: ".github/workflows/ci.yml",
  pages: ".github/workflows/pages.yml",
  release: ".github/workflows/release.yml"
};

const trustedActions = new Map([
  [
    "actions/checkout",
    {
      sha: "3d3c42e5aac5ba805825da76410c181273ba90b1",
      tag: "v7.0.1"
    }
  ],
  [
    "actions/setup-node",
    {
      sha: "820762786026740c76f36085b0efc47a31fe5020",
      tag: "v7.0.0"
    }
  ],
  [
    "pnpm/action-setup",
    {
      sha: "0ebf47130e4866e96fce0953f49152a61190b271",
      tag: "v6.0.9"
    }
  ],
  [
    "actions/upload-artifact",
    {
      sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      tag: "v7.0.1"
    }
  ],
  [
    "actions/configure-pages",
    {
      sha: "45bfe0192ca1faeb007ade9deae92b16b8254a0d",
      tag: "v6.0.0"
    }
  ],
  [
    "actions/deploy-pages",
    {
      sha: "cd2ce8fcbc39b97be8ca5fce6e763baed58fa128",
      tag: "v5.0.0"
    }
  ],
  [
    "actions/upload-pages-artifact",
    {
      sha: "fc324d3547104276b827a68afc52ff2a11cc49c9",
      tag: "v5.0.0"
    }
  ],
  [
    "changesets/action",
    {
      sha: "a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d",
      tag: "v1.9.0"
    }
  ]
]);

function actionReference(action) {
  const trusted = trustedActions.get(action);
  assert.ok(trusted, `No approved immutable action exists for ${action}`);
  return `${action}@${trusted.sha}`;
}

export function assertTrustedActionReference(reference, workflowPath) {
  const match = /^([^@]+)@([0-9a-f]{40})$/.exec(reference);
  const trusted = match ? trustedActions.get(match[1]) : undefined;
  assert.ok(
    match && trusted && trusted.sha === match[2],
    `${workflowPath}: ${reference} is not an approved immutable action`
  );
}

export function normalizeCondition(condition) {
  return String(condition)
    .trim()
    .replace(/^\$\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertNoJobLevelUses(workflow, workflowPath) {
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    assert.ok(
      !Object.hasOwn(job, "uses"),
      `${workflowPath}: job-level uses is forbidden (${jobName})`
    );
  }
}

export function assertPublishablePackageManifest(manifest, manifestPath) {
  assert.equal(
    typeof manifest.version,
    "string",
    `${manifestPath} version must be a stable semver string`
  );
  assert.match(
    manifest.version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    `${manifestPath} version must be a stable semver string`
  );
  assert.notEqual(
    manifest.private,
    true,
    `${manifestPath} must remain publishable`
  );
  assert.equal(
    manifest.publishConfig?.access,
    "public",
    `${manifestPath} must publish publicly`
  );
  assert.equal(
    manifest.publishConfig?.provenance,
    true,
    `${manifestPath} must publish with provenance`
  );
}

function readWorkflow(path) {
  const source = readFileSync(resolve(repositoryRoot, path), "utf8");
  const workflow = parse(source);
  assert.equal(
    typeof workflow,
    "object",
    `${path} must contain a YAML object`
  );
  return { path, source, workflow };
}

function stepsFor(workflow) {
  return Object.values(workflow.jobs ?? {}).flatMap(
    (job) => job.steps ?? []
  );
}

function runsFor(workflow) {
  return stepsFor(workflow)
    .map((step) => step.run)
    .filter((command) => typeof command === "string");
}

function actionStep(workflow, action) {
  return stepsFor(workflow).find(
    (step) => step.uses === actionReference(action)
  );
}

function assertOnlyTrustedActions(record) {
  for (const step of stepsFor(record.workflow)) {
    if (!step.uses) continue;
    assertTrustedActionReference(step.uses, record.path);
    const [action] = step.uses.split("@");
    const { tag } = trustedActions.get(action);
    const expectedLine = `uses: ${step.uses} # ${tag}`;
    assert.ok(
      record.source.includes(expectedLine),
      `${record.path}: ${step.uses} must retain its audited ${tag} comment`
    );
  }
}

function assertTriggerBranches(workflow, workflowName) {
  assert.ok(
    !Object.hasOwn(workflow.on ?? {}, "pull_request_target"),
    `${workflowName} must never use pull_request_target`
  );
  assert.deepEqual(
    workflow.on?.push?.branches,
    ["main"],
    `${workflowName} pushes must be restricted to main`
  );
}

function assertExactRuns(workflow, expected, workflowName) {
  assert.deepEqual(
    runsFor(workflow),
    expected,
    `${workflowName} commands changed; update the security contract intentionally`
  );
}

function assertNodeSetup(step, version, options = { cache: true }) {
  assert.ok(step, `Node ${version} setup step is missing`);
  assert.equal(String(step.with?.["node-version"]), version);
  if (options.cache) {
    assert.equal(step.with?.cache, "pnpm");
    assert.equal(step.with?.["package-manager-cache"], undefined);
  } else {
    assert.equal(step.with?.cache, undefined);
    assert.equal(step.with?.["package-manager-cache"], false);
  }
}

function assertPrivatePackages() {
  for (const path of [
    "apps/demo/package.json",
    "examples/react-vite/package.json",
    "examples/vanilla-vite/package.json"
  ]) {
    const manifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, path), "utf8")
    );
    assert.equal(manifest.private, true, `${path} must remain private`);
  }
}

function assertPackageContract() {
  const rootManifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8")
  );
  assert.equal(rootManifest.packageManager, "pnpm@10.34.5");
  assert.equal(
    rootManifest.scripts.check,
    "pnpm lint && pnpm test:versions && pnpm typecheck && pnpm build && " +
      "pnpm test:run:workspace && pnpm test:docs && " +
      "pnpm test:workflows && pnpm test:pack && pnpm test:e2e:run"
  );
  assert.equal(
    rootManifest.scripts["check:release"],
    "pnpm lint && pnpm test:versions && pnpm typecheck && pnpm build && " +
      "pnpm test:run:workspace && pnpm test:docs && " +
      "pnpm test:workflows && pnpm test:pack"
  );
  assert.equal(
    rootManifest.scripts["sync:versions"],
    "node scripts/sync-package-versions.mjs"
  );
  assert.equal(
    rootManifest.scripts["test:versions"],
    "node --test scripts/sync-package-versions.test.mjs && " +
      "node scripts/sync-package-versions.mjs --check"
  );
  assert.equal(
    rootManifest.scripts.version,
    "pnpm changeset version && pnpm sync:versions"
  );
  assert.equal(
    rootManifest.scripts.release,
    "pnpm changeset publish"
  );

  for (const path of [
    "packages/core/package.json",
    "packages/react/package.json"
  ]) {
    const manifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, path), "utf8")
    );
    assertPublishablePackageManifest(manifest, path);
  }
}

function assertCiContract(record) {
  const { source, workflow: ci } = record;
  assert.ok(
    Object.hasOwn(ci.on ?? {}, "pull_request"),
    "CI must run for pull requests"
  );
  assertTriggerBranches(ci, "CI");
  assert.deepEqual(ci.permissions, { contents: "read" });
  assert.deepEqual(ci.concurrency, {
    group: "ci-${{ github.workflow }}-${{ github.ref }}",
    "cancel-in-progress": true
  });
  assert.ok(
    !source.includes("secrets."),
    "CI pull-request workflows must not reference secrets"
  );
  assertExactRuns(
    ci,
    [
      "pnpm install --frozen-lockfile",
      "pnpm exec playwright install --with-deps chromium",
      "pnpm check"
    ],
    "CI"
  );
  assertNodeSetup(actionStep(ci, "actions/setup-node"), "20.19.0");
  const checkout = actionStep(ci, "actions/checkout");
  assert.equal(
    checkout?.with?.["fetch-depth"],
    0,
    "CI must fetch full history for Changesets divergence checks"
  );

  const artifacts = actionStep(ci, "actions/upload-artifact");
  assert.equal(normalizeCondition(artifacts?.if), "failure()");
  assert.deepEqual(
    String(artifacts?.with?.path)
      .trim()
      .split(/\s*\n\s*/),
    ["playwright-report/", "test-results/"]
  );
  assert.equal(artifacts?.with?.["if-no-files-found"], "ignore");
  assert.equal(artifacts?.with?.["retention-days"], 7);
}

function assertPagesContract(record) {
  const { source, workflow: pages } = record;
  assertTriggerBranches(pages, "Pages");
  assert.ok(
    Object.hasOwn(pages.on ?? {}, "workflow_dispatch"),
    "Pages must support manual retries"
  );
  assert.deepEqual(pages.permissions, {});
  assert.deepEqual(pages.concurrency, {
    group: "pages",
    "cancel-in-progress": false
  });
  assert.equal(
    normalizeCondition(pages.jobs.build.if),
    "github.ref == 'refs/heads/main'"
  );
  assert.equal(
    normalizeCondition(pages.jobs.deploy.if),
    "github.ref == 'refs/heads/main'"
  );
  assert.deepEqual(pages.jobs.build.permissions, { contents: "read" });
  assert.deepEqual(pages.jobs.deploy.permissions, {
    pages: "write",
    "id-token": "write"
  });
  assert.equal(pages.jobs.deploy.needs, "build");
  assert.deepEqual(pages.jobs.deploy.environment, {
    name: "github-pages",
    url: "${{ steps.deployment.outputs.page_url }}"
  });
  assertExactRuns(
    pages,
    [
      "pnpm install --frozen-lockfile",
      "pnpm --filter @soft-optics/demo build"
    ],
    "Pages"
  );
  assertNodeSetup(actionStep(pages, "actions/setup-node"), "20.19.0");
  assert.ok(actionStep(pages, "actions/configure-pages"));

  const build = stepsFor(pages).find(
    (step) => step.run === "pnpm --filter @soft-optics/demo build"
  );
  assert.deepEqual(build?.env, {
    GITHUB_ACTIONS: "true",
    VITE_BASE_PATH: "/SoftOpticsShader/"
  });
  const upload = actionStep(pages, "actions/upload-pages-artifact");
  assert.equal(upload?.with?.path, "apps/demo/dist");
  const deploy = actionStep(pages, "actions/deploy-pages");
  assert.equal(deploy?.id, "deployment");
  assert.ok(
    !source.includes("secrets."),
    "Pages must not reference repository secrets"
  );
}

function assertReleaseContract(record) {
  const { source, workflow: release } = record;
  assertTriggerBranches(release, "Release");
  assert.equal(
    Object.hasOwn(release.on ?? {}, "pull_request"),
    false,
    "Release credentials must not be exposed to pull-request events"
  );
  assert.deepEqual(release.permissions, {});
  assert.deepEqual(release.concurrency, {
    group: "release-${{ github.ref }}",
    "cancel-in-progress": false
  });

  const inputs = release.on?.workflow_dispatch?.inputs;
  assert.deepEqual(inputs?.confirm, {
    description: "Publish the current main branch packages to npm",
    required: true,
    type: "boolean",
    default: false
  });
  assert.deepEqual(inputs?.authentication, {
    description: "npm authentication method",
    required: true,
    type: "choice",
    default: "trusted-publishing",
    options: ["trusted-publishing", "token-fallback"]
  });
  assert.deepEqual(release.jobs.version.permissions, {
    contents: "write",
    "pull-requests": "write"
  });
  assert.deepEqual(release.jobs.publish.permissions, {
    contents: "read",
    "id-token": "write"
  });
  assert.equal(
    normalizeCondition(release.jobs.version.if),
    "github.event_name == 'push'"
  );
  assert.equal(
    normalizeCondition(release.jobs.publish.if),
    "github.event_name == 'workflow_dispatch' && " +
      "github.ref == 'refs/heads/main' && inputs.confirm == true"
  );
  assert.deepEqual(release.jobs.publish.environment, { name: "npm" });
  assert.deepEqual(
    release.jobs.version.steps.map((step) => step.name),
    [
      "Check out repository",
      "Set up pnpm",
      "Set up Node.js",
      "Install dependencies",
      "Create release pull request"
    ]
  );
  assert.deepEqual(
    release.jobs.publish.steps.map((step) => step.name),
    [
      "Check out repository",
      "Set up pnpm",
      "Set up Node.js",
      "Install dependencies",
      "Verify release",
      "Install trusted-publishing npm client",
      "Validate npm token fallback",
      "Publish with trusted publishing",
      "Publish with npm token fallback"
    ]
  );
  assert.deepEqual(runsFor({ jobs: { version: release.jobs.version } }), [
    "pnpm install --frozen-lockfile"
  ]);
  assert.deepEqual(runsFor({ jobs: { publish: release.jobs.publish } }), [
    "pnpm install --frozen-lockfile",
    "pnpm check:release",
    "npm install --global npm@11.18.0",
    'if [ -z "$NODE_AUTH_TOKEN" ]; then\n' +
      '  echo "::error::NPM_TOKEN is required for token fallback."\n' +
      "  exit 1\n" +
      "fi\n",
    "pnpm release",
    "pnpm release"
  ]);

  const setupNodes = stepsFor(release).filter(
    (step) => step.uses === actionReference("actions/setup-node")
  );
  assert.equal(setupNodes.length, 2);
  assertNodeSetup(setupNodes[0], "20.19.0");
  assertNodeSetup(setupNodes[1], "24", { cache: false });
  assert.equal(
    setupNodes[1].with?.["registry-url"],
    "https://registry.npmjs.org"
  );

  const versionAction = actionStep(release, "changesets/action");
  assert.equal(versionAction?.with?.version, "pnpm run version");
  assert.equal(release.jobs.publish.env, undefined);

  const verify = release.jobs.publish.steps.find(
    (step) => step.run === "pnpm check:release"
  );
  assert.equal(verify?.env, undefined);

  const tokenValidation = release.jobs.publish.steps.find(
    (step) => step.name === "Validate npm token fallback"
  );
  assert.equal(
    normalizeCondition(tokenValidation?.if),
    "inputs.authentication == 'token-fallback'"
  );
  assert.deepEqual(tokenValidation?.env, {
    NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}"
  });

  const trustedPublish = release.jobs.publish.steps.find(
    (step) => step.name === "Publish with trusted publishing"
  );
  assert.equal(
    normalizeCondition(trustedPublish?.if),
    "inputs.authentication == 'trusted-publishing'"
  );
  assert.deepEqual(trustedPublish?.env, {
    NPM_CONFIG_PROVENANCE: "true"
  });

  const tokenPublish = release.jobs.publish.steps.find(
    (step) => step.name === "Publish with npm token fallback"
  );
  assert.equal(
    normalizeCondition(tokenPublish?.if),
    "inputs.authentication == 'token-fallback'"
  );
  assert.deepEqual(tokenPublish?.env, {
    NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}",
    NPM_CONFIG_PROVENANCE: "true"
  });
  assert.equal(
    trustedPublish?.env?.NODE_AUTH_TOKEN,
    undefined,
    "Trusted publishing must not receive a long-lived npm token"
  );
  assert.equal(
    (source.match(/secrets\.NPM_TOKEN/g) ?? []).length,
    2,
    "NPM_TOKEN may only reach fallback validation and fallback publication"
  );
}

export function verifyRepositoryWorkflows() {
  const records = Object.fromEntries(
    Object.entries(workflowPaths).map(([key, path]) => [
      key,
      readWorkflow(path)
    ])
  );
  for (const record of Object.values(records)) {
    assertNoJobLevelUses(record.workflow, record.path);
    assertOnlyTrustedActions(record);
  }
  assertCiContract(records.ci);
  assertPagesContract(records.pages);
  assertReleaseContract(records.release);
  assertPrivatePackages();
  assertPackageContract();
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  verifyRepositoryWorkflows();
  console.log("GitHub workflow contract verified.");
}
