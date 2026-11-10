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
 * A PR the token cannot update gets one comment asking for a manual update.
 *
 * `planUpdate` is the pure selection rule. `updateBehindPrs` is the thin GitHub shell.
 * `node scripts/update-behind-prs.mjs --dry-run [<pr>]` prints the plan for
 * each open PR, read through `gh api`, and writes nothing.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Marks the one comment this module keeps on a PR it could not update. */
export const NOTICE_MARKER = '<!-- update-behind-prs -->';

/** The author of the comments the workflow writes. */
export const NOTICE_AUTHOR = 'github-actions[bot]';

/**
 * The workflows to dispatch after an update. `onMain` runs main's copy, as the
 * enforcement gate must; the rest run on the PR branch, like a `pull_request` run.
 * `pnpm gates:check` fails when a workflow that reports a required check is missing.
 */
export const DISPATCHES = [
  { workflow: 'ci.yml', onMain: false, withPr: false },
  { workflow: 'codeql.yml', onMain: false, withPr: false },
  { workflow: 'lighthouse.yml', onMain: false, withPr: false },
  { workflow: 'visual.yml', onMain: false, withPr: false },
  { workflow: 'pr-quality.yml', onMain: false, withPr: true },
  { workflow: 'enforcement-approval.yml', onMain: true, withPr: true },
];

/** GitHub lists at most this many files in a comparison. */
const COMPARE_FILES_LIMIT = 300;

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
 * @typedef {{ action: 'update' | 'notify' | 'current' | 'skip', reason: string }} Plan
 *   `current` is up to date: any earlier notice is removed.
 */

/**
 * @typedef {{ pullRequest: PullRequest, behindBy: number, mergeable: boolean | null, changesWorkflows: boolean, repository: string, defaultBranch: string }} Facts
 *   `behindBy` counts main's commits the head lacks; `mergeable` is GitHub's
 *   answer, `null` while it is still computing; `changesWorkflows` says whether
 *   those commits change a file in `.github/workflows/`, or might.
 * @type {[(facts: Facts) => boolean, Plan['action'], (facts: Facts) => string][]}
 */
const RULES = [
  [
    ({ pullRequest, defaultBranch }) => pullRequest.base.ref !== defaultBranch,
    'skip',
    ({ pullRequest, defaultBranch }) => `targets ${pullRequest.base.ref}, not ${defaultBranch}`,
  ],
  [({ pullRequest }) => pullRequest.draft, 'skip', () => 'is a draft'],
  [
    ({ pullRequest, repository }) => pullRequest.head.repo?.full_name !== repository,
    'skip',
    () => 'comes from a fork the workflow token cannot push to',
  ],
  [
    ({ pullRequest }) => pullRequest.user.type === 'Bot',
    'skip',
    () => 'is opened by a bot that keeps its own branch current',
  ],
  [
    ({ behindBy }) => behindBy === 0,
    'current',
    ({ defaultBranch }) => `is up to date with ${defaultBranch}`,
  ],
  [
    ({ mergeable }) => mergeable === false,
    'notify',
    ({ defaultBranch }) => conflictNotice(defaultBranch),
  ],
  [({ mergeable }) => mergeable === null, 'skip', () => 'has no mergeability from GitHub yet'],
  [
    ({ changesWorkflows }) => changesWorkflows,
    'notify',
    ({ defaultBranch }) => workflowNotice(defaultBranch),
  ],
  [
    () => true,
    'update',
    ({ behindBy, defaultBranch }) => `is ${behindBy} commit(s) behind ${defaultBranch}`,
  ],
];

/**
 * Decide what to do with one open PR: the first rule that applies. Pure.
 *
 * @param {Facts} facts
 * @returns {Plan}
 */
export function planUpdate(facts) {
  const [, action, reason] = RULES.find(([applies]) => applies(facts)) ?? RULES[RULES.length - 1];
  return { action, reason: reason(facts) };
}

/** @param {string} defaultBranch */
function conflictNotice(defaultBranch) {
  return (
    `This pull request is behind \`${defaultBranch}\` and conflicts with it, so it cannot be ` +
    'brought up to date automatically. It needs a manual rebase: rebase it on ' +
    `\`${defaultBranch}\` (or merge \`${defaultBranch}\` into it), resolve the conflicts, and push.`
  );
}

/** @param {string} defaultBranch */
function workflowNotice(defaultBranch) {
  return (
    `This pull request is behind \`${defaultBranch}\`, and \`${defaultBranch}\`'s new commits ` +
    'change a file in `.github/workflows/`. The workflow token may not push workflow changes, ' +
    `so it was not updated automatically. Press **Update branch**, or merge \`${defaultBranch}\` ` +
    'into it and push.'
  );
}

/** @param {string} defaultBranch @param {string} message */
function refusedNotice(defaultBranch, message) {
  return (
    `This pull request is behind \`${defaultBranch}\`, and GitHub did not complete the automatic ` +
    `update: ${message.replace(/\s+/g, ' ').trim()} Press **Update branch**, or merge ` +
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
 * @typedef {{ github: any, repo: { owner: string, repo: string }, number: number, defaultBranch: string, sleep: (ms: number) => Promise<unknown>, core: any, dryRun: boolean }} Shell
 */

/**
 * Read one PR as it is now and plan it. Only a behind PR waits for GitHub's
 * mergeability answer. A comparison too long to list every file counts as
 * changing a workflow.
 *
 * @param {Shell} shell
 */
async function readPlan({ github, repo, number, defaultBranch, sleep, core }) {
  const read = () => github.rest.pulls.get({ ...repo, pull_number: number });
  const { data: first } = await read();
  const { data: incoming } = await github.rest.repos.compareCommitsWithBasehead({
    ...repo,
    basehead: `${first.head.sha}...${defaultBranch}`,
  });
  const files = incoming.files ?? [];
  const waits = incoming.ahead_by > 0 && first.mergeable === null;
  const current = waits
    ? (await poll(read, ({ data }) => data.mergeable !== null, sleep)).data
    : first;
  if (waits && current.mergeable === null) {
    core.warning(
      `#${number}: GitHub has not computed mergeability; the next push to main retries.`,
    );
  }
  const plan = planUpdate({
    pullRequest: current,
    behindBy: incoming.ahead_by,
    mergeable: current.mergeable,
    changesWorkflows:
      files.length >= COMPARE_FILES_LIMIT ||
      files.some(({ filename }) => filename.startsWith('.github/workflows/')),
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
 * Wait for the merge commit, then dispatch every check for it. Update-branch
 * answers before it writes the commit, so a head that never moves gets the notice.
 *
 * @param {Shell} shell @param {string} head the head before the update
 */
async function dispatchChecks({ github, repo, number, defaultBranch, sleep, core }, head) {
  const read = () => github.rest.pulls.get({ ...repo, pull_number: number });
  const { data: updated } = await poll(read, ({ data }) => data.head.sha !== head, sleep);
  if (updated.head.sha === head) {
    const reason = refusedNotice(defaultBranch, 'GitHub accepted it, but the head never moved.');
    await notify({ github, repo, number, reason });
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
 * Bring one PR up to date and dispatch its checks, leave the one notice, or
 * clear a notice once the PR is current, however it got there.
 *
 * @param {Shell} shell
 */
async function handle(shell) {
  const { github, repo, number, core } = shell;
  const { plan, head } = await readPlan(shell);
  core.info(`#${number} ${plan.reason}: ${plan.action}`);
  if (shell.dryRun) return;
  if (plan.action === 'notify') await notify({ github, repo, number, reason: plan.reason });
  if (plan.action === 'current') await clearNotices({ github, repo, number });
  if (plan.action !== 'update' || !(await requestUpdate(shell, head))) return;
  await dispatchChecks(shell, head);
  await clearNotices({ github, repo, number });
}

/** @param {{ github: any, repo: { owner: string, repo: string }, number: number }} input */
const listComments = ({ github, repo, number }) =>
  github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: 100,
  });

/**
 * Post the notice once: an existing notice stays as it is.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number, reason: string }} input
 */
async function notify({ github, repo, number, reason }) {
  const comments = await listComments({ github, repo, number });
  if (comments.some(isNotice)) return;
  await github.rest.issues.createComment({
    ...repo,
    issue_number: number,
    body: noticeBody(reason),
  });
}

/**
 * Remove the notice once the PR is current, so a later problem gets a fresh one.
 *
 * @param {{ github: any, repo: { owner: string, repo: string }, number: number }} input
 */
async function clearNotices({ github, repo, number }) {
  const comments = await listComments({ github, repo, number });
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
 * @param {{ github: any, context: any, core: any, sleep?: (ms: number) => Promise<unknown>, dryRun?: boolean }} input
 */
export async function updateBehindPrs({ github, context, core, sleep = pause, dryRun = false }) {
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
      handle({ github, repo, number: pullRequest.number, defaultBranch, sleep, core, dryRun }),
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

/**
 * The reads `run` makes, through `gh api`, for a dry run. Every write throws.
 *
 * @param {string} repository `owner/name`
 */
function readOnlyGitHub(repository) {
  /** @param {string} path @param {string[]} flags */
  const api = async (path, flags = []) => ({
    data: JSON.parse(
      execFileSync('gh', ['api', ...flags, `repos/${repository}/${path}`], {
        encoding: 'utf8',
        maxBuffer: 1024 ** 3,
      }),
    ),
  });
  const refuse = async () => {
    throw new Error('A dry run writes nothing.');
  };
  return {
    paginate: async (/** @type {(args: object) => Promise<{ data: unknown[] }>} */ method, args) =>
      (await method(args)).data,
    rest: {
      pulls: {
        list: async (/** @type {{ base: string }} */ { base }) => {
          const pages = await api(
            `pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`,
            ['--paginate', '--slurp'],
          );
          return { data: pages.data.flat() };
        },
        get: (/** @type {{ pull_number: number }} */ { pull_number }) =>
          api(`pulls/${pull_number}`),
        updateBranch: refuse,
      },
      repos: {
        compareCommitsWithBasehead: (/** @type {{ basehead: string }} */ { basehead }) =>
          api(`compare/${basehead}`),
      },
      actions: { createWorkflowDispatch: refuse },
      issues: { listComments: refuse, createComment: refuse, deleteComment: refuse },
    },
  };
}

/** @param {string[]} argv */
async function runCli(argv) {
  const [flag, pr = ''] = argv;
  if (flag !== '--dry-run') {
    console.error('Usage: node scripts/update-behind-prs.mjs --dry-run [<pr>]');
    process.exitCode = 2;
    return;
  }
  const view = (/** @type {string} */ field, /** @type {string} */ query) =>
    execFileSync('gh', ['repo', 'view', '--json', field, '-q', query], {
      encoding: 'utf8',
    }).trim();
  const repository = view('nameWithOwner', '.nameWithOwner');
  const [owner, name] = repository.split('/');
  await updateBehindPrs({
    github: readOnlyGitHub(repository),
    context: {
      repo: { owner, repo: name },
      payload: {
        repository: { default_branch: view('defaultBranchRef', '.defaultBranchRef.name') },
        inputs: { pr },
      },
    },
    core: {
      info: (/** @type {string} */ line) => console.log(line),
      warning: (/** @type {string} */ line) => console.warn(line),
      setFailed: (/** @type {string} */ message) => {
        console.error(message);
        process.exitCode = 1;
      },
    },
    dryRun: true,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
