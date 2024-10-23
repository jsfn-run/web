import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: "./assets",
  plugins: [],
  build: {
    rollupOptions: {
      external: ["/@lithium/.*/", "/@sodium/.*/", "/@lucide/.*/"],
    },
  },
});
