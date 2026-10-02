import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { PrestaShopClient } from "../apps/api/src/lib/cmsPrestaShop"

test("PrestaShop: scoped credentials, fixed endpoint, plain content and preservation of long native SEO fields", async () => {
  let scope = "2:3", siteUrl = "https://example.com/shop/", foreign = false
  const client = new PrestaShopClient(siteUrl, { token: "a".repeat(64) }, scope, async (url, options) => {
    const address = new URL(url)
    assert.equal(address.pathname, "/shop/index.php"); assert.equal(address.searchParams.get("module"), "seo404connector")
    assert.equal(address.searchParams.get("scope"), "2:3"); assert.equal(options?.headers?.Authorization, "Bearer " + "a".repeat(64))
    assert.equal(options?.authenticated, true); assert.equal(options.followRedirects, false); assert.ok(!url.includes("a".repeat(64)))
    const data = address.searchParams.get("action") === "connection" ? { version: 1, label: "<b>Boutique FR</b>", siteUrl, scope } : {
      id: 1, url: foreign ? "https://other.com/product" : "https://example.com/shop/product", kind: "product", scope,
      title: "<b>Produit</b>", content: "<p>Contenu.</p><script>Accès interdits</script>", seoTitle: "T".repeat(255), seoDescription: "D".repeat(512), revision: "a".repeat(64), operationId: "",
    }
    const body = Buffer.from(JSON.stringify(data)); return { url, status: 200, ok: true, headers: {}, body, text: async () => body.toString() }
  })
  assert.deepEqual(await client.verify(), { label: "Boutique FR", scope: "2:3" })
  const resource = await client.read(1); assert.equal(resource.content, "Contenu."); assert.equal(resource.seoTitle?.length, 255)
  assert.equal(resource.seoDescription?.length, 512)
  scope = "2:4"; await assert.rejects(client.read(1), /langue/); scope = "2:3"
  foreign = true; await assert.rejects(client.read(1), /correspond/); foreign = false
  siteUrl = "https://example.com/other/"; await assert.rejects(client.verify(), /autre boutique/)
  await assert.rejects(client.list(1, "page"), /produits/)
})

test("PrestaShop module: real MySQL/InnoDB locks, native fields, language/shop isolation, CAS, rollback and durable cancellation", { skip: !process.env.TEST_CMS_MYSQL_DSN || !process.env.PHP_BINARY }, () => {
  const args = process.env.PHP_EXTENSION_DIR ? ["-d", "extension_dir=" + process.env.PHP_EXTENSION_DIR, "-d", "extension=pdo_mysql", "-d", "extension=zip"] : []
  const result = execFileSync(process.env.PHP_BINARY!, [...args, "tests/fixtures/prestashop-connector.php"], { encoding: "utf8", windowsHide: true, timeout: 30_000 })
  assert.match(result, /InnoDB locks, rollback and scoped cancellation passed/)
})
