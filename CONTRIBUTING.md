# Contributing

Thanks for helping improve Soft Optics Shader.

## Local development

This repository requires Node.js 20.19 or newer and pnpm 10.

```bash
corepack enable
pnpm install
pnpm check
```

Run the demo locally with:

```bash
pnpm dev
```

## Changesets and releases

Add a changeset for every user-facing package change:

```bash
pnpm changeset
```

Choose the affected package(s), select the semver impact, and write a concise
consumer-facing summary. Documentation-only changes that do not affect a
published package can use an empty changeset when the pull-request policy
requires one.

Maintainers prepare versions with `pnpm changeset version`, inspect generated
package/changelog changes, and run `pnpm check`. Publication is performed by
the protected repository release workflow; never commit npm tokens or place
them in example environment files.

## Pull requests

- Keep changes focused and document user-facing behavior.
- Add or update tests when behavior changes.
- Run `pnpm check` before opening a pull request.
- Do not commit credentials, generated reports, or local environment files.

By contributing, you agree that your contributions are licensed under the MIT
License.
