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

4. Publish the frozen `parallette25-vnext.1` app/service-worker artifacts with the recorded hashes.
5. Switch the served application coherently to vNext production read/write authority. Never run a v1.2 presentation with vNext writes, or a vNext presentation with v1.2 progression authority.
6. Confirm a stale/incorrect build identity fails inert rather than falling back to legacy startup, and confirm the service worker does not mix v1 and vNext cache lanes.

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

Export the `accounts` table again. New registrations and password recovery may legitimately change account rows during the observation window, so do not require the whole table to remain byte-identical. Instead, compare the pre-existing cohort's legacy training-authority projection (`profile_id`, revision and profile blob) privately and record only matching before/after hashes. Run the checked-in read-only query and retain all result sets:

```sh
cd profile-api
npx wrangler d1 export parallette25-profiles --remote --table=accounts --output="$release_evidence_dir/accounts-after.sql"
shasum -a 256 "$release_evidence_dir/accounts-after.sql"
npx wrangler d1 execute parallette25-profiles --remote --file=phase11-reconciliation.sql --json
```

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
