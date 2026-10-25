import { defineConfig } from "vite";

/** Frontend-only build; API is served by the Hono Node server. */
export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // Not used when running via `npm run dev` (Hono serves + proxies Vite in dev).
    port: 5173,
  },
});
