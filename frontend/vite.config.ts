import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const githubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  base: githubPages ? "/fly/" : "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
