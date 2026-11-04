import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // One eager entry and no modulepreload links: the fallback has no work to do.
  // Revisit this option if dynamic imports or multiple entries are introduced.
  build: { modulePreload: { polyfill: false } },
  server: { proxy: { "/api": "http://127.0.0.1:5050" } },
});
