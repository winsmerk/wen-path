import { NextResponse } from "next/server";
import { ensureSchema, getD1, getOpenAIKey, getWorkspaceIdentity, seedWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
type PlanItem = { title: string; minutes: number; day: string; type: string };

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

function fallbackPlan(vision: string, goal: string, capacity: number): PlanItem[] {
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
  const days = ["周一", "周二", "周四", "周六", "周日"];
  const visionTask = dimensions.find((item) => item.type === "general");
  const candidates = [main, ...(visionTask ? [visionTask] : []), ...dimensions.filter((item) => item !== visionTask)];
  return candidates.slice(0, count).map((item, index) => ({ ...item, minutes, day: days[index] }));
}

async function generatePlan(vision: string, goal: string, capacity: number, journeys: string): Promise<PlanItem[]> {
  const answer = await askOpenAI(`请为用户生成一份不机械、能真正推进生活的本周计划。

完整愿景：${vision}
本周目标：${goal}
正在推进或计划中的征程：${journeys || "暂无明确征程"}
本周可用时间：${capacity}分钟

生成规则：
1. 生成3-5个任务，总时长不超过可用时间的85%，保留余量。
2. 本周目标是主线，但任务需从至少2个相关维度展开，可选维度包括身体健康、英语与学习、职业与能力、财务与收入、关系与家庭、探索与生活；不要为了凑数覆盖所有维度。
3. 每个任务都必须具体、可执行、有可验证的完成成果，标题格式为“维度｜行动与成果”。
4. 结合愿景和当前征程做取舍，避免重复、空泛和连续安排同一种任务。
5. day使用周一至周日或本周；type只能是 reading、finance、exercise、english、general。
6. 只返回JSON数组，每项字段为 title、minutes、day、type，不要附加解释。`);
  if (answer) {
    try {
      const parsed = JSON.parse(answer.replace(/^```json\s*|\s*```$/g, "")) as PlanItem[];
      if (Array.isArray(parsed) && parsed.length >= 3) {
        const allowed = ["reading", "finance", "exercise", "english", "general"];
        const safe = parsed.slice(0, 5).map((item) => ({ title: clean(item.title, 100), minutes: Math.max(15, Math.min(180, Number(item.minutes) || 30)), day: clean(item.day, 12) || "本周", type: allowed.includes(item.type) ? item.type : "general" }));
        const dimensions = new Set(safe.map((item) => item.type));
        if (safe.every((item) => item.title) && dimensions.size >= 2 && safe.reduce((sum, item) => sum + item.minutes, 0) <= capacity * 0.85) return safe;
      }
    } catch { /* use deterministic fallback */ }
  }
  return fallbackPlan(vision, goal, capacity);
}

export async function GET() {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity } = context;
  const [profile, journeys, outcomes, actions, checkins, reviews, taskOutputs, financialRecords, englishMessages, footprints, footprintImages] = await Promise.all([
    db.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(identity.userId).first(),
    db.prepare("SELECT * FROM journeys WHERE user_id = ? AND deleted_at IS NULL ORDER BY sequence_number").bind(identity.userId).all(),
    db.prepare("SELECT * FROM monthly_outcomes WHERE user_id = ? ORDER BY rowid").bind(identity.userId).all(),
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
      if (!["cash", "fixed_asset", "investment", "property", "income", "fixed_expense", "daily_expense", "social_expense", "exercise_expense", "learning_expense"].includes(category) || !Number.isFinite(amount) || amount < 0 || (descriptionOnly && !content)) return NextResponse.json({ error: "finance_required" }, { status: 400 });
      await db.prepare("INSERT INTO financial_records (id,user_id,action_id,category,amount,note,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), identity.userId, task.id, category, amount, content || task.title, clean(body.recordedAt, 10) || now.slice(0, 10), now).run();
    }
    await db.prepare("INSERT INTO task_outputs (id,user_id,action_id,task_type,title,content,duration,feeling,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), identity.userId, task.id, task.task_type, task.title, content, duration, feeling, now).run();
    await db.prepare("UPDATE weekly_actions SET status = 'completed', completed_at = ? WHERE id = ? AND user_id = ?").bind(now, task.id, identity.userId).run();
  } else if (body.action === "weekly-settings") {
    const capacity = Math.max(60, Math.min(2400, Number(body.capacityMinutes) || 420)), goal = clean(body.goal, 500);
    await db.prepare("UPDATE profiles SET weekly_capacity_minutes = ?, weekly_goal = ?, updated_at = ? WHERE user_id = ?").bind(capacity, goal, now, identity.userId).run();
  } else if (body.action === "generate-week-plan") {
    const [profile, journeyRows] = await Promise.all([
      db.prepare("SELECT vision, weekly_capacity_minutes, weekly_goal FROM profiles WHERE user_id = ?").bind(identity.userId).first<{ vision: string; weekly_capacity_minutes: number; weekly_goal: string }>(),
      db.prepare("SELECT title, area, status, next_action FROM journeys WHERE user_id = ? AND deleted_at IS NULL AND status IN ('active','planned') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, sequence_number LIMIT 8").bind(identity.userId).all<{ title: string; area: string; status: string; next_action: string }>(),
    ]);
    const goal = clean(body.goal, 500) || profile?.weekly_goal || "推进最重要的人生目标";
    const capacity = Math.max(60, Math.min(2400, Number(body.capacityMinutes) || profile?.weekly_capacity_minutes || 420));
    const vision = clean(profile?.vision, 2000) || "建立健康、从容、持续成长且热爱日常的生活";
    const journeys = journeyRows.results.map((item) => `${item.area}｜${item.title}（${item.status === "active" ? "进行中" : "计划中"}）：${item.next_action}`).join("；");
    const plan = await generatePlan(vision, goal, capacity, journeys);
    await db.prepare("UPDATE weekly_actions SET status = 'paused' WHERE user_id = ? AND status = 'pending'").bind(identity.userId).run();
    const maxPriority = await db.prepare("SELECT COALESCE(MAX(priority),0) AS value FROM weekly_actions WHERE user_id = ?").bind(identity.userId).first<{ value: number }>();
    await db.batch(plan.map((item, index) => db.prepare("INSERT INTO weekly_actions (id,user_id,outcome_id,title,estimated_minutes,scheduled_for,priority,status,task_type,source) VALUES (?,?,?,?,?,?,?,'pending',?,'ai')").bind(crypto.randomUUID(), identity.userId, `${identity.userId}-${item.type === "reading" ? "career" : item.type}`, item.title, item.minutes, item.day, (maxPriority?.value ?? 0) + index + 1, item.type)));
    await db.prepare("UPDATE profiles SET weekly_capacity_minutes = ?, weekly_goal = ?, updated_at = ? WHERE user_id = ?").bind(capacity, goal, now, identity.userId).run();
  } else if (body.action === "checkin" && (body.type === "exercise" || body.type === "english")) {
    await db.prepare("INSERT INTO checkins (id,user_id,type,duration,note,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), identity.userId, body.type, Math.max(0, Math.min(600, Number(body.duration) || 0)), clean(body.note, 300), now).run();
  } else if (body.action === "add-journey") {
    const title = clean(body.title, 80), area = clean(body.area, 30), acceptance = clean(body.acceptanceCriteria, 300), nextAction = clean(body.nextAction, 160);
    if (!title || !area || !acceptance || !nextAction) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    const max = await db.prepare("SELECT COALESCE(MAX(sequence_number),0) AS value FROM journeys WHERE user_id = ?").bind(identity.userId).first<{ value: number }>();
    if ((max?.value ?? 0) >= 100) return NextResponse.json({ error: "journey_limit" }, { status: 409 });
    await db.prepare("INSERT INTO journeys (id,user_id,sequence_number,title,area,stage,acceptance_criteria,status,progress,next_action) VALUES (?,?,?,?,?,'自主规划',?,'planned',0,?)").bind(crypto.randomUUID(), identity.userId, (max?.value ?? 0) + 1, title, area, acceptance, nextAction).run();
  } else if (body.action === "journey-status" && typeof body.id === "string" && typeof body.status === "string") {
    if (!["active", "paused", "planned", "completed"].includes(body.status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    if (body.status === "active") { const count = await db.prepare("SELECT COUNT(*) AS total FROM journeys WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL").bind(identity.userId).first<{ total: number }>(); if ((count?.total ?? 0) >= 5) return NextResponse.json({ error: "active_limit" }, { status: 409 }); }
    await db.prepare("UPDATE journeys SET status = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL").bind(body.status, body.id, identity.userId).run();
  } else if (body.action === "update-journey" && typeof body.id === "string") {
    const title = clean(body.title, 80), area = clean(body.area, 30), acceptance = clean(body.acceptanceCriteria, 300), nextAction = clean(body.nextAction, 160);
    if (!title || !area || !acceptance || !nextAction) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    await db.prepare("UPDATE journeys SET title=?,area=?,acceptance_criteria=?,next_action=? WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(title, area, acceptance, nextAction, body.id, identity.userId).run();
  } else if (body.action === "delete-journey" && typeof body.id === "string") {
    await db.prepare("UPDATE journeys SET deleted_at=?,status='paused' WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(now, body.id, identity.userId).run();
  } else if (body.action === "adjust-plan" && typeof body.mode === "string") {
    if (body.mode === "pause-lowest") { const target = await db.prepare("SELECT id FROM weekly_actions WHERE user_id=? AND status='pending' ORDER BY priority DESC LIMIT 1").bind(identity.userId).first<{id:string}>(); if (!target) return NextResponse.json({error:"nothing_to_adjust"},{status:409}); await db.prepare("UPDATE weekly_actions SET status='paused' WHERE id=? AND user_id=?").bind(target.id,identity.userId).run(); }
    else if (body.mode === "shrink-scope") { const target = await db.prepare("SELECT id,estimated_minutes FROM weekly_actions WHERE user_id=? AND status='pending' AND estimated_minutes>30 ORDER BY estimated_minutes DESC LIMIT 1").bind(identity.userId).first<{id:string;estimated_minutes:number}>(); if (!target) return NextResponse.json({error:"nothing_to_adjust"},{status:409}); await db.prepare("UPDATE weekly_actions SET estimated_minutes=? WHERE id=? AND user_id=?").bind(Math.max(30,target.estimated_minutes-20),target.id,identity.userId).run(); }
    else if (body.mode === "restore-paused") await db.prepare("UPDATE weekly_actions SET status='pending' WHERE user_id=? AND status='paused'").bind(identity.userId).run();
    else return NextResponse.json({error:"invalid_adjustment"},{status:400});
  } else if (body.action === "financial-record") {
    const category = clean(body.category, 30), descriptionOnly = category === "fixed_asset" || category === "property", amount = descriptionOnly ? 0 : Number(body.amount), actionId = clean(body.actionId, 80) || null, note = clean(body.note, 400);
    if (!["cash","fixed_asset","investment","property","income","fixed_expense","daily_expense","social_expense","exercise_expense","learning_expense"].includes(category) || !Number.isFinite(amount) || amount < 0 || (descriptionOnly && !note)) return NextResponse.json({error:"invalid_finance"},{status:400});
    await db.prepare("INSERT INTO financial_records (id,user_id,action_id,category,amount,note,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),identity.userId,actionId,category,amount,note,clean(body.recordedAt,10)||now.slice(0,10),now).run();
  } else if (body.action === "update-financial-record" && typeof body.id === "string") {
    const category = clean(body.category, 30), descriptionOnly = category === "fixed_asset" || category === "property", amount = descriptionOnly ? 0 : Number(body.amount), actionId = clean(body.actionId, 80) || null, note = clean(body.note, 400);
    if (!["cash","fixed_asset","investment","property","income","fixed_expense","daily_expense","social_expense","exercise_expense","learning_expense"].includes(category) || !Number.isFinite(amount) || amount < 0 || (descriptionOnly && !note)) return NextResponse.json({error:"invalid_finance"},{status:400});
    await db.prepare("UPDATE financial_records SET action_id=?,category=?,amount=?,note=?,recorded_at=? WHERE id=? AND user_id=?").bind(actionId,category,amount,note,clean(body.recordedAt,10)||now.slice(0,10),body.id,identity.userId).run();
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
    const achievement=clean(body.achievement),lowValue=clean(body.lowValue),nextPriority=clean(body.nextPriority); if(!achievement||!nextPriority)return NextResponse.json({error:"missing_fields"},{status:400});
    await db.prepare("INSERT INTO reviews (id,user_id,period,achievement,low_value,next_priority,created_at) VALUES (?,?,'week',?,?,?,?)").bind(crypto.randomUUID(),identity.userId,achievement,lowValue,nextPriority,now).run();
  } else return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
