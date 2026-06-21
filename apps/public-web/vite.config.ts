import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 3000,
    // Bind all interfaces so a phone on the same LAN can reach the QR target
    // (http://<lan-ip>:3000). Without this, Vite binds localhost only and
    // off-device scans can't connect.
    host: true,
    // Same-origin /api in dev so HttpOnly session cookies survive mobile browsers.
    // Production uses Traefik (or similar) on one host; split ports break Safari QR claim.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true,
      },
    },
  },
});
