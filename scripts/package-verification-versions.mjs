const dependencyKinds = [
  "dependencies",
  "devDependencies",
  "optionalDependencies"
];

function exactRegistryVersion(lockedVersion) {
  const resolved = String(lockedVersion).split("(")[0];
  if (
    resolved.length === 0 ||
    /^(?:file|link|workspace):/u.test(resolved)
  ) {
    return undefined;
  }
  return resolved;
}

export function pinImporterVersions(
  manifest,
  importer,
  localPackageNames
) {
  for (const dependencyKind of dependencyKinds) {
    for (const dependencyName of Object.keys(
      manifest[dependencyKind] ?? {}
    )) {
      if (localPackageNames.has(dependencyName)) continue;

      const locked = importer[dependencyKind]?.[dependencyName];
      if (!locked) {
        throw new Error(
          `${dependencyName} is missing from the committed lockfile importer.`
        );
      }
      const exactVersion = exactRegistryVersion(locked.version);
      if (!exactVersion) {
        throw new Error(
          `${dependencyName} does not resolve to an immutable registry version.`
        );
      }
      manifest[dependencyKind][dependencyName] = exactVersion;
    }
  }
  return manifest;
}

export function createConsumerLockfile(
  workspaceLock,
  importer,
  manifest,
  localPackageNames
) {
  const consumerImporter = structuredClone(importer);
  for (const dependencyKind of dependencyKinds) {
    for (const dependencyName of Object.keys(
      consumerImporter[dependencyKind] ?? {}
    )) {
      if (
        localPackageNames.has(dependencyName) ||
        !manifest[dependencyKind]?.[dependencyName]
      ) {
        delete consumerImporter[dependencyKind][dependencyName];
        continue;
      }
      const manifestSpecifier =
        manifest[dependencyKind]?.[dependencyName];
      if (typeof manifestSpecifier !== "string") {
        throw new Error(
          `${dependencyName} is missing from the consumer manifest.`
        );
      }
      consumerImporter[dependencyKind][dependencyName].specifier =
        manifestSpecifier;
    }
  }

  return {
    ...structuredClone(workspaceLock),
    importers: {
      ".": consumerImporter
    }
  };
}

export function pinnedWorkspaceDependencyOverrides(
  workspaceLock,
  workspacePackages,
  localPackageNames
) {
  const overrides = {};
  for (const workspacePackage of workspacePackages) {
    const importer =
      workspaceLock.importers?.[workspacePackage.directory];
    if (!importer) {
      throw new Error(
        `${workspacePackage.directory} is missing from the committed lockfile.`
      );
    }
    for (const dependencyName of Object.keys(
      workspacePackage.manifest.dependencies ?? {}
    )) {
      if (localPackageNames.has(dependencyName)) continue;
      const locked = importer.dependencies?.[dependencyName];
      const exactVersion = exactRegistryVersion(locked?.version);
      if (!exactVersion) {
        throw new Error(
          `${dependencyName} does not have an immutable package dependency resolution.`
        );
      }
      overrides[dependencyName] = exactVersion;
    }
  }
  return overrides;
}

function importerResolution(importer, dependencyName) {
  for (const dependencyKind of dependencyKinds) {
    const resolution = importer[dependencyKind]?.[dependencyName];
    if (resolution) return resolution.version;
  }
  return undefined;
}

export function addPackedArchivesToConsumerLockfile(
  lockfile,
  manifest,
  archives
) {
  const importer = lockfile.importers["."];
  const archiveByName = new Map(
    archives.map((archive) => [archive.manifest.name, archive])
  );
  lockfile.overrides = structuredClone(
    manifest.pnpm?.overrides ?? {}
  );

  for (const archive of archives) {
    const { fileSpecifier, integrity } = archive;
    const packedManifest = archive.manifest;
    const dependencyKind = dependencyKinds.find(
      (kind) => manifest[kind]?.[packedManifest.name]
    );
    if (!dependencyKind) continue;

    const peerNames = Object.keys(
      packedManifest.peerDependencies ?? {}
    ).sort().reverse();
    const peerSuffix = peerNames
      .map((peerName) => {
        const version = importerResolution(importer, peerName);
        if (!version) {
          throw new Error(
            `${packedManifest.name} peer ${peerName} is not locked by the consumer.`
          );
        }
        return `(${peerName}@${version})`;
      })
      .join("");
    importer[dependencyKind] ??= {};
    importer[dependencyKind][packedManifest.name] = {
      specifier: fileSpecifier,
      version: `${fileSpecifier}${peerSuffix}`
    };

    const packageKey = `${packedManifest.name}@${fileSpecifier}`;
    lockfile.packages[packageKey] = {
      resolution: {
        integrity,
        tarball: fileSpecifier
      },
      version: packedManifest.version
    };
    if (packedManifest.engines) {
      lockfile.packages[packageKey].engines =
        structuredClone(packedManifest.engines);
    }
    if (packedManifest.peerDependencies) {
      lockfile.packages[packageKey].peerDependencies =
        structuredClone(packedManifest.peerDependencies);
    }

    const snapshotDependencies = {};
    for (const dependencyName of Object.keys(
      packedManifest.dependencies ?? {}
    )) {
      const localArchive = archiveByName.get(dependencyName);
      const lockedVersion =
        localArchive?.fileSpecifier ??
        manifest.pnpm?.overrides?.[dependencyName];
      if (!lockedVersion) {
        throw new Error(
          `${packedManifest.name} dependency ${dependencyName} has no offline resolution.`
        );
      }
      snapshotDependencies[dependencyName] = lockedVersion;
    }
    for (const peerName of peerNames) {
      snapshotDependencies[peerName] =
        importerResolution(importer, peerName);
    }
    lockfile.snapshots[`${packageKey}${peerSuffix}`] = {
      dependencies: snapshotDependencies
    };
  }
  return lockfile;
}
