import { executionPeriods } from "@/lib/workspace";

export type PlanningIdentity = { userId: string };

const defaultTypes = [
  ["health", "健康", "#3f7d69", "♥", 1],
  ["learning", "学习", "#496b91", "Aa", 2],
  ["work", "工作", "#8a6339", "□", 3],
  ["creation", "创作", "#7b5b8d", "✦", 4],
  ["finance", "财务", "#50635c", "¥", 5],
  ["family", "家庭", "#9a6666", "⌂", 6],
  ["social", "社交", "#7c6a52", "○", 7],
  ["entertainment", "娱乐", "#477b7e", "♪", 8],
  ["travel", "旅行", "#397b91", "↗", 9],
  ["life", "生活", "#6b715f", "☼", 10],
  ["other", "其他", "#77736d", "·", 11],
] as const;

let planningSchemaPromise: Promise<void> | null = null;
const seededPlanningUsers = new Set<string>();
const refreshedPlanningPeriods = new Set<string>();

async function initializePlanningSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS journey_stages_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, objective TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned', sort_order INTEGER NOT NULL DEFAULT 1,
      start_date TEXT, end_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journey_goals_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, stage_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', acceptance_criteria TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'planned', sort_order INTEGER NOT NULL DEFAULT 1,
      start_date TEXT, end_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS task_types_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type_key TEXT NOT NULL, name TEXT NOT NULL,
      color TEXT NOT NULL, icon TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS task_definitions_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, goal_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', type_key TEXT NOT NULL DEFAULT 'other', mode TEXT NOT NULL DEFAULT 'once',
      frequency TEXT NOT NULL DEFAULT 'once', occurrences INTEGER NOT NULL DEFAULT 1,
      weekdays_json TEXT NOT NULL DEFAULT '[]', month_days_json TEXT NOT NULL DEFAULT '[]', times_json TEXT NOT NULL DEFAULT '[]',
      scheduled_date TEXT, start_date TEXT, end_date TEXT, estimated_minutes INTEGER NOT NULL DEFAULT 30,
      priority INTEGER NOT NULL DEFAULT 2, record_required INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS planning_records_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, instance_id TEXT NOT NULL, type_key TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', duration INTEGER NOT NULL DEFAULT 0,
      feeling TEXT NOT NULL DEFAULT '', recorded_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS monthly_plans_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS monthly_plan_goals_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL, goal_id TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 2, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS task_instances_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL, goal_id TEXT NOT NULL,
      definition_id TEXT NOT NULL, title TEXT NOT NULL, type_key TEXT NOT NULL,
      scheduled_date TEXT NOT NULL, scheduled_time TEXT NOT NULL DEFAULT '', estimated_minutes INTEGER NOT NULL DEFAULT 30,
      priority INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL DEFAULT 'system',
      user_adjusted INTEGER NOT NULL DEFAULT 0, occurrence_key TEXT NOT NULL, completed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly_capacity_days_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, weekday INTEGER NOT NULL, available INTEGER NOT NULL DEFAULT 1,
      minutes INTEGER NOT NULL DEFAULT 60, slots_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS planning_reports_v2 (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, report_type TEXT NOT NULL, period TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'final', summary_json TEXT NOT NULL, generated_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_stages_v2_user_sort ON journey_stages_v2(user_id,sort_order)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_goals_v2_stage_sort ON journey_goals_v2(user_id,stage_id,sort_order)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_v2_goal ON task_definitions_v2(user_id,goal_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_task_types_v2_key ON task_types_v2(user_id,type_key)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_month_plan_v2_period ON monthly_plans_v2(user_id,period)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_month_goal_v2 ON monthly_plan_goals_v2(user_id,plan_id,goal_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_instances_v2_occurrence ON task_instances_v2(user_id,occurrence_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_instances_v2_date ON task_instances_v2(user_id,scheduled_date,status)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_capacity_v2_day ON weekly_capacity_days_v2(user_id,weekday)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_v2_period ON planning_reports_v2(user_id,report_type,period)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_records_instance ON planning_records_v2(user_id,instance_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_planning_records_type_date ON planning_records_v2(user_id,type_key,recorded_at)"),
  ]);
  await db.prepare("PRAGMA optimize").run();
}

export function ensurePlanningSchema(db: D1Database) {
  if (!planningSchemaPromise) {
    planningSchemaPromise = initializePlanningSchema(db).catch((error) => {
      planningSchemaPromise = null;
      throw error;
    });
  }
  return planningSchemaPromise;
}

export async function seedPlanningTypes(db: D1Database, userId: string) {
  if (seededPlanningUsers.has(userId)) return;
  const [typeCount, capacityCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total FROM task_types_v2 WHERE user_id=?").bind(userId).first<{total:number}>(),
    db.prepare("SELECT COUNT(*) AS total FROM weekly_capacity_days_v2 WHERE user_id=?").bind(userId).first<{total:number}>(),
  ]);
  if (Number(typeCount?.total) >= defaultTypes.length && Number(capacityCount?.total) >= 7) {
    seededPlanningUsers.add(userId);
    return;
  }
  const now = new Date().toISOString();
  await db.batch(defaultTypes.map(([key,name,color,icon,sort]) => db.prepare(
    "INSERT OR IGNORE INTO task_types_v2 (id,user_id,type_key,name,color,icon,sort_order,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)",
  ).bind(`${userId}-type-${key}`,userId,key,name,color,icon,sort,now,now)));
  await db.batch([1,2,3,4,5,6,7].map((weekday) => db.prepare(
    "INSERT OR IGNORE INTO weekly_capacity_days_v2 (id,user_id,weekday,available,minutes,slots_json,updated_at) VALUES (?,?,?,1,60,'[]',?)",
  ).bind(`${userId}-capacity-${weekday}`,userId,weekday,now)));
  seededPlanningUsers.add(userId);
}

function dateKey(date: Date) { return date.toISOString().slice(0,10); }
function mondayOf(date: Date) { const copy=new Date(date); const d=(copy.getUTCDay()+6)%7; copy.setUTCDate(copy.getUTCDate()-d); return dateKey(copy); }
function daysInPeriod(period:string) { const [y,m]=period.split("-").map(Number); return new Date(Date.UTC(y,m,0)).getUTCDate(); }
function parseList(value:string) { try { const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed:[]; } catch { return []; } }
function hash(value:string) { let result=0; for(let i=0;i<value.length;i++) result=(result*31+value.charCodeAt(i))>>>0; return result; }

type DefinitionRow = { id:string;goal_id:string;title:string;type_key:string;mode:string;frequency:string;occurrences:number;weekdays_json:string;month_days_json:string;times_json:string;scheduled_date:string|null;start_date:string|null;end_date:string|null;estimated_minutes:number;priority:number };

function candidateDates(task:DefinitionRow, period:string) {
  const total=daysInPeriod(period), all=Array.from({length:total},(_,index)=>`${period}-${String(index+1).padStart(2,"0")}`)
    .filter((date)=>(!task.start_date||date>=task.start_date)&&(!task.end_date||date<=task.end_date));
  if(task.mode==="once") {
    if(task.scheduled_date&&task.scheduled_date.startsWith(period)) return [task.scheduled_date];
    return all.length?[all[hash(task.id+period)%all.length]]:[];
  }
  const count=Math.max(1,Math.min(10,Number(task.occurrences)||1));
  if(task.frequency==="daily") return all.flatMap((date)=>Array.from({length:count},()=>date));
  if(task.frequency==="weekly") {
    const wanted=parseList(task.weekdays_json).map(Number).filter((item)=>item>=1&&item<=7);
    const weeks=new Map<string,string[]>();
    for(const date of all){const d=new Date(`${date}T00:00:00Z`);const key=mondayOf(d);const list=weeks.get(key)||[];list.push(date);weeks.set(key,list);}
    return [...weeks.values()].flatMap((dates,weekIndex)=>{
      const chosen=wanted.length?dates.filter((date)=>{const day=new Date(`${date}T00:00:00Z`).getUTCDay();return (day===0?7:day)&&wanted.includes(day===0?7:day);}):[];
      const pool=chosen.length?chosen:dates;
      return Array.from({length:count},(_,index)=>pool[(hash(task.id)+weekIndex+index*Math.max(1,Math.floor(pool.length/count)))%pool.length]);
    });
  }
  const monthDays=parseList(task.month_days_json).map(Number).filter((item)=>item>=1&&item<=total);
  if(monthDays.length) return monthDays.slice(0,count).map((day)=>`${period}-${String(day).padStart(2,"0")}`).filter((date)=>all.includes(date));
  return Array.from({length:count},(_,index)=>all[Math.min(all.length-1,Math.floor((index+.5)*all.length/count))]).filter(Boolean);
}

export async function generatePlanInstances(db:D1Database,userId:string,period:string) {
  const plan=await db.prepare("SELECT id FROM monthly_plans_v2 WHERE user_id=? AND period=? AND status!='draft'").bind(userId,period).first<{id:string}>();
  if(!plan)return 0;
  const tasks=await db.prepare(`SELECT t.* FROM task_definitions_v2 t
    JOIN monthly_plan_goals_v2 pg ON pg.goal_id=t.goal_id AND pg.user_id=t.user_id
    WHERE t.user_id=? AND pg.plan_id=? AND t.enabled=1`).bind(userId,plan.id).all<DefinitionRow>();
  const now=new Date().toISOString();
  const inserts:D1PreparedStatement[]=[];
  for(const task of tasks.results){
    const dates=candidateDates(task,period),times=parseList(task.times_json).map(String).filter((item)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(item));
    for(let index=0;index<dates.length;index++){
      const date=dates[index],occurrenceKey=`${plan.id}:${task.id}:${date}:${index}`;
      inserts.push(db.prepare(`INSERT OR IGNORE INTO task_instances_v2
        (id,user_id,plan_id,goal_id,definition_id,title,type_key,scheduled_date,scheduled_time,estimated_minutes,priority,status,source,user_adjusted,occurrence_key,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending','system',0,?,?,?)`).bind(crypto.randomUUID(),userId,plan.id,task.goal_id,task.id,task.title,task.type_key,date,times.length?times[index%times.length]:"",task.estimated_minutes,task.priority,occurrenceKey,now,now));
    }
  }
  let created=0;
  for(let offset=0;offset<inserts.length;offset+=80){
    const results=await db.batch(inserts.slice(offset,offset+80));
    created+=results.reduce((sum,result)=>sum+Number(result.meta.changes||0),0);
  }
  return created;
}

function summary(rows:Array<{status:string;estimated_minutes:number;type_key:string;goal_id:string}>) {
  const total=rows.length,completed=rows.filter((item)=>item.status==="completed").length;
  const plannedMinutes=rows.reduce((sum,item)=>sum+Number(item.estimated_minutes||0),0);
  const completedMinutes=rows.filter((item)=>item.status==="completed").reduce((sum,item)=>sum+Number(item.estimated_minutes||0),0);
  const byType:Record<string,{count:number;minutes:number;completed:number}>={};
  const byGoal:Record<string,{count:number;completed:number}>={};
  for(const row of rows){byType[row.type_key]??={count:0,minutes:0,completed:0};byType[row.type_key].count++;byType[row.type_key].minutes+=row.estimated_minutes;if(row.status==="completed")byType[row.type_key].completed++;byGoal[row.goal_id]??={count:0,completed:0};byGoal[row.goal_id].count++;if(row.status==="completed")byGoal[row.goal_id].completed++;}
  return {total,completed,pending:rows.filter((item)=>item.status==="pending").length,paused:rows.filter((item)=>item.status==="paused").length,completionRate:total?Math.round(completed/total*100):0,plannedMinutes,completedMinutes,byType,byGoal};
}

export async function generateReports(db:D1Database,userId:string) {
  const now=new Date(),today=dateKey(new Date(now.getTime()+8*3600000));
  const thisMonday=mondayOf(new Date(`${today}T00:00:00Z`)); const previousSunday=new Date(`${thisMonday}T00:00:00Z`);previousSunday.setUTCDate(previousSunday.getUTCDate()-1);const previousMonday=mondayOf(previousSunday);
  const currentMonth=today.slice(0,7);const [year,month]=currentMonth.split("-").map(Number);const previousMonth=dateKey(new Date(Date.UTC(year,month-2,1))).slice(0,7);
  const periods:["weekly"|"monthly",string,string,string][]=[
    ["weekly",previousMonday,dateKey(previousSunday),previousMonday],
    ["monthly",`${previousMonth}-01`,`${previousMonth}-${String(daysInPeriod(previousMonth)).padStart(2,"0")}`,previousMonth],
  ];
  for(const [type,start,end,period] of periods){
    const rows=await db.prepare("SELECT status,estimated_minutes,type_key,goal_id FROM task_instances_v2 WHERE user_id=? AND scheduled_date>=? AND scheduled_date<=?").bind(userId,start,end).all<{status:string;estimated_minutes:number;type_key:string;goal_id:string}>();
    if(!rows.results.length)continue;
    const data=summary(rows.results),timestamp=new Date().toISOString();
    await db.prepare(`INSERT INTO planning_reports_v2 (id,user_id,report_type,period,status,summary_json,generated_at,updated_at)
      VALUES (?,?,?,?,'final',?,?,?) ON CONFLICT(user_id,report_type,period) DO UPDATE SET summary_json=excluded.summary_json,updated_at=excluded.updated_at`).bind(crypto.randomUUID(),userId,type,period,JSON.stringify(data),timestamp,timestamp).run();
  }
}

export async function ensurePlanningDerivedData(db:D1Database,userId:string) {
  const {month,weekStart}=executionPeriods(),cacheKey=`${userId}:${month}:${weekStart}`;
  if(refreshedPlanningPeriods.has(cacheKey))return;
  const previousSunday=new Date(`${weekStart}T00:00:00Z`);previousSunday.setUTCDate(previousSunday.getUTCDate()-1);
  const previousWeek=mondayOf(previousSunday);
  const [year,monthNumber]=month.split("-").map(Number),previousMonth=dateKey(new Date(Date.UTC(year,monthNumber-2,1))).slice(0,7);
  const state=await db.prepare(`SELECT
    (SELECT COUNT(*) FROM monthly_plans_v2 WHERE user_id=? AND period=? AND status!='draft') AS plans,
    (SELECT COUNT(*) FROM task_instances_v2 WHERE user_id=? AND scheduled_date>=? AND scheduled_date<=?) AS instances,
    (SELECT COUNT(*) FROM planning_reports_v2 WHERE user_id=? AND status='final' AND ((report_type='weekly' AND period=?) OR (report_type='monthly' AND period=?))) AS reports`).bind(userId,month,userId,`${month}-01`,`${month}-31`,userId,previousWeek,previousMonth).first<{plans:number;instances:number;reports:number}>();
  if(Number(state?.plans)>0&&Number(state?.instances)===0)await generatePlanInstances(db,userId,month);
  if(Number(state?.reports)<2)await generateReports(db,userId);
  refreshedPlanningPeriods.add(cacheKey);
}

export async function syncPlanningProgress(db:D1Database,userId:string,goalId:string,now=new Date().toISOString()) {
  const instanceCounts=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM task_instances_v2 WHERE user_id=? AND goal_id=?").bind(userId,goalId).first<{total:number;completed:number}>();
  const total=Number(instanceCounts?.total||0),completed=Number(instanceCounts?.completed||0);
  if(total>0)await db.prepare("UPDATE journey_goals_v2 SET status=CASE WHEN ?=? THEN 'completed' WHEN status='completed' THEN 'active' ELSE status END,updated_at=? WHERE user_id=? AND id=?").bind(completed,total,now,userId,goalId).run();
  const goal=await db.prepare("SELECT stage_id FROM journey_goals_v2 WHERE user_id=? AND id=?").bind(userId,goalId).first<{stage_id:string}>();
  if(!goal)return;
  const goalCounts=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM journey_goals_v2 WHERE user_id=? AND stage_id=?").bind(userId,goal.stage_id).first<{total:number;completed:number}>();
  const goalTotal=Number(goalCounts?.total||0),goalCompleted=Number(goalCounts?.completed||0);
  if(goalTotal>0)await db.prepare("UPDATE journey_stages_v2 SET status=CASE WHEN ?=? THEN 'completed' WHEN status='completed' THEN 'active' ELSE status END,updated_at=? WHERE user_id=? AND id=?").bind(goalCompleted,goalTotal,now,userId,goal.stage_id).run();
}

export async function planningSnapshot(db:D1Database,userId:string) {
  const {localDate,weekStart,weekEnd,month}=executionPeriods();
  const [stages,goals,tasks,types,plans,planGoals,instances,capacity,reports,records]=await Promise.all([
    db.prepare("SELECT * FROM journey_stages_v2 WHERE user_id=? ORDER BY sort_order,created_at").bind(userId).all(),
    db.prepare("SELECT * FROM journey_goals_v2 WHERE user_id=? ORDER BY sort_order,created_at").bind(userId).all(),
    db.prepare("SELECT * FROM task_definitions_v2 WHERE user_id=? ORDER BY priority,created_at").bind(userId).all(),
    db.prepare("SELECT * FROM task_types_v2 WHERE user_id=? ORDER BY sort_order").bind(userId).all(),
    db.prepare("SELECT * FROM monthly_plans_v2 WHERE user_id=? ORDER BY period DESC").bind(userId).all(),
    db.prepare("SELECT * FROM monthly_plan_goals_v2 WHERE user_id=? ORDER BY priority,created_at").bind(userId).all(),
    db.prepare("SELECT i.*,COALESCE(d.record_required,0) AS record_required,r.id AS record_id FROM task_instances_v2 i LEFT JOIN task_definitions_v2 d ON d.id=i.definition_id AND d.user_id=i.user_id LEFT JOIN planning_records_v2 r ON r.instance_id=i.id AND r.user_id=i.user_id WHERE i.user_id=? AND i.scheduled_date>=date(?,'start of month','-1 month') AND i.scheduled_date<=date(?,'start of month','+2 month','-1 day') ORDER BY i.scheduled_date,CASE WHEN i.scheduled_time='' THEN 1 ELSE 0 END,i.scheduled_time,i.priority,i.created_at").bind(userId,localDate,localDate).all(),
    db.prepare("SELECT * FROM weekly_capacity_days_v2 WHERE user_id=? ORDER BY weekday").bind(userId).all(),
    db.prepare("SELECT * FROM planning_reports_v2 WHERE user_id=? ORDER BY period DESC LIMIT 24").bind(userId).all(),
    db.prepare("SELECT * FROM planning_records_v2 WHERE user_id=? ORDER BY recorded_at DESC,created_at DESC LIMIT 500").bind(userId).all(),
  ]);
  return {stages:stages.results,goals:goals.results,tasks:tasks.results,taskTypes:types.results,monthlyPlans:plans.results,monthlyPlanGoals:planGoals.results,taskInstances:instances.results,capacityDays:capacity.results,reports:reports.results,records:records.results,calendar:{localDate,weekStart,weekEnd,month}};
}

export function weekHealth(instances:Array<{scheduled_date:string;estimated_minutes:number;status:string}>,capacityDays:Array<{available:number;minutes:number}>,weekStart:string,weekEnd:string,fallback=420) {
  const planned=instances.filter((item)=>item.scheduled_date>=weekStart&&item.scheduled_date<=weekEnd&&item.status!=="paused").reduce((sum,item)=>sum+Number(item.estimated_minutes),0);
  const configured=capacityDays.reduce((sum,item)=>sum+(item.available?Number(item.minutes):0),0);const capacity=configured||fallback;
  const load=capacity?Math.round(planned/capacity*100):0;const health=load<=80?"healthy":load<=100?"full":load<=120?"over":"severe";
  return {plannedMinutes:planned,capacityMinutes:capacity,remainingMinutes:Math.max(0,capacity-planned),load,health};
}
