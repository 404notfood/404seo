import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

test("WordPress connector PHP: permissions, CAS, rollback, SEO hooks and cancelled delayed requests", { skip: !process.env.PHP_BINARY }, () => {
  const result = execFileSync(process.env.PHP_BINARY!, ["tests/fixtures/wordpress-connector.php"], { encoding: "utf8", windowsHide: true, timeout: 15_000 })
  assert.match(result, /delayed cancellation passed/)
})
