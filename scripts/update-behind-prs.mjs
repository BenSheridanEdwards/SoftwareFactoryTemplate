#!/usr/bin/env node
/**
 * Bring every open pull request that is behind main up to date (ADR 0129).
 *
 * `.github/workflows/update-behind-prs.yml` runs this module from main through
 * `actions/github-script` on every push to main. For each open, ready, same-repo,
 * human-authored PR into main that is behind it, it asks GitHub to merge main into
 * the PR branch (update-branch, merge method). A push made with the workflow's
 * GITHUB_TOKEN starts no `pull_request` run, so the module then dispatches each
 * workflow that reports a required check on that branch, and the enforcement gate
 * on main, so the new head is judged and an unchanged sign-off carries to it.
 * A PR that conflicts with main, or whose update GitHub refuses, gets one comment
 * asking for a manual update.
 *
 * `planUpdate` is the pure selection rule. `run` is the thin GitHub shell.
 */

/** Marks the one comment this module keeps on a PR it could not update. */
export const NOTICE_MARKER = '<!-- update-behind-prs -->';

/** The author of the comments the workflow writes. */
export const NOTICE_AUTHOR = 'github-actions[bot]';

/**
 * The workflows to dispatch after an update. `onMain` runs main's copy, as the
 * enforcement gate must; the rest run on the PR branch, like a `pull_request` run.
 */
export const DISPATCHES = [
  { workflow: 'ci.yml', onMain: false, withPr: false },
  { workflow: 'codeql.yml', onMain: false, withPr: false },
  { workflow: 'lighthouse.yml', onMain: false, withPr: false },
  { workflow: 'visual.yml', onMain: false, withPr: false },
  { workflow: 'pr-quality.yml', onMain: false, withPr: true },
  { workflow: 'enforcement-approval.yml', onMain: true, withPr: true },
];

/** How long to wait for GitHub to compute mergeability or write the merge commit. */
const POLL = { attempts: 20, delayMs: 3000 };

/**
 * @typedef {{
 *   number: number,
 *   draft: boolean,
 *   user: { login: string, type: string },
 *   head: { sha: string, ref: string, repo: { full_name: string } | null },
 *   base: { ref: string },
 * }} PullRequest
 * @typedef {{ action: 'update' | 'notify' | 'skip', reason: string }} Plan
 */

/**
 * Decide what to do with one open PR. Pure.
 *
 * @param {{ pullRequest: PullRequest, behindBy: number, mergeable: boolean | null, repository: string, defaultBranch: string }} facts
 *   `behindBy` counts main's commits the head lacks; `mergeable` is GitHub's
 *   answer, `null` while it is still computing.
 * @returns {Plan}
 */
export function planUpdate({ pullRequest, behindBy, mergeable, repository, defaultBranch }) {
  if (pullRequest.base.ref !== defaultBranch) {
    return { action: 'skip', reason: `targets ${pullRequest.base.ref}, not ${defaultBranch}` };
  }
  if (pullRequest.draft) return { action: 'skip', reason: 'is a draft' };
  if (pullRequest.head.repo?.full_name !== repository) {
    return { action: 'skip', reason: 'comes from a fork the workflow token cannot push to' };
  }
  if (pullRequest.user.type === 'Bot') {
    return { action: 'skip', reason: 'is opened by a bot that keeps its own branch current' };
  }
  if (behindBy === 0) return { action: 'skip', reason: `is up to date with ${defaultBranch}` };
  if (mergeable === false) {
    return {
      action: 'notify',
      reason: conflictNotice(defaultBranch),
    };
  }
  if (mergeable === null) {
    return { action: 'skip', reason: 'has no mergeability from GitHub yet' };
  }
  return { action: 'update', reason: `is ${behindBy} commit(s) behind ${defaultBranch}` };
}

/** @param {string} defaultBranch */
function conflictNotice(defaultBranch) {
  return (
    `This pull request is behind \`${defaultBranch}\` and conflicts with it, so it cannot be ` +
    'brought up to date automatically. It needs a manual rebase: rebase it on ' +
    `\`${defaultBranch}\` (or merge \`${defaultBranch}\` into it), resolve the conflicts, and push.`
  );
}

/** @param {string} defaultBranch @param {string} message */
function refusedNotice(defaultBranch, message) {
  return (
    `This pull request is behind \`${defaultBranch}\`, and GitHub refused the automatic update: ` +
    `${message.replace(/\s+/g, ' ').trim()} Press **Update branch**, or merge ` +
    `\`${defaultBranch}\` into it and push.`
  );
}

/**
 * The comment body for a PR this module could not update.
 *
 * @param {string} reason
 */
export function noticeBody(reason) {
  return `${NOTICE_MARKER}\n${reason}\n`;
}

/** @param {{ user?: { login?: string } | null, body?: string | null }} comment */
const isNotice = (comment) =>
  comment.user?.login === NOTICE_AUTHOR && String(comment.body ?? '').startsWith(NOTICE_MARKER);

/** @param {number} ms */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask until `read` returns a value `done` accepts, or give up.
 *
 * @template T
 * @param {() => Promise<T>} read @param {(value: T) => boolean} done
 * @param {(ms: number) => Promise<unknown>} sleep @param {number} attempts
 * @returns {Promise<T>}
 */
async function poll(read, done, sleep, attempts = POLL.attempts) {
  const value = await read();
  if (done(value) || attempts <= 1) return value;
  await sleep(POLL.delayMs);
  return poll(read, done, sleep, attempts - 1);
}

/**
 * @typedef {{ github: any, repo: { owner: string, repo: string }, number: number, defaultBranch: string, sleep: (ms: number) => Promise<unknown>, core: any }} Shell
 */

/**
 * Read one PR as it is now and plan it. Only a behind PR waits for GitHub's
 * mergeability answer.
 *
 * @param {Shell} shell
 */
async function readPlan({ github, repo, number, defaultBranch, sleep }) {
  const read = () => github.rest.pulls.get({ ...repo, pull_number: number });
  const { data: first } = await read();
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
    ...repo,
    basehead: `${defaultBranch}...${first.head.sha}`,
  });
  const waits = comparison.behind_by > 0 && first.mergeable === null;
  const current = waits
    ? (await poll(read, ({ data }) => data.mergeable !== null, sleep)).data
    : first;
  const plan = planUpdate({
    pullRequest: current,
    behindBy: comparison.behind_by,
    mergeable: current.mergeable,
    repository: `${repo.owner}/${repo.repo}`,
    defaultBranch,
  });
  return { plan, head: current.head.sha };
}

/**
 * Ask GitHub to merge main into the PR at `head`. Returns whether it accepted.
 * A head that moved is left to its own push's checks; any other refusal gets the notice.
 *
 * @param {Shell} shell @param {string} head
 */
async function requestUpdate({ github, repo, number, defaultBranch, core }, head) {
  try {
    await github.rest.pulls.updateBranch({ ...repo, pull_number: number, expected_head_sha: head });
    return true;
  } catch (error) {
    if (error?.status !== 422) throw error;
    const message = String(error.message ?? error);
    if (/expected head sha/i.test(message)) {
      core.info(`#${number} moved while it was being updated; its own push runs its checks.`);
    } else {
      await notify({ github, repo, number, reason: refusedNotice(defaultBranch, message) });
    }
    return false;
  }
}

/**
 * Wait for the merge commit, then dispatch every check for it.
 *
 * @param {Shell} shell @param {string} head the head before the update
 */
async function dispatchChecks({ github, repo, number, defaultBranch, sleep, core }, head) {
  const read = () => github.rest.pulls.get({ ...repo, pull_number: number });
  const { data: updated } = await poll(read, ({ data }) => data.head.sha !== head, sleep);
  if (updated.head.sha === head) {
    throw new Error(`#${number}: GitHub accepted the update but the head did not move in time.`);
  }
  await Promise.all(
    DISPATCHES.map(({ workflow, onMain, withPr }) =>
      github.rest.actions.createWorkflowDispatch({
        ...repo,
        workflow_id: workflow,
        ref: onMain ? defaultBranch : updated.head.ref,
        inputs: withPr ? { pr: String(number) } : {},
      }),
    ),
  );
  core.info(`#${number} updated to ${updated.head.sha}; dispatched its checks.`);
}

/**
 * Bring one PR up to date and dispatch its checks, or leave the one notice.
 *
 * @param {Shell} shell
 */
async function handle(shell) {
  const { github, repo, number, core } = shell;
  const { plan, head } = await readPlan(shell);
  core.info(`#${number} ${plan.reason}: ${plan.action}`);
  if (plan.action === 'notify') {
    await notify({ github, repo, number, reason: plan.reason });
  }
  if (plan.action !== 'update' || !(await requestUpdate(shell, head))) return;
  await dispatchChecks(shell, head);
  await clearNotices({ github, repo, number });
}

/**
 * Post the notice once: an existing notice stays as it is.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, reason: string }} input
 */
async function notify({ github, repo, number, reason }) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });
  if (comments.some(isNotice)) return;
  await github.rest.issues.createComment({
    ...repo,
    issue_number: number,
    body: noticeBody(reason),
  });
}

/**
 * Remove the notice once the PR is current, so a later conflict gets a fresh one.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number }} input
 */
async function clearNotices({ github, repo, number }) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });
  await Promise.all(
    comments
      .filter(isNotice)
      .map((comment) => github.rest.issues.deleteComment({ ...repo, comment_id: comment.id })),
  );
}

/**
 * The `actions/github-script` entry point. `inputs.pr`, when a person dispatches
 * the workflow with it, limits the run to that one PR.
 *
 * @param {{ github: any, context: any, core: any, sleep?: (ms: number) => Promise<unknown> }} input
 */
export async function run({ github, context, core, sleep = pause }) {
  const repo = context.repo;
  const defaultBranch = context.payload.repository.default_branch;
  const only = String(context.payload.inputs?.pr ?? '').trim();
  if (only !== '' && !/^[1-9]\d*$/.test(only)) {
    throw new Error(`inputs.pr must be a pull request number, got ${JSON.stringify(only)}.`);
  }
  const pullRequests =
    only === ''
      ? await github.paginate(github.rest.pulls.list, {
          ...repo,
          state: 'open',
          base: defaultBranch,
          per_page: 100,
        })
      : [(await github.rest.pulls.get({ ...repo, pull_number: Number(only) })).data];

  const results = await Promise.allSettled(
    pullRequests.map((pullRequest) =>
      handle({ github, repo, number: pullRequest.number, defaultBranch, sleep, core }),
    ),
  );
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [`#${pullRequests[index].number}: ${result.reason?.message ?? result.reason}`]
      : [],
  );
  if (failures.length > 0) {
    core.setFailed(`Could not bring every behind PR up to date:\n${failures.join('\n')}`);
  }
}
