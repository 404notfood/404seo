import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

interface LockedPackage {
  version?: string
  resolved?: string
  integrity?: string
  optional?: boolean
  os?: string[]
  cpu?: string[]
  optionalDependencies?: Record<string, string>
}

test("Lightning CSS lockfile includes native binaries for every platform before deployment", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")) as {
    packages: Record<string, LockedPackage>
  }
  const lightning = lock.packages["node_modules/lightningcss"]
  assert.ok(lightning?.optionalDependencies)
  assert.ok(Object.keys(lightning.optionalDependencies).length > 0)

  for (const [name, version] of Object.entries(lightning.optionalDependencies)) {
    const binary = lock.packages[`node_modules/${name}`]
    assert.ok(binary, `Missing ${name}: regenerate the lockfile without node_modules`)
    assert.equal(binary.version, version, name)
    assert.equal(binary.optional, true, name)
    assert.ok(binary.resolved?.startsWith("https://registry.npmjs.org/"), name)
    assert.ok(binary.integrity?.startsWith("sha512-"), name)
    assert.ok(binary.os?.length, name)
    assert.ok(binary.cpu?.length, name)
  }
})
