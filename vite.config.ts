import path from "path";
import fs from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { mochaPlugins } from "@getmocha/vite-plugins";

export default defineConfig({
  plugins: (() => {
    const plugins = [
      ...mochaPlugins(process.env),
      react(),
    ];

    const auxiliaryConfigPath = path.resolve(__dirname, "mocha", "emails-service", "wrangler.json");
    if (fs.existsSync(auxiliaryConfigPath)) {
      plugins.push(
        cloudflare({
          auxiliaryWorkers: [{ configPath: auxiliaryConfigPath }],
        }),
      );
    } else {
      plugins.push(cloudflare());
    }

    return plugins;
  })(),
  server: {
    allowedHosts: true,
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
      },
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
