import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

// Deterministic, uncompressed ZIP. No third-party packager or executable install hooks.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const entries = ["seo404connector.php", "classes/Seo404Gateway.php", "classes/Seo404Text.php", "controllers/front/api.php", "upgrade/upgrade-1.1.0.php"]
const locals = [], centrals = []
let offset = 0
for (const entry of entries) {
  const name = Buffer.from("seo404connector/" + entry)
  const body = readFileSync(resolve(root, "integrations/prestashop/seo404connector", entry))
  let crc = 0xffffffff
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  crc = (crc ^ 0xffffffff) >>> 0
  const local = Buffer.alloc(30), central = Buffer.alloc(46)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(33, 12)
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(33, 14)
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
  locals.push(local, name, body); centrals.push(central, name); offset += local.length + name.length + body.length
}
const directory = Buffer.concat(centrals), end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
const out = resolve(root, "site/public/downloads")
mkdirSync(out, { recursive: true })
writeFileSync(resolve(out, "seo404-prestashop.zip"), Buffer.concat([...locals, directory, end]))
console.log("Module PrestaShop empaqueté.")
