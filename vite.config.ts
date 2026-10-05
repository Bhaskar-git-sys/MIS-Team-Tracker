import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base:
    process.env.GITHUB_ACTIONS === "true" && repositoryName
      ? `/${repositoryName}/`
      : "/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: null,
  },
  optimizeDeps: {
    exclude: ["three"],
  },
});
