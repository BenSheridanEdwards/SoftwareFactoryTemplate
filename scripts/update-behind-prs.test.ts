import {
  DISPATCHES,
  NOTICE_AUTHOR,
  NOTICE_MARKER,
  noticeBody,
  planUpdate,
  updateBehindPrs as run,
} from './update-behind-prs.mjs';

const REPOSITORY = 'owner/repo';
const OLD_HEAD = 'a'.repeat(40);
const NEW_HEAD = 'b'.repeat(40);

interface PullRequest {
  number: number;
  draft: boolean;
  mergeable: boolean | null;
  user: { login: string; type: string };
  head: { sha: string; ref: string; repo: { full_name: string } | null };
  base: { ref: string };
}

const pullRequest = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  number: 7,
  draft: false,
  mergeable: true,
  user: { login: 'maintainer', type: 'User' },
  head: { sha: OLD_HEAD, ref: 'feat/thing', repo: { full_name: REPOSITORY } },
  base: { ref: 'main' },
  ...overrides,
});

const plan = (pr: PullRequest, behindBy: number, changesWorkflows = false) =>
  planUpdate({
    pullRequest: pr,
    behindBy,
    mergeable: pr.mergeable,
    changesWorkflows,
    repository: REPOSITORY,
    defaultBranch: 'main',
  });

describe('planUpdate', () => {
  it('updates a ready PR that is behind main', () => {
    expect(plan(pullRequest(), 3)).toEqual({
      action: 'update',
      reason: 'is 3 commit(s) behind main',
    });
  });

  it('skips a draft, even when it is behind', () => {
    expect(plan(pullRequest({ draft: true }), 3)).toEqual({ action: 'skip', reason: 'is a draft' });
  });

  it('asks for a manual rebase when the PR conflicts with main', () => {
    const result = plan(pullRequest({ mergeable: false }), 3);
    expect(result.action).toBe('notify');
    expect(result.reason).toContain('needs a manual rebase');
  });

  it('marks a PR that is up to date with main as current', () => {
    expect(plan(pullRequest(), 0)).toEqual({
      action: 'current',
      reason: 'is up to date with main',
    });
  });

  it('asks for Update branch when main brings a workflow change the token may not push', () => {
    const result = plan(pullRequest(), 3, true);
    expect(result.action).toBe('notify');
    expect(result.reason).toContain('change a file in `.github/workflows/`');
  });

  it('skips forks, bots, other bases, and PRs GitHub has not judged yet', () => {
    [
      pullRequest({ head: { sha: OLD_HEAD, ref: 'x', repo: { full_name: 'fork/repo' } } }),
      pullRequest({ head: { sha: OLD_HEAD, ref: 'x', repo: null } }),
      pullRequest({ user: { login: 'dependabot[bot]', type: 'Bot' } }),
      pullRequest({ base: { ref: 'release' } }),
      pullRequest({ mergeable: null }),
    ].forEach((pr) => {
      expect(plan(pr, 3).action).toBe('skip');
    });
  });
});

interface PageRequest {
  owner: string;
  repo: string;
  per_page: number;
}

interface DispatchRequest {
  owner: string;
  repo: string;
  workflow_id: string;
  ref: string;
  inputs: Record<string, string>;
}

interface Calls {
  updates: number[];
  dispatches: DispatchRequest[];
  created: string[];
  edited: string[];
  deleted: number[];
}

interface Comment {
  id: number;
  user: { login: string };
  body: string;
}

/**
 * An in-memory GitHub: PRs by number, how far each is behind and which files
 * main brings, and the calls made. Like GitHub, update-branch answers first and
 * moves the head on a later read.
 */
function fakeGitHub({
  pulls,
  behind,
  incomingFiles = [],
  comments = [],
  refuse,
  moves = true,
  headsWithoutRuns = [],
}: {
  pulls: PullRequest[];
  behind: Record<number, number>;
  incomingFiles?: string[];
  comments?: Comment[];
  refuse?: { status: number; message: string };
  moves?: boolean;
  headsWithoutRuns?: string[];
}) {
  const state = new Map(pulls.map((pr) => [pr.number, { ...pr }]));
  const pending = new Set<number>();
  const calls: Calls = { updates: [], dispatches: [], created: [], edited: [], deleted: [] };
  const github = {
    paginate: async <T>(method: (args: PageRequest) => Promise<{ data: T[] }>, args: PageRequest) =>
      (await method(args)).data,
    rest: {
      pulls: {
        list: async () => ({ data: [...state.values()] }),
        get: async ({ pull_number }: { pull_number: number }) => {
          const pr = state.get(pull_number);
          const data = { ...pr };
          if (pr && pending.delete(pull_number)) {
            state.set(pull_number, { ...pr, head: { ...pr.head, sha: NEW_HEAD } });
          }
          return { data };
        },
        updateBranch: async ({ pull_number }: { pull_number: number }) => {
          if (refuse) throw Object.assign(new Error(refuse.message), { status: refuse.status });
          calls.updates.push(pull_number);
          if (moves) pending.add(pull_number);
          return { data: { message: 'Updating pull request branch.' } };
        },
      },
      repos: {
        compareCommitsWithBasehead: async ({ basehead }: { basehead: string }) => {
          const number = [...state.values()].find((pr) => basehead.startsWith(pr.head.sha))?.number;
          const aheadBy = number === undefined ? 0 : (behind[number] ?? 0);
          return {
            data: {
              ahead_by: aheadBy,
              files: aheadBy > 0 ? incomingFiles.map((filename) => ({ filename })) : [],
            },
          };
        },
      },
      actions: {
        listWorkflowRuns: async ({ head_sha }: { head_sha: string }) => ({
          data: { total_count: headsWithoutRuns.includes(head_sha) ? 0 : 1 },
        }),
        createWorkflowDispatch: async (args: DispatchRequest) => {
          calls.dispatches.push(args);
          return { data: {} };
        },
      },
      issues: {
        listComments: async () => ({ data: comments }),
        createComment: async ({ body }: { body: string }) => {
          calls.created.push(body);
          return { data: {} };
        },
        updateComment: async ({ body }: { body: string }) => {
          calls.edited.push(body);
          return { data: {} };
        },
        deleteComment: async ({ comment_id }: { comment_id: number }) => {
          calls.deleted.push(comment_id);
          return { data: {} };
        },
      },
    },
  };
  return { github, calls };
}

const context = (inputs?: Record<string, string>) => ({
  repo: { owner: 'owner', repo: 'repo' },
  payload: { repository: { default_branch: 'main' }, inputs },
});

const core = () => ({ info: jest.fn(), warning: jest.fn(), setFailed: jest.fn() });
const sleep = async () => undefined;
const oldNotice = { id: 4, user: { login: NOTICE_AUTHOR }, body: noticeBody('old conflict') };

describe('run', () => {
  it('updates only the behind, ready, mergeable PR and dispatches its checks on the new head', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [
        pullRequest({ number: 1 }),
        pullRequest({
          number: 2,
          draft: true,
          head: { ...pullRequest().head, sha: 'c'.repeat(40) },
        }),
        pullRequest({ number: 3, head: { ...pullRequest().head, sha: 'd'.repeat(40) } }),
      ],
      behind: { 1: 2, 2: 2, 3: 0 },
    });
    const log = core();
    await run({ github, context: context(), core: log, sleep });

    expect(calls.updates).toEqual([1]);
    expect(calls.dispatches).toEqual(
      DISPATCHES.map(({ workflow, onMain, withPr }) => ({
        owner: 'owner',
        repo: 'repo',
        workflow_id: workflow,
        ref: onMain ? 'main' : 'feat/thing',
        inputs: withPr ? { pr: '1' } : {},
      })),
    );
    expect(log.info).toHaveBeenCalledWith(`#1 updated to ${NEW_HEAD}; dispatched its checks.`);
    expect(log.setFailed).not.toHaveBeenCalled();
  });

  it('dispatches the enforcement gate on main and every other check on the PR branch', () => {
    expect(DISPATCHES.filter(({ onMain }) => onMain).map(({ workflow }) => workflow)).toEqual([
      'enforcement-approval.yml',
    ]);
  });

  it('comments once on a conflicting PR and does not update it', async () => {
    const first = fakeGitHub({ pulls: [pullRequest({ mergeable: false })], behind: { 7: 1 } });
    await run({ github: first.github, context: context(), core: core(), sleep });
    expect(first.calls.updates).toEqual([]);
    expect(first.calls.created).toHaveLength(1);
    expect(first.calls.created[0]).toContain('needs a manual rebase');

    const again = fakeGitHub({
      pulls: [pullRequest({ mergeable: false })],
      behind: { 7: 1 },
      comments: [{ id: 9, user: { login: NOTICE_AUTHOR }, body: first.calls.created[0] ?? '' }],
    });
    await run({ github: again.github, context: context(), core: core(), sleep });
    expect(again.calls.created).toEqual([]);
  });

  it('comments instead of updating when main brings a workflow change', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 1 },
      incomingFiles: ['README.md', '.github/workflows/ci.yml'],
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.updates).toEqual([]);
    expect(calls.created[0]).toContain('Press **Update branch**');
  });

  it('treats a comparison too long to list every file as a workflow change', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 1 },
      incomingFiles: Array.from({ length: 300 }, (_, index) => `docs/${index}.md`),
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.updates).toEqual([]);
  });

  it('comments when GitHub refuses the update', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 1 },
      refuse: { status: 422, message: 'refusing to allow a GitHub App to update workflow' },
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.dispatches).toEqual([]);
    expect(calls.created[0]).toContain('refusing to allow a GitHub App to update workflow');
  });

  it('leaves a PR alone when its head moved during the update', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 1 },
      refuse: { status: 422, message: 'expected head sha didnt match current head ref.' },
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.created).toEqual([]);
    expect(calls.dispatches).toEqual([]);
  });

  it('removes only its own notice once the PR is updated', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 1 },
      comments: [
        oldNotice,
        { id: 5, user: { login: 'maintainer' }, body: `${NOTICE_MARKER}\nquoted` },
      ],
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.deleted).toEqual([4]);
  });

  it('removes its notice from a PR someone else brought up to date', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 0 },
      comments: [oldNotice],
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.updates).toEqual([]);
    expect(calls.dispatches).toEqual([]);
    expect(calls.deleted).toEqual([4]);
  });

  it('dispatches the checks for a current PR whose head an earlier update left without runs', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 0 },
      headsWithoutRuns: [OLD_HEAD],
    });
    const log = core();
    await run({ github, context: context(), core: log, sleep });
    expect(calls.updates).toEqual([]);
    expect(calls.dispatches.map(({ workflow_id, ref }) => [workflow_id, ref])).toEqual(
      DISPATCHES.map(({ workflow, onMain }) => [workflow, onMain ? 'main' : 'feat/thing']),
    );
    expect(log.info).toHaveBeenCalledWith(`#7 has no check runs at ${OLD_HEAD}: dispatch`);
  });

  it('fails the run when a dispatch fails, and the next run dispatches the checks again', async () => {
    const first = fakeGitHub({ pulls: [pullRequest()], behind: { 7: 1 } });
    first.github.rest.actions.createWorkflowDispatch = async () => {
      throw Object.assign(new Error('Server Error'), { status: 502 });
    };
    const log = core();
    await run({ github: first.github, context: context(), core: log, sleep });
    expect(log.setFailed).toHaveBeenCalledWith(expect.stringContaining('Server Error'));

    const next = fakeGitHub({
      pulls: [pullRequest({ head: { ...pullRequest().head, sha: NEW_HEAD } })],
      behind: { 7: 0 },
      headsWithoutRuns: [NEW_HEAD],
    });
    await run({ github: next.github, context: context(), core: core(), sleep });
    expect(next.calls.dispatches).toHaveLength(DISPATCHES.length);
  });

  it('rewrites its one notice when the reason changes', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest({ mergeable: false })],
      behind: { 7: 1 },
      comments: [oldNotice],
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.created).toEqual([]);
    expect(calls.edited).toEqual([expect.stringContaining('needs a manual rebase')]);
  });

  it('leaves a PR alone when its head moves while GitHub computes mergeability', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest({ mergeable: null })],
      behind: { 7: 1 },
    });
    const reads = [
      pullRequest({ mergeable: null }),
      pullRequest({ mergeable: true, head: { ...pullRequest().head, sha: NEW_HEAD } }),
    ];
    github.rest.pulls.get = async () => ({ data: reads.shift() ?? pullRequest() });
    const log = core();
    await run({ github, context: context(), core: log, sleep });
    expect(calls.updates).toEqual([]);
    expect(log.info).toHaveBeenCalledWith(
      '#7 moved while it was being read; its own push runs its checks: skip',
    );
  });

  it('limits a dispatched run to the PR it names, and rejects anything but a number', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest({ number: 1 }), pullRequest({ number: 2 })],
      behind: { 1: 1, 2: 1 },
    });
    await run({ github, context: context({ pr: '2' }), core: core(), sleep });
    expect(calls.updates).toEqual([2]);

    await expect(
      run({ github, context: context({ pr: '2; rm' }), core: core(), sleep }),
    ).rejects.toThrow('inputs.pr must be a pull request number');
  });

  it('only reads and reports its plans in a dry run', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest({ number: 1 }), pullRequest({ number: 2, mergeable: false })],
      behind: { 1: 1, 2: 1 },
    });
    const log = core();
    await run({ github, context: context(), core: log, sleep, dryRun: true });
    expect(calls).toEqual({ updates: [], dispatches: [], created: [], edited: [], deleted: [] });
    expect(log.info.mock.calls.map(([line]) => line)).toEqual([
      '#1 is 1 commit(s) behind main: update',
      expect.stringMatching(
        /^#2 This pull request is behind `main` and conflicts with it.*: notify$/,
      ),
    ]);
  });

  it('comments and fails the run when GitHub accepts an update but the head never moves', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 1 },
      moves: false,
    });
    const log = core();
    await run({ github, context: context(), core: log, sleep });
    expect(calls.dispatches).toEqual([]);
    expect(calls.created[0]).toContain('the head never moved');
    expect(log.setFailed).toHaveBeenCalledWith(expect.stringContaining('head did not move'));
  });

  it('warns when GitHub never computes mergeability for a behind PR', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest({ mergeable: null })],
      behind: { 7: 1 },
    });
    const log = core();
    await run({ github, context: context(), core: log, sleep });
    expect(calls.updates).toEqual([]);
    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('has not computed mergeability'),
    );
  });
});
