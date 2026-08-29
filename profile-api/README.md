# Parallette25 profile sync

This Cloudflare Worker provides private, password-protected accounts so the same profile can be opened on an iPhone, iPad or another browser. The training app remains local-first and usable offline; cross-device sync resumes when the device reconnects.

## One-time setup

1. Confirm `wrangler.toml` contains a `DB` D1 binding and the allowed GitHub Pages origin. Workers Builds can automatically provision the named D1 database when `database_id` is omitted.
2. Keep the existing `PROFILES` KV binding during migration so an old passwordless profile can be claimed once. New accounts and sessions are stored only in D1.
3. Apply the checked-in D1 migration before deploying: `npx wrangler d1 migrations apply parallette25-profiles --remote`.
4. Run `npx wrangler deploy`. For Cloudflare Workers Builds, use `profile-api` as the root directory and `npx wrangler d1 migrations apply parallette25-profiles --remote && npx wrangler deploy` as the deploy command. Schema changes never run inside a user request.
5. Copy the resulting `https://...workers.dev` URL.
6. In GitHub, open **parallettes → Settings → Secrets and variables → Actions → Variables** and add:
   - Name: `VITE_PROFILE_API_URL`
   - Value: the Worker URL, with no trailing slash
7. Run the GitHub Pages workflow, or merge the release into `main`.

The Worker permits browser requests from `https://kyriakos243.github.io` by default. If the Pages domain changes, update `ALLOWED_ORIGINS` in `wrangler.toml` and deploy the Worker again.

## vNext shadow observations

Migration `0002_vnext_shadow_observations.sql` adds normalised vNext observation, intent, reset, snapshot and migration-receipt tables without changing the v1.2 profile blob. The authenticated `POST /vnext/shadow/sync` delta route is disabled unless the Worker environment explicitly sets `VNEXT_SHADOW_MODE` to `true`.

During Phases 4–10, that variable was enabled only in a local, preview or otherwise isolated shadow environment. Phase 11 may enable it in production only at the explicit checkpoint below. Requests use the existing bearer authorization and bounded body reader; immutable identity conflicts fail closed, while exact retries are idempotent.

## Phase 11 release health and operations

`GET /health` is read-only and reports three gates separately:

- ordinary password/D1 and legacy-schema health;
- configured production release identity plus the accepted RC.3 provenance;
- migration-0002/immutability readiness and whether authenticated vNext sync is enabled.

The checked-in production configuration carries only non-sensitive identity values for `parallette25-vnext.1`. `VNEXT_SHADOW_MODE=true` remains deliberately absent until the snapshot, additive-schema, disabled-API health and rollback-owner gates in the [Phase 11 production runbook](../docs/VNEXT_PRODUCTION_RELEASE_RUNBOOK.md) pass. A healthy v1.2 API does not imply that vNext is ready; final readiness requires exact identity, complete observation schema and explicit sync enablement.

The runbook also defines private D1 snapshot evidence, the read-only `phase11-reconciliation.sql` checks and the fail-closed `scripts/vnext-phase11-release-ops.mjs` preflight/reconciliation/rollback-plan commands. Neither script deploys, migrates, restores nor deletes data. Never put database exports or credential material in the repository.

## Privacy and security model

- No GitHub token or Cloudflare credential is included in the website.
- Usernames are unique case-insensitively and are never publicly listed.
- Passwords are transformed with PBKDF2-SHA256 and a unique salt; the plaintext password is never stored.
- Sign-in uses a revocable, opaque 30-day bearer session stored only on the signed-in device.
- A one-time recovery code is shown after registration or legacy claim. Recovery rotates the code and signs out other sessions.
- Failed authentication is rate-limited. Profile reads and writes require the account session, and deletion also requires the password.
- Guest sessions are never uploaded.
- IndexedDB remains the offline cache, and unsynced changes retry when the device reconnects.
- Existing passwordless KV profiles cannot be browsed. They can only be claimed by a device that already has the matching local profile identifier.

The KV namespace identifier in `wrangler.toml` is deployment configuration, not a credential. Never commit Cloudflare API tokens, account credentials, or other secrets.
