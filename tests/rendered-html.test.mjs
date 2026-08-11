import assert from "node:assert/strict";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the LifeOS application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /文子的 LifeOS/);
  assert.match(html, /40岁征程工作台/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("ships product metadata and database declaration", async () => {
  const { readFile } = await import("node:fs/promises");
  const [layout, page, hosting] = await Promise.all([
    readFile(new URL("app/layout.tsx", templateRoot), "utf8"),
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    readFile(new URL(".openai/hosting.json", templateRoot), "utf8"),
  ]);
  assert.match(layout, /文子的 LifeOS/);
  assert.match(page, /<LifeOS \/>/);
  assert.match(hosting, /"d1": "DB"/);
});
