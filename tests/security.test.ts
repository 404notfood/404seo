import { test } from "node:test"
import assert from "node:assert/strict"
import { isPublicAddress, isValidPublicUrl, fetchPublicUrl } from "../packages/shared/src/utils/publicUrl"
import { isPublicApiRoute, isCrossSiteMutation } from "../apps/api/src/lib/securityPolicy"

test("SSRF: deny private, encoded, mapped IPv6 and special-use addresses", () => {
  const urls = [
    "http://localhost", "http://localhost.", "http://127.1", "http://2130706433", "http://0x7f000001",
    "http://10.0.0.1", "http://192.168.1.2", "http://172.16.0.1", "http://172.31.255.255",
    "http://169.254.169.254", "http://100.64.0.1", "http://[::1]", "http://[::ffff:127.0.0.1]",
    "http://[::ffff:7f00:1]", "http://[fc00::1]", "http://[fe90::1]", "http://[2002:7f00:1::]",
    "http://[2001:db8::1]", "http://192.0.2.1", "http://198.18.0.1", "http://203.0.113.1",
    "file:///etc/passwd", "ftp://example.com", "http://user:pass@example.com", "https://example.com:6379",
    "http://metadata.google.internal", "http://router.lan", "http://x.localhost",
  ]
  for (const url of urls) assert.equal(isValidPublicUrl(url), false, url)
  for (const url of ["https://example.com/page", "http://8.8.8.8", "https://[2606:4700:4700::1111]"]) {
    assert.equal(isValidPublicUrl(url), true, url)
  }
  assert.equal(isPublicAddress("not-an-ip"), false)
})

test("blocked targets fail before opening a socket", async () => {
  await assert.rejects(fetchPublicUrl("http://127.0.0.1:80/secret"), /SSRF/)
  await assert.rejects(fetchPublicUrl("http://[::ffff:a00:1]/secret"), /SSRF/)
})

test("public routes are exact and method-specific", () => {
  assert.equal(isPublicApiRoute("POST", "/api/billing/webhook?test=1"), true)
  assert.equal(isPublicApiRoute("GET", "/api/reports/11111111-1111-4111-8111-111111111111"), true)
  assert.equal(isPublicApiRoute("GET", "/api/reports/admin"), false)
  for (const path of ["/health/admin", "/api/google/callback-extra", "/api/auth/admin", "/api/reports/token/delete"]) {
    assert.equal(isPublicApiRoute("GET", path), false, path)
  }
  assert.equal(isPublicApiRoute("DELETE", "/api/reports/token"), false)
})

function withOriginEnvironment(mode: "development" | "production", assertions: () => void): void {
  const keys = ["NODE_ENV", "NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL", "CHROME_EXTENSION_ORIGINS"] as const
  const previous = keys.map(key => [key, process.env[key]] as const)
  process.env.NODE_ENV = mode
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example"
  process.env.BETTER_AUTH_URL = "https://auth.example"
  process.env.CHROME_EXTENSION_ORIGINS = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  try {
    assertions()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

for (const mode of ["development", "production"] as const) {
  test(`cookie mutations respect ${mode} origins while native bearer clients work`, () => {
    withOriginEnvironment(mode, () => {
      assert.equal(isCrossSiteMutation("POST", "https://evil.example", undefined, false), true)
      assert.equal(isCrossSiteMutation("POST", undefined, "cross-site", false), true)
      assert.equal(isCrossSiteMutation("POST", "https://app.example", undefined, false), false)
      assert.equal(isCrossSiteMutation("POST", "https://auth.example", undefined, false), false)
      assert.equal(isCrossSiteMutation("POST", "https://app.example.evil.example", undefined, false), true)
      assert.equal(isCrossSiteMutation("POST", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", undefined, false), false)
      assert.equal(isCrossSiteMutation("POST", "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", undefined, false), true)
      assert.equal(isCrossSiteMutation("POST", "http://localhost:3000", undefined, false), mode === "production")
      assert.equal(isCrossSiteMutation("POST", "https://seo.404notfood.fr", undefined, false), mode !== "production")
      assert.equal(isCrossSiteMutation("POST", "https://evil.example", undefined, true), false)
      assert.equal(isCrossSiteMutation("GET", "https://evil.example", undefined, false), false)
    })
  })
}
