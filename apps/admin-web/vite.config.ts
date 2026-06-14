import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 3001,
    // Same-origin /api in dev so HttpOnly admin session cookies work.
    proxy: {
      "/api": { target: "http://127.0.0.1:3002", changeOrigin: true },
    },
  },
});
