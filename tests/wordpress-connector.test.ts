import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

test("WordPress connector PHP: permissions, CAS, rollback, SEO hooks and cancelled delayed requests", { skip: !process.env.PHP_BINARY }, () => {
  const helper = readFileSync("integrations/wordpress/seo404-connector/Seo404Text.php")
  assert.deepEqual(helper, readFileSync("integrations/prestashop/seo404connector/classes/Seo404Text.php"), "Both connectors use the same text-preservation rules")
  const archive = readFileSync("site/public/downloads/seo404-connector.zip"), entries = new Map<string, Buffer>(); let offset = 0
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.readUInt32LE(offset + 18), length = archive.readUInt16LE(offset + 26), extra = archive.readUInt16LE(offset + 28), start = offset + 30 + length + extra
    entries.set(archive.subarray(offset + 30, offset + 30 + length).toString(), archive.subarray(start, start + size)); offset = start + size
  }
  assert.deepEqual(entries.get("seo404-connector/Seo404Text.php"), helper)
  assert.deepEqual(entries.get("seo404-connector/seo404-connector.php"), readFileSync("integrations/wordpress/seo404-connector/seo404-connector.php"))
  const result = execFileSync(process.env.PHP_BINARY!, ["tests/fixtures/wordpress-connector.php"], { encoding: "utf8", windowsHide: true, timeout: 15_000 })
  assert.match(result, /delayed cancellation passed/)
})
