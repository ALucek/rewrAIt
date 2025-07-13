import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "../dist",
  },
}); 