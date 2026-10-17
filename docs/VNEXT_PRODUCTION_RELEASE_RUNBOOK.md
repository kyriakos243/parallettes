# Parallette25 vNext Production Release Runbook

[Back to the project map](../MASTER_PLAN.md) · [Data and migration contracts](VNEXT_DATA_MIGRATION.md) · [Phase roadmap](VNEXT_IMPLEMENTATION_ROADMAP.md)

**Scope:** Phase 11 controlled release of `parallette25-vnext.1`, promoted from accepted candidate `parallette25-vnext-rc.3` at source fingerprint `1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47`.

This runbook is enforced by fail-closed validation plus a manual GitHub Pages workflow. The workflow can publish only the exact frozen vNext artifact named by a granted release contract, or an explicitly selected retained v1 rollback commit. It never migrates, restores or deletes D1 data. Do not put passwords, bearer sessions, recovery codes, API tokens or account payloads in release evidence or version control.

Current Cloudflare references: [D1 migrations](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply), [D1 export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) and [Workers rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## 1. Fixed release contract

| Gate | Required value |
|---|---|
| Production release | `parallette25-vnext.1` |
| Accepted source candidate | `parallette25-vnext-rc.3` |
| Accepted source fingerprint | `1aba25c526ddbc1280489e464aa48b7aace8e1e5f365944652bb4bc676c38d47` |
| Required baseline | full commit `61b08766250100d502744b4c64a244e3d6f5fd6b` or a verified successor containing it |
| Production D1 | `parallette25-profiles` / `4dfe10d8-e66e-4115-ac7d-6be01eacd75e` |
| Additive remote migration | `0002_vnext_shadow_observations.sql` |
| Observation sync route | `POST /vnext/shadow/sync` |
| Authority before cutover | coherent v1.2 read/write |
| Authority after cutover | coherent vNext production read/write |
| Normal rollback | authority/code rollback only; retain all legacy and additive data |

Stop if any identity differs, if the deployed v1.2 baseline cannot be proved, if a release or rollback owner is absent, if the current D1 state cannot be recovered, if the API health contract is incomplete, or if read and write authority cannot switch together.

## 2. Release evidence and roles

Before touching production, name:

- the release owner who may advance each gate;
- the rollback owner who can independently call rollback and has access to the last verified v1.2 deployment;
- the observation-window end time and the channel through which a rollback decision is communicated.

Keep evidence in an operator-controlled encrypted location outside the repository. Record exact timestamps, deployed artifact/version identifiers, commands and exit results. Database exports contain private profile and credential-derived data; restrict them and never attach them to an issue or commit.

The validator rejects credential-like keys. Every evidence set receives a new release-attempt UUID and is bound to the exact Pages origin, Worker URL/version, production D1 UUID and frozen distribution fingerprint. Timestamps must be chronological and fresh; evidence from an earlier attempt or another target cannot be replayed.

Copy [the fail-closed preflight template](vnext-phase11-preflight.example.json) and [the reconciliation template](vnext-phase11-reconciliation.example.json) into the private evidence location, then replace every placeholder. The checked-in examples are intentionally incomplete and cannot pass the validator unchanged.

```sh
node scripts/vnext-phase11-release-ops.mjs source
node scripts/vnext-phase11-release-ops.mjs preflight --evidence /absolute/path/to/preflight.json
```

`source` proves that the current checkout contains the required baseline and the checked-in release, RC provenance, migration and API identities. It does not prove what is currently deployed; the operator must supply that evidence separately.

## 3. Verify deployed v1.2 and freeze artifacts

1. Inspect the currently served application and service worker. Tie their build/deployment identifiers to `61b0876` or a verified successor containing it.
2. Build the already-approved production source without modifying it. The exact production API origin must be present. Record the complete distribution-set SHA-256, application/index and service-worker hashes, build ID, non-v1 cache channel and profile Worker version identifier.
3. Confirm the production bundle contains one vNext authority path and does not contain an executable legacy startup path.
4. Confirm the accepted media manifest has owner approval for the exact RC.3 guide fingerprints. Missing or substituted media stops the release.
5. Build and validate the exact retained v1 rollback commit through the workflow's `rollback-v1` lane. Record its Pages deployment ID, source commit, build ID, service-worker hash and v1 cache channel.

Any RC or staging surface used for release evidence must use an isolated origin and isolated browser storage. A nested same-origin RC is not eligible for promotion. Production additionally uses a distinct IndexedDB database and local identity/recovery namespace, so old RC review state cannot become production truth.

Do not rebuild between snapshot and cutover. A changed artifact hash restarts preflight.

## 4. Capture recoverable production state

Use the configured production database name/binding only after independently confirming the target. Record the Wrangler version and do not change it mid-release. Create a private temporary directory; move the evidence to durable encrypted storage before ending the release session.

```sh
release_evidence_dir="$(mktemp -d)"
chmod 700 "$release_evidence_dir"
cd profile-api
npx wrangler --version
npx wrangler d1 info parallette25-profiles
npx wrangler d1 time-travel info parallette25-profiles
npx wrangler d1 export parallette25-profiles --remote --output="$release_evidence_dir/database-before.sql"
npx wrangler d1 export parallette25-profiles --remote --table=accounts --output="$release_evidence_dir/accounts-before.sql"
shasum -a 256 "$release_evidence_dir/database-before.sql" "$release_evidence_dir/accounts-before.sql"
```

Required evidence:

- current D1 Time Travel bookmark and timestamp;
- full database export SHA-256;
- accounts-table export SHA-256;
- proof that the export can be parsed/restored in an isolated local database;
- secure storage reference and retention owner.

Cloudflare D1 migration application also captures a backup, but that does not replace the explicit bookmark and export evidence. Time Travel restoration overwrites the database in place and is not normal rollback.

## 5. Apply additive schema and deploy the disabled API

1. Confirm that only the expected additive migration is pending.
2. Apply migration `0002`; do not edit or delete legacy fields/tables.
3. Deploy the backward-compatible profile Worker with release identity variables present and `VNEXT_SHADOW_MODE` still absent/false.
4. Read `/health`. It must report separately:
   - `ok`, legacy account schema and password/D1 service healthy;
   - release ID `parallette25-vnext.1`, RC.3 provenance, exact fingerprint and exact production D1 UUID with `identityReady: true`;
   - the exact full vNext schema fingerprint, migration-history row for `0002`, observation tables and immutability triggers ready;
   - sync disabled and vNext aggregate readiness false.
5. Populate the preflight evidence with this exact response and run the disabled-API preflight command again.

```sh
cd profile-api
npx wrangler d1 migrations list parallette25-profiles --remote
npx wrangler d1 migrations apply parallette25-profiles --remote
```

If schema application fails, stop. Do not deploy the application, enable sync or restore production data casually; first verify D1's migration rollback/result and the pre-release bookmark/export.

## 6. Enable sync, publish the frozen app and switch authority

The remaining actions form one controlled cutover. Pause if any gate fails.

1. Make `VNEXT_SHADOW_MODE=true` and `VNEXT_PRODUCTION_AUTHORITY_MODE=true` together in the reviewed production Worker configuration and deploy that exact configuration. The first enables authenticated observation sync; the second rejects stale v1.2 profile writes after an athlete creates a vNext sync head. Both are deliberate operator checkpoints and remain absent from the checked-in production config before the gate.
2. Read `/health` again. The same release/schema identity must now have `vnext.syncEnabled: true`, `vnext.productionAuthorityEnabled: true` and `vnext.ready: true`.
3. Update the preflight evidence with the enabled health response and run:

   ```sh
   node scripts/vnext-phase11-release-ops.mjs preflight --evidence /absolute/path/to/preflight.json --require-sync
   ```

4. At the authority switch, export the pre-existing cohort's legacy training-authority projection (`profile_id`, revision and profile blob) as the authority-boundary baseline. Prefer a capture immediately before publishing and verify it again immediately after. A just-after-cutover capture may establish the boundary only when the latest row write timestamp strictly precedes the exact deployment cutover and the earlier recovery export remains preserved. A legitimate v1.2 save may differ from that recovery export because v1.2 remains authoritative until this boundary.
5. Publish the frozen `parallette25-vnext.1` app/service-worker artifacts with the recorded hashes.
6. Switch the served application coherently to vNext production read/write authority. Never run a v1.2 presentation with vNext writes, or a vNext presentation with v1.2 progression authority.
7. Confirm a stale/incorrect build identity fails inert rather than falling back to legacy startup, and confirm the service worker does not mix v1 and vNext cache lanes.

The migration is intentionally **per-athlete and first-access**, not a server-side bulk profile rewrite. On an athlete's first production vNext open, the exact v1.2 authority surface is snapshotted, converted idempotently, stored locally and reconciled through authenticated delta sync. Therefore `expectedMigratedProfiles` means the activated cohort observed during the release window—not every account in D1. Reopening or reconnecting the same profile must reuse the same migration receipt and must not create duplicate observations.

## 7. Immediate smoke and reconciliation

Run the bounded Phase 11 smoke flows against synthetic/release-owner profiles only; never inspect another athlete's payload:

- fresh account/local athlete opens Today and creates one session;
- existing v1.2 athlete converts once, shows imported/provisional provenance and receives a recommendation;
- offline session is retained, then syncs once on reconnect;
- two devices union disjoint observations without duplication;
- reset followed by a stale-device reconnect cannot resurrect old progress;
- stale cache/service-worker identity cannot mix v1.2 and vNext;
- rollback owner can select the verified v1.2 deployment.

Export the `accounts` table again. New registrations and password recovery may legitimately change account rows during the observation window, so do not require the whole table to remain byte-identical. Instead, compare the pre-existing cohort's legacy training-authority projection privately against the authority-boundary baseline and record only matching before/after hashes. Preserve the earlier recovery projection hash separately. Run the checked-in read-only query and retain its single aggregate result row:

```sh
cd profile-api
npx wrangler d1 export parallette25-profiles --remote --table=accounts --output="$release_evidence_dir/accounts-after.sql"
shasum -a 256 "$release_evidence_dir/accounts-after.sql"
npx wrangler d1 execute parallette25-profiles --remote --command="$(sed '/^--/d' phase11-reconciliation.sql | tr '\n' ' ')" --json
```

Current Wrangler remote uploaded-file mode reports execution metadata rather than the query row, so use the direct read-only statement form above for evidence capture. The reconciliation validator requires the latest pre-existing legacy write to precede the exact cutover and the matching baseline capture to occur at or after cutover; any post-cutover legacy-authority delta remains a rollback trigger.

Map the query's snake-case metric/invariant names into the reconciliation evidence JSON. All invariant counts must be zero. Snapshot and migration-run counts must cover the activated cohort. Then run:

```sh
node scripts/vnext-phase11-release-ops.mjs reconcile --evidence /absolute/path/to/reconciliation.json --preflight /absolute/path/to/preflight.json
```

Stop and roll back application authority for any identity mismatch, unexpected change to a pre-existing legacy authority row, non-zero invariant, unsafe recommendation, duplicated/lost Session Record, reset resurrection, mixed authority/cache path, or unexplained sync failure.

## 8. Normal rollback

Generate the exact non-executable checklist from the accepted cutover evidence:

```sh
node scripts/vnext-phase11-release-ops.mjs rollback-plan --evidence /absolute/path/to/preflight.json
```

Normal rollback is non-destructive:

1. stop granting new vNext authority;
2. let active workouts finish locally and preserve outboxes;
3. restore the verified v1.2 app/service-worker deployment and prove its v1 cache lane;
4. close the vNext cohort, then disable vNext sync writes;
5. verify ordinary auth/profile/history/offline reads;
6. retain migration `0002`, vNext observations, snapshots, reset tombstones, migration receipts and all legacy data;
7. run the read-only reconciliation query and record the incident boundary.

A Worker version rollback does not roll back D1. Do not remove the additive binding/schema or data it depends on. A D1 Time Travel or export restore is a separate destructive incident response: it overwrites data and may discard valid post-snapshot observations. It requires a new explicit owner decision after quantifying affected writes and recording the bookmark that can undo the restore.

## 9. Observation window and closeout

Keep rollback controls, the legacy data path and snapshots through the agreed observation window. Track only operational aggregates and reported defects; do not introduce unapproved analytics. At closeout, record:

- deployed app/service-worker/Worker versions and hashes;
- exact API health identity;
- migration and reconciliation counts for the activated cohort;
- all smoke results and any rollback action;
- unresolved limitations and observation-window owner.

Retiring rollback, deleting legacy fields, removing migration snapshots or purging additive observations is **not** part of Phase 11. It requires a separate explicit maintenance approval.

## 10. Original production cutover checkpoint

The owner-authorised release attempt `520c65f9-2d89-4044-9481-b9ba05911363` published the exact frozen `parallette25-vnext.1` artifact through GitHub Actions run `33244593778` and Pages deployment `6154176269`. The live index and service worker match the frozen hashes, build `33055d9391f5136450dc` and cache lane `vnext-production1`. The retained-v1 rollback rehearsal succeeded through run `33243858575` and deployment `6154034303`.

Production D1 was recovery-exported and locally restore-verified before additive migrations. Migration history and exact schema fingerprint are healthy; both authority variables are enabled together. Immediate bounded smoke passed a fresh 25-minute workout through Session Record and next recommendation, exact retry/offline replay, a second-device replay, first-access legacy conversion, repeated migration, reset followed by stale-device suppression, cache isolation and rollback readiness.

The `2026-08-29T10:54:59Z` read-only checkpoint contained five activated profiles: four had idempotent migration snapshots/receipts and one was a fresh native session path. It recorded 13 Session Plans, 32 Evidence Events and 11 Session Records; every checked identity, cursor, reset, reference, correction, migration and immutable-row invariant was zero. The pre-existing legacy authority projection was byte-identical from the `2026-08-29T09:05:27Z` cutover boundary through reconciliation. The earlier recovery export was recorded separately because a legitimate v1.2 synchronization-clock write completed before cutover. The 2026-10-15 audit recovered its hash and prior restore result, but could not locate the original temporary exports or a durable copy; see Section 12. Do not treat those historical hashes as an available backup.

The private evidence set binds exact Worker/D1 identities, hashes, timestamps and recovery material without committing athlete payloads or credentials. The original observation window ended at `2026-08-30T08:40:19Z`. Retain rollback and all legacy/additive data until separately authorised cleanup. The private cutover authority-hash evidence remains the reference for historical migration closeout; the frontend correction below does not repeat migration or change authority.

## 11. Owner-approved workout UX correction — 2026-10-15

The owner accepted the isolated correction in motion and explicitly authorised deployment once checks passed. This is a frontend release under the existing Phase 11 authority: no Worker deployment, schema change, migration rerun, reset, legacy deletion or rollback retirement. The accepted RC.3 provenance and exact owned-media approvals remain unchanged.

The complete local check chain passed (with the stale guided-test label assertion corrected to the accepted UI), including type checking, 118 UI/accessibility assertions, focused workout/custom/recovery checks, domain/data/auth regressions and the production build. The standard Phase 11 check now includes the workout UX validator. The production distribution is bound to:

| Identity | Frozen value |
|---|---|
| Build | `eb58fb904465ddeb6c25` |
| Cache lane | `vnext-production1` |
| Distribution SHA-256 | `7c0fedc4712a75386a7bbed74b5d70440f3b68449dc874d784d4af2cfac9a357` |
| Index SHA-256 | `e83362dc485ce2838afc81056dd0ee5b31ead55d71f0e43224023bb128b956eb` |
| Service-worker SHA-256 | `6b026448bb0b23c98e41493c20c7c9e467e066abfda590b3432868f39ee15ffa` |

The existing read-only reconciliation query was run through the signed-in Cloudflare D1 console against the exact production database, observed at `2026-10-15T10:14:07Z`: 5 accounts/sync heads, 74 changes, 14 plans, 32 evidence events, 12 session records, 5 intents, 2 reset tombstones, 4 snapshots and 4 active migration runs; no rolled-back runs/entities and all 14 integrity invariants zero. This is fresh aggregate integrity evidence, not a replacement for the private historical legacy-authority hash comparison. Public API health separately confirms the exact release/database/schema identity and paired sync/production authority. No CLI OAuth grant or database mutation was needed.

The previous live distribution was downloaded and independently matched the complete frozen fingerprint `6ea84cd7835a8d605708e33fa9e673534d38c5fed230914162e1842b55dee6d4`. It is retained in the operator's local release-evidence directory together with fresh health and aggregate results. Its source is `c2063f938911197df5fdf6e7d52e14d7749e7fe0` (run `33244593778`, deployment `6154176269`), so code-only rollback can use the controlled `vnext-production` lane with that exact commit while preserving all current data and authority. The older verified v1 rollback lane also remains available.

Deployment status: **successful** through [workflow 38719486015](https://github.com/kyriakos243/parallettes/actions/runs/38719486015), exact checked-out source `2dff93a5b809abdbcd309c2f708a3ff0ebcb29be`, Pages artifact `11964577228`. The workflow ran from `main` at `5beab7a467fb559b6540532244f71d8398942c2f`, so Pages labels its deployment with that workflow ref; the build job separately checked out and verified the exact requested correction commit. At `2026-10-15T10:22:31.063Z`, all 22 normally served files matched the local frozen distribution byte-for-byte and the API health validator passed with sync and production authority enabled. The browser reached the expected sign-in gate, reloaded cleanly and reported no warnings/errors. No live account session was available for a repeated authenticated workout smoke; the accepted isolated-preview workout/custom/cancellation checks remain its UX evidence.

The correction is delivered. The older private cutover legacy-authority hash comparison was not reconstructed by this frontend release and must not be claimed as freshly verified. Release and rollback artifacts, health responses, source identity and aggregate query results are retained in the operator-controlled local release-evidence directory.

## 12. iPhone correction and closeout verification — 2026-10-15

The owner authorised the remaining Phase 11 checks, recovery of original migration evidence, and a phone workout layout correction. The player now places coaching below its animation and allocates the remaining viewport height to the animation. Instructions, safety copy, timer and 44px controls remain visible together at ordinary text size; enlarged text can scroll rather than being clipped. Desktop remains side by side. Exercise/media geometry, prescriptions, timers and persistence contracts are unchanged.

The full local and controlled-deployment checks passed, including 118 UI/accessibility assertions, focused workout/custom/recovery scenarios, domain/data/auth regressions, TypeScript, production isolation and exact artifact grant. Two production builds were identical. Responsive browser frames passed at 320×568, 375×667, 390×664 and 390×844, plus 1024×768 desktop. At 375×667, the animation occupies 351×315px above complete coaching, with the complete stage ending at y=659. This is browser viewport evidence, not a physical iPhone/Safari certification.

| Release identity | Verified value |
|---|---|
| Exact deployed source | `096150391ddc6543c2341af797da3a6f74d4ec2a` |
| Controlled workflow | [38766382477](https://github.com/kyriakos243/parallettes/actions/runs/38766382477) |
| Pages artifact | `11990196010` |
| Build / cache lane | `f995bec866dc6645b3c0` / `vnext-production1` |
| Distribution SHA-256 | `4eefa4f706bf3dcfdd77572ac17795ee544d731fe9edad447d2d14ac5eac33d2` |
| Index SHA-256 | `c948d3244f431d2ac1649727a3834ee30ee1a4f745271429dec047475655ac67` |
| Service-worker SHA-256 | `03d784e5a37ab1ec75b7e19082749deaf956657672b7afffc2ad83e7080101c3` |

The workflow completed successfully at `2026-10-15T16:09:26Z`; it ran from main `889ae83117eac434053d7dc1ff892241568faa08` and independently checked out the exact source above. At `2026-10-15T16:13:55.494Z`, all 22 public files matched the frozen distribution. API health at `2026-10-15T16:13:55.482Z` passed exact release/provenance/D1 identity, migration `0002_vnext_shadow_observations.sql`, schema fingerprint `2e5ff8e06af41b2e0aad00671d13c995c938ba5fc0db2db1023f9f5549dddc9d`, and paired sync/production authority. No Worker source or configuration changed in this correction; the last verified main Worker build before this branch is `e3ae8c9f-6784-4328-8433-811d3539e502` (build reference, not an asserted runtime-version UUID).

Authenticated production smoke used only the owner-created test account. Custom preview cancellation restored Today; a second five-minute Custom plan advanced through work/rest, paused and saved locally, then reloaded with exactly 03:44 elapsed / 00:16 rest remaining and resumed. Completion requested feedback for the performed development movement only. Selecting Stopped for this synthetic test saved one immutable record, synced and rebuilt the recommendation. After the new deployment, reload and History showed exactly one Custom Session (2m 45s work, Modified); app console warnings/errors were empty. The unfinished optional placement check reopens on reload and can be closed without fabricating health answers.

Fresh read-only production reconciliation after that save reported 6 accounts/sync heads, 78 changes, 15 plans, 32 evidence events, 13 records, 6 intents, 2 reset tombstones, 4 legacy snapshots and 4 active migration runs. Rolled-back runs/entities and all 14 integrity invariant counts were zero. The original pre-export cohort query returned one account, revision 227, with latest legacy write still `2026-08-29T08:55:41.492Z`. These console checks initially established aggregate/metadata integrity. The subsequent current backup comparison below additionally establishes byte-for-byte legacy-authority equality.

The original project audit was located and its non-sensitive evidence metadata recovered. It records successful isolated SQL restore integrity, equal cutover/reconciliation/post-merge/final-source legacy hashes `842a1edefb99eb87dd241b69f773a9ff061bcc37dbce1f1575011af9a5929a56`, and passing final preflight/reconciliation validators at `2026-08-29T13:16:32.717Z`. The original observation window ended `2026-08-30T08:40:19Z`; the project owner remains the release/rollback decision owner. No rollback or destructive restoration occurred during this closeout work.

**Recovery evidence limitation:** The original SQL exports and projection files are absent from their recorded temporary directory, and no durable copy was located in the relevant project/evidence locations. Recovered hashes and the historical restore result do not recreate those files. The dashboard returned a current D1 Time Travel bookmark on 2026-10-15, retained privately; the dashboard confirms a seven-day restore window. It is neither a durable export nor the original recovery point. Original backup availability must not be represented as verified.

Current build artifacts, logs, screenshots, API health, aggregate checks, the recovery bookmark and authenticated smoke notes are retained outside Git under the operator's `Documents/Codex/parallette25-release-evidence/2026-10-15-phase11-closeout` directory. The historical audit metadata is in the sibling `2026-10-15-workout-ux/recovered-migration-evidence.json` (SHA-256 `0c8bfcd39594b11f0fa5906ac591a3271e79be4802edba0120909964287cd780`). The aggregate/audit evidence contains no athlete payloads or credentials. The newly retained SQL exports below do contain private account/profile data and must remain outside Git. FileVault was confirmed enabled on the operator machine during closeout; evidence directories restrict access to the operator. Existing vNext/v1 code rollback lanes and all legacy/additive database data remain; cleanup and rollback retirement need separate approval.

### Current recovery archive verified

The owner explicitly approved account lookup, D1 access and Wrangler’s mandatory offline refresh for a current backup, isolated restore verification and logout. Using Wrangler `4.151.0`, full and accounts-only exports of the exact production D1 were captured at `2026-10-15T16:36:36.648Z` under the private evidence directory’s `current-backup-20261015T163625Z` subdirectory. FileVault is enabled; the directory is mode 700 and its files mode 600. The project owner is the retention owner. The archive is a current recovery point, not a reconstruction of the missing August pre-migration export.

| Recovery evidence | Verified value |
|---|---|
| Full SQL SHA-256 | `f43560a3fbedc642eeed034291cac1f1022f7d17b395ea21294601e8a3a16d33` |
| Accounts SQL SHA-256 | `223482274114536d53aee07ff1aec38f815f495889b199009d061839b23fdd5a` |
| Isolated in-memory SQLite restore | Integrity `ok`; zero foreign-key violations |
| Restored data reconciliation | All 14 invariant counts zero; same 6 accounts, 15 plans, 13 records, 4 snapshots and 4 active migration runs |
| Current legacy-authority projection SHA-256 | `842a1edefb99eb87dd241b69f773a9ff061bcc37dbce1f1575011af9a5929a56`, equal to original cutover boundary |
| Temporary CLI access | Wrangler confirmed successful logout after export |
| Post-backup public health | Exact release/schema/D1/paired-authority validator passed at `2026-10-15T16:37:51.736Z` |

The fresh legacy comparison selects accounts created before the original export timestamp (`2026-08-29T08:41:02.000Z`), confirms one row, and hashes `profile_id`, `revision`, original unmodified `profile_json` in profile-ID order using SQLite CLI quote mode without headers (UTF-8/LF with final newline). The resulting full-projection hash equals the recovered historical hash, establishing the selected cohort’s exact equality. The original export join itself cannot be replayed without the missing file. No private SQL rows were included in repository evidence, and no production restore was performed.

**Closeout status: PHASE 11 COMPLETE on 2026-10-15, with an owner-accepted historical retention exception.** Release, migration audit, fresh legacy-byte equality, current integrity/smoke and current backup/restore checks pass. After reviewing the missing original August pre-migration archive and the limits of the current backup, the owner explicitly replied “Accept exception and close Phase 11.” This accepts the historical Section 4 retention failure for this closeout only; it does not claim that the original archive is available or alter future release backup requirements. The current archive protects current recovery but cannot recreate the missing original recovery point. Preserve current recovery material, vNext/v1 code rollback lanes and all legacy/additive data. No next phase, legacy cleanup, rollback retirement or destructive restoration is authorised.


## 13. Completion feedback and landscape corrections — 2026-10-17

The owner explicitly authorised both fixes and deployment after checks. This frontend release places completion before the workout preview and focuses its heading on initial or recovered review; radio input focus remains stable while answering. Compact landscape places the guide beside readable coaching and timer/controls. Portrait presentation, owned media, workout timing, training policy, data schemas, authority and the accepted historical archive exception are unchanged. No Worker/configuration deployment, migration, database reset or destructive restore is required or performed by the Pages workflow.

Local verification: full `pnpm check` passed (including 118 UI/accessibility assertions, domain/data/auth and workout/recovery checks) and two production builds produced the same exact distribution. The existing keyboard validator now permits only negative programmatic-focus tabindex while continuing to reject explicit/dynamic tab order. Browser frames at 874×402, 874×320 and 667×375 landscape, 402×874, 402×650 and 375×667 portrait, plus 1024×768 desktop have no horizontal overflow. All five representative workout movements fit the 874×402 stage through y=394; 874×320 fits through y=312. Early completion and reload both focus the review heading at y≈16, with the save action initially visible; answering Stopped saves one additional local Partial record. A 30-node/21-group progression plan is recorded in the roadmap, with no content implementation approved.

| Frozen release identity | Value |
|---|---|
| Build / cache lane | `b8449f390b94cb9cee17` / `vnext-production1` |
| Distribution SHA-256 | `89e3ac3a5b8f2e82471eedb5e5e8463d8986ed273fb9a376f9f3540406831ebf` |
| Index SHA-256 | `887b435e0ae61611c8c7094f4241fcb2ad2be52874978a06cd135c2b68d03ec8` |
| Service-worker SHA-256 | `e9908395a27351d0a81af67fcb527a6ab83dc171fe02f28ac1cc0fd8c3159884` |

The previous build `f995bec866dc6645b3c0`, exact source `096150391ddc6543c2341af797da3a6f74d4ec2a`, is retained as a complete frozen rollback artifact; all 22 normally served files matched it at `2026-10-17T14:11:22.547Z`. The restore-verified encrypted current backup from 2026-10-15 remains owner-retained; this frontend-only correction does not rerun migration or claim a new D1 reconciliation. Public health is revalidated for deployment. No renewed Cloudflare CLI access is needed.

Evidence is private outside Git under `Documents/Codex/parallette25-release-evidence/2026-10-17-usability-fixes`, including old/new frozen distributions, build/check logs, public health, layout measurements and screenshots. Phase 11 remains closed. Physical Safari/Home Screen safe areas, audio, screen lock/background timing and larger text still await the owner's iPhone 17 test; no physical-device certification is inferred from browser frames.

**Deployment status: successful.** [Controlled workflow 39039910603](https://github.com/kyriakos243/parallettes/actions/runs/39039910603) built exact source `84be1dd4054e50e91937eec84d97b47c0bdbfd47`, reran the complete check/build/isolation/grant chain and deployed at `2026-10-17T14:15:56Z`; Pages artifact `12104015518`. The workflow ran from main `937629a2d26c867338216a4ec6c1bb1f00f6d0c6` and independently checked out the exact requested source. At `2026-10-17T14:16:49.425Z`, all 22 normally served files matched the frozen distribution. Public health at `2026-10-17T14:16:49.951Z` passed exact release/schema/database/paired-authority validation. In the live test account’s existing zero-question recovered review, the completion heading is focused at y≈16 and Save workout at y≈200, including a 402×650 viewport. No new production record was saved, and browser warnings/errors were empty.

Existing open clients may keep the previous service worker while a workout is running. For the owner’s updated-version test, close all Parallette25 Safari tabs and the Home Screen app, then reopen normally; do not clear browser data or sign out. Physical feedback remains the next checkpoint; no additional implementation or progression batch is authorised by this release.


## 14. Batch A progression release — 2026-10-17

The owner accepted all five animations in the isolated final-product player and explicitly authorised deployment after final checks. The separate Batch A acceptance ledger binds candidate fingerprint `01b28dab5f7d6c682f93b89994123b4f2798f8f44c33ebc38f1e1c4b78256e99` and all five literal guide fingerprints. Historical RC.3/media approval and catalogue-v1/v2 fingerprints remain unchanged. Production selects catalogue v3/projection v3 and all three immutable bundles coherently. Five stronger-gated nodes are content-backed; 25 nodes remain gaps. No later batch is authorised.

Runtime upgrade checks cover old pending assessments/guided results, recovered v2 workout playback/swaps/completion, fresh v3 planning/guided evidence, cache invalidation, exact save retry and mixed-version export/import. A plan never gains a newer-catalogue swap. Backup export metadata enumerates v1/v2/v3. The new accepted guides use the unchanged renderer/player/CSS. The existing shorter-session safety exception remains explicit rather than adding load to fill the clock.

Fresh recovery material is retained privately under `Documents/Codex/parallette25-release-evidence/2026-10-17-batch-a-release/current-backup`. Wrangler 4.151.0 used the same temporary account-read/D1/background scopes previously approved by the owner. The exact production D1 identity was confirmed; a fresh bookmark and full/accounts SQL exports were captured. Both restored in isolated memory, SQLite integrity is `ok`, foreign-key violations are zero and all 14 reconciliation invariants are zero. FileVault is on, the directory/files are 700/600, and temporary CLI access was successfully logged out. Full SQL SHA-256: `ba5b43e0bc270edf2d2d8eee572580a246da2fcdaa1790919c185620509bd778`; accounts SHA-256: `223482274114536d53aee07ff1aec38f815f495889b199009d061839b23fdd5a`. No production restore, direct SQL mutation, migration, schema or Worker deployment is part of this release.

The previously served 22 files were independently matched to build `b8449f390b94cb9cee17` / distribution `89e3ac3a5b8f2e82471eedb5e5e8463d8986ed273fb9a376f9f3540406831ebf` and retained. The new frozen build is `71bef225371de61db7a6`, distribution `d241037371556344d387cfaef8eeca02472e9c0db70542da02bce919bbbc6b3c`, index `31e1e9d6a6205b70872f6bdb22e7186096b75432020875c816bf0ed0434e9565`, worker `242a11abda9a67d4d6e8408b290a4cde37d3cc28ea72680eeadd54b1a322ddff`, cache lane `vnext-production1`.

**Deployment status: successful.** [Controlled workflow 39044314733](https://github.com/kyriakos243/parallettes/actions/runs/39044314733) independently checked out exact source `6858f12d36a6cee0f66771a44efbf8d394108db3`, reran the full check/build/isolation/grant chain, and deployed Pages artifact `12104998981` at `2026-10-17T15:18:11Z`. Its workflow ref was main `b4e3cfd0ef85c52d810081114b239f9aa70fc8f0`; that ref is distinct from the exact built source. At `2026-10-17T15:21:44.161Z`, all 22 normally served files matched the frozen distribution byte-for-byte. Public API health passed exact release/provenance/D1/schema identity and paired sync/production authority. Local full checks included 1,635 focused Batch A content/upgrade checks; repeat production builds were identical.

Authenticated production smoke used only the owner-created test account. The pending catalogue-v2 zero-question review saved once as its original 4-second Partial record and synced. A fresh catalogue-v3 workout paused during preparation at 00:03 elapsed / 00:42 remaining; Save & close, reload and Resume preserved those facts. It ended after 6 seconds of preparation, requested no unperformed development rating, saved one Partial record and synced. After another reload, History contained three total entries, exactly one per plan (two v2, one v3). The normal UI export enumerated catalogue versions `[1,2,3]` and projection version `[3]`; all three plans had one record and no benchmark observations. No advanced achievement or health answer was fabricated. The existing unfinished placement draft reopened and was closed without changing answers. App warnings/errors were empty.

Live browser checks at 402×874 portrait and 874×402 landscape preserve the accepted layout without horizontal overflow; screenshots, full logs, exact artifact/health comparisons and the private mixed-version export are retained under `Documents/Codex/parallette25-release-evidence/2026-10-17-batch-a-release`. Physical iPhone/Safari/Home Screen behavior remains the owner's follow-up. Close all Parallette25 tabs and the Home Screen app, then reopen normally to let an older service worker release its client; do not clear data. The five stronger-gated additions appear only when current prerequisites permit them. Batch A is delivered; Phase 11 remains closed and Batches B–F remain unapproved.

**Rollback boundary:** the previous v2 frontend is usable only before any v3 observations are written. Once v3 facts exist, retain v3 reading compatibility for a frontend repair; a bare v2 artifact would fail closed on that newer history. The existing controlled retained-v1 authority rollback remains the separate operational fallback described in Section 8, preserving all legacy/additive observations. No database rewind, data deletion or silent downgrade is authorised. Existing older devices must update before interpreting v3 observations.


## 15. Combined B–F progression release — 2026-10-17

**Delivered.** After accepting every B–F animation, the owner explicitly authorised combined checks and deployment once they passed. This lifted the earlier hold until all batches were finished. Production catalogue/projection v8 completes the agreed 30-step inventory: 255 exercises, 124 protocols and all 103 frozen graph nodes backed, with zero gaps. Native history v1–v8 and export metadata remain coherent. Graph edges, capacities, prerequisites, restrictions, freshness and specialist opt-in plus exact-goal gates are unchanged; content availability never grants athlete readiness. The handstand-through-90-degree-to-Planche connector retains its explicit active lockout.

The separate combined release adapter preserves A/RC media gates and every original B–F guide, candidate, source and owner-acceptance fingerprint. Prepared manifests remain historical evidence; separate literal ledgers record acceptance. Production registers exact accepted B–F coordinate snapshots with no generated fallback and imports the F-approved sizing stylesheet (SHA-256 `b8fd8ae322eb8a5aa437d72c33bb4cb270a534305492ce82c1b6a9dedbb171d8`). Shared renderer/player sources remain unchanged.

Cross-platform validation exposed small generator-reference differences. Attempts `39064448648` and `39064911964` stopped before publication; their diagnostics are retained. Literal approval hashes remained exact. C/D/E regeneration differed by at most `1.14e-13`; four F reference leaves at the near-straight knee sample `full-planche-to-handstand-transition.poses.175.{lk,rk}.{x,y}` differed by at most `1.2450951487608108e-6`. Only those four generated reference coordinates permit `2e-6`; all others retain `1e-10`, with exact shape/metadata, finite checks and physical geometry checks. Negative tests prove the exception cannot grant a changed literal approval hash, exceed its bound or affect another sample. The shipped animation data and training conditions did not change. The application chunk is 6.47 MB uncompressed / 1.33 MB gzip and is precached by the existing PWA.

### Recovery and rollback

Fresh recovery evidence is retained outside Git under `Documents/Codex/parallette25-release-evidence/2026-10-17-combined-progression/current-backup`, in FileVault-protected storage, directory mode 700 / files 600. The project owner retains it. Wrangler 4.151.0 independently confirmed the exact production D1 and captured its bookmark plus full/accounts exports at `2026-10-17T19:47:15.982950Z`, using the previously approved temporary account-read/D1/offline-refresh scopes. Both exports restore in isolated memory: integrity `ok`, zero foreign-key violations and all 14 invariants zero. At that checkpoint there were 6 accounts, 20 plans, 32 events, 18 records and 4 snapshots/active migration runs. Temporary CLI access was successfully logged out.

- Full SQL SHA-256: `d28b48a3cd6c8c0d79de91abbbd83facb686584c6eaea430e582250c6ff16328`.
- Accounts SQL SHA-256: `223482274114536d53aee07ff1aec38f815f495889b199009d061839b23fdd5a`.

All 22 previously served files matched the accepted A build `71bef225371de61db7a6` at `2026-10-17T19:43:43.744077Z`; its complete artifact is retained. After any v8 facts exist, a bare A/v3 frontend is not a valid repair: preserve all v1–v8 readers and observations. Retained-v1 authority rollback remains the separately controlled fallback in Section 8. Never overwrite newer facts with a pre-release database. No Worker/configuration deployment, schema, new migration, direct SQL mutation, reset or destructive restore is part of this release.

### Frozen publication and live verification

[Controlled workflow 39065166577](https://github.com/kyriakos243/parallettes/actions/runs/39065166577) checked out exact source `f0081072df9416913174ff7ca8f2f9b5ce163d33`, reran full checks (including 394 combined upgrade/recovery/media assertions), type checking, production build, PWA/authority isolation and exact artifact grant. It deployed Pages artifact `12112623716` at `2026-10-17T20:07:18Z`. The workflow ref was main `a99ff41c7d9a0c756234d6ac1f9828e09646d706`, distinct from the verified built source.

| Release identity | Verified value |
|---|---|
| Build / cache lane | `f636d83a464a940fe927` / `vnext-production1` |
| Distribution SHA-256 | `432c606f09d25faa03aa45477096ce1f5e9d13bc5941902bb234edfe5e17df6e` |
| Index SHA-256 | `5417c4b081cb2f4355b1e91e745007ba65d4f91aa425df6fed4c9e909fc2ecd9` |
| Service-worker SHA-256 | `a356648821e991c42ed56875bcf3bbda63b07e3b0954cf1368b00c25556efa9a` |

Repeat builds match exactly. At `2026-10-17T20:08:04.866898Z`, all 23 normally served files matched the frozen distribution. Public health passed exact release/schema/D1 identity and paired sync/production authority. Ninety isolated final-player layouts covered every accepted guide at 402×874, 402×760 and 874×402, including complete SVG bounds; paused rotation also passed.

Authenticated smoke used only the existing owner-created `phase11-review` account. A new v8 workout paused during preparation at 00:09 elapsed / 00:36 remaining; Save & close/reload preserved both exactly, and Resume remained available. Ending early recovered the focused completion form in a fresh tab, requested no unperformed development rating and saved one synced 9-second Partial record. Another reload shows four entries, one per plan: two v2, one v3 and one v8. The three earlier plans/records are unchanged compared with the Batch A export; no benchmark events were created. Normal export enumerates native v1–v8 and projection v8. Live phone-size checks pass at 402×874 (stage ends at y=866) and 874×402 (y=394), without horizontal or SVG overflow. Browser warnings/errors are empty. Logs, screenshots, exact artifacts and private exports remain in the release-evidence directory outside Git.

**Owner acceptance:** the owner reports the full update looks good on iPhone 17 and all three requested checks pass: portrait/landscape visibility, pause/reopen/resume and completion with one History entry. Optional offline/audio/background/screen-lock/larger-text/Home Screen behavior remains unreported, not inferred as passed. Phase 11 stays closed with its historical archive exception; future recovery retention requirements remain unchanged. PR #25 is merged as main `f8b08609c4679e82119cd0004d68a3e7eea7fc90`, whose application tree matches the deployed source. The subsequent Custom preview fix is a separate local correction; no new deployment, training-order change, cleanup or rollback retirement is authorised by this acceptance.


## 16. Mixed workout structure and Custom animated preview — 2026-10-17

**Delivered and owner accepted on iPhone 17, 2026-10-18.** The owner approved the recommended mixed structure, inclusion of the Custom preview correction and deployment once checks pass. New-plan execution is canonical in Training Engine Section 6.6; compatibility is canonical in Data & Migration Section 5.9. Historical generator/runner/media/definition approval bytes remain intact. New plans add no wire fields or Worker/schema change. Existing saved workouts retain their native order.

Full validation and TypeScript pass, including 394 combined progression checks, 50 mixed full/Custom/demand/equipment plans and seven actual-component timer/recovery scenarios. Both current client and current Worker validators accept the new plan/record pairs. Tests retain exact work and rest totals, primary/technical protection, final-occurrence completion, safe swap boundaries including rewind/reload, performed-only partial review, one-record retries and mixed-policy export/import. Local real-browser preparation advanced wrists → rest → shoulder sweep, paused at 01:02 elapsed / 00:43 remaining and recovered exactly. Ending saved one 47-second preparation-only Partial record with no development rating. All seven 20-minute Custom preview cards render owned guides; a safe regression survives reload into the player and cancellation leaves that one History entry unchanged. Browser warnings/errors are empty. Player stages end at y=866 (402×874), y=752 (402×760) and y=394 (874×402), with complete guide/coaching/controls and no horizontal overflow.

The prior combined release's 23 served files match its frozen artifact at 2026-10-17T20:42:01.865423Z; main is verified as PR #25 merge `f8b08609c4679e82119cd0004d68a3e7eea7fc90`. Fresh public API health passes exact release/schema/D1 identity and paired authority. A fresh FileVault-protected full/accounts export at `2026-10-17T20:46:10.812288+00:00` restores into isolated memory with integrity `ok`, zero foreign-key violations and all 14 invariants zero. Counts: 6 accounts, 21 plans, 32 events, 19 records, four snapshots/active migration runs. Full export SHA-256 `4d95bada46d42448004949165f8929de72ed8f8f80d0c565f59383d88ec497ab`; accounts SHA-256 `223482274114536d53aee07ff1aec38f815f495889b199009d061839b23fdd5a`. The owner retains the archive outside Git; temporary same-scope CLI access is logged out. No production restore, SQL mutation, Worker/configuration deployment, migration, reset or deletion occurs.

The checked production artifact builds identically before/after its grant binding: build `2e2103dcc57af6ac454b`, cache lane `vnext-production1`, distribution SHA-256 `e20977b5d3ad8c3aed998a5d51f79d3f182e97423a0242b6c63915c3a8f20a4a`, index `b677d75cc6cdc62dcec683ad224fbf9ab919ee2497c7d8588888804fb1201a18`, service worker `085e842734d4c3a4860bc60f1a59df98f553fe066fb2ea0f8fc7462d5efc99a4`. Exact-artifact grant verification passes. Evidence, frozen artifact and screenshots are retained privately under `Documents/Codex/parallette25-release-evidence/2026-10-17-mixed-workout`. Preserve old and mixed execution readers and all native v1–v8 definitions for frontend repairs; never rewind the database over newer observations.

[Controlled workflow 39068343601](https://github.com/kyriakos243/parallettes/actions/runs/39068343601) checked out exact source `d794a410024fe63e6c93ca0b2bd04bd88a20bf5e`, reran full checks/build/isolation/grant and completed publication at `2026-10-17T20:51:29Z`. Its workflow ref was verified main `f8b08609c4679e82119cd0004d68a3e7eea7fc90`, distinct from the built source. At `2026-10-17T20:52:30.297349Z` all 23 served files matched the frozen distribution, and fresh API health passed.

Live smoke used only the existing owner-created test account. All seven Custom preview guides render; cancellation preserves four existing records. A safe Knee Push-Up regression survives reload before start. The mixed Custom player pauses at 00:14 elapsed / 00:31 remaining; Save & close/reload preserves both exactly, paused. Ending from the recovered draft requests no unperformed development rating, saves one synced 14-second preparation-only Partial record, rebuilds Today and retains exactly five History entries after another reload. Normal exports prove all four earlier plans/records unchanged, no added Evidence Events or benchmark observations, native definition versions v1–v8 and projection v8; the new plan retains `vnext-mixed-workout-generator@1`. Live player stages end at y=866 portrait and y=394 landscape, with no horizontal overflow and empty browser warning/error logs. The final preview screenshot and layouts are retained with private evidence.

On 2026-10-18 the owner reports all three requested checks pass on iPhone 17: all Custom preview guides/swaps; rotating sets with instructions/controls in portrait and landscape; and pause/reopen/resume followed by completion with exactly one History entry. This closes physical acceptance of the mixed-workout/Custom-preview update. Short sessions or incompatible work can retain focused sets. Background/screen-lock timing, audio, larger text, offline and Home Screen behavior remain optional unreported checks. Phase 11 stays closed with its historical archive exception. The owner explicitly approved merging [PR #26](https://github.com/kyriakos243/parallettes/pull/26) on 2026-10-18; it integrates the update, release record and this acceptance into main. The application tree remains the exact deployed source; recording acceptance requires no new deployment. No further implementation or cleanup is authorised.


## 17. Foreground timer and background recovery — 2026-10-18

**Delivered and live verified, 2026-10-18 local time; physical iPhone acceptance pending.** The owner requested timer/background reliability first and deployment after checks. Engine §6.7 defines the pause/foreground policy; Data §5.10 defines unchanged native records and additive advisory pause reason. The original SHA-pinned runner and media approval bytes are unchanged; production native-order workouts use the reliable adapter while mixed workouts use the same clock. Definitions v1–v8, catalogue/projection v8, all gates, prescriptions and work/rest budgets remain intact.

Verified main baseline is PR #26 merge `23fa6ad481f3c49a3012a65567c381a610c6aeaa`; its application tree matches deployed source `d794a410024fe63e6c93ca0b2bd04bd88a20bf5e`. All 23 prior public files match the accepted frozen artifact; API health passes exact release/schema/D1/paired-authority checks. Full checks and type checking pass; final timing review covers 31 actual component/hook/controller scenarios. Independent focused review found no actionable issue. Local browser leaving/back and reload retain 00:46 elapsed / 00:14 rest remaining, with an explicit paused message; Resume clears it and rest advances normally. Ending at 01:19 elapsed requests no development ratings and saves one preparation-only 64-second Partial record. Phone stages end at y=866 portrait and y=394 landscape without horizontal overflow.

Fresh full/accounts recovery exports were captured at `2026-10-17T21:19:40.146265+00:00` in FileVault-protected owner-retained storage. Both restore in isolated SQLite with integrity ok, no foreign-key failures and all 14 reconciliation invariants zero; at capture: six accounts, 22 plans, 32 events, 20 records and four active migration runs/snapshots. Full SQL SHA-256 `c07572809a2f9248c40f1ebfa89865d074e692113a914c06f19c783ccad93113`; accounts `223482274114536d53aee07ff1aec38f815f495889b199009d061839b23fdd5a`. Same previously approved temporary account-read/D1/offline-refresh access was renewed and successfully logged out. No production restore, SQL mutation, Worker/configuration/schema deployment, migration, reset or deletion is part of this release.

Frozen artifact: build `3f206f064e124bdba15d`, cache lane `vnext-production1`, distribution `cdb86cd2ae4eff0c2b1afdad7c86f8b6ef49851a461db9e8ea3a9cac8a262379`, index `05e67a69ca9b290572704a8a10d011297e18a337cd518192e7beb33d26763024`, service worker `6b5394d0a12ef0cd07b91bba02b90ab24810198f81cc65028a85de70c35e5bbd`. Rebuilding after exact grant binding reproduces the same artifact. Evidence and frozen distribution are retained outside Git under `Documents/Codex/parallette25-release-evidence/2026-10-18-timer-reliability`. Preserve native and mixed readers and v1–v8 definitions in a repair; never rewind current observations. This frontend correction does not retire the separate retained-v1 authority rollback.

[Controlled workflow 39070805835](https://github.com/kyriakos243/parallettes/actions/runs/39070805835) ran from main `23fa6ad481f3c49a3012a65567c381a610c6aeaa`, checked out exact requested source `013f4946a7daae39d21f3c0e808fd8ef3c74b7ce`, reran full validation (including all 31 lifecycle cases), type checking, build, isolation and exact grant binding, and completed deployment at `2026-10-17T21:26:25Z` (2026-10-18 in Asia/Nicosia). At `2026-10-17T21:26:45.086624+00:00` all 23 public files matched the frozen artifact, and fresh API health passed. [PR #27](https://github.com/kyriakos243/parallettes/pull/27) contains this release and its record; it remains open for the owner checkpoint.

Live smoke used only the owner-created `phase11-review` account. The timer reached 00:12 elapsed / 00:33 work remaining; leaving the page, returning after more than ten seconds and reloading preserved those exact facts and the explicit paused message. Resume alone restarted timing and cleared the message. Browser screen wake lock was accepted; no physical iPhone behavior is inferred. Ending at 28 seconds requested no development ratings and saved one synced preparation-only Partial record. Reload retained six History entries, exactly one per plan. Before/after exports prove all five earlier plans/records unchanged, no new evidence events or benchmark observations, and native definitions v1–v8 retained. Phone-size stages end at y=866 portrait and y=394 landscape with no horizontal overflow. Browser warning/error logs are empty. Screenshot, layouts, exports and workflow evidence are retained privately with the frozen release.

Owner follow-up: close all Parallette25 tabs and the installed app, then reopen normally without clearing data. During a short test-profile session, switch apps for about 15 seconds and separately lock the screen for 15 seconds; both returns must preserve the exercise/set and countdown, show paused state and await Resume. Leave the visible running workout untouched past the phone's ordinary auto-lock period to check screen wake lock; if unavailable, the app should still pause safely on lock. Finish/save once, reload and confirm one new History entry. Repeat in Safari/Home Screen mode if both are normally used. Report the mode, exact iOS version and observed behavior if any check fails. The separate historical archive exception remains closed and future retention requirements remain intact.
