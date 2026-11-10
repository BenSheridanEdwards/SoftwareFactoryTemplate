# 129. Update behind pull requests automatically

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-10
- **Amends:** [0029](0029-pr-body-names-its-head-commit.md),
  [0122](0122-sign-off-follows-the-guarded-changes.md)

## Context

Branch protection on `main` is strict: a PR must contain main before it can
merge. The maintainer ticked an enforcement sign-off on a PR that had fallen
behind main after another PR merged, so it could not merge, and asked for
automatic updates. The repository is user-owned, so GitHub's merge queue is not
available. The repository setting that shows **Update branch** is on.

Three facts shape the design:

- A push made with a workflow's `GITHUB_TOKEN` starts no `pull_request` or
  `pull_request_target` run. A merge commit made that way would leave the new
  head with no required checks and no enforcement gate run. `GITHUB_TOKEN` may
  still start `workflow_dispatch` runs.
- Branch protection matches a required check by name and app. Every job in a
  GitHub Actions run reports a check run with its job name on the commit the run
  is for, whatever event started it. A `workflow_dispatch` run on a branch is
  for that branch's head.
- The PR body names its head commit (ADR 0029). Any new head, including a merge
  from main, failed the body check until the author edited the body.

## Decision

**A workflow updates behind PRs on every push to main.**
`update-behind-prs.yml` runs main's `scripts/update-behind-prs.mjs`. For each
open PR into main it asks GitHub whether the head is behind main and whether it
merges cleanly, then:

- skips a draft, a PR from a fork (the token cannot push there), a PR opened by
  a bot (Dependabot keeps its own branch current and stops once another account
  pushes to it), and a PR that is up to date;
- comments once on a PR that conflicts with main, saying it needs a manual
  rebase, and deletes that comment after a later successful update;
- otherwise calls update-branch with the head it judged, so a push made in the
  meantime wins and is judged by its own run.

**It merges main into the PR branch.** Update-branch's merge method makes one
merge commit and rewrites nothing. A rebase would rewrite every commit the
author and the reviewers already hold, force their local branches to reset,
and change the SHAs that the PR body, review comments and the sign-off name.
The merge keeps those intact and is squashed away when the PR merges, so linear
history on main is unaffected.

**It dispatches the new head's checks.** After the head moves, the script
dispatches `ci.yml`, `codeql.yml`, `lighthouse.yml`, `visual.yml` and
`pr-quality.yml` on the PR branch, and `enforcement-approval.yml` on main with
the PR number. Their jobs report the names branch protection requires on the
new head, so no personal token or GitHub App is needed. Where a dispatched run
differs from a `pull_request` run:

- It checks out the branch head, not GitHub's test merge, so `HEAD^1` is the
  old PR head. Changed-file coverage and blast-radius evidence compare the
  branch with `origin/main` instead. The docs-only and Lighthouse scope scripts
  treat any event other than `pull_request` as a full run, so every lane, the
  audits and the screenshots run.
- The `Branch contains main` lane applies only to `pull_request` and is skipped.
  Strict branch protection still refuses to merge a head that lacks main.
- `pr-quality.yml` reads the title, body and branch from the API on both events,
  and a dispatch fails unless the PR it names has this branch as its head.
- The enforcement gate runs only from the default branch, so main's script
  judges the PR, exactly as on a PR event, and carries an unchanged sign-off by
  ADR 0122's fingerprint.

**A clean merge from main keeps the body current.** The PR body validator
accepts a `- Head commit:` that names an earlier head when every later commit
on the first-parent chain is a clean merge from main: two parents, the second
contained in main, and a tree identical to the tree Git's own merge of those
parents writes. It reads the North Star field at that named commit. Any other
commit, including a merge that also edits the PR, still needs the body
re-checked.

## Consequences

The maintainer ticks a PR once; when main moves, the PR is brought up to date,
its checks run on the new head, and the tick carries unless a guarded file
changed. An author must pull before pushing again to a branch the workflow
updated.

GitHub refuses a `GITHUB_TOKEN` push that changes a file under
`.github/workflows/`, so when main's new commits change a workflow file the
update is refused and the PR gets the one comment asking for **Update branch**.
A person pressing it starts the normal `pull_request` runs. Closing this gap
needs a GitHub App installation token with Contents, Pull requests and
Workflows write, stored as a secret; that is a separate decision.

Every dispatched update runs the full CI, CodeQL, Lighthouse and visual lanes,
without the docs-only and UI-scope savings. The merge confidence label grades
only `pull_request` runs, so it keeps its last grade until the next push.
A workflow that starts reporting a new required check must be added to
`DISPATCHES` in `scripts/update-behind-prs.mjs` and given a `workflow_dispatch`
trigger.

This decision applies from the moment it is on main: the push trigger and the
enforcement gate's dispatch run main's copies.
