# Repository policy

## Pi compatibility and releases

- Target only the latest stable npm release of `@earendil-works/pi-coding-agent`. Resolve `@latest` again before each release. Do not maintain an older-version test matrix or add compatibility code solely for old Pi releases.
- Run `npm test` before release. Its `pretest` runs `test:pi`, which installs the latest validation dependencies under `tmp/` with `--ignore-scripts` before checking Pi. `npm run test:unit` is a dependency-free unit-only check, not a release check.
- After successful checks, update the standalone README line `Tested against Pi <version>` with the exact version actually tested on every release. Put Node versions and validation scope in the next paragraph. Never claim an unrun browser, terminal, or end-to-end check. A peer minimum is not a promise that every later version has been tested.
- Keep this root `AGENTS.md` tracked and committed. Do not bump versions, publish, or push unless requested.
- Keep validation dependencies and temporary output under root `tmp/`. Do not ship them or add a Pi runtime dependency to a static theme or browser download.

## Code quality

- Remove dead code, unused imports, and unused dependencies in the area you change. Keep responsibilities separate and fix root causes with simple, consistent changes. Avoid duplicated logic and unnecessary abstractions. Do not mix unrelated refactors into a fix.
- Keep files focused and normally under 350 lines. Explain exceptions in the change description; do not split cohesive data or existing test fixtures just to satisfy a count.
- Validate external input at its boundary. Keep configuration explicit and separate from logic. Never commit secrets, credentials, local settings, or generated validation output.
- Add regression tests for changed behavior. Run available tests and the stack-specific checks below. If a linter or type checker is not configured, say so rather than claiming it passed.
- Remove stale or irrelevant docs and comments. Keep useful ones accurate, short, clear, and human-friendly, including commands and validation limits. Explain non-obvious decisions rather than restating code. Apply `unslop` and `write-prompts` skills when available.
- Preserve unrelated local changes. Stage only your own edits and inspect the staged diff before committing.

## Stack-specific checks

This is plain browser JavaScript, HTML, and CSS. Keep palette/export logic in `src/palette.js`, hit testing in `src/preview.js`, picker behavior in `src/color-picker.js`, and DOM/storage/download wiring in `app.js`.
Run `npm run check` for JavaScript syntax and `npm test` for unit behavior plus representative exported JSON against Pi's real validator and loader. There is no configured lint or typecheck tool. Browser interaction and visual fidelity need separate manual checks.
Existing larger test files are accepted until a related change warrants a focused split; do not rewrite unrelated user work.
