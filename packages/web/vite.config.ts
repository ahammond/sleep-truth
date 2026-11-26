import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // One inline file has no chunks to preload; the polyfill only adds a fetch().
    modulePreload: { polyfill: false },
  },
});
