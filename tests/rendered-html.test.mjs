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
  assert.match(html, /wen flow/);
  assert.doesNotMatch(html, /40岁征程工作台/);
  assert.match(html, /把愿景连接到征程、本周与今天/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("ships product metadata, adaptive planning, and database declaration", async () => {
  const { readFile } = await import("node:fs/promises");
  const [layout, page, lifeOS, workspaceApi, visionJourneys, hosting] = await Promise.all([
    readFile(new URL("app/layout.tsx", templateRoot), "utf8"),
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    readFile(new URL("app/LifeOS.tsx", templateRoot), "utf8"),
    readFile(new URL("app/api/workspace/route.ts", templateRoot), "utf8"),
    readFile(new URL("lib/vision-journeys.ts", templateRoot), "utf8"),
    readFile(new URL(".openai/hosting.json", templateRoot), "utf8"),
  ]);
  assert.match(layout, /const title = "wen flow · Build a life you love\."/);
  assert.match(page, /<LifeOS \/>/);
  assert.match(lifeOS, /苏轼/);
  assert.match(lifeOS, /帮我调整计划/);
  assert.match(lifeOS, /编辑征程/);
  assert.match(lifeOS, /当前财务情况/);
  assert.match(lifeOS, /English Coach/);
  assert.match(lifeOS, /我的足迹/);
  assert.match(lifeOS, /编辑愿景/);
  assert.match(lifeOS, /未来要做的事情/);
  assert.match(lifeOS, /compactVision/);
  assert.match(lifeOS, /新增月度成果/);
  assert.match(lifeOS, /新增周任务/);
  assert.match(lifeOS, /关联月度成果/);
  assert.match(lifeOS, /提交一篇读书笔记/);
  assert.match(lifeOS, /英语学习笔记/);
  assert.match(lifeOS, /提交完成证据/);
  assert.match(lifeOS, /保存七问复盘/);
  assert.match(lifeOS, /经营利润/);
  assert.match(lifeOS, /副业时间上限/);
  assert.match(workspaceApi, /完整愿景/);
  assert.match(workspaceApi, /本周目标是主线/);
  assert.match(workspaceApi, /dimensions\.size >= 2/);
  assert.match(workspaceApi, /add-outcome/);
  assert.match(workspaceApi, /update-weekly-action/);
  assert.match(workspaceApi, /delete-weekly-action/);
  assert.match(workspaceApi, /note_required/);
  assert.match(workspaceApi, /complete-journey/);
  assert.match(workspaceApi, /stage_locked/);
  assert.match(workspaceApi, /is_side_hustle/);
  assert.match(workspaceApi, /kill_rule_count/);
  assert.equal([...visionJourneys.matchAll(/^\s+\[\d+,/gm)].length, 100);
  assert.match(visionJourneys, /完成40岁人生复盘与下一阶段愿景/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "MEDIA"/);
});
