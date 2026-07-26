import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  join,
  relative,
  resolve
} from "node:path";
import { fileURLToPath } from "node:url";
import { list as listTar } from "tar";
import {
  parse as parseYaml,
  stringify as stringifyYaml
} from "yaml";

import {
  addPackedArchivesToConsumerLockfile,
  createConsumerLockfile,
  pinImporterVersions,
  pinnedWorkspaceDependencyOverrides
} from "./package-verification-versions.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const verificationRoot = mkdtempSync(
  join(tmpdir(), "soft-optics-package-verification-")
);
const artifactsDirectory = join(verificationRoot, "artifacts");
const workspaceLock = parseYaml(
  readFileSync(resolve(repositoryRoot, "pnpm-lock.yaml"), "utf8")
);
const workspaceManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8")
);
const expectedPackageFiles = [
  "package/LICENSE",
  "package/README.md",
  "package/dist/index.cjs",
  "package/dist/index.cjs.map",
  "package/dist/index.d.cts",
  "package/dist/index.d.ts",
  "package/dist/index.js",
  "package/dist/index.js.map",
  "package/package.json"
];
const packageDirectories = ["packages/core", "packages/react"];
const packages = packageDirectories.map((directory) => {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, directory, "package.json"), "utf8")
  );
  return {
    directory,
    manifest,
    name: manifest.name,
    version: manifest.version,
    versionExport:
      directory === "packages/core"
        ? "SOFT_OPTICS_VERSION"
        : "SOFT_OPTICS_REACT_VERSION"
  };
});
const corePackage = packages.find(
  (workspacePackage) =>
    workspacePackage.name === "@blvdesign/soft-optics"
);
const reactPackage = packages.find(
  (workspacePackage) =>
    workspacePackage.name === "@blvdesign/soft-optics-react"
);
if (!corePackage || !reactPackage) {
  throw new Error("Core and React package manifests must be present.");
}
const reactCoreSpecifier =
  reactPackage.manifest.dependencies?.[corePackage.name];
if (reactCoreSpecifier !== "workspace:^") {
  throw new Error(
    `${reactPackage.name} must depend on ${corePackage.name} through workspace:^.`
  );
}

function expectedPublishedDependencies(workspacePackage) {
  const dependencies = {
    ...(workspacePackage.manifest.dependencies ?? {})
  };
  if (workspacePackage === reactPackage) {
    dependencies[corePackage.name] = `^${corePackage.version}`;
  }
  return dependencies;
}

function run(command, args, cwd, stdio = "inherit") {
  return execFileSync(command, args, {
    cwd,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    stdio
  });
}

function sameRecord(actual = {}, expected = {}) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(actual).sort())
  ) === JSON.stringify(
    Object.fromEntries(Object.entries(expected).sort())
  );
}

async function readArchive(archivePath) {
  const files = new Map();
  await listTar({
    file: archivePath,
    onReadEntry(entry) {
      if (entry.type !== "File") {
        entry.resume();
        return;
      }
      const chunks = [];
      entry.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      entry.on("end", () => {
        files.set(entry.path, Buffer.concat(chunks));
      });
    }
  });
  return files;
}

function normalizedArchiveText(files, archiveFile) {
  const contents = files.get(archiveFile);
  if (!contents) {
    throw new Error(`Tarball is missing ${archiveFile}.`);
  }
  return contents.toString("utf8").replace(/\r\n?/gu, "\n");
}

async function verifyArchive(workspacePackage, archivePath) {
  const archive = await readArchive(archivePath);
  const packageFiles = [...archive.keys()].sort();

  if (JSON.stringify(packageFiles) !== JSON.stringify(expectedPackageFiles)) {
    const missing = expectedPackageFiles.filter(
      (file) => !packageFiles.includes(file)
    );
    const unexpected = packageFiles.filter(
      (file) => !expectedPackageFiles.includes(file)
    );
    throw new Error(
      `${workspacePackage.name} tarball contents differ from the allowlist.` +
      ` Missing: ${missing.join(", ") || "none"}.` +
      ` Unexpected: ${unexpected.join(", ") || "none"}.`
    );
  }

  const license = normalizedArchiveText(
    archive,
    "package/LICENSE"
  );
  const readme = normalizedArchiveText(
    archive,
    "package/README.md"
  );
  const packageJson = JSON.parse(
    normalizedArchiveText(archive, "package/package.json")
  );

  if (!license.startsWith("MIT License\n")) {
    throw new Error(
      `${workspacePackage.name} tarball does not contain the MIT License.`
    );
  }
  if (!readme.startsWith(`# ${workspacePackage.name}\n`)) {
    throw new Error(
      `${workspacePackage.name} tarball does not contain its package README.`
    );
  }
  if (packageJson.name !== workspacePackage.name) {
    throw new Error(
      `${workspacePackage.name} tarball publishes the wrong package name.`
    );
  }
  if (packageJson.version !== workspacePackage.version) {
    throw new Error(
      `${workspacePackage.name} tarball publishes ${packageJson.version}, ` +
      `expected ${workspacePackage.version}.`
    );
  }
  const expectedDependencies =
    expectedPublishedDependencies(workspacePackage);
  if (!sameRecord(packageJson.dependencies, expectedDependencies)) {
    throw new Error(
      `${workspacePackage.name} publishes unexpected dependencies: ` +
      JSON.stringify(packageJson.dependencies ?? {})
    );
  }
  if (
    !sameRecord(
      packageJson.peerDependencies,
      workspacePackage.manifest.peerDependencies ?? {}
    )
  ) {
    throw new Error(
      `${workspacePackage.name} publishes unexpected peer dependencies: ` +
      JSON.stringify(packageJson.peerDependencies ?? {})
    );
  }
  if (JSON.stringify(packageJson).includes("workspace:")) {
    throw new Error(
      `${workspacePackage.name} tarball contains an unresolved workspace dependency.`
    );
  }

  const rootExport = packageJson.exports?.["."];
  for (const condition of ["types", "import", "require"]) {
    const exportPath = rootExport?.[condition];
    if (typeof exportPath !== "string") {
      throw new Error(
        `${workspacePackage.name} has no ${condition} root export.`
      );
    }
    const archivedExportPath =
      `package/${exportPath.replace(/^\.\//, "")}`;
    if (!packageFiles.includes(archivedExportPath)) {
      throw new Error(
        `${workspacePackage.name} ${condition} export is absent from its tarball.`
      );
    }
  }

  const forbidden = packageFiles.filter((file) =>
    /(?:^|\/)(?:src|test|tests|apps|demo|portfolio)(?:\/|\.|$)/i.test(file)
  );
  if (forbidden.length > 0) {
    throw new Error(
      `${workspacePackage.name} tarball contains forbidden project files: ` +
      forbidden.join(", ")
    );
  }

  console.log(
    `${workspacePackage.name}: verified ${packageFiles.length} exact tarball files`
  );
  return packageJson;
}

async function packPackages() {
  const archives = new Map();

  for (const workspacePackage of packages) {
    rmSync(resolve(repositoryRoot, workspacePackage.directory, "dist"), {
      force: true,
      recursive: true
    });
    const before = new Set(readdirSync(artifactsDirectory));
    run(
      "pnpm",
      [
        "--filter",
        workspacePackage.name,
        "pack",
        "--pack-destination",
        artifactsDirectory
      ],
      repositoryRoot,
      "pipe"
    );
    const archiveName = readdirSync(artifactsDirectory).find(
      (entry) => entry.endsWith(".tgz") && !before.has(entry)
    );
    if (!archiveName) {
      throw new Error(`No tarball was created for ${workspacePackage.name}.`);
    }
    const archivePath = join(artifactsDirectory, archiveName);
    const packedManifest = await verifyArchive(
      workspacePackage,
      archivePath
    );
    archives.set(workspacePackage.name, {
      archivePath,
      manifest: packedManifest
    });
  }

  return archives;
}

function installAndBuildExample(exampleName, archives) {
  const source = resolve(repositoryRoot, "examples", exampleName);
  const consumer = join(verificationRoot, `consumer-${exampleName}`);
  cpSync(source, consumer, {
    recursive: true,
    filter: (sourcePath) =>
      !["dist", "node_modules", "pnpm-lock.yaml"].includes(
        basename(sourcePath)
      )
  });

  const manifestPath = join(consumer, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.packageManager = workspaceManifest.packageManager;
  delete manifest.devDependencies?.vite;
  delete manifest.devDependencies?.["@vitejs/plugin-react"];
  manifest.scripts = {
    build: "tsc --noEmit"
  };
  const tsconfigPath = join(consumer, "tsconfig.json");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  tsconfig.compilerOptions.types = ["node"];
  tsconfig.include = ["src"];
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(tsconfig, null, 2)}\n`
  );
  writeFileSync(
    join(consumer, "src", "import-meta.d.ts"),
    [
      "interface ImportMeta {",
      "  readonly hot?: {",
      "    dispose(callback: () => void): void;",
      "  };",
      "}",
      ""
    ].join("\n")
  );
  const importer =
    workspaceLock.importers?.[`examples/${exampleName}`];
  if (!importer) {
    throw new Error(
      `${exampleName} is not represented in the committed pnpm lockfile.`
    );
  }
  pinImporterVersions(
    manifest,
    importer,
    new Set(archives.keys())
  );
  manifest.pnpm ??= {};
  manifest.pnpm.overrides ??= {};
  Object.assign(
    manifest.pnpm.overrides,
    pinnedWorkspaceDependencyOverrides(
      workspaceLock,
      packages,
      new Set(archives.keys())
    )
  );
  manifest.pnpm.onlyBuiltDependencies = ["esbuild"];
  const localArchives = [...archives.values()].map((archive) => ({
    ...archive,
    fileSpecifier: `file:${relative(
      consumer,
      archive.archivePath
    ).replaceAll("\\", "/")}`,
    integrity:
      "sha512-" +
      createHash("sha512")
        .update(readFileSync(archive.archivePath))
        .digest("base64")
  }));
  for (const [packageName, archive] of archives) {
    if (manifest.dependencies?.[packageName]) {
      const fileSpecifier = localArchives.find(
        (candidate) => candidate.archivePath === archive.archivePath
      ).fileSpecifier;
      manifest.dependencies[packageName] = fileSpecifier;
      manifest.pnpm.overrides[packageName] =
        fileSpecifier;
    }
  }
  const consumerLock = createConsumerLockfile(
    workspaceLock,
    importer,
    manifest,
    new Set(archives.keys())
  );
  addPackedArchivesToConsumerLockfile(
    consumerLock,
    manifest,
    localArchives
  );
  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  writeFileSync(
    join(consumer, "pnpm-lock.yaml"),
    stringifyYaml(consumerLock)
  );

  run(
    "pnpm",
    [
      "install",
      "--ignore-workspace",
      "--offline",
      "--no-frozen-lockfile",
      "--config.registry=https://registry.npmjs.org"
    ],
    consumer
  );

  for (const packageName of Object.keys(manifest.dependencies ?? {})) {
    if (!packageName.startsWith("@blvdesign/soft-optics")) continue;
    const installedPath = realpathSync(
      join(consumer, "node_modules", packageName)
    );
    if (installedPath.startsWith(repositoryRoot)) {
      throw new Error(
        `${exampleName} resolved ${packageName} to the workspace instead of a tarball.`
      );
    }
  }

  const installedReport = JSON.parse(
    run(
      "pnpm",
      ["list", "--depth=0", "--json", "--ignore-workspace"],
      consumer,
      "pipe"
    )
  )[0];
  for (const dependencyKind of [
    "dependencies",
    "devDependencies"
  ]) {
    for (const dependencyName of Object.keys(
      manifest[dependencyKind] ?? {}
    )) {
      const locked = importer[dependencyKind]?.[dependencyName];
      if (!locked) {
        throw new Error(
          `${exampleName} has no locked ${dependencyName}.`
        );
      }
      const installed =
        installedReport?.[dependencyKind]?.[dependencyName];
      if (!installed) {
        throw new Error(
          `${exampleName} did not install locked ${dependencyName}.`
        );
      }
      const lockedVersion =
        archives.get(dependencyName)?.manifest.version ??
        String(locked.version).split("(")[0];
      if (installed.version !== lockedVersion) {
        throw new Error(
          `${exampleName} installed ${dependencyName}@${installed.version}, ` +
          `but the committed lockfile resolves ${lockedVersion}.`
        );
      }
    }
  }

  run("pnpm", ["build"], consumer);

  const installedSoftOpticsPackages = Object.keys(
    manifest.dependencies ?? {}
  ).filter((name) => name.startsWith("@blvdesign/soft-optics"));
  for (const packageName of installedSoftOpticsPackages) {
    const workspacePackage = packages.find(
      (candidate) => candidate.name === packageName
    );
    const packedVersion = archives.get(packageName)?.manifest.version;
    if (!workspacePackage || typeof packedVersion !== "string") {
      throw new Error(
        `${exampleName} has no packed version contract for ${packageName}.`
      );
    }
    const versionExport = workspacePackage.versionExport;
    const esmProbe =
      `const value = await import(${JSON.stringify(packageName)});` +
      `if (value[${JSON.stringify(versionExport)}] !== ` +
      `${JSON.stringify(packedVersion)}) { ` +
      `throw new Error(${JSON.stringify(
        `${packageName} ESM runtime version does not match its packed manifest`
      )}); }`;
    const cjsProbe =
      `const value = require(${JSON.stringify(packageName)});` +
      `if (value[${JSON.stringify(versionExport)}] !== ` +
      `${JSON.stringify(packedVersion)}) { ` +
      `throw new Error(${JSON.stringify(
        `${packageName} CJS runtime version does not match its packed manifest`
      )}); }`;
    run("node", ["--input-type=module", "--eval", esmProbe], consumer);
    run("node", ["--eval", cjsProbe], consumer);
  }

  console.log(
    `${exampleName}: installed ${installedSoftOpticsPackages.length} ` +
    "package tarball(s), built, and matched ESM/CJS runtime versions"
  );
}

const cleanup = () => {
  rmSync(verificationRoot, { force: true, recursive: true });
};
process.once("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.once("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

try {
  mkdirSync(artifactsDirectory, { recursive: true });
  const archives = await packPackages();
  installAndBuildExample("vanilla-vite", archives);
  installAndBuildExample("react-vite", archives);
} finally {
  cleanup();
}
