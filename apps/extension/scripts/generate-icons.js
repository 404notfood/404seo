// Génère les icônes PNG pour l'extension Chrome à partir d'un SVG inline
// Usage: node scripts/generate-icons.js

import { createCanvas } from "canvas"
import { writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, "../public/icons")
mkdirSync(iconsDir, { recursive: true })

const SIZES = [16, 32, 48, 128]

for (const size of SIZES) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext("2d")

  // Fond bleu foncé
  ctx.fillStyle = "#0f172a"
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * 0.18)
  ctx.fill()

  // Lettre "S" blanche
  ctx.fillStyle = "#2563eb"
  ctx.beginPath()
  ctx.roundRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8, size * 0.12)
  ctx.fill()

  ctx.fillStyle = "#ffffff"
  ctx.font = `bold ${Math.round(size * 0.55)}px Arial`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("S", size / 2, size / 2 + size * 0.03)

  const buffer = canvas.toBuffer("image/png")
  writeFileSync(join(iconsDir, `icon-${size}.png`), buffer)
  console.log(`✓ icon-${size}.png`)
}

console.log("Icônes générées dans public/icons/")
