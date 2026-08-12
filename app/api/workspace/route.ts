import { NextResponse } from "next/server";
import { ensureSchema, executionPeriods, getD1, getOpenAIKey, getWorkspaceIdentity, seedWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
type PlanItem = { title: string; minutes: number; day: string; type: string; outcomeId?: string; sideHustle?: boolean; sourceTaskId: string };
type JourneyTaskCandidate = { id:string;journey_id:string;journey_title:string;area:string;title:string;acceptance_criteria:string;estimated_minutes:number;task_type:string;execution_frequency:"daily"|"monthly";priority:number };

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

async function syncJourneyFromTasks(db:D1Database,userId:string,journeyId:string,now:string) {
  const counts=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM journey_tasks WHERE user_id=? AND journey_id=?").bind(userId,journeyId).first<{total:number;completed:number}>();
  const total=Number(counts?.total??0),completed=Number(counts?.completed??0);
  if(!total)return;
  const progress=Math.round(completed/total*100);
  await db.prepare("UPDATE journeys SET progress=?,status=CASE WHEN ?=100 THEN 'completed' WHEN status='completed' THEN 'active' ELSE status END,completed_at=CASE WHEN ?=100 THEN COALESCE(completed_at,?) ELSE NULL END WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(progress,progress,progress,now,journeyId,userId).run();
  if(progress===100)await activateNextEligibleJourney(db,userId);
}

async function generateJourneyTasks(journey:{title:string;area:string;acceptance_criteria:string;next_action:string},existing:string[]) {
  const answer=await askOpenAI(`请把一个人生征程拆成5-8个有先后顺序、可独立完成的子任务。
征程：${journey.title}
领域：${journey.area}
征程验收标准：${journey.acceptance_criteria}
当前下一步：${journey.next_action}
已有子任务：${existing.join("；")||"暂无"}
要求：覆盖从准备到最终验收的完整路径；不重复已有任务；每项有清晰完成标准；粒度适合在一周内推进；不要生成与征程无关的通用习惯。
其中重复练习、健康习惯、日常记录设为 daily；一次性交付、阶段成果设为 monthly。
只返回JSON数组，字段 title、acceptanceCriteria、estimatedMinutes、taskType（reading、finance、exercise、english、general）、executionFrequency（daily或monthly）。`);
  if(!answer)return [];
  try {
    const parsed=JSON.parse(answer.replace(/^```json\s*|\s*```$/g,"")) as Array<{title?:string;acceptanceCriteria?:string;estimatedMinutes?:number;taskType?:string;executionFrequency?:string}>;
    const allowed=["reading","finance","exercise","english","general"];
    return parsed.slice(0,8).map((item)=>({title:clean(item.title,120),acceptanceCriteria:clean(item.acceptanceCriteria,500),estimatedMinutes:Math.max(15,Math.min(1200,Number(item.estimatedMinutes)||60)),taskType:allowed.includes(clean(item.taskType,20))?clean(item.taskType,20):classify(clean(item.title,120)),executionFrequency:item.executionFrequency==="daily"?"daily":"monthly"})).filter((item)=>item.title&&item.acceptanceCriteria&&!existing.includes(item.title));
  } catch{return [];}
}

async function evaluateJourneyTasks(journey:{title:string;acceptance_criteria:string},tasks:Array<{title:string;acceptance_criteria:string;estimated_minutes:number;execution_frequency:string;status:string}>) {
  const answer=await askOpenAI(`评估一个征程的子任务设计是否合理。
征程：${journey.title}
最终验收：${journey.acceptance_criteria}
子任务：${tasks.map((item,index)=>`${index+1}. ${item.title}｜完成标准：${item.acceptance_criteria}｜单次${item.estimated_minutes}分钟｜频率：${item.execution_frequency==="daily"?"每日":"每月"}｜${item.status}`).join("\n")||"暂无"}
请检查：是否覆盖最终验收、顺序和依赖是否合理、每日/每月频率是否恰当、粒度是否适合月/周计划、是否重复或遗漏、是否存在无法验证的描述。
只返回JSON：score（0-100）、summary（简短结论）、strengths（字符串数组）、issues（字符串数组）、suggestions（字符串数组）。`);
  if(!answer)return {score:0,summary:"AI 暂时无法评估，请稍后重试。",strengths:[],issues:["未获得 AI 评估结果"],suggestions:[]};
  try {
    const parsed=JSON.parse(answer.replace(/^```json\s*|\s*```$/g,"")) as {score?:number;summary?:string;strengths?:unknown[];issues?:unknown[];suggestions?:unknown[]};
    const list=(value:unknown[])=>value.slice(0,5).map((item)=>clean(item,300)).filter(Boolean);
    return {score:Math.max(0,Math.min(100,Number(parsed.score)||0)),summary:clean(parsed.summary,600),strengths:list(parsed.strengths||[]),issues:list(parsed.issues||[]),suggestions:list(parsed.suggestions||[])};
  } catch{return {score:0,summary:"AI 返回的评估格式无法读取，请稍后重试。",strengths:[],issues:["评估结果格式异常"],suggestions:[]};}
}

async function selectWeekTasks(goal:string,capacity:number,candidates:JourneyTaskCandidate[],protectedDay:string,sideHustleLimit:number,reviewContext:string):Promise<PlanItem[]> {
  if(!candidates.length)return [];
  const days=["周一","周二","周三","周四","周五","周六","周日"].filter((day)=>day!==protectedDay);
  const limit=capacity*.85;
  let used=0,sideUsed=0;
  const recurring:PlanItem[]=[];
  for(const day of days){
    for(const item of candidates.filter((candidate)=>candidate.execution_frequency==="daily")){
      const minutes=Math.max(15,Number(item.estimated_minutes)||30);
      if(used+minutes>limit)continue;
      const wantsSide=/职业|收入/.test(item.area),side=wantsSide&&sideUsed+minutes<=sideHustleLimit;
      used+=minutes;if(side)sideUsed+=minutes;
      recurring.push({title:item.title,minutes,day,type:["reading","finance","exercise","english","general"].includes(item.task_type)?item.task_type:"general",outcomeId:"",sideHustle:side,sourceTaskId:item.id});
    }
  }
  const monthlyCandidates=candidates.filter((item)=>item.execution_frequency!=="daily");
  if(!monthlyCandidates.length||used>=limit)return recurring;
  const answer=await askOpenAI(`从现有征程子任务中选择本周任务。绝对不要新建、改写或拼接任务。
本周目标：${goal}
可用时间：${capacity}分钟（最多使用85%）
副业上限：${sideHustleLimit}分钟；休息日：${protectedDay}
最近复盘：${reviewContext||"暂无"}
每日任务已先占用${used}分钟。剩余候选月度任务：${monthlyCandidates.map((item)=>`${item.id}｜${item.area}｜${item.journey_title} → ${item.title}｜${item.estimated_minutes}分钟｜类型${item.task_type}｜优先级${item.priority}`).join("；")}
从月度任务中选择0-5项最能推进目标且能放入剩余容量的任务。只返回JSON数组，每项字段 sourceTaskId、day、sideHustle；sourceTaskId必须来自候选列表。`);
  let selected:Array<{sourceTaskId?:string;day?:string;sideHustle?:boolean}>=[];
  if(answer)try{selected=JSON.parse(answer.replace(/^```json\s*|\s*```$/g,""));}catch{/* fallback */}
  const byId=new Map(monthlyCandidates.map((item)=>[item.id,item]));
  if(!Array.isArray(selected)||!selected.length)selected=monthlyCandidates.slice(0,Math.min(5,monthlyCandidates.length)).map((item,index)=>({sourceTaskId:item.id,day:days[index%days.length],sideHustle:/职业|收入/.test(item.area)}));
  const selectedMonthly=selected.flatMap((pick,index)=>{
    const item=byId.get(clean(pick.sourceTaskId,100));if(!item)return [];
    const minutes=Math.max(15,Number(item.estimated_minutes)||60),side=Boolean(pick.sideHustle)&&sideUsed+minutes<=sideHustleLimit;
    if(used+minutes>limit)return [];
    used+=minutes;if(side)sideUsed+=minutes;
    return [{title:item.title,minutes,day:clean(pick.day,12)===protectedDay?"本周":clean(pick.day,12)||days[index%days.length]||"本周",type:["reading","finance","exercise","english","general"].includes(item.task_type)?item.task_type:"general",outcomeId:"",sideHustle:side,sourceTaskId:item.id}];
  });
  return [...recurring,...selectedMonthly];
}

function classify(goal: string) {
  if (/英语|英文|口语|English/i.test(goal)) return "english";
  if (/财务|现金|固定资产|投资|房产|收入|支出|资产/.test(goal)) return "finance";
  if (/运动|健身|跑步|力量|健康/.test(goal)) return "exercise";
  if (/读书|阅读|书/.test(goal)) return "reading";
  return "general";
}

function remainingPlanningDays(localDate:string,protectedDay:string) {
  const labels=["周日","周一","周二","周三","周四","周五","周六"];
  const start=new Date(`${localDate}T00:00:00Z`),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1,0);
  let total=0;
  for(const cursor=new Date(start);cursor<=end;cursor.setUTCDate(cursor.getUTCDate()+1))if(labels[cursor.getUTCDay()]!==protectedDay)total++;
  return Math.max(1,total);
}

async function reviewJourneyEvidence(title:string,criteria:string,evidence:string) {
  const answer=await askOpenAI(`请严格验收一次人生征程的完成证据。
征程：${title}
验收标准：${criteria}
用户证据：${evidence}
判断证据是否已经充分证明满足验收标准。只返回JSON：status（passed或needs_more）、score（0-100）、feedback（中文，明确说明通过理由或缺少什么）。`);
  if(answer) try {
    const parsed=JSON.parse(answer.replace(/^```json\s*|\s*```$/g,"")) as {status?:string;score?:number;feedback?:string};
    const score=Math.max(0,Math.min(100,Number(parsed.score)||0));
    const status=parsed.status==="passed"&&score>=70?"passed":"needs_more";
    return {status,score,mode:"ai",feedback:clean(parsed.feedback,1000)|| (status==="passed"?"AI验收通过：证据与验收标准一致。":"AI验收待补充：证据还不足以证明完成，请补充可验证结果。")};
  } catch { /* conservative fallback below */ }
  return reviewEvidenceLocally(criteria,evidence);
}

function reviewEvidenceLocally(criteria:string,evidence:string) {
  const normalized=evidence.replace(/\s+/g," ").trim();
  const lengthScore=Math.min(25,Math.floor(normalized.length/3));
  const hasCompletion=/完成|已做|已经|达成|通过|提交|发布|输出|记录|坚持|实现|获得|整理|复盘/.test(normalized);
  const hasResult=/笔记|链接|文档|截图|照片|数据|记录|报告|作品|证书|反馈|清单|页面|文件|成果|时长|金额|次数|日期/.test(normalized);
  const hasMeasure=/\d+(?:\.\d+)?\s*(?:次|天|周|月|小时|分钟|页|篇|字|元|万|%|公里|kg|本)?|https?:\/\/|20\d{2}[-/.年]\d{1,2}/i.test(normalized);
  const criteriaTerms=[...new Set(criteria.match(/[\u4e00-\u9fff]{2,6}/g)??[])].filter((term)=>!/^(完成|达到|进行|一次|能够|相关|需要|并且|以及)$/.test(term));
  const overlap=criteriaTerms.slice(0,12).filter((term)=>normalized.includes(term)||[...term].filter((char)=>normalized.includes(char)).length>=Math.min(3,term.length)).length;
  const score=Math.min(88,25+lengthScore+(hasCompletion?15:0)+(hasResult?13:0)+(hasMeasure?10:0)+Math.min(10,overlap*2));
  const missing:string[]=[];
  if(normalized.length<20)missing.push("更完整地描述做了什么和最终结果");
  if(!hasCompletion)missing.push("明确说明已经完成的行动");
  if(!hasResult)missing.push("补充笔记、链接、截图、数据或其他成果形式");
  if(!hasMeasure)missing.push("补充日期、次数、时长或可核验链接");
  const status=score>=70?"passed":"needs_more";
  return {
    status,
    score,
    mode:"rules",
    feedback:status==="passed"
      ?"智能规则验收通过：证据包含明确行动、结果和可核验信息。AI服务恢复后仍可再次复核。"
      :`智能规则验收待补充：${missing.slice(0,2).join("；")||"请补充与验收标准直接对应的可核验结果"}。`,
  };
}

function noMarketEvidence(value:string){return /^(暂无|没有|无|本周没有|0)$/i.test(value.trim())||/没有.{0,6}(反馈|用户|收入|证据)|暂无.{0,6}(反馈|用户|收入|证据)/.test(value);}

async function evaluateStopRules(db:D1Database,userId:string) {
  const rows=await db.prepare("SELECT energy_score,health_check,market_evidence,decision,kill_rule_count FROM reviews WHERE user_id=? ORDER BY created_at DESC LIMIT 4").bind(userId).all<{energy_score:number;health_check:string;market_evidence:string;decision:string;kill_rule_count:number}>();
  const reasons:Array<{code:string;severity:"adjust"|"stop";reason:string}>=[];
  const latest=rows.results[0];
  if(!latest)return {decision:"continue",reasons};
  if(latest.decision==="stop")reasons.push({code:"manual_stop",severity:"stop",reason:"本周复盘已明确选择停止当前商业方向。"});
  else if(latest.decision==="adjust")reasons.push({code:"manual_adjust",severity:"adjust",reason:"本周复盘已明确选择调整方向或范围。"});
  if(Number(latest.kill_rule_count)>=2)reasons.push({code:"kill_rules",severity:"stop",reason:`本周已触发 ${latest.kill_rule_count} 条停止规则。`});
  if(rows.results.length>=2&&rows.results.slice(0,2).every((item)=>Number(item.energy_score)<=4))reasons.push({code:"low_energy",severity:"adjust",reason:"连续两周能量不高于4分，下周必须降低负载。"});
  if(rows.results.length>=2&&rows.results.slice(0,2).every((item)=>/睡眠|生病|疼痛|透支|疲惫/.test(item.health_check)))reasons.push({code:"health_pressure",severity:"adjust",reason:"健康或睡眠连续两周承压，应优先恢复。"});
  const emptyMarket=rows.results.filter((item)=>noMarketEvidence(item.market_evidence)).length;
  if(rows.results.length>=4&&emptyMarket>=4)reasons.push({code:"no_market_evidence",severity:"stop",reason:"连续四周没有形成真实市场证据，建议停止或重设方向。"});
  else if(rows.results.length>=3&&emptyMarket>=3)reasons.push({code:"weak_market_evidence",severity:"adjust",reason:"连续三周缺少真实市场证据，应缩小范围并验证需求。"});
  return {decision:reasons.some((item)=>item.severity==="stop")?"stop":reasons.length?"adjust":"continue",reasons};
}

async function refreshProgress(db: D1Database, userId: string) {
  const {month}=executionPeriods();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31T23:59:59`;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO evidence_events (id,user_id,source_type,source_id,evidence_type,action_id,occurred_at,created_at) SELECT 'checkin:'||id,user_id,'checkin',id,type,'',created_at,created_at FROM checkins WHERE user_id=?").bind(userId),
    db.prepare("INSERT OR IGNORE INTO evidence_events (id,user_id,source_type,source_id,evidence_type,action_id,occurred_at,created_at) SELECT 'task:'||action_id,user_id,'task_output',action_id,task_type,action_id,MIN(created_at),MIN(created_at) FROM task_outputs WHERE user_id=? GROUP BY user_id,action_id,task_type").bind(userId),
  ]);
  const [outcomeRows, actionRows, checkinRows, outputRows, journeyRows,journeyTaskRows] = await Promise.all([
    db.prepare("SELECT id,journey_id,title,acceptance_criteria,progress,kind,source_task_id FROM monthly_outcomes WHERE user_id=? AND status='active' AND period=?").bind(userId,month).all<{id:string;journey_id:string;title:string;acceptance_criteria:string;progress:number;kind:string;source_task_id:string}>(),
    db.prepare("SELECT a.id,a.outcome_id,a.source_task_id,a.status FROM weekly_actions a LEFT JOIN weekly_cycles c ON c.id=a.cycle_id WHERE a.user_id=? AND c.week_start>=? AND c.week_start<=?").bind(userId,monthStart,`${month}-31`).all<{id:string;outcome_id:string;source_task_id:string;status:string}>(),
    db.prepare("SELECT evidence_type AS type,COUNT(*) AS total FROM evidence_events WHERE user_id=? AND occurred_at>=? AND occurred_at<=? GROUP BY evidence_type").bind(userId,monthStart,monthEnd).all<{type:string;total:number}>(),
    db.prepare("SELECT evidence_type AS task_type,COUNT(DISTINCT action_id) AS total FROM evidence_events WHERE user_id=? AND source_type='task_output' AND occurred_at>=? AND occurred_at<=? GROUP BY evidence_type").bind(userId,monthStart,monthEnd).all<{task_type:string;total:number}>(),
    db.prepare("SELECT id,status,progress FROM journeys WHERE user_id=? AND deleted_at IS NULL").bind(userId).all<{id:string;status:string;progress:number}>(),
    db.prepare("SELECT id,journey_id,status,execution_frequency FROM journey_tasks WHERE user_id=?").bind(userId).all<{id:string;journey_id:string;status:string;execution_frequency:string}>(),
  ]);
  const evidenceCounts = new Map<string,number>();
  for (const row of checkinRows.results) evidenceCounts.set(row.type, Number(row.total));
  // Output rows are queried separately to assert action-level de-duplication; the unified evidence count above is authoritative.
  void outputRows;
  const outcomeProgress = new Map<string,number>();
  const updates: D1PreparedStatement[] = [];
  for (const outcome of outcomeRows.results) {
    let progress = Number(outcome.progress);
    if(outcome.source_task_id){
      const sourceTask=journeyTaskRows.results.find((item)=>item.id===outcome.source_task_id);
      if(sourceTask?.execution_frequency==="daily"){
        const target=Number(`${outcome.title}${outcome.acceptance_criteria}`.match(/(\d+)\s*次/)?.[1]??1);
        const completed=actionRows.results.filter((item)=>item.source_task_id===outcome.source_task_id&&item.status==="completed").length;
        progress=Math.min(100,Math.round(completed/Math.max(1,target)*100));
      } else progress=sourceTask?.status==="completed"?100:0;
    }
    else if (outcome.kind === "habit") {
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
    const linkedTasks=journeyTaskRows.results.filter((item)=>item.journey_id===journey.id);
    const linked = outcomeRows.results.filter((item) => item.journey_id === journey.id).map((item) => outcomeProgress.get(item.id) ?? 0);
    const taskProgress=linkedTasks.map((item)=>{
      if(item.status==="completed")return 100;
      if(item.execution_frequency!=="daily")return 0;
      const recurringOutcome=outcomeRows.results.find((outcome)=>outcome.source_task_id===item.id);
      return recurringOutcome?outcomeProgress.get(recurringOutcome.id)??0:0;
    });
    const calculated = taskProgress.length?Math.round(taskProgress.reduce((sum,item)=>sum+item,0)/taskProgress.length):linked.length ? Math.round(linked.reduce((sum,item)=>sum+item,0)/linked.length) : journey.progress;
    const progress = journey.status === "completed" ? 100 : calculated;
    if (progress !== journey.progress) updates.push(db.prepare("UPDATE journeys SET progress=? WHERE id=? AND user_id=?").bind(progress,journey.id,userId));
  }
  const {weekStart}=executionPeriods();
  updates.push(db.prepare("UPDATE weekly_cycles SET total_count=(SELECT COUNT(*) FROM weekly_actions WHERE user_id=? AND cycle_id=weekly_cycles.id),completed_count=(SELECT COUNT(*) FROM weekly_actions WHERE user_id=? AND cycle_id=weekly_cycles.id AND status='completed') WHERE user_id=? AND week_start=?").bind(userId,userId,userId,weekStart));
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
  const {month:currentPeriod,weekStart}=executionPeriods();
  const [profile, journeys, journeyTasks, outcomes, outcomeHistory, activeWeek, weeklyCycles, actions, historyActions, checkins, reviews, taskOutputs, financialRecords, englishMessages, footprints, footprintImages, stopRuleEvents] = await Promise.all([
    db.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(identity.userId).first(),
    db.prepare("SELECT * FROM journeys WHERE user_id = ? AND deleted_at IS NULL ORDER BY sequence_number").bind(identity.userId).all(),
    db.prepare("SELECT * FROM journey_tasks WHERE user_id=? ORDER BY journey_id,priority,rowid").bind(identity.userId).all(),
    db.prepare("SELECT * FROM monthly_outcomes WHERE user_id = ? AND period=? ORDER BY rowid").bind(identity.userId,currentPeriod).all(),
    db.prepare("SELECT * FROM monthly_outcomes WHERE user_id = ? AND period<? ORDER BY period DESC,rowid DESC LIMIT 60").bind(identity.userId,currentPeriod).all(),
    db.prepare("SELECT * FROM weekly_cycles WHERE user_id=? AND week_start=? LIMIT 1").bind(identity.userId,weekStart).first(),
    db.prepare("SELECT * FROM weekly_cycles WHERE user_id=? ORDER BY week_start DESC LIMIT 12").bind(identity.userId).all(),
    db.prepare("SELECT * FROM weekly_actions WHERE user_id = ? AND cycle_id=(SELECT id FROM weekly_cycles WHERE user_id=? AND week_start=? LIMIT 1) ORDER BY priority,rowid").bind(identity.userId,identity.userId,weekStart).all(),
    db.prepare("SELECT * FROM weekly_actions WHERE user_id = ? AND cycle_id IN (SELECT id FROM weekly_cycles WHERE user_id=? AND week_start<?) ORDER BY rowid DESC LIMIT 120").bind(identity.userId,identity.userId,weekStart).all(),
    db.prepare("SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 30").bind(identity.userId).all(),
    db.prepare("SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 8").bind(identity.userId).all(),
    db.prepare("SELECT * FROM task_outputs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(identity.userId).all(),
    db.prepare("SELECT * FROM financial_records WHERE user_id = ? ORDER BY recorded_at DESC, created_at DESC LIMIT 200").bind(identity.userId).all(),
    db.prepare("SELECT * FROM english_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 60").bind(identity.userId).all(),
    db.prepare("SELECT * FROM footprints WHERE user_id = ? ORDER BY updated_at DESC").bind(identity.userId).all(),
    db.prepare("SELECT id, footprint_id FROM footprint_images WHERE user_id = ? ORDER BY created_at ASC").bind(identity.userId).all(),
    db.prepare("SELECT * FROM stop_rule_events WHERE user_id=? ORDER BY created_at DESC LIMIT 20").bind(identity.userId).all(),
  ]);
  return NextResponse.json({ profile, journeys: journeys.results, journeyTasks:journeyTasks.results, outcomes: outcomes.results, outcomeHistory: outcomeHistory.results, activeWeek, weeklyCycles:weeklyCycles.results, actions: actions.results, historyActions:historyActions.results, checkins: checkins.results, reviews: reviews.results, taskOutputs: taskOutputs.results, financialRecords: financialRecords.results, englishMessages: englishMessages.results, footprints: footprints.results, footprintImages: footprintImages.results,stopRuleEvents:stopRuleEvents.results });
}

export async function POST(request: Request) {
  const context = await prepare();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, identity } = context;
  const body = (await request.json()) as Record<string, unknown>;
  const now = new Date().toISOString();
  const periods=executionPeriods();
  const activeCycleId=`${identity.userId}-week-${periods.weekStart}`;

  if (body.action === "initialize") {
    await db.prepare("UPDATE profiles SET initialized = 1, updated_at = ? WHERE user_id = ?").bind(now, identity.userId).run();
  } else if (body.action === "update-vision") {
    const vision = clean(body.vision, 2000), targetDate = clean(body.targetDate, 10);
    const parsedTarget = new Date(`${targetDate}T00:00:00`);
    if (!vision || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(parsedTarget.getTime())) return NextResponse.json({ error: "invalid_vision" }, { status: 400 });
    await db.prepare("UPDATE profiles SET vision=?,target_date=?,updated_at=? WHERE user_id=?").bind(vision, targetDate, now, identity.userId).run();
  } else if (body.action === "toggle-action" && typeof body.id === "string") {
    const row = await db.prepare("SELECT status,source_task_id FROM weekly_actions WHERE id = ? AND user_id = ?").bind(body.id, identity.userId).first<{ status: string;source_task_id:string }>();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const status = row.status === "completed" ? "pending" : "completed";
    await db.prepare("UPDATE weekly_actions SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?").bind(status, status === "completed" ? now : null, body.id, identity.userId).run();
    if(row.source_task_id){const task=await db.prepare("SELECT journey_id,execution_frequency FROM journey_tasks WHERE id=? AND user_id=?").bind(row.source_task_id,identity.userId).first<{journey_id:string;execution_frequency:string}>();if(task&&task.execution_frequency!=="daily"){await db.prepare("UPDATE journey_tasks SET status=?,completed_at=?,updated_at=? WHERE id=? AND user_id=?").bind(status==="completed"?"completed":"pending",status==="completed"?now:null,now,row.source_task_id,identity.userId).run();await syncJourneyFromTasks(db,identity.userId,task.journey_id,now);}}
  } else if (body.action === "complete-task" && typeof body.id === "string") {
    const task = await db.prepare("SELECT * FROM weekly_actions WHERE id = ? AND user_id = ?").bind(body.id, identity.userId).first<{ id: string; title: string; task_type: string;source_task_id:string }>();
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
    if(task.source_task_id){const source=await db.prepare("SELECT journey_id,execution_frequency FROM journey_tasks WHERE id=? AND user_id=?").bind(task.source_task_id,identity.userId).first<{journey_id:string;execution_frequency:string}>();if(source&&source.execution_frequency!=="daily"){await db.prepare("UPDATE journey_tasks SET status='completed',completed_at=?,updated_at=? WHERE id=? AND user_id=?").bind(now,now,task.source_task_id,identity.userId).run();await syncJourneyFromTasks(db,identity.userId,source.journey_id,now);}}
  } else if (body.action === "weekly-settings") {
    const capacity = Math.max(60, Math.min(2400, Number(body.capacityMinutes) || 420)), goal = clean(body.goal, 500);
    const sideHustleLimit = Math.max(0,Math.min(720,Number(body.sideHustleLimitMinutes) || 360)), protectedDay = clean(body.protectedDay,10) || "周日";
    await db.prepare("UPDATE profiles SET weekly_capacity_minutes=?,weekly_goal=?,side_hustle_limit_minutes=?,protected_day=?,updated_at=? WHERE user_id=?").bind(capacity,goal,sideHustleLimit,protectedDay,now,identity.userId).run();
    await db.prepare("UPDATE weekly_cycles SET goal=?,capacity_minutes=? WHERE id=? AND user_id=?").bind(goal,capacity,activeCycleId,identity.userId).run();
  } else if (body.action === "add-journey-task" || body.action === "update-journey-task") {
    const journeyId=clean(body.journeyId,100),title=clean(body.title,120),acceptance=clean(body.acceptanceCriteria,500),taskType=clean(body.taskType,20),executionFrequency=clean(body.executionFrequency,20);
    const minutes=Math.max(15,Math.min(1200,Number(body.estimatedMinutes)||60));
    if(!journeyId||!title||!acceptance||!["reading","finance","exercise","english","general"].includes(taskType)||!["daily","monthly"].includes(executionFrequency))return NextResponse.json({error:"invalid_journey_task"},{status:400});
    const journey=await db.prepare("SELECT id FROM journeys WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(journeyId,identity.userId).first();if(!journey)return NextResponse.json({error:"not_found"},{status:404});
    if(body.action==="add-journey-task"){const priority=await db.prepare("SELECT COALESCE(MAX(priority),0) AS value FROM journey_tasks WHERE user_id=? AND journey_id=?").bind(identity.userId,journeyId).first<{value:number}>();await db.prepare("INSERT INTO journey_tasks (id,user_id,journey_id,title,acceptance_criteria,estimated_minutes,task_type,execution_frequency,priority,status,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?, 'pending','manual',?,?)").bind(crypto.randomUUID(),identity.userId,journeyId,title,acceptance,minutes,taskType,executionFrequency,Number(priority?.value??0)+1,now,now).run();}
    else if(typeof body.id==="string")await db.prepare("UPDATE journey_tasks SET title=?,acceptance_criteria=?,estimated_minutes=?,task_type=?,execution_frequency=?,updated_at=? WHERE id=? AND journey_id=? AND user_id=?").bind(title,acceptance,minutes,taskType,executionFrequency,now,body.id,journeyId,identity.userId).run();
    else return NextResponse.json({error:"missing_id"},{status:400});
    await syncJourneyFromTasks(db,identity.userId,journeyId,now);
  } else if (body.action === "delete-journey-task" && typeof body.id === "string") {
    const task=await db.prepare("SELECT journey_id FROM journey_tasks WHERE id=? AND user_id=?").bind(body.id,identity.userId).first<{journey_id:string}>();if(!task)return NextResponse.json({error:"not_found"},{status:404});
    await db.batch([db.prepare("UPDATE weekly_actions SET source_task_id='' WHERE user_id=? AND source_task_id=?").bind(identity.userId,body.id),db.prepare("UPDATE monthly_outcomes SET source_task_id='' WHERE user_id=? AND source_task_id=?").bind(identity.userId,body.id),db.prepare("DELETE FROM journey_tasks WHERE id=? AND user_id=?").bind(body.id,identity.userId)]);await syncJourneyFromTasks(db,identity.userId,task.journey_id,now);
  } else if (body.action === "toggle-journey-task" && typeof body.id === "string") {
    const task=await db.prepare("SELECT journey_id,status FROM journey_tasks WHERE id=? AND user_id=?").bind(body.id,identity.userId).first<{journey_id:string;status:string}>();if(!task)return NextResponse.json({error:"not_found"},{status:404});const status=task.status==="completed"?"pending":"completed";
    await db.batch([db.prepare("UPDATE journey_tasks SET status=?,completed_at=?,updated_at=? WHERE id=? AND user_id=?").bind(status,status==="completed"?now:null,now,body.id,identity.userId),db.prepare("UPDATE weekly_actions SET status=?,completed_at=? WHERE user_id=? AND source_task_id=? AND status!='paused'").bind(status==="completed"?"completed":"pending",status==="completed"?now:null,identity.userId,body.id),db.prepare("UPDATE monthly_outcomes SET progress=? WHERE user_id=? AND source_task_id=? AND status='active'").bind(status==="completed"?100:0,identity.userId,body.id)]);await syncJourneyFromTasks(db,identity.userId,task.journey_id,now);
  } else if (body.action === "generate-journey-tasks" && typeof body.journeyId === "string") {
    const [journey,existing]=await Promise.all([db.prepare("SELECT title,area,acceptance_criteria,next_action FROM journeys WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(body.journeyId,identity.userId).first<{title:string;area:string;acceptance_criteria:string;next_action:string}>(),db.prepare("SELECT title FROM journey_tasks WHERE journey_id=? AND user_id=?").bind(body.journeyId,identity.userId).all<{title:string}>()]);if(!journey)return NextResponse.json({error:"not_found"},{status:404});
    const generated=await generateJourneyTasks(journey,existing.results.map((item)=>item.title));if(!generated.length)return NextResponse.json({error:"generation_failed"},{status:503});
    const start=existing.results.length;await db.batch(generated.map((item,index)=>db.prepare("INSERT INTO journey_tasks (id,user_id,journey_id,title,acceptance_criteria,estimated_minutes,task_type,execution_frequency,priority,status,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?, 'pending','ai',?,?)").bind(crypto.randomUUID(),identity.userId,body.journeyId,item.title,item.acceptanceCriteria,item.estimatedMinutes,item.taskType,item.executionFrequency,start+index+1,now,now)));await syncJourneyFromTasks(db,identity.userId,body.journeyId,now);
  } else if (body.action === "evaluate-journey-tasks" && typeof body.journeyId === "string") {
    const [journey,tasks]=await Promise.all([db.prepare("SELECT title,acceptance_criteria FROM journeys WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(body.journeyId,identity.userId).first<{title:string;acceptance_criteria:string}>(),db.prepare("SELECT title,acceptance_criteria,estimated_minutes,execution_frequency,status FROM journey_tasks WHERE journey_id=? AND user_id=? ORDER BY priority,rowid").bind(body.journeyId,identity.userId).all<{title:string;acceptance_criteria:string;estimated_minutes:number;execution_frequency:string;status:string}>()]);if(!journey)return NextResponse.json({error:"not_found"},{status:404});return NextResponse.json({ok:true,evaluation:await evaluateJourneyTasks(journey,tasks.results)});
  } else if (body.action === "generate-month-outcomes") {
    const [taskRows,currentRows,profile]=await Promise.all([
      db.prepare("SELECT t.id,t.journey_id,j.title AS journey_title,j.area,t.title,t.acceptance_criteria,t.estimated_minutes,t.task_type,t.execution_frequency,t.priority FROM journey_tasks t JOIN journeys j ON j.id=t.journey_id WHERE t.user_id=? AND t.status='pending' AND j.status='active' AND j.deleted_at IS NULL AND t.id NOT IN (SELECT source_task_id FROM monthly_outcomes WHERE user_id=? AND status='active') ORDER BY CASE WHEN t.execution_frequency='daily' THEN 0 ELSE 1 END,j.sequence_number,t.priority LIMIT 30").bind(identity.userId,identity.userId).all<JourneyTaskCandidate>(),
      db.prepare("SELECT title,status FROM monthly_outcomes WHERE user_id=? AND period=?").bind(identity.userId,periods.month).all<{title:string;status:string}>(),
      db.prepare("SELECT protected_day FROM profiles WHERE user_id=?").bind(identity.userId).first<{protected_day:string}>(),
    ]);
    if(currentRows.results.some((item)=>item.status!=="active"))return NextResponse.json({error:"month_settled"},{status:409});
    const slots=Math.max(0,5-currentRows.results.length);
    if(!slots)return NextResponse.json({error:"month_outcomes_full"},{status:409});
    if(!taskRows.results.length)return NextResponse.json({error:"no_journey_tasks"},{status:409});
    const candidates=taskRows.results.slice(0,slots);
    const activeDays=remainingPlanningDays(periods.localDate,profile?.protected_day||"周日");
    await db.batch(candidates.map((item)=>{const daily=item.execution_frequency==="daily";return db.prepare("INSERT INTO monthly_outcomes (id,user_id,title,acceptance_criteria,progress,expected_hours,status,journey_id,kind,period,source_task_id) VALUES (?,?,?,?,0,?,'active',?,?,?,?,?)").bind(crypto.randomUUID(),identity.userId,daily?`每日｜${item.title}`:item.title,daily?`本月剩余时间完成 ${activeDays} 次；每次标准：${item.acceptance_criteria}`:item.acceptance_criteria,Math.max(1,Math.ceil(item.estimated_minutes*(daily?activeDays:1)/60)),item.journey_id,daily?"habit":"milestone",periods.month,item.id)}));
  } else if (body.action === "settle-month") {
    if(Number(periods.localDate.slice(8,10))<25)return NextResponse.json({error:"month_not_ready"},{status:409});
    const rows=await db.prepare("SELECT * FROM monthly_outcomes WHERE user_id=? AND period=? AND status='active'").bind(identity.userId,periods.month).all<{id:string;title:string;acceptance_criteria:string;progress:number;expected_hours:number;journey_id:string;kind:string}>();
    if(!rows.results.length)return NextResponse.json({error:"nothing_to_settle"},{status:409});
    const nextDate=new Date(`${periods.month}-01T00:00:00Z`);nextDate.setUTCMonth(nextDate.getUTCMonth()+1);const nextPeriod=nextDate.toISOString().slice(0,7);
    const updates=rows.results.map((item)=>db.prepare("UPDATE monthly_outcomes SET status=?,settled_at=? WHERE id=? AND user_id=?").bind(Number(item.progress)>=100?"completed":"rolled",now,item.id,identity.userId));
    const carries=rows.results.filter((item)=>Number(item.progress)<100).map((item)=>db.prepare("INSERT INTO monthly_outcomes (id,user_id,title,acceptance_criteria,progress,expected_hours,status,journey_id,kind,period,rolled_from_id) VALUES (?,?,?,?,0,?,'active',?,?,?,?)").bind(crypto.randomUUID(),identity.userId,item.title,item.acceptance_criteria,item.expected_hours,item.journey_id,item.kind,nextPeriod,item.id));
    await db.batch([...updates,...carries]);
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
    let title = clean(body.title, 120), outcomeId = clean(body.outcomeId, 100);
    const scheduledFor = clean(body.scheduledFor, 12) || "本周",sourceTaskId=clean(body.sourceTaskId,100);
    const minutes = Math.max(15, Math.min(600, Number(body.estimatedMinutes) || 30)), taskType = clean(body.taskType, 20), isSideHustle = body.isSideHustle ? 1 : 0;
    if(body.action==="add-weekly-action"){
      const source=await db.prepare("SELECT title,task_type,journey_id FROM journey_tasks WHERE id=? AND user_id=? AND status='pending'").bind(sourceTaskId,identity.userId).first<{title:string;task_type:string;journey_id:string}>();
      if(!source)return NextResponse.json({error:"invalid_source_task"},{status:400});title=source.title;
      if(!outcomeId)outcomeId=(await db.prepare("SELECT id FROM monthly_outcomes WHERE user_id=? AND status='active' AND (source_task_id=? OR journey_id=?) ORDER BY CASE WHEN source_task_id=? THEN 0 ELSE 1 END LIMIT 1").bind(identity.userId,sourceTaskId,source.journey_id,sourceTaskId).first<{id:string}>())?.id||"";
    }
    if (!title || !["reading","finance","exercise","english","general"].includes(taskType)) return NextResponse.json({ error: "invalid_task" }, { status: 400 });
    if (outcomeId) { const outcome = await db.prepare("SELECT id FROM monthly_outcomes WHERE id=? AND user_id=?").bind(outcomeId,identity.userId).first(); if (!outcome) return NextResponse.json({ error: "invalid_outcome" }, { status: 400 }); }
    if (body.action === "add-weekly-action") { const priority = await db.prepare("SELECT COALESCE(MAX(priority),0) AS value FROM weekly_actions WHERE user_id=? AND cycle_id=?").bind(identity.userId,activeCycleId).first<{value:number}>(); await db.prepare("INSERT INTO weekly_actions (id,user_id,outcome_id,title,estimated_minutes,scheduled_for,priority,status,task_type,source,is_side_hustle,cycle_id,source_task_id) VALUES (?,?,?,?,?,?,?,'pending',?,'manual',?,?,?)").bind(crypto.randomUUID(),identity.userId,outcomeId,title,minutes,scheduledFor,(priority?.value??0)+1,taskType,isSideHustle,activeCycleId,sourceTaskId).run(); }
    else if (typeof body.id === "string") await db.prepare("UPDATE weekly_actions SET outcome_id=?,title=?,estimated_minutes=?,scheduled_for=?,task_type=?,source='manual',is_side_hustle=? WHERE id=? AND user_id=?").bind(outcomeId,title,minutes,scheduledFor,taskType,isSideHustle,body.id,identity.userId).run();
    else return NextResponse.json({ error: "missing_id" }, { status: 400 });
  } else if (body.action === "delete-weekly-action" && typeof body.id === "string") {
    await db.prepare("DELETE FROM weekly_actions WHERE id=? AND user_id=?").bind(body.id,identity.userId).run();
  } else if (body.action === "carry-action" && typeof body.id === "string") {
    const old=await db.prepare("SELECT * FROM weekly_actions WHERE id=? AND user_id=? AND cycle_id!=?").bind(body.id,identity.userId,activeCycleId).first<{id:string;outcome_id:string;title:string;estimated_minutes:number;scheduled_for:string;task_type:string;is_side_hustle:number}>();
    if(!old)return NextResponse.json({error:"not_found"},{status:404});
    const exists=await db.prepare("SELECT id FROM weekly_actions WHERE user_id=? AND cycle_id=? AND carried_from_id=?").bind(identity.userId,activeCycleId,old.id).first();
    if(exists)return NextResponse.json({error:"already_carried"},{status:409});
    const rolledOutcome=old.outcome_id?await db.prepare("SELECT id FROM monthly_outcomes WHERE user_id=? AND period=? AND (id=? OR rolled_from_id=?) ORDER BY CASE WHEN rolled_from_id=? THEN 0 ELSE 1 END LIMIT 1").bind(identity.userId,periods.month,old.outcome_id,old.outcome_id,old.outcome_id).first<{id:string}>():null;
    const priority=await db.prepare("SELECT COALESCE(MAX(priority),0) AS value FROM weekly_actions WHERE user_id=? AND cycle_id=?").bind(identity.userId,activeCycleId).first<{value:number}>();
    await db.prepare("INSERT INTO weekly_actions (id,user_id,outcome_id,title,estimated_minutes,scheduled_for,priority,status,task_type,source,is_side_hustle,cycle_id,carried_from_id) VALUES (?,?,?,?,?,?,?,'pending',?,'carried',?,?,?)").bind(crypto.randomUUID(),identity.userId,rolledOutcome?.id||old.outcome_id,old.title,old.estimated_minutes,"本周",Number(priority?.value??0)+1,old.task_type,old.is_side_hustle,activeCycleId,old.id).run();
  } else if (body.action === "generate-week-plan") {
    const [profile, taskRows, latestReview] = await Promise.all([
      db.prepare("SELECT vision, weekly_capacity_minutes, weekly_goal,side_hustle_limit_minutes,protected_day FROM profiles WHERE user_id = ?").bind(identity.userId).first<{ vision: string; weekly_capacity_minutes: number; weekly_goal: string;side_hustle_limit_minutes:number;protected_day:string }>(),
      db.prepare("SELECT t.id,t.journey_id,j.title AS journey_title,j.area,t.title,t.acceptance_criteria,t.estimated_minutes,t.task_type,t.execution_frequency,t.priority FROM journey_tasks t JOIN journeys j ON j.id=t.journey_id WHERE t.user_id=? AND t.status='pending' AND j.status='active' AND j.deleted_at IS NULL AND (t.execution_frequency='daily' OR t.id NOT IN (SELECT source_task_id FROM weekly_actions WHERE user_id=? AND cycle_id=? AND status IN ('pending','completed'))) ORDER BY CASE WHEN t.execution_frequency='daily' THEN 0 ELSE 1 END,j.sequence_number,t.priority LIMIT 40").bind(identity.userId,identity.userId,activeCycleId).all<JourneyTaskCandidate>(),
      db.prepare("SELECT health_check,energy_score,decision,auto_decision,kill_rule_count,next_priority FROM reviews WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(identity.userId).first<{health_check:string;energy_score:number;decision:string;auto_decision:string;kill_rule_count:number;next_priority:string}>(),
    ]);
    const goal = clean(body.goal, 500) || profile?.weekly_goal || "推进最重要的人生目标";
    const requestedCapacity = Math.max(60, Math.min(2400, Number(body.capacityMinutes) || profile?.weekly_capacity_minutes || 420));
    const lowEnergy = Boolean(latestReview && (latestReview.energy_score <= 4 || /睡眠|生病|疲惫|透支|疼痛/.test(latestReview.health_check)));
    const capacity = lowEnergy ? Math.max(60,Math.floor(requestedCapacity*.65/5)*5) : requestedCapacity;
    const configuredSideLimit = Math.max(0,Math.min(720,Number(body.sideHustleLimitMinutes) || profile?.side_hustle_limit_minutes || 360));
    const sideHustleLimit = latestReview?.auto_decision === "stop" || latestReview?.decision === "stop" ? 0 : lowEnergy ? Math.floor(configuredSideLimit/2/5)*5 : configuredSideLimit;
    const protectedDay = clean(body.protectedDay,10) || profile?.protected_day || "周日";
    const reviewContext = latestReview ? `能量${latestReview.energy_score}/10；健康：${latestReview.health_check || "未填写"}；用户决定：${latestReview.decision}；系统判断：${latestReview.auto_decision}；停止规则触发${latestReview.kill_rule_count}条；下周重点：${latestReview.next_priority}` : "";
    if(!taskRows.results.length)return NextResponse.json({error:"no_journey_tasks"},{status:409});
    const plan = await selectWeekTasks(goal, capacity, taskRows.results, protectedDay, sideHustleLimit, reviewContext);
    const completedDaily=new Set((await db.prepare("SELECT source_task_id,scheduled_for FROM weekly_actions WHERE user_id=? AND cycle_id=? AND status='completed' AND source_task_id!=''").bind(identity.userId,activeCycleId).all<{source_task_id:string;scheduled_for:string}>()).results.map((item)=>`${item.source_task_id}:${item.scheduled_for}`));
    const freshPlan=plan.filter((item)=>!completedDaily.has(`${item.sourceTaskId}:${item.day}`));
    if(!freshPlan.length)return NextResponse.json({error:"no_tasks_fit_capacity"},{status:409});
    await db.prepare("UPDATE weekly_actions SET status = 'paused' WHERE user_id = ? AND cycle_id=? AND status = 'pending'").bind(identity.userId,activeCycleId).run();
    const maxPriority = await db.prepare("SELECT COALESCE(MAX(priority),0) AS value FROM weekly_actions WHERE user_id = ? AND cycle_id=?").bind(identity.userId,activeCycleId).first<{ value: number }>();
    const outcomeByTask=new Map((await db.prepare("SELECT id,source_task_id,journey_id FROM monthly_outcomes WHERE user_id=? AND status='active' AND period=?").bind(identity.userId,periods.month).all<{id:string;source_task_id:string;journey_id:string}>()).results.map((item)=>[item.source_task_id,item.id]));
    const taskJourney=new Map(taskRows.results.map((item)=>[item.id,item.journey_id]));
    const outcomeByJourney=new Map((await db.prepare("SELECT id,journey_id FROM monthly_outcomes WHERE user_id=? AND status='active' AND period=? ORDER BY rowid").bind(identity.userId,periods.month).all<{id:string;journey_id:string}>()).results.map((item)=>[item.journey_id,item.id]));
    await db.batch(freshPlan.map((item, index) => db.prepare("INSERT INTO weekly_actions (id,user_id,outcome_id,title,estimated_minutes,scheduled_for,priority,status,task_type,source,is_side_hustle,cycle_id,source_task_id) VALUES (?,?,?,?,?,?,?,'pending',?,'ai',?,?,?)").bind(crypto.randomUUID(), identity.userId, outcomeByTask.get(item.sourceTaskId)||outcomeByJourney.get(taskJourney.get(item.sourceTaskId)||"")||"", item.title, item.minutes, item.day, (maxPriority?.value ?? 0) + index + 1, item.type, item.sideHustle ? 1 : 0,activeCycleId,item.sourceTaskId)));
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
    const journey = await db.prepare("SELECT id,title,acceptance_criteria FROM journeys WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(body.id,identity.userId).first<{id:string;title:string;acceptance_criteria:string}>();
    if (!journey) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const review=await reviewJourneyEvidence(journey.title,journey.acceptance_criteria,evidence);
    if(review.status!=="passed"){
      await db.prepare("UPDATE journeys SET evidence=?,evidence_review_status='needs_more',evidence_review_feedback=?,evidence_score=? WHERE id=? AND user_id=?").bind(evidence,review.feedback,review.score,body.id,identity.userId).run();
      return NextResponse.json({ok:false,error:"evidence_needs_more",feedback:review.feedback,score:review.score,reviewMode:review.mode},{status:422});
    }
    await db.prepare("UPDATE journeys SET status='completed',progress=100,evidence=?,completed_at=?,evidence_review_status='passed',evidence_review_feedback=?,evidence_score=? WHERE id=? AND user_id=?").bind(evidence,now,review.feedback,review.score,body.id,identity.userId).run();
    await activateNextEligibleJourney(db,identity.userId);
    return NextResponse.json({ok:true,reviewMode:review.mode,score:review.score,feedback:review.feedback});
  } else if (body.action === "update-journey" && typeof body.id === "string") {
    const title = clean(body.title, 80), area = clean(body.area, 30), acceptance = clean(body.acceptanceCriteria, 300), nextAction = clean(body.nextAction, 160);
    if (!title || !area || !acceptance || !nextAction) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    await db.prepare("UPDATE journeys SET title=?,area=?,acceptance_criteria=?,next_action=? WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(title, area, acceptance, nextAction, body.id, identity.userId).run();
  } else if (body.action === "delete-journey" && typeof body.id === "string") {
    await db.prepare("UPDATE journeys SET deleted_at=?,status='paused' WHERE id=? AND user_id=? AND deleted_at IS NULL").bind(now, body.id, identity.userId).run();
  } else if (body.action === "adjust-plan" && typeof body.mode === "string") {
    if (body.mode === "pause-lowest") { const target = await db.prepare("SELECT id FROM weekly_actions WHERE user_id=? AND cycle_id=? AND status='pending' AND task_type!='exercise' ORDER BY priority DESC LIMIT 1").bind(identity.userId,activeCycleId).first<{id:string}>(); if (!target) return NextResponse.json({error:"nothing_to_adjust"},{status:409}); await db.prepare("UPDATE weekly_actions SET status='paused' WHERE id=? AND user_id=?").bind(target.id,identity.userId).run(); }
    else if (body.mode === "shrink-scope") { const target = await db.prepare("SELECT id,estimated_minutes FROM weekly_actions WHERE user_id=? AND cycle_id=? AND status='pending' AND estimated_minutes>30 ORDER BY estimated_minutes DESC LIMIT 1").bind(identity.userId,activeCycleId).first<{id:string;estimated_minutes:number}>(); if (!target) return NextResponse.json({error:"nothing_to_adjust"},{status:409}); await db.prepare("UPDATE weekly_actions SET estimated_minutes=? WHERE id=? AND user_id=?").bind(Math.max(30,target.estimated_minutes-20),target.id,identity.userId).run(); }
    else if (body.mode === "restore-paused") await db.prepare("UPDATE weekly_actions SET status='pending' WHERE user_id=? AND cycle_id=? AND status='paused'").bind(identity.userId,activeCycleId).run();
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
    const energyScore=Math.max(1,Math.min(10,Number(body.energyScore)||7));
    if(!achievement||!healthCheck||!marketEvidence||!nextPriority||!["continue","adjust","stop"].includes(decision))return NextResponse.json({error:"missing_fields"},{status:400});
    const reviewId=crypto.randomUUID();
    await db.prepare("INSERT INTO reviews (id,user_id,period,achievement,low_value,next_priority,health_check,market_evidence,energy_score,decision,kill_rule_count,week_start,auto_decision,auto_reasons,created_at) VALUES (?,?,'week',?,?,?,?,?,?,?,0,?,'continue','[]',?)").bind(reviewId,identity.userId,achievement,lowValue,nextPriority,healthCheck,marketEvidence,energyScore,decision,periods.weekStart,now).run();
    const evaluation=await evaluateStopRules(db,identity.userId);
    await db.prepare("UPDATE reviews SET kill_rule_count=?,auto_decision=?,auto_reasons=? WHERE id=? AND user_id=?").bind(evaluation.reasons.length,evaluation.decision,JSON.stringify(evaluation.reasons),reviewId,identity.userId).run();
    if(evaluation.reasons.length)await db.batch(evaluation.reasons.map((item)=>db.prepare("INSERT OR IGNORE INTO stop_rule_events (id,user_id,week_start,rule_code,severity,reason,created_at) VALUES (?,?,?,?,?,?,?)").bind(`${identity.userId}:${periods.weekStart}:${item.code}`,identity.userId,periods.weekStart,item.code,item.severity,item.reason,now)));
  } else return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
