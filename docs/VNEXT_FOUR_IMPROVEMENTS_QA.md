# Four approved improvements — accepted and released, 2026-10-20

The owner approved these four changes together, focused checks and final QA. Implementation used no simulator, deployment, production account access or real training-data writes. Its baseline was live build `062799423b50af791eb1` and main `c92efbad98802de716c31e45523ba7bec72326f5`. The owner subsequently passed both physical device checks and authorised release: build `9d6666cf69bfe5b52ea6` is now live through PR #37 and controlled workflow 39479257029. All saved training/account data is verified preserved; release runbook §32 records the single routine sync-timestamp difference and exact evidence.

## Delivered behavior

| Improvement | Result | Acceptance checked |
|---|---|---|
| Automatic progression | New generator 4 prefers an unfinished, currently usable milestone over a satisfied parent. An established safe variation remains available when the next step needs recovery. | All seven families; exact next checks; explicit targets; stale reconfirmation; stronger/specialist gates; Today/Custom and demand choices. Native generator 3 remains unchanged. |
| Recovery explanation | When recent demanding work prevents useful development and there is no suitable lighter session, Today explains that limitation and suggests recovery. | Real composition failure; active restriction and post-clearance cases take precedence. The existing 48-hour high-load rule is unchanged. |
| Dependable updates | A downloaded update is visible and explicitly applied. Workouts, pending checks, unsaved goal edits and busy commands block activation. Another app window must be closed first. A version identifier is in Offline & data tools. | Real browser download/activation, duplicate windows, goal-edit lock, paused workout/review lock, saved early finish, retained history and offline reopening. Synthetic outbox/compatibility tests retain exact pending data and cursor. |
| Paused setup | Continue saves submitted goals/equipment independently of skill confirmation. Continue later, reopening, Today and Custom honor them. | Draft-write and intent-write failures, exact retry, reload, Back, newer Progress/synced edits, native placement drafts and restriction preservation. No performance evidence is awarded. |

## Verification

- Full `pnpm check` passed, including domain, native definitions, training, migration, reset/rollback, Worker, accounts, recovery, media and UI checks. Final update refinements also passed the focused update suite and TypeScript.
- Production-lane build and distribution validation passed. Repeated distribution validation is checked for identical output bytes; its build identity includes service-worker source and exposes the same identity in the HTML shell.
- Seven synthetic longitudinal profiles completed **252 visits and 252 saved workouts**, with no empty visits and strict plan/start validation. The reviewed pushing case previously stalled and had eight empty visits in 36; new exact guided checks now progress through Tempo, Staggered and Deep deficit milestones. Practice-only history remains unconfirmed. These are software scenarios, not validation of physiological outcomes.
- Browser QA used an isolated loopback origin and synthetic device-only profile, with external connections blocked. Submitted Planche/L-sit goals survived Continue later and reopening without completing checks. Nine measured preparation seconds were saved as one partial workout with no invented development rating.
- A second build was created only for the local update rehearsal. Pending workout/review and open goal editor blocked updates. A second app window was refused with an actionable message. After closing it, Update now loaded the new build while keeping the same goals, draft and single nine-second workout. With the local server stopped, cached reopening still showed that same History record.
- Browser QA caught and fixed an update dead end: the native “End & review” path can retain its timer checkpoint after committing the workout. The update gate now accepts that timer only when the exact plan has a saved Session Record and no workout/check envelope remains. Unknown, malformed, foreign and unfinished checkpoints still block.
- The final focused update suite also covers a new HTML shell served by a legacy worker, mixed-version download rejection, offline activation, unsolicited controller changes, cache-lane isolation and future reader rejection before local page writes, cursor advance or outbox acknowledgement.

Evidence and logs: `/Users/kyria/Documents/Codex/parallette25-review-evidence/2026-10-20-four-improvements/`. The local server and disposable browser tabs were closed; temporary duplicate build directories were removed. Browser-managed synthetic-origin storage was not claimed erased.

## Compatibility and release boundary

No database schema, observation schema, namespace, account identity or existing event/session ID changes. Definitions 1–8, native plans/generator readers 1–4 and existing recovery paths remain. Projection stays at 11. New generator 4 has its own immutable plan identity; old generator 3 entry points are retained.

Reader capability 2 is separate from observation schema/version. A future compatible Worker must be released before the new client. Its sync route rejects missing/older reader capabilities before training-store access; the new client identifies an update requirement and retains its queued data. The currently released Worker tolerates the new request field, so the candidate is compatible with it. The compatible Worker was subsequently deployed before the accepted client; see release runbook §32.

Already-distributed clients cannot retroactively display these new controls. On the first eventual release, finish/save active work, close the existing production app and tabs, reopen online and confirm the new app version. Keep the installation and its storage. An old client may show a generic sync error until upgraded; it is not globally disabled while offline. Do not strip unknown data, advance an incompatible cursor, or roll back to a reader that cannot understand retained newer facts.

## Physical acceptance — passed on iPhone and iPad

Desktop browser and synthetic tests cannot certify iOS Home Screen lifecycle or storage eviction. No further training-content tour is needed. On an isolated preview, one short update/reopen journey on each iPhone and iPad confirmed:

1. With a synthetic saved workout and selected goals, use the offered update; History still contains the same workout once and the goals remain.
2. Close/reopen the Home Screen app offline; Today and History load.

The owner subsequently authorised this isolated preview. [P25 Update Test](https://parallette25-update-test-oct20.daring-ash-7897.chatgpt.site/parallettes/) is owner-private and separate from production and the earlier comfort preview. Site `appgprj_6ad7b57cbaa0819186e17d6c1c84150b`, source `875fc4b7e31bdb7c76a153a32518d5a62518edb1`, deployment `appgdep_6ad7b6a7e9e481918de822ffbb1a8011` succeeded. Source lives in `sites/parallette25-update-qa-20261020` as a separate Site repository.

The empty-store-only start button seeds Planche/L-sit goals and one nine-second partial sample workout using the native runtime. It refuses to overwrite existing training storage. No account API is configured, outbound connections are restricted to the test origin, and the sample creates no performance confirmation. Test 1 (`6498efe8ec961c39a9df`) and Test 2 (`15a2381a424677920eff`) share identical candidate assets. Fixture-only differences select a worker URL and its matching cached shell; the real Update now activation, single-window guard, reload and cache retention code are used. These are preview identities; the unreleased production candidate remains `9d6666cf69bfe5b52ea6`.

Desktop browser verification of the packaged fixture passed: sample start, actual Update now, Test 2, complete tab closure/reopening with the server stopped, Today goals and exactly one nine-second History entry. Preview packaging validates all 27 eager/lazy JS/CSS assets, standalone manifest, API isolation and absence of credentials. Production manifest was read-only rechecked and remains `062799423b50af791eb1`. The private hosted access gate requires ChatGPT sign-in; it is not Parallette25 account access. Publication success and the hosted access gate were verified. The desktop browser had no signed-in ChatGPT session, so the hosted application behind that gate was not exercised; the exact packaged fixture passed locally.

On each physical device: open in Safari, add **P25 Update Test** to the Home Screen, close the Safari test tab and open that icon. Tap **Start sample check → Prepare test update → Update now**. Expect **Test 2 · Update complete**. Turn on Airplane Mode with Wi-Fi off, close/reopen the icon, and confirm Today and History load with the same goals and one nine-second workout. Restore connectivity. No training or backup import is needed.

The owner confirmed both physical iPhone/iPad update and offline checks passed and explicitly authorised the release on 2026-10-20. No authenticated production sync or device storage-eviction test was performed. Controlled release evidence is recorded in the release runbook.
