import { defineConfig } from "vite"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

export default defineConfig({
  plugins: [
    {
      name: "extension-assets",
      closeBundle() {
        const manifest = JSON.parse(readFileSync("manifest.json", "utf8"))
        manifest.background.service_worker = "background.js"
        manifest.content_scripts[0].js = ["content.js"]
        writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2))
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve("src/popup/popup.html"),
        background: resolve("src/background/service-worker.ts"),
        content: resolve("src/content/content-script.ts"),
      },
      output: { entryFileNames: "[name].js" },
    },
  },
})
