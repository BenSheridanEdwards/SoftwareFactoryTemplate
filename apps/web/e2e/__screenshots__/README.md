# Visual baselines

These are the twelve Linux Chromium baselines for `../visual.spec.ts`.
To update on Linux, run `pnpm e2e:install`, then `pnpm visual:update`.
Inspect every changed PNG, commit it with the UI change, and rerun `pnpm visual`.
CI only compares and uploads `visual-differences` on a failure.

Last refresh: Playwright 1.61.0 with its pinned Chromium headless shell, for the Tailwind restyle on the `@repo/ui` tokens (ADR 0114). These six images are the hosted runner's own `*-actual.png` captures from the `Visual regression` job's `visual-differences` artifact, so they match CI byte for byte. Captures from arm64 Linux containers and other hosts differ from the runner by a few thousand anti-aliased glyph pixels. When a local capture fails on CI, inspect and commit the runner images from that artifact. The job stops at the first mismatch, so a full refresh can take one push per screen state.
For low-memory capture, build and run the production preview separately on port 5173, then update and compare:
```sh
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --update-snapshots --workers=1
VISUAL=1 E2E_BUILD=1 E2E_BASE_URL=http://127.0.0.1:5173 node --max-old-space-size=128 node_modules/@playwright/test/cli.js test --workers=1
```

To-do refresh: the six `todos-*.png` images are the hosted ubuntu-latest runner captures from Visual regression run 43486851914, artifact `visual-differences`, copied from the first attempts in `test-results/` without changing their bytes. The six greeting images are unchanged.
