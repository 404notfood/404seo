// scripts/package.mjs — Build + zip de l'extension prête à charger dans Chrome.
//
// Produit un fichier .zip dont le manifest.json est à la RACINE de l'archive
// (pas dans un sous-dossier dist/), directement chargeable via
// "Charger l'extension non empaquetée" après dézippage.
//
// Implémentation : ZIP "stored" (sans compression) en pur Node, pour ne dépendre
// ni de la commande `zip` (absente de certains environnements) ni d'une lib npm.
// Les fichiers de l'extension sont petits : l'absence de compression est sans impact.

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateRawSync, crc32 } from "node:zlib"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const distDir = join(root, "dist")

// 1. Build Vite (génère dist/)
console.log(">> Build de l'extension (vite build)…")
execSync("npm run build", { cwd: root, stdio: "inherit" })

// 2. Version depuis le manifest source → nom du zip
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf-8"))
const version = manifest.version ?? "0.0.0"
const zipPath = join(root, `seo-audit-pro-v${version}.zip`)

// 3. Liste récursive des fichiers de dist/
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}
const files = walk(distDir)

// 4. Construction du ZIP. node:zlib n'expose pas crc32 avant Node 22.x ;
//    fallback sur une implémentation locale si indisponible.
const crc =
  typeof crc32 === "function"
    ? (buf) => crc32(buf) >>> 0
    : (() => {
        const table = Array.from({ length: 256 }, (_, n) => {
          let c = n
          for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
          return c >>> 0
        })
        return (buf) => {
          let c = 0xffffffff
          for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
          return (c ^ 0xffffffff) >>> 0
        }
      })()

const localParts = []
const centralParts = []
let offset = 0

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n >>> 0); return b }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }

for (const file of files) {
  // Chemin relatif POSIX (séparateurs /) pour la compatibilité ZIP.
  const name = relative(distDir, file).split(/[\\/]/).join("/")
  const data = readFileSync(file)
  const nameBuf = Buffer.from(name, "utf-8")
  const checksum = crc(data)
  const compressed = deflateRawSync(data)
  const useDeflate = compressed.length < data.length
  const body = useDeflate ? compressed : data
  const method = useDeflate ? 8 : 0 // 8 = deflate, 0 = stored

  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
    u32(checksum), u32(body.length), u32(data.length), u16(nameBuf.length), u16(0),
    nameBuf,
  ])
  localParts.push(localHeader, body)

  centralParts.push(Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
    u32(checksum), u32(body.length), u32(data.length),
    u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
    nameBuf,
  ]))

  offset += localHeader.length + body.length
}

const central = Buffer.concat(centralParts)
const eocd = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
  u32(central.length), u32(offset), u16(0),
])

writeFileSync(zipPath, Buffer.concat([...localParts, central, eocd]))
console.log(`>> Archive créée : ${zipPath} (${files.length} fichiers)`)
