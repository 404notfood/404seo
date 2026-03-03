import { defineConfig } from "vite"
import webExtension from "vite-plugin-web-extension"

export default defineConfig({
  plugins: [
    webExtension({
      manifest: "manifest.json",
      additionalInputs: [
        "src/options/options.html",
        "src/popup/popup.html",
      ],
    }),
  ],
  build: {
    outDir: "dist",
    minify: true,
    sourcemap: false,
  },
})
