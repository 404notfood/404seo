import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

// Deterministic ZIP with one uncompressed PHP entry, using Node's standard library.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const name = Buffer.from("seo404-connector/seo404-connector.php")
const body = readFileSync(resolve(root, "integrations/wordpress/seo404-connector/seo404-connector.php"))
let crc = 0xffffffff
for (const byte of body) {
  crc ^= byte
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
}
crc = (crc ^ 0xffffffff) >>> 0
const local = Buffer.alloc(30)
local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4)
local.writeUInt16LE(33, 12)
local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26)
const central = Buffer.alloc(46)
central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
central.writeUInt16LE(33, 14)
central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28)
const end = Buffer.alloc(22), offset = local.length + name.length + body.length
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(offset, 16)
const out = resolve(root, "site/public/downloads")
mkdirSync(out, { recursive: true })
writeFileSync(resolve(out, "seo404-connector.zip"), Buffer.concat([local, name, body, central, name, end]))
console.log("Extension WordPress empaquetée.")
