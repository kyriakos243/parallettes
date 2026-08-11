# Parallette25 profile sync

This Cloudflare Worker provides private, password-protected accounts so the same profile can be opened on an iPhone, iPad or another browser. The training app remains local-first and usable offline; cross-device sync resumes when the device reconnects.

## One-time setup

1. Confirm `wrangler.toml` contains a `DB` D1 binding and the allowed GitHub Pages origin. Workers Builds can automatically provision the named D1 database when `database_id` is omitted.
2. Keep the existing `PROFILES` KV binding during migration so an old passwordless profile can be claimed once. New accounts and sessions are stored only in D1.
3. From this folder, run `npx wrangler deploy`, or connect this repository in Cloudflare Workers Builds with `profile-api` as the root directory and `npx wrangler deploy` as the deploy command.
4. The Worker creates its tables on the first account request. The SQL in `migrations/0001_password_accounts.sql` is also provided for explicit migration workflows.
5. Copy the resulting `https://...workers.dev` URL.
6. In GitHub, open **parallettes → Settings → Secrets and variables → Actions → Variables** and add:
   - Name: `VITE_PROFILE_API_URL`
   - Value: the Worker URL, with no trailing slash
7. Run the GitHub Pages workflow, or merge the release into `main`.

The Worker permits browser requests from `https://kyriakos243.github.io` by default. If the Pages domain changes, update `ALLOWED_ORIGINS` in `wrangler.toml` and deploy the Worker again.

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
