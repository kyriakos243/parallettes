# Parallette25 profile sync

This optional Cloudflare Worker gives permanent username profiles a small shared store so the same profile can be opened on an iPhone, iPad, or another browser. The app remains usable offline and without this service, but cross-device sync requires it.

## One-time setup

1. Sign in to Cloudflare and create a Workers KV namespace named `parallette25-profiles`.
2. Copy `wrangler.toml.example` to `wrangler.toml`.
3. Replace `replace-with-your-kv-namespace-id` with the namespace ID shown by Cloudflare.
4. From this folder, run `npx wrangler deploy` and copy the resulting `https://...workers.dev` URL.
5. In GitHub, open **parallettes → Settings → Secrets and variables → Actions → Variables** and add:
   - Name: `VITE_PROFILE_API_URL`
   - Value: the Worker URL, with no trailing slash
6. Run the GitHub Pages workflow, or merge the V2 pull request into `main`.

The Worker permits browser requests from `https://kyriakos243.github.io` by default. If the Pages domain changes, update `ALLOWED_ORIGIN` in `wrangler.toml` and deploy the Worker again.

## Privacy and security model

- No GitHub token or Cloudflare credential is included in the website.
- Profiles intentionally use a username without a password, as specified for V2.
- A username is a convenient selector, not authentication. Anyone who knows a username can open that profile.
- Guest sessions are never uploaded.
- IndexedDB remains the offline cache, and unsynced changes retry when the device reconnects.

Do not commit a real `wrangler.toml` containing deployment identifiers if you prefer to keep those identifiers private. The checked-in example is sufficient for future setup.
