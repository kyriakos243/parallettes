# Parallette 25

A mobile-first workout app containing five guided 25-minute parallette core and handstand sessions. It includes animated exercise demonstrations, equal-difficulty swaps, editable work/rest intervals, a full-screen countdown timer, audio cues, and iPhone Home Screen support.

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
