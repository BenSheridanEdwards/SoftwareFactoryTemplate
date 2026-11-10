import {
  DISPATCHES,
  NOTICE_AUTHOR,
  NOTICE_MARKER,
  noticeBody,
  planUpdate,
  run,
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

const plan = (pr: PullRequest, behindBy: number) =>
  planUpdate({
    pullRequest: pr,
    behindBy,
    mergeable: pr.mergeable,
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

  it('leaves a PR that is up to date with main alone', () => {
    expect(plan(pullRequest(), 0)).toEqual({ action: 'skip', reason: 'is up to date with main' });
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
  deleted: number[];
}

interface Comment {
  id: number;
  user: { login: string };
  body: string;
}

/** An in-memory GitHub: PRs by number, how far each is behind, and the calls made. */
function fakeGitHub({
  pulls,
  behind,
  comments = [],
  refuse,
}: {
  pulls: PullRequest[];
  behind: Record<number, number>;
  comments?: Comment[];
  refuse?: { status: number; message: string };
}) {
  const state = new Map(pulls.map((pr) => [pr.number, { ...pr }]));
  const calls: Calls = { updates: [], dispatches: [], created: [], deleted: [] };
  const github = {
    paginate: async <T>(method: (args: PageRequest) => Promise<{ data: T[] }>, args: PageRequest) =>
      (await method(args)).data,
    rest: {
      pulls: {
        list: async () => ({ data: [...state.values()] }),
        get: async ({ pull_number }: { pull_number: number }) => ({
          data: { ...state.get(pull_number) },
        }),
        updateBranch: async ({ pull_number }: { pull_number: number }) => {
          if (refuse) throw Object.assign(new Error(refuse.message), { status: refuse.status });
          calls.updates.push(pull_number);
          const pr = state.get(pull_number);
          if (pr) state.set(pull_number, { ...pr, head: { ...pr.head, sha: NEW_HEAD } });
          return { data: {} };
        },
      },
      repos: {
        compareCommitsWithBasehead: async ({ basehead }: { basehead: string }) => {
          const number = [...state.values()].find((pr) => basehead.endsWith(pr.head.sha))?.number;
          return { data: { behind_by: number === undefined ? 0 : (behind[number] ?? 0) } };
        },
      },
      actions: {
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

const core = () => ({ info: jest.fn(), setFailed: jest.fn() });
const sleep = async () => undefined;

describe('run', () => {
  it('updates only the behind, ready, mergeable PR and dispatches its checks', async () => {
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
      comments: [{ id: 9, user: { login: NOTICE_AUTHOR }, body: first.calls.created[0] }],
    });
    await run({ github: again.github, context: context(), core: core(), sleep });
    expect(again.calls.created).toEqual([]);
  });

  it('comments when GitHub refuses the update, for example over a workflow file', async () => {
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

  it('removes its own notice once the PR is updated, and no one else comment', async () => {
    const { github, calls } = fakeGitHub({
      pulls: [pullRequest()],
      behind: { 7: 1 },
      comments: [
        { id: 4, user: { login: NOTICE_AUTHOR }, body: noticeBody('old conflict') },
        { id: 5, user: { login: 'maintainer' }, body: `${NOTICE_MARKER}\nquoted` },
      ],
    });
    await run({ github, context: context(), core: core(), sleep });
    expect(calls.deleted).toEqual([4]);
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

  it('fails the run when GitHub accepts an update but the head never moves', async () => {
    const { github } = fakeGitHub({ pulls: [pullRequest()], behind: { 7: 1 } });
    github.rest.pulls.updateBranch = async () => ({ data: {} });
    const log = core();
    await run({ github, context: context(), core: log, sleep });
    expect(log.setFailed).toHaveBeenCalledWith(expect.stringContaining('head did not move'));
  });
});
