import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import type { RequestOptions, IncomingMessage } from "node:http"
import { fetchPublicUrl } from "../packages/shared/src/utils/publicUrl"

const require = createRequire(import.meta.url)
const dns = require("node:dns/promises") as typeof import("node:dns/promises")
const http = require("node:http") as typeof import("node:http")

test("network SSRF protection validates DNS, pins sockets and bounds responses", async t => {
  await t.test("mixed public/private DNS is rejected before connecting", async () => {
    mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }])
    const request = mock.method(http, "request", () => { throw new Error("Socket must not open") })
    try {
      await assert.rejects(fetchPublicUrl("http://example.com"), /non publique/)
      assert.equal(request.mock.callCount(), 0)
    } finally { mock.restoreAll() }
  })
  await t.test("the validated IP is pinned and redirects to localhost are blocked", async () => {
    const lookup = mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }])
    const request = mock.method(http, "request", (_url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      assert.equal(options.agent, false)
      assert.ok(options.lookup)
      options.lookup!("example.com", {}, (_error, address) => assert.equal(address, "8.8.8.8"))
      const req = new EventEmitter()
      return Object.assign(req, {
        end() { queueMicrotask(() => {
          const response = Object.assign(Readable.from([]), { statusCode: 302, headers: { location: "http://127.0.0.1/secret" } })
          callback(response as unknown as IncomingMessage)
          req.emit("close")
        }) },
        destroy(error: Error) { req.emit("error", error); req.emit("close") },
      })
    })
    try {
      await assert.rejects(fetchPublicUrl("http://example.com"), /SSRF/)
      assert.equal(lookup.mock.callCount(), 1)
      assert.equal(request.mock.callCount(), 1)
    } finally { mock.restoreAll() }
  })
  await t.test("oversized bodies terminate the request", async () => {
    mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }])
    mock.method(http, "request", (_url: URL, _options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      const req = new EventEmitter()
      return Object.assign(req, {
        end() { queueMicrotask(() => callback(Object.assign(Readable.from([Buffer.alloc(100)]), { statusCode: 200, headers: {} }) as unknown as IncomingMessage)) },
        destroy(error: Error) { req.emit("error", error); req.emit("close") },
      })
    })
    try { await assert.rejects(fetchPublicUrl("http://example.com", { maxBytes: 50 }), /volumineuse/) }
    finally { mock.restoreAll() }
  })
})
