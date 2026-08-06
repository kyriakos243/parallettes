# Parallette 25

A mobile-first workout app containing five guided 25-minute parallette core and handstand sessions. It includes smooth exercise demonstrations, equal-difficulty swaps (including warm-up and cooldown alternatives), editable work/rest intervals, a full-screen countdown timer, audio cues, and iPhone Home Screen support.

**Live app:** https://kyriakos243.github.io/parallettes/

## Demonstration system

- Dynamic warm-ups, cooldowns and common floor-core movements use lightweight continuous vector motion that remains sharp on an iPhone or iPad.
- Parallette- and wall-specific drills use their original full animated GIF demonstrations, including static-position guides.
- The media component also supports muted, looping, inline MP4 clips for any professionally licensed animation pack added later. MP4 is preferred to GIF for smoother playback and smaller downloads on mobile.

Do not add third-party GIFs from scraped exercise repositories unless the original asset license explicitly permits redistribution. Many public repositories expose GymVisual or other commercial artwork without transferable rights.

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

Open the live site in Safari, tap **Share**, then choose **Add to Home Screen**. Workout choices and timer settings are stored locally on the device.
