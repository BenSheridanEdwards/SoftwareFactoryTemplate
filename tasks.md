# Tasks

Write each piece of work here before it starts, and move it between sections as
it progresses. Each entry is one line: what it is, its T3 thread, and its PR or
issue. Write "no thread recorded" when the work has no T3 thread.

## Queued

- Optimise the remaining feedback-loop bottleneck with gate-parity proof; needs a fresh measurement of current main first. No thread recorded. Issue [#298](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/298)
- Epic: monitoring our factory. No thread recorded. Issue [#250](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/250)
- Tests: move from Jest to Vitest and tune isolation. No thread recorded. Issue [#245](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/245)
- CI: cache task results and run only affected packages, with a self-hosted remote cache. No thread recorded. Issue [#242](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/242)

## In progress

- Add this task list and the AGENTS.md rule to keep it. T3 thread 15a5d0fa. PR [#350](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/350)

## Waiting

- Drift test of the factory claim (ADR 0130): first pilot recorded, waiting on the maintainer for a pull request and the next test. No thread recorded. Branch `claude/beautiful-sagan-2sxbf9`; no pull request yet.
- Lab suites out of `pnpm verify` and one gate run at push (ADR 0131), waiting on the maintainer for a pull request. No thread recorded. Branch `claude/beautiful-sagan-2sxbf9`; no pull request yet. Issue [#298](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/298)
- Status rule reads through a call, and trial prompts name what to leave unread (ADR 0132), waiting on the maintainer for a pull request and the sign-off for the policy plugin. No thread recorded. Branch `claude/beautiful-sagan-2sxbf9`; no pull request yet.
- Two-arm test of the factory claim (ADR 0127) and its two pilots of 10 November 2026, with a strong and a less capable builder, waiting on the maintainer for a pull request and the North Star sign-off. No thread recorded. Branch `claude/beautiful-sagan-2sxbf9`; no pull request yet.
- To-do reference app that replaces the greeting (draft), parked until the other issues close. T3 thread 15a5d0fa. PR [#335](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/335)
- Page tests run the real feature router, stacked on `feat/todo-example-app` and waiting for PR #335. No thread recorded. PR [#343](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/343), issue [#339](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/339)
- Share a feature's validation rules between api and web (draft), stacked on `feat/todo-example-app` and waiting for PR #335. No thread recorded. PR [#344](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/344), issue [#338](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/338)
- Deploy a preview of each same-repo pull request, waiting on the maintainer's hosting choice (Cloudflare Workers or Vercel Hobby). No thread recorded. Issue [#139](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/139)
- Run StyleProof on the component gallery only (draft), parked until StyleProof is ready. T3 thread 36462ab3. PR [#143](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/143)

## Done

- Bring behind pull requests up to date automatically, merged 10 November 2026. T3 thread 6627d761. PR [#349](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/349)
- Fail the gate on Fallow, Playwright worker and runner warnings, merged 10 November 2026. T3 thread 15a5d0fa. PR [#346](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/346), issue [#231](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/231)
- Six policy rules mined from nine agent rebuilds, merged 10 November 2026. T3 thread 15a5d0fa. PR [#345](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/345), issue [#337](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/337)
- Bring guidance in line with the current gates, merged 10 November 2026. No thread recorded. PR [#348](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/348)
- Close audit findings in the UI, api and gate scripts, merged 10 November 2026. No thread recorded. PR [#347](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/347)
