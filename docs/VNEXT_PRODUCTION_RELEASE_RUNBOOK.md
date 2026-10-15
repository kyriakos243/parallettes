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

Fresh read-only production reconciliation after that save reported 6 accounts/sync heads, 78 changes, 15 plans, 32 evidence events, 13 records, 6 intents, 2 reset tombstones, 4 legacy snapshots and 4 active migration runs. Rolled-back runs/entities and all 14 integrity invariant counts were zero. The original pre-export cohort query returned one account, revision 227, with latest legacy write still `2026-08-29T08:55:41.492Z`. These are current aggregate/metadata checks; they are not a fresh byte-for-byte legacy payload comparison.

The original project audit was located and its non-sensitive evidence metadata recovered. It records successful isolated SQL restore integrity, equal cutover/reconciliation/post-merge/final-source legacy hashes `842a1edefb99eb87dd241b69f773a9ff061bcc37dbce1f1575011af9a5929a56`, and passing final preflight/reconciliation validators at `2026-08-29T13:16:32.717Z`. The original observation window ended `2026-08-30T08:40:19Z`; the project owner remains the release/rollback decision owner. No rollback or destructive restoration occurred during this closeout work.

**Recovery evidence limitation:** The original SQL exports and projection files are absent from their recorded temporary directory, and no durable copy was located in the relevant project/evidence locations. Recovered hashes and the historical restore result do not recreate those files. The dashboard returned a current D1 Time Travel bookmark on 2026-10-15, retained privately; the dashboard confirms a seven-day restore window. It is neither a durable export nor the original recovery point. Original backup availability must not be represented as verified.

Current build artifacts, logs, screenshots, API health, aggregate checks, the recovery bookmark and authenticated smoke notes are retained outside Git under the operator's `Documents/Codex/parallette25-release-evidence/2026-10-15-phase11-closeout` directory. The historical audit metadata is in the sibling `2026-10-15-workout-ux/recovered-migration-evidence.json` (SHA-256 `0c8bfcd39594b11f0fa5906ac591a3271e79be4802edba0120909964287cd780`). These files contain no athlete payloads or credentials. FileVault was confirmed enabled on the operator machine during closeout; evidence directories restrict access to the operator. Existing vNext/v1 code rollback lanes and all legacy/additive database data remain; cleanup and rollback retirement need separate approval.

**Closeout status:** Release, migration audit and current integrity/smoke checks pass; Phase 11 stays open only for the recovery archive retention exception. Section 4 required durable evidence retention. Complete a current encrypted full export and isolated restore verification, then obtain owner acceptance of the missing historical archive if the original cannot be found. Recording the limitation under Section 9 does not by itself waive that retention requirement.
