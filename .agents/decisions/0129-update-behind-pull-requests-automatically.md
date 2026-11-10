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

Four facts shape the design:

- A push made with a workflow's `GITHUB_TOKEN` starts no `pull_request` or
  `pull_request_target` run. A merge commit made that way would leave the new
  head with no required checks and no enforcement gate run. `GITHUB_TOKEN` may
  still start `workflow_dispatch` runs.
- Branch protection matches a required check by name and app. Every job in a
  GitHub Actions run reports a check run with its job name on the commit the run
  is for, whatever event started it. A `workflow_dispatch` run on a branch is
  for that branch's head.
- `GITHUB_TOKEN` never holds the `workflows` permission, and GitHub refuses an
  app's push that changes a file under `.github/workflows/`.
- The PR body names its head commit and the last North Star commit at that head
  (ADR 0029, ADR 0057). On 10 November, after updates from main, the
  `PR quality` check failed on two PRs because the head had moved past the body.

## Decision

**A workflow updates behind PRs on every push to main.**
`update-behind-prs.yml` runs main's `scripts/update-behind-prs.mjs`. For each
open PR into main it compares the head with main and asks GitHub whether it
merges cleanly, then:

- skips a draft, a PR from a fork (the token cannot push there), and a PR opened
  by a bot (Dependabot keeps its own branch current and stops once another
  account pushes to it);
- leaves a PR that is up to date alone, and removes any earlier notice from it,
  however it got there;
- comments once on a PR that conflicts with main, saying it needs a manual
  rebase;
- comments once, without trying, when main's new commits change a file under
  `.github/workflows/` or list too many files to tell, because the token may not
  push that change;
- otherwise calls update-branch with the head it judged, so a push made in the
  meantime wins and is judged by its own run. Update-branch answers before it
  writes the merge commit, so the script waits for the head to move; a head
  that never moves gets the notice and fails the run.

**It merges main into the PR branch.** Update-branch's merge method makes one
merge commit and rewrites nothing. A rebase would rewrite every commit the
author and the reviewers already hold, force their local branches to reset,
and change the SHAs that the PR body, review comments and the sign-off name.
Rewriting also loses the sign-off: ADR 0122 carries a tick only to a head whose
PR still lists the ticked commit. On 10 November a PR was ticked at one head
and rebased onto main nine seconds later; its guard fingerprint was identical,
but the ticked commit was no longer in the PR, so the gate asked again. A merge
keeps the ticked commit in the PR, and is squashed away when the PR merges, so
linear history on main is unaffected.

**It dispatches the new head's checks.** After the head moves, the script
dispatches `ci.yml`, `codeql.yml`, `lighthouse.yml`, `visual.yml` and
`pr-quality.yml` on the PR branch, and `enforcement-approval.yml` on main with
the PR number. Their jobs report the names branch protection requires on the
new head, so no personal token or GitHub App is needed. `pnpm gates:check`
fails when a workflow that reports a required check, or the enforcement gate,
is missing from `DISPATCHES` or has no `workflow_dispatch` trigger. Where a
dispatched run differs from a `pull_request` run:

- It checks out the branch head, not GitHub's test merge, so `HEAD^1` is the
  old PR head. Changed-file coverage and blast-radius evidence compare the
  branch with `origin/main` instead. The docs-only and Lighthouse scope scripts
  treat any event other than `pull_request` as a full run, so every lane, the
  audits and the screenshots run.
- The `Branch contains main` lane applies only to `pull_request` and is skipped.
  Strict branch protection still refuses to merge a head that lacks main.
- `pr-quality.yml` reads the title, body and branch from the API on both events.
  A dispatch fails unless it names, by number, the open PR whose head is this
  branch.
- The enforcement gate runs only from the default branch, so main's script
  judges the PR, exactly as on a PR event, and carries an unchanged sign-off by
  ADR 0122's fingerprint.

**The PR body check accepts a clean merge from main; nothing rewrites the
body.** The validator accepts a `- Head commit:` that names an earlier head when
every later commit on the first-parent chain is a clean merge from main: two
parents, the second contained in main, and a tree identical to the tree Git's
own merge of those parents writes. Such a merge adds main's reviewed commits
and nothing of the PR's own, so what the author checked still describes the
PR. The validator reads `- North Star commit:` at that named commit too, so a
North Star change arriving from main does not ask the author to restate it.
Rewriting the fields instead would make the body claim a re-check no one did,
and the workflow would need to edit PR bodies. A merge that also edits the PR,
any ordinary commit, and a rebase still need the body re-checked. The PRD
fields stay judged at the merged head: an update that brings a main-side edit
to a PRD this PR cites, or to its `Covers` globs, still asks the author to look.

## Consequences

The maintainer ticks a PR once; when main moves, the PR is brought up to date,
its checks run on the new head, its body stays valid, and the tick carries
unless a guarded file changed. An author must pull before pushing again to a
branch the workflow updated, and should merge main rather than rebase when
updating by hand, so the tick and the body stay valid.

When main's new commits change a workflow file, the PR gets the one comment
asking for **Update branch**, and a person pressing it starts the normal
`pull_request` runs. The PR that adds this workflow changes several workflows,
so the first run after it merges comments on every behind PR. Closing this gap
needs a GitHub App installation token with Contents, Pull requests and
Workflows write, stored as a secret; that is a separate decision.

Every dispatched update runs the full CI, CodeQL, Lighthouse and visual lanes,
without the docs-only and UI-scope savings. The merge confidence label grades
only `pull_request` runs, so it keeps its last grade until the next push.

This decision applies from the moment it is on main: the push trigger and the
enforcement gate's dispatch run main's copies.
