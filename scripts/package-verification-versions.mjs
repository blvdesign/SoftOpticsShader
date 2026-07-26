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
