import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const compiler = require.resolve("typescript/bin/tsc")
const projects = ["site", "apps/api", "apps/extension", "packages/shared", "packages/crawler", "packages/analyzer", "packages/scorer", "packages/reporter", "workers"]
let failed = false
for (const project of projects) {
  console.log(`TypeScript: ${project}`)
  const result = spawnSync(process.execPath, [compiler, "--noEmit", "-p", project], { stdio: "inherit" })
  if (result.status !== 0) failed = true
}
process.exitCode = failed ? 1 : 0
