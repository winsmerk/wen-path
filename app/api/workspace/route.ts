import { NextResponse } from "next/server";
import { ensureSchema, getD1, getOpenAIKey, getWorkspaceIdentity, seedWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
type PlanItem = { title: string; minutes: number; day: string; type: string; outcomeId?: string; sideHustle?: boolean };
type PlanOutcome = { id: string; title: string; kind: string; journey_title: string };

async function prepare() {
  const identity = await getWorkspaceIdentity();
  if (!identity) return null;
  const db = getD1();
  await ensureSchema(db);
  await seedWorkspace(db, identity);
  return { db, identity };
}

function clean(value: unknown, length = 600) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}

function outputText(data: unknown) {
  const result = data as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  return result.output_text || result.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") || "";
}

async function askOpenAI(prompt: string) {
  const key = getOpenAIKey();
  if (!key) return "";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-luna", instructions: "你是 wen flow 的克制型生活教练。输出必须简洁、具体、可执行。", input: prompt }),
    });
    if (!response.ok) return "";
    return outputText(await response.json());
  } catch { return ""; }
}

function classify(goal: string) {
  if (/英语|英文|口语|English/i.test(goal)) return "english";
  if (/财务|现金|固定资产|投资|房产|收入|支出|资产/.test(goal)) return "finance";
  if (/运动|健身|跑步|力量|健康/.test(goal)) return "exercise";
  if (/读书|阅读|书/.test(goal)) return "reading";
  return "general";
}

function fallbackPlan(vision: string, goal: string, capacity: number, outcomes: PlanOutcome[], protectedDay: string, sideHustleLimit: number): PlanItem[] {
  const mainType = classify(goal);
  const visionFocus = vision.split(/[。！？；;]+/).map((item) => item.trim()).filter(Boolean).at(-1)?.replace(/^最重要的是[，,:：]?\s*/, "").slice(0, 24) || "想要的生活";
  const main = { type: mainType, title: `本周主线｜为“${goal.slice(0, 30)}”完成一个可验证成果` };
  const dimensions = [
    { type: "exercise", title: "身体健康｜完成一次运动并记录时长与身体感受" },
    { type: "english", title: "英语能力｜用英语讲述本周目标，并整理一页纠正笔记" },
    { type: "finance", title: "财务基础｜更新本周现金流，并写下一个具体财务决定" },
    { type: "reading", title: "认知成长｜围绕本周目标阅读，并输出三点读书笔记" },
    { type: "general", title: `愿景校准｜对照“${visionFocus}”，复盘取舍并确定下一步` },
  ].filter((item) => item.type !== mainType);
  const count = capacity < 180 ? 3 : capacity < 420 ? 4 : 5;
  const usableMinutes = Math.floor(capacity * 0.85 / 5) * 5;
  const minutes = Math.max(15, Math.floor(usableMinutes / count / 5) * 5);
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].filter((day) => day !== protectedDay);
  const visionTask = dimensions.find((item) => item.type === "general");
  const candidates = [main, ...(visionTask ? [visionTask] : []), ...dimensions.filter((item) => item !== visionTask)];
  let assignedSideHustleMinutes = 0;
  return candidates.slice(0, count).map((item, index) => {
    const wantsSideHustle = /职业|收入|作品|商业|副业/.test(item.title);
    const sideHustle = wantsSideHustle && assignedSideHustleMinutes + minutes <= sideHustleLimit;
    if (sideHustle) assignedSideHustleMinutes += minutes;
    return { ...item, minutes, day: days[index % days.length], outcomeId: outcomes.find((outcome) => classify(outcome.title) === item.type)?.id || outcomes[index % Math.max(1,outcomes.length)]?.id || "", sideHustle };
  });
}

async function generatePlan(vision: string, goal: string, capacity: number, journeys: string, outcomes: PlanOutcome[], protectedDay: string, sideHustleLimit: number, reviewContext: string): Promise<PlanItem[]> {
  const outcomeContext = outcomes.map((item) => `${item.id}｜${item.journey_title} → ${item.title}（${item.kind === "habit" ? "持续习惯" : "里程碑"}）`).join("；") || "暂无月度成果";
  const answer = await askOpenAI(`请为用户生成一份不机械、能真正推进生活的本周计划。

完整愿景：${vision}
本周目标：${goal}
正在推进或计划中的征程：${journeys || "暂无明确征程"}
本月成果（每项开头是可用的outcomeId）：${outcomeContext}
本周可用时间：${capacity}分钟
副业时间上限：${sideHustleLimit}分钟
完全休息日：${protectedDay}
最近复盘：${reviewContext || "暂无"}

生成规则：
1. 生成3-5个任务，总时长不超过可用时间的85%，保留余量。
2. 本周目标是主线，但任务需从至少2个相关维度展开，可选维度包括身体健康、英语与学习、职业与能力、财务与收入、关系与家庭、探索与生活；不要为了凑数覆盖所有维度。
3. 每个任务都必须具体、可执行、有可验证的完成成果，标题格式为“维度｜行动与成果”。
4. 结合愿景和当前征程做取舍，避免重复、空泛和连续安排同一种任务。
5. 不得安排在完全休息日；所有sideHustle为true的任务总时长不得超过副业时间上限。复盘能量低时减少数量和总时长；复盘决定stop时不生成副业任务。
6. 每个任务优先关联一个最匹配的本月成果，outcomeId只能使用上方提供的ID；没有合适成果时为空字符串。
7. day使用周一至周六、本周；type只能是 reading、finance、exercise、english、general。
8. 只返回JSON数组，每项字段为 title、minutes、day、type、outcomeId、sideHustle，不要附加解释。`);
  if (answer) {
    try {
      const parsed = JSON.parse(answer.replace(/^```json\s*|\s*```$/g, "")) as PlanItem[];
      if (Array.isArray(parsed) && parsed.length >= 3) {
        const allowed = ["reading", "finance", "exercise", "english", "general"];
        const outcomeIds = new Set(outcomes.map((item) => item.id));
        const safe = parsed.slice(0, 5).map((item) => ({ title: clean(item.title, 100), minutes: Math.max(15, Math.min(180, Number(item.minutes) || 30)), day: clean(item.day, 12) === protectedDay ? "本周" : clean(item.day, 12) || "本周", type: allowed.includes(item.type) ? item.type : "general", outcomeId: outcomeIds.has(clean(item.outcomeId,100)) ? clean(item.outcomeId,100) : "", sideHustle: Boolean(item.sideHustle) }));
        const dimensions = new Set(safe.map((item) => item.type));
        const sideHustleMinutes = safe.filter((item)=>item.sideHustle).reduce((sum,item)=>sum+item.minutes,0);
        if (safe.every((item) => item.title) && dimensions.size >= 2 && safe.reduce((sum, item) => sum + item.minutes, 0) <= capacity * 0.85 && sideHustleMinutes <= sideHustleLimit) return safe;
      }
    } catch { /* use deterministic fallback */ }
  }
  return fallbackPlan(vision, goal, capacity, outcomes, protectedDay, sideHustleLimit);
}

async function refreshProgress(db: D1Database, userId: string) {
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const [outcomeRows, actionRows, checkinRows, outputRows, journeyRows] = await Promise.all([
    db.prepare("SELECT id,journey_id,title,acceptance_criteria,progress,kind FROM monthly_outcomes WHERE user_id=? AND status='active'").bind(userId).all<{id:string;journey_id:string;title:string;acceptance_criteria:string;progress:number;kind:string}>(),
    db.prepare("SELECT outcome_id,status FROM weekly_actions WHERE user_id=?").bind(userId).all<{outcome_id:string;status:string}>(),
    db.prepare("SELECT type,COUNT(*) AS total FROM checkins WHERE user_id=? AND created_at>=? GROUP BY type").bind(userId,monthStart).all<{type:string;total:number}>(),
    db.prepare("SELECT task_type,COUNT(*) AS total FROM task_outputs WHERE user_id=? AND created_at>=? GROUP BY task_type").bind(userId,monthStart).all<{task_type:string;total:number}>(),
    db.prepare("SELECT id,status,progress FROM journeys WHERE user_id=? AND deleted_at IS NULL").bind(userId).all<{id:string;status:string;progress:number}>(),
  ]);
  const evidenceCounts = new Map<string,number>();
  for (const row of checkinRows.results) evidenceCounts.set(row.type, (evidenceCounts.get(row.type) ?? 0) + Number(row.total));
  for (const row of outputRows.results) evidenceCounts.set(row.task_type, (evidenceCounts.get(row.task_type) ?? 0) + Number(row.total));
  const outcomeProgress = new Map<string,number>();
  const updates: D1PreparedStatement[] = [];
  for (const outcome of outcomeRows.results) {
    let progress = Number(outcome.progress);
    if (outcome.kind === "habit") {
      const type = /运动|健康/.test(outcome.title) ? "exercise" : /英语|英文|口语/.test(outcome.title) ? "english" : /读书|阅读/.test(outcome.title) ? "reading" : "";
      const target = Number(`${outcome.title}${outcome.acceptance_criteria}`.match(/(\d+)\s*次/)?.[1] ?? 12);
      if (type) progress = Math.min(100, Math.round((evidenceCounts.get(type) ?? 0) / target * 100));
    } else {
      const linked = actionRows.results.filter((item) => item.outcome_id === outcome.id && item.status !== "paused");
      if (linked.length) progress = Math.round(linked.filter((item) => item.status === "completed").length / linked.length * 100);
    }
    outcomeProgress.set(outcome.id, progress);
    updates.push(db.prepare("UPDATE monthly_outcomes SET progress=? WHERE id=? AND user_id=?").bind(progress,outcome.id,userId));
  }
  for (const journey of journeyRows.results) {
    const linked = outcomeRows.results.filter((item) => item.journey_id === journey.id).map((item) => outcomeProgress.get(item.id) ?? 0);
    const progress = journey.status === "completed" ? 100 : linked.length ? Math.round(linked.reduce((sum,item)=>sum+item,0)/linked.length) : journey.progress;
    if (progress !== journey.progress) updates.push(db.prepare("UPDATE journeys SET progress=? WHERE id=? AND user_id=?").bind(progress,journey.id,userId));
  }
  if (updates.length) await db.batch(updates);
}

async function activateNextEligibleJourney(db: D1Database, userId: string) {
  const active = await db.prepare("SELECT COUNT(*) AS total FROM journeys WHERE user_id=? AND status='active' AND deleted_at IS NULL").bind(userId).first<{total:number}>();
  let slots = Math.max(0, 5 - Number(active?.total ?? 0));
  if (!slots) return;
  const rows = await db.prepare("SELECT id,sequence_number,stage,status FROM journeys WHERE user_id=? AND deleted_at IS NULL ORDER BY sequence_number").bind(userId).all<{id:string;sequence_number:number;stage:string;status:string}>();
  const updates: D1PreparedStatement[] = [];
  for (const candidate of rows.results.filter((item) => item.status === "planned")) {
    const priorStageIncomplete = rows.results.some((item) => item.sequence_number < candidate.sequence_number && item.stage !== candidate.stage && item.status !== "completed");
    if (priorStageIncomplete) continue;
    updates.push(db.prepare("UPDATE journeys SET status='active' WHERE id=? AND user_id=?").bind(candidate.id,userId));
    slots -= 1;
    if (!slots) break;
  }
  if (updates.length) await db.batch(updates);
}

export async function GET() {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity } = context;
  await refreshProgress(db, identity.userId);
  const currentPeriod = new Date().toISOString().slice(0,7);
  const [profile, journeys, outcomes, actions, checkins, reviews, taskOutputs, financialRecords, englishMessages, footprints, footprintImages] = await Promise.all([
    db.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(identity.userId).first(),
    db.prepare("SELECT * FROM journeys WHERE user_id = ? AND deleted_at IS NULL ORDER BY sequence_number").bind(identity.userId).all(),
    db.prepare("SELECT * FROM monthly_outcomes WHERE user_id = ? AND (period=? OR period='') ORDER BY rowid").bind(identity.userId,currentPeriod).all(),
    db.prepare("SELECT * FROM weekly_actions WHERE user_id = ? ORDER BY priority, rowid").bind(identity.userId).all(),
    db.prepare("SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(identity.userId).all(),
    db.prepare("SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 8").bind(identity.userId).all(),
    db.prepare("SELECT * FROM task_outputs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(identity.userId).all(),
    db.prepare("SELECT * FROM financial_records WHERE user_id = ? ORDER BY recorded_at DESC, created_at DESC LIMIT 200").bind(identity.userId).all(),
    db.prepare("SELECT * FROM english_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 60").bind(identity.userId).all(),
    db.prepare("SELECT * FROM footprints WHERE user_id = ? ORDER BY updated_at DESC").bind(identity.userId).all(),
    db.prepare("SELECT id, footprint_id FROM footprint_images WHERE user_id = ? ORDER BY created_at ASC").bind(identity.userId).all(),
  ]);
  return NextResponse.json({ profile, journeys: journeys.results, outcomes: outcomes.results, actions: actions.results, checkins: checkins.results, reviews: reviews.results, taskOutputs: taskOutputs.results, financialRecords: financialRecords.results, englishMessages: englishMessages.results, footprints: footprints.results, footprintImages: footprintImages.results });
}

export async function POST(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity } = context;
  const body = (await request.json()) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (body.action === "initialize") {
    await db.prepare("UPDATE profiles SET initialized = 1, updated_at = ? WHERE user_id = ?").bind(now, identity.userId).run();
  } else if (body.action === "update-vision") {
    const vision = clean(body.vision, 2000), targetDate = clean(body.targetDate, 10);
    const parsedTarget = new Date(`${targetDate}T00:00:00`);
    if (!vision || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(parsedTarget.getTime())) return NextResponse.json({ error: "invalid_vision" }, { status: 400 });
    await db.prepare("UPDATE profiles SET vision=?,target_date=?,updated_at=? WHERE user_id=?").bind(vision, targetDate, now, identity.userId).run();
  } else if (body.action === "toggle-action" && typeof body.id === "string") {
    const row = await db.prepare("SELECT status FROM weekly_actions WHERE id = ? AND user_id = ?").bind(body.id, identity.userId).first<{ status: string }>();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const status = row.status === "completed" ? "pending" : "completed";
    await db.prepare("UPDATE weekly_actions SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?").bind(status, status === "completed" ? now : null, body.id, identity.userId).run();
  } else if (body.action === "complete-task" && typeof body.id === "string") {
    const task = await db.prepare("SELECT * FROM weekly_actions WHERE id = ? AND user_id = ?").bind(body.id, identity.userId).first<{ id: string; title: string; task_type: string }>();
    if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const content = clean(body.content, 3000), feeling = clean(body.feeling, 600), duration = Math.max(0, Math.min(600, Number(body.duration) || 0));
    if ((task.task_type === "reading" || task.task_type === "english") && !content) return NextResponse.json({ error: "output_required" }, { status: 400 });
    if (task.task_type === "exercise" && (!duration || !feeling)) return NextResponse.json({ error: "output_required" }, { status: 400 });
    if (task.task_type === "finance") {
      const category = clean(body.category, 30), descriptionOnly = category === "fixed_asset" || category === "property", amount = descriptionOnly ? 0 : Number(body.amount);
      const incomeType = category === "income" && ["salary","non_salary"].includes(clean(body.incomeType,20)) ? clean(body.incomeType,20) : "";
      const sourceName = category === "income" ? clean(body.sourceName,100) : "";
      const expenseScope = /expense$/.test(category) && clean(body.expenseScope,20) === "business" ? "business" : "personal";
      if (!["cash", "fixed_asset", "investment", "property", "income", "fixed_expense", "daily_expense", "social_expense", "exercise_expense", "learning_expense"].includes(category) || !Number.isFinite(amount) || amount < 0 || (descriptionOnly && !content)) return NextResponse.json({ error: "finance_required" }, { status: 400 });
      await db.prepare("INSERT INTO financial_records (id,user_id,action_id,category,amount,note,recorded_at,created_at,income_type,source_name,expense_scope) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), identity.userId, task.id, category, amount, content || task.title, clean(body.recordedAt, 10) || now.slice(0, 10), now,incomeType,sourceName,expenseScope).run();
    }
    await db.prepare("INSERT INTO task_outputs (id,user_id,action_id,task_type,title,content,duration,feeling,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), identity.userId, task.id, task.task_type, task.title, content, duration, feeling, now).run();
    await db.prepare("UPDATE weekly_actions SET status = 'completed', completed_at = ? WHERE id = ? AND user_id = ?").bind(now, task.id, identity.userId).run();
  } else if (body.action === "weekly-settings") {
    const capacity = Math.max(60, Math.min(2400, Number(body.capacityMinutes) || 420)), goal = clean(body.goal, 500);
    const sideHustleLimit = Math.max(0,Math.min(720,Number(body.sideHustleLimitMinutes) || 360)), protectedDay = clean(body.protectedDay,10) || "周日";
    await db.prepare("UPDATE profiles SET weekly_capacity_minutes=?,weekly_goal=?,side_hustle_limit_minutes=?,protected_day=?,updated_at=? WHERE user_id=?").bind(capacity,goal,sideHustleLimit,protectedDay,now,identity.userId).run();
  } else if (body.action === "add-outcome" || body.action === "update-outcome") {
    const title = clean(body.title, 100), acceptance = clean(body.acceptanceCriteria, 500), journeyId = clean(body.journeyId,100), kind = clean(body.kind,20);
    const progress = Math.round(Math.max(0, Math.min(100, Number(body.progress) || 0))), hours = Math.round(Math.max(1, Math.min(200, Number(body.expectedHours) || 1)));
    if (!title || !acceptance || !journeyId || !["habit","milestone"].includes(kind)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    const journey = await db.prepare("SELECT id FROM journeys WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(journeyId,identity.userId).first();
    if (!journey) return NextResponse.json({error:"invalid_journey"},{status:400});
    if (body.action === "add-outcome") await db.prepare("INSERT INTO monthly_outcomes (id,user_id,title,acceptance_criteria,progress,expected_hours,status,journey_id,kind,period) VALUES (?,?,?,?,?,?,'active',?,?,?)").bind(crypto.randomUUID(),identity.userId,title,acceptance,progress,hours,journeyId,kind,now.slice(0,7)).run();
    else if (typeof body.id === "string") await db.prepare("UPDATE monthly_outcomes SET title=?,acceptance_criteria=?,progress=?,expected_hours=?,journey_id=?,kind=?,period=? WHERE id=? AND user_id=?").bind(title,acceptance,progress,hours,journeyId,kind,now.slice(0,7),body.id,identity.userId).run();
    else return NextResponse.json({ error: "missing_id" }, { status: 400 });
  } else if (body.action === "delete-outcome" && typeof body.id === "string") {
    await db.batch([db.prepare("UPDATE weekly_actions SET outcome_id='' WHERE user_id=? AND outcome_id=?").bind(identity.userId,body.id),db.prepare("DELETE FROM monthly_outcomes WHERE id=? AND user_id=?").bind(body.id,identity.userId)]);
  } else if (body.action === "add-weekly-action" || body.action === "update-weekly-action") {
    const title = clean(body.title, 120), outcomeId = clean(body.outcomeId, 100), scheduledFor = clean(body.scheduledFor, 12) || "本周";
    const minutes = Math.max(15, Math.min(600, Number(body.estimatedMinutes) || 30)), taskType = clean(body.taskType, 20), isSideHustle = body.isSideHustle ? 1 : 0;
    if (!title || !["reading","finance","exercise","english","general"].includes(taskType)) return NextResponse.json({ error: "invalid_task" }, { status: 400 });
    if (outcomeId) { const outcome = await db.prepare("SELECT id FROM monthly_outcomes WHERE id=? AND user_id=?").bind(outcomeId,identity.userId).first(); if (!outcome) return NextResponse.json({ error: "invalid_outcome" }, { status: 400 }); }
    if (body.action === "add-weekly-action") { const priority = await db.prepare("SELECT COALESCE(MAX(priority),0) AS value FROM weekly_actions WHERE user_id=?").bind(identity.userId).first<{value:number}>(); await db.prepare("INSERT INTO weekly_actions (id,user_id,outcome_id,title,estimated_minutes,scheduled_for,priority,status,task_type,source,is_side_hustle) VALUES (?,?,?,?,?,?,?,'pending',?,'manual',?)").bind(crypto.randomUUID(),identity.userId,outcomeId,title,minutes,scheduledFor,(priority?.value??0)+1,taskType,isSideHustle).run(); }
    else if (typeof body.id === "string") await db.prepare("UPDATE weekly_actions SET outcome_id=?,title=?,estimated_minutes=?,scheduled_for=?,task_type=?,source='manual',is_side_hustle=? WHERE id=? AND user_id=?").bind(outcomeId,title,minutes,scheduledFor,taskType,isSideHustle,body.id,identity.userId).run();
    else return NextResponse.json({ error: "missing_id" }, { status: 400 });
  } else if (body.action === "delete-weekly-action" && typeof body.id === "string") {
    await db.prepare("DELETE FROM weekly_actions WHERE id=? AND user_id=?").bind(body.id,identity.userId).run();
  } else if (body.action === "generate-week-plan") {
    const [profile, journeyRows, outcomeRows, latestReview] = await Promise.all([
      db.prepare("SELECT vision, weekly_capacity_minutes, weekly_goal,side_hustle_limit_minutes,protected_day FROM profiles WHERE user_id = ?").bind(identity.userId).first<{ vision: string; weekly_capacity_minutes: number; weekly_goal: string;side_hustle_limit_minutes:number;protected_day:string }>(),
      db.prepare("SELECT title, area, status, next_action FROM journeys WHERE user_id = ? AND deleted_at IS NULL AND status IN ('active','planned') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, sequence_number LIMIT 8").bind(identity.userId).all<{ title: string; area: string; status: string; next_action: string }>(),
      db.prepare("SELECT o.id,o.title,o.kind,j.title AS journey_title FROM monthly_outcomes o LEFT JOIN journeys j ON j.id=o.journey_id WHERE o.user_id=? AND o.status='active' AND (o.period=? OR o.period='') ORDER BY o.rowid LIMIT 8").bind(identity.userId,now.slice(0,7)).all<PlanOutcome>(),
      db.prepare("SELECT health_check,energy_score,decision,kill_rule_count,next_priority FROM reviews WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(identity.userId).first<{health_check:string;energy_score:number;decision:string;kill_rule_count:number;next_priority:string}>(),
    ]);
    const goal = clean(body.goal, 500) || profile?.weekly_goal || "推进最重要的人生目标";
    const requestedCapacity = Math.max(60, Math.min(2400, Number(body.capacityMinutes) || profile?.weekly_capacity_minutes || 420));
    const lowEnergy = Boolean(latestReview && (latestReview.energy_score <= 4 || /睡眠|生病|疲惫|透支|疼痛/.test(latestReview.health_check)));
    const capacity = lowEnergy ? Math.max(60,Math.floor(requestedCapacity*.65/5)*5) : requestedCapacity;
    const configuredSideLimit = Math.max(0,Math.min(720,Number(body.sideHustleLimitMinutes) || profile?.side_hustle_limit_minutes || 360));
    const sideHustleLimit = latestReview?.decision === "stop" ? 0 : lowEnergy ? Math.floor(configuredSideLimit/2/5)*5 : configuredSideLimit;
    const protectedDay = clean(body.protectedDay,10) || profile?.protected_day || "周日";
    const vision = clean(profile?.vision, 2000) || "建立健康、从容、持续成长且热爱日常的生活";
    const journeys = journeyRows.results.map((item) => `${item.area}｜${item.title}（${item.status === "active" ? "进行中" : "计划中"}）：${item.next_action}`).join("；");
    const reviewContext = latestReview ? `能量${latestReview.energy_score}/10；健康：${latestReview.health_check || "未填写"}；决定：${latestReview.decision}；停止规则触发${latestReview.kill_rule_count}条；下周重点：${latestReview.next_priority}` : "";
    const plan = await generatePlan(vision, goal, capacity, journeys, outcomeRows.results, protectedDay, sideHustleLimit, reviewContext);
    await db.prepare("UPDATE weekly_actions SET status = 'paused' WHERE user_id = ? AND status = 'pending'").bind(identity.userId).run();
    const maxPriority = await db.prepare("SELECT COALESCE(MAX(priority),0) AS value FROM weekly_actions WHERE user_id = ?").bind(identity.userId).first<{ value: number }>();
    await db.batch(plan.map((item, index) => db.prepare("INSERT INTO weekly_actions (id,user_id,outcome_id,title,estimated_minutes,scheduled_for,priority,status,task_type,source,is_side_hustle) VALUES (?,?,?,?,?,?,?,'pending',?,'ai',?)").bind(crypto.randomUUID(), identity.userId, item.outcomeId || "", item.title, item.minutes, item.day, (maxPriority?.value ?? 0) + index + 1, item.type, item.sideHustle ? 1 : 0)));
    await db.prepare("UPDATE profiles SET weekly_capacity_minutes = ?, weekly_goal = ?,side_hustle_limit_minutes=?,protected_day=?, updated_at = ? WHERE user_id = ?").bind(requestedCapacity, goal,configuredSideLimit,protectedDay, now, identity.userId).run();
  } else if (body.action === "checkin" && (body.type === "exercise" || body.type === "english" || body.type === "reading")) {
    const note = clean(body.note, 3000);
    if ((body.type === "english" || body.type === "reading") && !note) return NextResponse.json({ error: "note_required" }, { status: 400 });
    await db.prepare("INSERT INTO checkins (id,user_id,type,duration,note,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), identity.userId, body.type, Math.max(0, Math.min(600, Number(body.duration) || 0)), note, now).run();
  } else if (body.action === "add-journey") {
    const title = clean(body.title, 80), area = clean(body.area, 30), acceptance = clean(body.acceptanceCriteria, 300), nextAction = clean(body.nextAction, 160);
    if (!title || !area || !acceptance || !nextAction) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    const max = await db.prepare("SELECT COALESCE(MAX(sequence_number),0) AS value FROM journeys WHERE user_id = ?").bind(identity.userId).first<{ value: number }>();
    if ((max?.value ?? 0) >= 100) return NextResponse.json({ error: "journey_limit" }, { status: 409 });
    await db.prepare("INSERT INTO journeys (id,user_id,sequence_number,title,area,stage,acceptance_criteria,status,progress,next_action) VALUES (?,?,?,?,?,'自主规划',?,'planned',0,?)").bind(crypto.randomUUID(), identity.userId, (max?.value ?? 0) + 1, title, area, acceptance, nextAction).run();
  } else if (body.action === "journey-status" && typeof body.id === "string" && typeof body.status === "string") {
    if (!["active", "paused", "planned", "completed"].includes(body.status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    if (body.status === "active") {
      const [count,target,rows] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS total FROM journeys WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL").bind(identity.userId).first<{ total: number }>(),
        db.prepare("SELECT sequence_number,stage FROM journeys WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(body.id,identity.userId).first<{sequence_number:number;stage:string}>(),
        db.prepare("SELECT sequence_number,stage,status FROM journeys WHERE user_id=? AND deleted_at IS NULL").bind(identity.userId).all<{sequence_number:number;stage:string;status:string}>(),
      ]);
      if ((count?.total ?? 0) >= 5) return NextResponse.json({ error: "active_limit" }, { status: 409 });
      if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const locked = rows.results.some((item) => item.sequence_number < target.sequence_number && item.stage !== target.stage && item.status !== "completed");
      if (locked) return NextResponse.json({ error: "stage_locked" }, { status: 409 });
    }
    await db.prepare("UPDATE journeys SET status = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL").bind(body.status, body.id, identity.userId).run();
  } else if (body.action === "complete-journey" && typeof body.id === "string") {
    const evidence = clean(body.evidence,3000);
    if (!evidence) return NextResponse.json({ error: "evidence_required" }, { status: 400 });
    const journey = await db.prepare("SELECT id FROM journeys WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(body.id,identity.userId).first();
    if (!journey) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await db.prepare("UPDATE journeys SET status='completed',progress=100,evidence=?,completed_at=? WHERE id=? AND user_id=?").bind(evidence,now,body.id,identity.userId).run();
    await activateNextEligibleJourney(db,identity.userId);
  } else if (body.action === "update-journey" && typeof body.id === "string") {
    const title = clean(body.title, 80), area = clean(body.area, 30), acceptance = clean(body.acceptanceCriteria, 300), nextAction = clean(body.nextAction, 160);
    if (!title || !area || !acceptance || !nextAction) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    await db.prepare("UPDATE journeys SET title=?,area=?,acceptance_criteria=?,next_action=? WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(title, area, acceptance, nextAction, body.id, identity.userId).run();
  } else if (body.action === "delete-journey" && typeof body.id === "string") {
    await db.prepare("UPDATE journeys SET deleted_at=?,status='paused' WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(now, body.id, identity.userId).run();
  } else if (body.action === "adjust-plan" && typeof body.mode === "string") {
    if (body.mode === "pause-lowest") { const target = await db.prepare("SELECT id FROM weekly_actions WHERE user_id=? AND status='pending' AND task_type!='exercise' ORDER BY priority DESC LIMIT 1").bind(identity.userId).first<{id:string}>(); if (!target) return NextResponse.json({error:"nothing_to_adjust"},{status:409}); await db.prepare("UPDATE weekly_actions SET status='paused' WHERE id=? AND user_id=?").bind(target.id,identity.userId).run(); }
    else if (body.mode === "shrink-scope") { const target = await db.prepare("SELECT id,estimated_minutes FROM weekly_actions WHERE user_id=? AND status='pending' AND estimated_minutes>30 ORDER BY estimated_minutes DESC LIMIT 1").bind(identity.userId).first<{id:string;estimated_minutes:number}>(); if (!target) return NextResponse.json({error:"nothing_to_adjust"},{status:409}); await db.prepare("UPDATE weekly_actions SET estimated_minutes=? WHERE id=? AND user_id=?").bind(Math.max(30,target.estimated_minutes-20),target.id,identity.userId).run(); }
    else if (body.mode === "restore-paused") await db.prepare("UPDATE weekly_actions SET status='pending' WHERE user_id=? AND status='paused'").bind(identity.userId).run();
    else return NextResponse.json({error:"invalid_adjustment"},{status:400});
  } else if (body.action === "financial-record") {
    const category = clean(body.category, 30), descriptionOnly = category === "fixed_asset" || category === "property", amount = descriptionOnly ? 0 : Number(body.amount), actionId = clean(body.actionId, 80) || null, note = clean(body.note, 400);
    const incomeType = category === "income" && ["salary","non_salary"].includes(clean(body.incomeType,20)) ? clean(body.incomeType,20) : "", sourceName = category === "income" ? clean(body.sourceName,100) : "", expenseScope = /expense$/.test(category) && clean(body.expenseScope,20) === "business" ? "business" : "personal";
    if (!["cash","fixed_asset","investment","property","income","fixed_expense","daily_expense","social_expense","exercise_expense","learning_expense"].includes(category) || !Number.isFinite(amount) || amount < 0 || (descriptionOnly && !note)) return NextResponse.json({error:"invalid_finance"},{status:400});
    await db.prepare("INSERT INTO financial_records (id,user_id,action_id,category,amount,note,recorded_at,created_at,income_type,source_name,expense_scope) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),identity.userId,actionId,category,amount,note,clean(body.recordedAt,10)||now.slice(0,10),now,incomeType,sourceName,expenseScope).run();
  } else if (body.action === "update-financial-record" && typeof body.id === "string") {
    const category = clean(body.category, 30), descriptionOnly = category === "fixed_asset" || category === "property", amount = descriptionOnly ? 0 : Number(body.amount), actionId = clean(body.actionId, 80) || null, note = clean(body.note, 400);
    const incomeType = category === "income" && ["salary","non_salary"].includes(clean(body.incomeType,20)) ? clean(body.incomeType,20) : "", sourceName = category === "income" ? clean(body.sourceName,100) : "", expenseScope = /expense$/.test(category) && clean(body.expenseScope,20) === "business" ? "business" : "personal";
    if (!["cash","fixed_asset","investment","property","income","fixed_expense","daily_expense","social_expense","exercise_expense","learning_expense"].includes(category) || !Number.isFinite(amount) || amount < 0 || (descriptionOnly && !note)) return NextResponse.json({error:"invalid_finance"},{status:400});
    await db.prepare("UPDATE financial_records SET action_id=?,category=?,amount=?,note=?,recorded_at=?,income_type=?,source_name=?,expense_scope=? WHERE id=? AND user_id=?").bind(actionId,category,amount,note,clean(body.recordedAt,10)||now.slice(0,10),incomeType,sourceName,expenseScope,body.id,identity.userId).run();
  } else if (body.action === "delete-financial-record" && typeof body.id === "string") {
    await db.prepare("DELETE FROM financial_records WHERE id=? AND user_id=?").bind(body.id,identity.userId).run();
  } else if (body.action === "english-coach") {
    const message = clean(body.message,1200); if (!message) return NextResponse.json({error:"missing_message"},{status:400});
    const ai = await askOpenAI(`用户正在练习英语。用户说：${message}\n请用JSON回答，字段 reply（自然的英文回复）和 feedback（中文点评，包含一个改进建议）。`);
    let reply = "That sounds like a meaningful goal. What is the smallest step you can take this week?", feedback = "表达清楚。建议注意句首大写，并尽量补充一个具体例子。";
    if (ai) { try { const parsed = JSON.parse(ai.replace(/^```json\s*|\s*```$/g,"")) as {reply?:string;feedback?:string}; reply=clean(parsed.reply,1000)||reply; feedback=clean(parsed.feedback,1000)||feedback; } catch { reply=clean(ai,1000)||reply; } }
    await db.batch([
      db.prepare("INSERT INTO english_messages (id,user_id,role,text,feedback,created_at) VALUES (?,?,'user',?,'',?)").bind(crypto.randomUUID(),identity.userId,message,now),
      db.prepare("INSERT INTO english_messages (id,user_id,role,text,feedback,created_at) VALUES (?,?,'assistant',?,?,?)").bind(crypto.randomUUID(),identity.userId,reply,feedback,new Date(Date.now()+1).toISOString()),
    ]);
    return NextResponse.json({ok:true,reply,feedback});
  } else if (body.action === "review") {
    const achievement=clean(body.achievement),lowValue=clean(body.lowValue),healthCheck=clean(body.healthCheck),marketEvidence=clean(body.marketEvidence),nextPriority=clean(body.nextPriority),decision=clean(body.decision,20);
    const energyScore=Math.max(1,Math.min(10,Number(body.energyScore)||7)),killRuleCount=Math.max(0,Math.min(7,Number(body.killRuleCount)||0));
    if(!achievement||!healthCheck||!marketEvidence||!nextPriority||!["continue","adjust","stop"].includes(decision))return NextResponse.json({error:"missing_fields"},{status:400});
    await db.prepare("INSERT INTO reviews (id,user_id,period,achievement,low_value,next_priority,health_check,market_evidence,energy_score,decision,kill_rule_count,created_at) VALUES (?,?,'week',?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),identity.userId,achievement,lowValue,nextPriority,healthCheck,marketEvidence,energyScore,decision,killRuleCount,now).run();
  } else return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
