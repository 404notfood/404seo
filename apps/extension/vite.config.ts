import { defineConfig } from "vite"
import webExtension from "vite-plugin-web-extension"

export default defineConfig({
  plugins: [
    webExtension({
      manifest: "manifest.json",
      additionalInputs: [
        "src/popup/popup.html",
      ],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
  },
})
