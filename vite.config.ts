import { defineConfig } from "vite"

// Vite config: relative base (works behind the RunPod proxy at any path) + a documented home for the
// build. VITE_BASE_LANG (read in the app) is injected at build time by setup.sh; default is fine for dev.
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 1200 },
})
