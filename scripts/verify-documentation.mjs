import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const requiredDocuments = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs/architecture.md",
  "docs/browser-support.md",
  "docs/troubleshooting.md",
  "apps/demo/public/media/README.md"
];
const requiredReadmeTerms = [
  "https://blvdesign.github.io/SoftOpticsShader/",
  "@blvdesign/soft-optics",
  "@blvdesign/soft-optics-react",
  "createSoftOptics",
  "SoftOptics",
  "useSoftOptics",
  "data-soft-optics-live",
  "prefers-reduced-motion",
  "destroy()",
  "SOFT_OPTICS_CONFIG_RANGES",
  "MIT"
];
const expectedConfigRows = [
  ["enabled", "true", "boolean"],
  ["edges", '["top", "bottom"]', "top \\| bottom"],
  ["edgeHeight", "7", "0–20"],
  ["featherHeight", "2", "0–10"],
  ["maxBlur", "20", "0–64"],
  ["refraction", "3", "0–16"],
  ["chromaticAberration", "2", "0–8"],
  ["velocitySensitivity", "1.5", "0.1–10"],
  ["peakHoldMs", "100", "0–2,000"],
  ["decayMs", "800", "1–10,000"],
  ["oppositeEdgeResponse", "0.4", "0–1"],
  ["edgeFadeDistance", "36", "1–10,000"],
  ["presenceFloor", "0.68", "0–1"]
];
const requiredCaptureBudgetGuidance = {
  "README.md":
    "does not reduce the document-sized physical canvas or its capture-budget calculation",
  "docs/browser-support.md":
    "does not reduce the document-sized physical canvas in v0.1.0",
  "docs/troubleshooting.md":
    "A smaller custom root does not reduce this document-sized physical canvas"
};

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name.startsWith(".git")
      ) {
        return [];
      }
      return markdownFiles(path);
    }
    return extname(entry.name) === ".md" ? [path] : [];
  });
}

for (const documentPath of requiredDocuments) {
  const absolutePath = resolve(repositoryRoot, documentPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Required documentation is missing: ${documentPath}`);
  }
}

for (const [documentPath, guidance] of Object.entries(
  requiredCaptureBudgetGuidance
)) {
  const contents = readFileSync(
    resolve(repositoryRoot, documentPath),
    "utf8"
  );
  const normalizedContents = contents.replace(/\s+/gu, " ");
  if (!normalizedContents.includes(guidance)) {
    throw new Error(
      `${documentPath} does not state the custom-root capture-budget limitation.`
    );
  }
}

const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
for (const term of requiredReadmeTerms) {
  if (!readme.includes(term)) {
    throw new Error(`README.md does not document ${term}.`);
  }
}
for (const [name, defaultValue, range] of expectedConfigRows) {
  const row = readme
    .split("\n")
    .find((line) => line.includes(`| \`${name}\` |`));
  if (
    !row ||
    !row.includes(`| \`${defaultValue}\` |`) ||
    !row.includes(range)
  ) {
    throw new Error(
      `README.md has no exact config row for ${name} (${defaultValue}, ${range}).`
    );
  }
}

const localLinkPattern = /\[[^\]]*\]\((?!https?:|mailto:|#)([^)\s]+)\)/gu;
for (const markdownPath of markdownFiles(repositoryRoot)) {
  const markdown = readFileSync(markdownPath, "utf8");
  for (const match of markdown.matchAll(localLinkPattern)) {
    const target = match[1]?.split("#")[0];
    if (!target) continue;
    const absoluteTarget = resolve(dirname(markdownPath), target);
    if (!existsSync(absoluteTarget)) {
      throw new Error(
        `${markdownPath.slice(repositoryRoot.length + 1)} links to missing ${target}.`
      );
    }
  }
}

for (const example of ["vanilla-vite", "react-vite"]) {
  const exampleRoot = resolve(repositoryRoot, "examples", example);
  for (const sourcePath of [
    ...readdirSync(resolve(exampleRoot, "src"))
      .filter((name) => /\.(?:ts|tsx)$/u.test(name))
      .map((name) => resolve(exampleRoot, "src", name)),
    resolve(exampleRoot, "vite.config.ts")
  ]) {
    const source = readFileSync(sourcePath, "utf8");
    if (
      source.includes("../../packages/") ||
      source.includes("/src/index") ||
      /alias\s*:/u.test(source)
    ) {
      throw new Error(
        `${sourcePath.slice(repositoryRoot.length + 1)} bypasses package exports.`
      );
    }
  }
}

console.log(
  `Documentation: verified ${requiredDocuments.length} required files, ` +
  `${expectedConfigRows.length} config rows, local links, and consumer imports`
);
