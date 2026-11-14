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

- Make the to-do list the home page, Phase C PR 14. No thread recorded. PR [#376](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/376).

- Point PRD conflict gate fixtures at to-dos, Phase C PR 13a. No thread recorded. PR [#371](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/371).

- Point remaining gate tests at to-dos, Phase C PR 13c. No thread recorded. PR [#375](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/375).

- Add hosted to-do visual baselines, Phase B PR 11 of ADR 0123. No thread recorded. PR [#369](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/369).



- Filter and clear done at /todos, Phase B PR 10. No thread recorded. PR [#367](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/367).

- Mark done, edit and delete at `/todos`, Phase B PR 9. T3 [thread](t3-thread://v2/f4863e70-7db9-4416-8108-a4fa053a71bd/mcp:363909c1-1cd9-45aa-8b0c-7614efc7c5c4). PR [#366](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/366).

- List and add to-dos at /todos, including pending double-submit page coverage, Phase B PR 8 of ADR 0123. No thread recorded. PR [#365](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/365).

- Run page tests on the real app router, Phase B PR 7 of ADR 0123. No thread recorded. PR [#364](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/364). Issue [#339](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/issues/339).

- Serve the to-dos on the app router, Phase B PR 6 of ADR 0123. No thread recorded. PR [#363](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/363).


- Record accepted to-do reference decision as ADR 0123. No thread recorded. PR [#359](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/359).

- Add this task list and the AGENTS.md rule to keep it. T3 thread 15a5d0fa. PR [#350](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/350)

## Waiting

- Specify the to-do app, Phase B PR 12 of ADR 0123; awaiting Ben's guarded-path tick. No thread recorded. PR [#370](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/370).

- Point PR body PRD fixtures at to-dos, Phase C PR 13a2; local verify and 32 E2E tests passed, awaiting review and #370. No thread recorded. PR [#372](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/372).

- Point architecture boundary fixtures at to-dos, Phase C PR 13b of ADR 0123; defer 13b2 to stay under 400 lines. No thread recorded. PR [#373](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/373); local checks passed, awaiting review.

- Point remaining architecture fixtures at to-dos, Phase C PR 13b2 of ADR 0123. No thread recorded. PR [#374](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/374); local verify and E2E passed, awaiting review.


- Cover to-do load and re-read failures, Phase B PR 10b; local verification and 32 E2E tests passed. No thread recorded. PR [#368](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/368).

- Add the to-do domain and application, Phase B PR 5 of ADR 0123. No thread recorded. PR [#362](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/362).

- Fix Merge confidence sparse checkout with import regression coverage; awaiting guarded-path sign-off and review. No thread recorded. PR [#355](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/355)
- Isolate E2E servers and reserve trial ports; local checks passed, awaiting review. No thread recorded. PR [#356](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/356)
- Skip deleted slices in changed coverage; built and awaiting review. No thread recorded. PR [#357](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/357)
- Start each Pact run fresh and extend integration timeouts; local proof passed, awaiting review. No thread recorded. PR [#358](https://github.com/BenSheridanEdwards/SoftwareFactoryTemplate/pull/358)

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
