// Génère des icônes PNG simples sans dépendances
// Utilise l'API Canvas de Node.js (disponible nativement depuis Node 18+ expérimental)
// ou génère des PNG minimalistes via construction manuelle

import { writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dir = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dir, "../public/icons")
mkdirSync(iconsDir, { recursive: true })

// PNG minimal : 1x1 pixel bleu (#2563eb) upscalé via les dimensions annoncées
// Format PNG valide avec IHDR + IDAT + IEND
function createSolidPNG(size, r, g, b) {
  // On crée un PNG size×size avec tous les pixels de la même couleur
  // PNG structure: signature + IHDR + IDAT (zlib) + IEND

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  function uint32be(n) {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(n, 0)
    return b
  }
  function crc32(data) {
    let crc = 0xffffffff
    for (const byte of data) {
      crc ^= byte
      for (let i = 0; i < 8; i++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
      }
    }
    return (crc ^ 0xffffffff) >>> 0
  }
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii")
    const crcData = Buffer.concat([typeBytes, data])
    const crc = uint32be(crc32(crcData))
    return Buffer.concat([uint32be(data.length), typeBytes, data, crc])
  }

  const ihdrData = Buffer.concat([
    uint32be(size), uint32be(size),
    Buffer.from([8, 2, 0, 0, 0]) // 8-bit, RGB, deflate, no filter, no interlace
  ])

  // IDAT: raw image data, one filter byte per row + RGB pixels
  // Row: [filter=0, R, G, B, R, G, B, ...]
  const rowSize = 1 + size * 3
  const raw = Buffer.alloc(size * rowSize)
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize
    raw[rowStart] = 0 // filter type None
    for (let x = 0; x < size; x++) {
      raw[rowStart + 1 + x * 3] = r
      raw[rowStart + 2 + x * 3] = g
      raw[rowStart + 3 + x * 3] = b
    }
  }

  // zlib compress (deflate level 0 = store)
  function zlibStore(data) {
    const CHUNK = 32768
    const chunks = []
    for (let i = 0; i < data.length; i += CHUNK) {
      const slice = data.slice(i, i + CHUNK)
      const isLast = i + CHUNK >= data.length
      const header = Buffer.alloc(5)
      header[0] = isLast ? 1 : 0
      header.writeUInt16LE(slice.length, 1)
      header.writeUInt16LE(~slice.length & 0xffff, 3)
      chunks.push(header, slice)
    }
    // zlib header (CMF=0x78, FLG=0x01 for no dict, level 0)
    let adler = 1
    for (const b of data) {
      adler = ((adler & 0xffff) + b) % 65521 | (((adler >>> 16) + ((adler & 0xffff) + b) % 65521) % 65521) * 65536
    }
    const s1 = adler & 0xffff
    const s2 = (adler >>> 16) & 0xffff
    const adlerBuf = Buffer.from([s2 >> 8, s2 & 0xff, s1 >> 8, s1 & 0xff])
    return Buffer.concat([Buffer.from([0x78, 0x01]), ...chunks, adlerBuf])
  }

  const idat = chunk("IDAT", zlibStore(raw))
  const iend = chunk("IEND", Buffer.alloc(0))

  return Buffer.concat([sig, chunk("IHDR", ihdrData), idat, iend])
}

const SIZES = [16, 32, 48, 128]
for (const size of SIZES) {
  const png = createSolidPNG(size, 37, 99, 235) // #2563eb
  writeFileSync(join(iconsDir, `icon-${size}.png`), png)
  console.log(`✓ icon-${size}.png (${size}×${size})`)
}
console.log("Icônes générées dans public/icons/")
