import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: "./assets",
  plugins: [],
  build: {
    rollupOptions: {
      external: [/@(li3|sodium|lucide)\/.*/],
    },
  },
});
