# Parallette 25+

A mobile-first Parallette25 V2 engine containing five permanent themes, 170 tagged movements, three session levels, equipment-aware Custom Sessions, role-matched swaps and optional Calisthenics Lab work. Every recommended session is exactly 25 minutes; Progress and Challenge can add five minutes for an exact 30-minute session. Custom Sessions support exact 5/10/15/20/25/30-minute builds.

The documented exercise-count adjustment from the specification’s proposed 163 to the audited 170-movement production pool is recorded in [docs/V2_AUDIT_ADJUSTMENTS.md](docs/V2_AUDIT_ADJUSTMENTS.md).

The authoritative session order is **Dynamic Warm-up → Prepare → Handstand → optional Calisthenics Lab → Abs/Core → static Cooldown & Stretching**.

**Current live app:** https://kyriakos243.github.io/parallettes/

The V2 work is intentionally developed on a separate branch/PR first. The current live URL remains on the previous stable release until the V2 checks and review are complete.

## Demonstration system and media policy

- Dynamic and transition movements use owned, multi-keyframe motion guides that remain sharp on an iPhone or iPad.
- Static positions use one technically precise full-body key position; the app never manufactures a fake two-frame animation.
- Parallette and wall guides explicitly preserve hand, foot, bar and wall contact. Freestanding and higher-risk drills are protected by readiness gates.
- The media component supports muted looping MP4 clips plus posters when a professionally filmed, redistribution-cleared asset is available.

Do not add third-party GIFs from scraped exercise repositories unless the original asset licence explicitly permits redistribution. ExerciseDB, MuscleWiki and many public mirrors prohibit local bundling or contain commercial artwork without transferable rights. Every bundled third-party asset must have traceable provenance in the media manifest.

**Live app:** https://kyriakos243.github.io/parallettes/

## Local development

Requirements: Node.js 22+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/parallettes/`.

## Production build

```bash
pnpm build
pnpm preview
```

The static site is written to `dist/`. The Vite base path is already configured as `/parallettes/` for the repository URL.

## GitHub Pages

The included `.github/workflows/deploy-pages.yml` workflow builds and deploys the site whenever `main` is updated.

1. In the GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push or merge the project into `main`, or run the workflow manually from **Actions**.
4. After the workflow finishes, open `https://kyriakos243.github.io/parallettes/`.

## Add to an iPhone

Open the live site in Safari, tap **Share**, then choose **Add to Home Screen**. Profiles, difficulty choices, swaps, Lab settings, readiness and history are cached on the device. The optional `VITE_PROFILE_API_URL` proxy enables cross-device profile sync without placing a GitHub token in the browser; when it is not configured, the app remains local-first and supports JSON backup/import.

## Optional shared username profiles

The static Pages bundle never contains a write credential. A small Cloudflare Worker template is included in `profile-api/`; it stores username profiles in KV and enforces revision checks.

1. Create a Workers KV namespace and copy `profile-api/wrangler.toml.example` to `profile-api/wrangler.toml`.
2. Insert the namespace ID, then deploy the Worker from that folder.
3. In the GitHub repository, create the Actions variable `VITE_PROFILE_API_URL` containing the Worker URL (without a trailing slash).
4. Run the Pages workflow. The same username can then be selected on another iPhone while IndexedDB remains the offline cache.
