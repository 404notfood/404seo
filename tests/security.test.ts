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

test("cookie mutations reject hostile origins while native bearer clients work", () => {
  assert.equal(isCrossSiteMutation("POST", "https://evil.example", undefined, false), true)
  assert.equal(isCrossSiteMutation("POST", undefined, "cross-site", false), true)
  assert.equal(isCrossSiteMutation("POST", "http://localhost:3000", undefined, false), false)
  assert.equal(isCrossSiteMutation("POST", "https://evil.example", undefined, true), false)
  assert.equal(isCrossSiteMutation("GET", "https://evil.example", undefined, false), false)
})
