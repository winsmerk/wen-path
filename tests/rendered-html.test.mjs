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

test("ships vision journey planning, reporting, and durable data declarations", async () => {
  const { readFile } = await import("node:fs/promises");
  const [layout, page, lifeOS, planningUI, workspaceApi, planningApi, planningRecordsApi, speakingCoachApi, planningLib, journalApi, recordsApi, schema, workspaceLib, migration, recordsMigration, weekSelectionMigration, quotes, hosting] = await Promise.all([
    readFile(new URL("app/layout.tsx", templateRoot), "utf8"),
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    readFile(new URL("app/LifeOS.tsx", templateRoot), "utf8"),
    readFile(new URL("app/PlanningSystem.tsx", templateRoot), "utf8"),
    readFile(new URL("app/api/workspace/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/planning/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/planning-records/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/speaking-coach/route.ts", templateRoot), "utf8"),
    readFile(new URL("lib/planning.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/journal/route.ts", templateRoot), "utf8"),
    readFile(new URL("app/api/records/route.ts", templateRoot), "utf8"),
    readFile(new URL("db/schema.ts", templateRoot), "utf8"),
    readFile(new URL("lib/workspace.ts", templateRoot), "utf8"),
    readFile(new URL("drizzle/0016_vision_journey_planning.sql", templateRoot), "utf8"),
    readFile(new URL("drizzle/0017_task_records.sql", templateRoot), "utf8"),
    readFile(new URL("drizzle/0018_week_task_selection.sql", templateRoot), "utf8"),
    readFile(new URL("lib/su-shi-quotes.ts", templateRoot), "utf8"),
    readFile(new URL(".openai/hosting.json", templateRoot), "utf8"),
  ]);
  assert.match(layout, /const title = "wen flow · Build a life you love\."/);
  assert.match(page, /<LifeOS \/>/);
  assert.match(lifeOS, /label: "愿景"/);
  assert.match(lifeOS, /key: "journey"/);
  assert.match(lifeOS, /key: "plan"/);
  assert.doesNotMatch(lifeOS, /label: "40岁愿景"/);
  assert.match(lifeOS, /目标日期（可选）/);
  assert.match(lifeOS, /拥有自由选择工作与生活地点的能力/);
  assert.match(lifeOS, /当前财务情况/);
  assert.match(lifeOS, /finance-detail-filters/);
  assert.match(lifeOS, /工资收入/);
  assert.match(lifeOS, /个人支出/);
  assert.match(lifeOS, /finance-filter-total/);
  assert.match(lifeOS, /金额合计/);
  assert.match(lifeOS, /本金合计/);
  assert.match(lifeOS, /收益合计/);
  assert.match(lifeOS, /English Coach/);
  assert.match(lifeOS, /key: "tools"/);
  assert.match(lifeOS, /历史复盘记录/);
  assert.match(lifeOS, /自动周报/);
  assert.match(lifeOS, /weeklyReports/);
  assert.match(lifeOS, /reports={planning\.reports}/);
  assert.match(lifeOS, /综合周报/);
  assert.match(lifeOS, /查看周报详情/);
  assert.match(lifeOS, /开始时间/);
  assert.match(lifeOS, /结束时间/);
  assert.match(lifeOS, /review\.week_start===report\.period/);
  assert.match(lifeOS, /按任务类型归档的完成记录/);
  assert.doesNotMatch(lifeOS, /key: "footprints"/);
  assert.match(planningUI, /新增阶段/);
  assert.match(planningUI, /阶段目标/);
  assert.match(planningUI, /添加任务/);
  assert.match(planningUI, /单次任务/);
  assert.match(planningUI, /周期任务/);
  assert.match(planningUI, /完成时默认提醒填写记录/);
  assert.match(planningUI, /直接完成/);
  assert.match(planningUI, /保存记录并完成/);
  assert.doesNotMatch(planningApi, /nextStatus==="completed"&&current\.record_required/);
  assert.match(lifeOS, /开始录音/);
  assert.match(lifeOS, /结束录音/);
  assert.match(lifeOS, /sendRecording/);
  assert.match(speakingCoachApi, /gpt-audio-1\.5/);
  assert.match(speakingCoachApi, /specific likely pronunciation problems/);
  assert.match(planningUI, /每天/);
  assert.match(planningUI, /每周/);
  assert.match(planningUI, /每月/);
  assert.match(planningUI, /具体时间（逗号分隔，可不填）/);
  assert.match(planningUI, /选择本月要推进的目标/);
  assert.match(planningUI, /月计划已生成，周计划和每日待办已同步更新/);
  assert.match(planningUI, /本周负载/);
  assert.match(planningUI, /勾选本周要完成的任务/);
  assert.match(planningUI, /taskModeLabel/);
  assert.match(planningUI, /开始时间/);
  assert.match(planningUI, /完成时间/);
  assert.match(planningUI, /month-stage-dates/);
  assert.match(planningUI, /month-goal-dates/);
  assert.match(planningUI, /stage\.status==="active"/);
  assert.match(planningUI, /暂无已开始的阶段/);
  assert.match(planningUI, /手动添加本周任务/);
  assert.match(planningUI, /添加到本周/);
  assert.match(planningUI, /苏东坡 · 每日一句/);
  assert.match(planningUI, /dailySuShiQuote/);
  assert.doesNotMatch(planningUI, /<h1>今日待办<\/h1>/);
  assert.match(quotes, /临江仙·送钱穆父/);
  assert.match(planningUI, /set-week-selection/);
  assert.match(planningUI, /每周可用时间/);
  assert.match(planningUI, /周报与月报/);
  assert.match(planningUI, /function compareTasks/);
  assert.match(planningUI, /scheduled_time\.localeCompare/);
  assert.match(planningUI, /priority-b\.priority/);
  assert.match(planningApi, /save-stage/);
  assert.match(planningApi, /delete-stage/);
  assert.match(planningApi, /save-goal/);
  assert.match(planningApi, /delete-goal/);
  assert.match(planningApi, /save-task/);
  assert.match(planningApi, /delete-task/);
  assert.match(planningApi, /save-month-plan/);
  assert.match(planningApi, /s\.status='active'/);
  assert.match(planningApi, /update-instance/);
  assert.match(planningApi, /set-week-selection/);
  assert.match(planningApi, /add-week-task/);
  assert.match(planningApi, /source,user_adjusted,week_selected/);
  assert.match(planningApi, /record_required/);
  assert.match(planningRecordsApi, /planning_records_v2/);
  assert.match(planningRecordsApi, /planning_record/);
  assert.match(planningApi, /capacity-settings/);
  assert.match(planningLib, /generatePlanInstances/);
  assert.match(planningLib, /INSERT OR IGNORE INTO task_instances_v2/);
  assert.match(planningLib, /user_adjusted/);
  assert.match(planningLib, /generateReports/);
  assert.match(planningLib, /completionRate/);
  assert.match(planningLib, /8\*3600000/);
  assert.match(lifeOS, /经营利润/);
  assert.match(lifeOS, /备用金/);
  assert.match(lifeOS, /点击查看明细/);
  assert.match(lifeOS, /投资本金/);
  assert.match(lifeOS, /本月收益（元，可为负）/);
  assert.match(lifeOS, /travel_expense/);
  assert.match(lifeOS, /六类支出累计/);
  assert.match(workspaceApi, /'travel_expense'/);
  assert.match(lifeOS, /写一篇日记/);
  assert.match(lifeOS, /记下灵感/);
  assert.match(lifeOS, /删除记录/);
  assert.match(workspaceApi, /settleFinancialMonths/);
  assert.match(workspaceApi, /financial_monthly_bills/);
  assert.match(workspaceLib, /removed_modules_purged/);
  assert.match(workspaceLib, /DELETE FROM footprints/);
  assert.match(workspaceApi, /SET action_id=NULL/);
  assert.match(journalApi, /invalid_images/);
  assert.match(journalApi, /DELETE/);
  assert.match(recordsApi, /record_images/);
  assert.match(recordsApi, /too_many_images/);
  assert.match(schema, /journal_entries/);
  assert.match(schema, /record_images/);
  assert.match(schema, /journey_stages_v2/);
  assert.match(schema, /task_instances_v2/);
  assert.match(schema, /planning_reports_v2/);
  assert.match(schema, /planning_records_v2/);
  assert.match(schema, /week_selected/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS journey_stages_v2/);
  assert.match(migration, /idx_instances_v2_occurrence/);
  assert.match(recordsMigration, /ALTER TABLE task_definitions_v2 ADD COLUMN record_required/);
  assert.match(weekSelectionMigration, /ALTER TABLE task_instances_v2 ADD COLUMN week_selected/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "MEDIA"/);
});
