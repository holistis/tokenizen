import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    // Component tests use react-dom/server (renderToStaticMarkup), which
    // needs no DOM. Keeps this fast and avoids adding jsdom as a dependency.
    environment: "node",
  },
});
