import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/parallettes/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    watch: process.env.CODEX_SANDBOX === "seatbelt"
      ? { useFsEvents: false, usePolling: true }
      : undefined,
  },
});
