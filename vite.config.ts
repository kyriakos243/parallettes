import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageJson from "./package.json";

export default defineConfig({
  // The Phase 9 release candidate is built beneath `/vnext-rc/` so its
  // service worker cannot claim the ordinary v1.2 application scope.
  base: process.env.P25_BUILD_BASE ?? "/parallettes/",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
  },
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "vendor", test: /node_modules/u }],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    watch: process.env.CODEX_SANDBOX === "seatbelt"
      ? { useFsEvents: false, usePolling: true }
      : undefined,
  },
});
