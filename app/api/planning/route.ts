import { NextResponse } from "next/server";
import { executionPeriods, getD1, getWorkspaceIdentity } from "@/lib/workspace";
import { ensurePlanningDerivedData, ensurePlanningSchema, generatePlanInstances, generateReports, planningSnapshot, seedPlanningTypes, syncPlanningProgress } from "@/lib/planning";

export const dynamic = "force-dynamic";

function clean(value:unknown,length=800){return typeof value==="string"?value.trim().slice(0,length):"";}
function validDate(value:string){return !value||/^\d{4}-\d{2}-\d{2}$/.test(value);}
function list(value:unknown,limit=31){return Array.isArray(value)?value.slice(0,limit):[];}

async function prepare(){
  const identity=await getWorkspaceIdentity();if(!identity)return null;
  const db=getD1();await ensurePlanningSchema(db);await seedPlanningTypes(db,identity.userId);
  return {db,identity};
}

export async function GET(){
  const context=await prepare();if(!context)return NextResponse.json({error:"unauthorized"},{status:401});
  await ensurePlanningDerivedData(context.db,context.identity.userId);
  return NextResponse.json(await planningSnapshot(context.db,context.identity.userId));
}

export async function POST(request:Request){
  const context=await prepare();if(!context)return NextResponse.json({error:"unauthorized"},{status:401});
  const {db,identity}=context,userId=identity.userId,body=(await request.json()) as Record<string,unknown>,action=clean(body.action,60),now=new Date().toISOString();

  if(action==="save-stage"){
    const id=clean(body.id,100),title=clean(body.title,120),objective=clean(body.objective,1200),status=clean(body.status,20)||"planned",startDate=clean(body.startDate,10),endDate=clean(body.endDate,10);
    if(!title||!["planned","active","completed","paused"].includes(status)||!validDate(startDate)||!validDate(endDate))return NextResponse.json({error:"invalid_stage"},{status:400});
    if(id)await db.prepare("UPDATE journey_stages_v2 SET title=?,objective=?,status=?,start_date=?,end_date=?,updated_at=? WHERE id=? AND user_id=?").bind(title,objective,status,startDate||null,endDate||null,now,id,userId).run();
    else {const order=await db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS value FROM journey_stages_v2 WHERE user_id=?").bind(userId).first<{value:number}>();await db.prepare("INSERT INTO journey_stages_v2 (id,user_id,title,objective,status,sort_order,start_date,end_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,title,objective,status,Number(order?.value||1),startDate||null,endDate||null,now,now).run();}
  } else if(action==="delete-stage"){
    const id=clean(body.id,100);if(!id)return NextResponse.json({error:"invalid_stage"},{status:400});
    const goals=await db.prepare("SELECT id FROM journey_goals_v2 WHERE user_id=? AND stage_id=?").bind(userId,id).all<{id:string}>();
    for(const goal of goals.results){await db.prepare("DELETE FROM task_instances_v2 WHERE user_id=? AND goal_id=? AND status!='completed'").bind(userId,goal.id).run();await db.prepare("DELETE FROM task_definitions_v2 WHERE user_id=? AND goal_id=?").bind(userId,goal.id).run();await db.prepare("DELETE FROM monthly_plan_goals_v2 WHERE user_id=? AND goal_id=?").bind(userId,goal.id).run();}
    await db.prepare("DELETE FROM journey_goals_v2 WHERE user_id=? AND stage_id=?").bind(userId,id).run();await db.prepare("DELETE FROM journey_stages_v2 WHERE user_id=? AND id=?").bind(userId,id).run();
  } else if(action==="move-stage"){
    const id=clean(body.id,100),direction=Number(body.direction);const row=await db.prepare("SELECT sort_order FROM journey_stages_v2 WHERE user_id=? AND id=?").bind(userId,id).first<{sort_order:number}>();
    if(row){const other=await db.prepare(`SELECT id,sort_order FROM journey_stages_v2 WHERE user_id=? AND sort_order ${direction<0?"<":">"} ? ORDER BY sort_order ${direction<0?"DESC":"ASC"} LIMIT 1`).bind(userId,row.sort_order).first<{id:string;sort_order:number}>();if(other)await db.batch([db.prepare("UPDATE journey_stages_v2 SET sort_order=? WHERE id=? AND user_id=?").bind(other.sort_order,id,userId),db.prepare("UPDATE journey_stages_v2 SET sort_order=? WHERE id=? AND user_id=?").bind(row.sort_order,other.id,userId)]);}
  } else if(action==="save-goal"){
    const id=clean(body.id,100),stageId=clean(body.stageId,100),title=clean(body.title,160),description=clean(body.description,1200),criteria=clean(body.acceptanceCriteria,800),priority=Math.max(1,Math.min(3,Number(body.priority)||2)),status=clean(body.status,20)||"planned",startDate=clean(body.startDate,10),endDate=clean(body.endDate,10);
    const stage=await db.prepare("SELECT id FROM journey_stages_v2 WHERE id=? AND user_id=?").bind(stageId,userId).first();
    if(!stage||!title||!["planned","active","completed","paused"].includes(status)||!validDate(startDate)||!validDate(endDate))return NextResponse.json({error:"invalid_goal"},{status:400});
    if(id)await db.prepare("UPDATE journey_goals_v2 SET stage_id=?,title=?,description=?,acceptance_criteria=?,priority=?,status=?,start_date=?,end_date=?,updated_at=? WHERE id=? AND user_id=?").bind(stageId,title,description,criteria,priority,status,startDate||null,endDate||null,now,id,userId).run();
    else {const order=await db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS value FROM journey_goals_v2 WHERE user_id=? AND stage_id=?").bind(userId,stageId).first<{value:number}>();await db.prepare("INSERT INTO journey_goals_v2 (id,user_id,stage_id,title,description,acceptance_criteria,priority,status,sort_order,start_date,end_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,stageId,title,description,criteria,priority,status,Number(order?.value||1),startDate||null,endDate||null,now,now).run();}
  } else if(action==="delete-goal"){
    const id=clean(body.id,100);await db.prepare("DELETE FROM task_instances_v2 WHERE user_id=? AND goal_id=? AND status!='completed'").bind(userId,id).run();await db.prepare("DELETE FROM task_definitions_v2 WHERE user_id=? AND goal_id=?").bind(userId,id).run();await db.prepare("DELETE FROM monthly_plan_goals_v2 WHERE user_id=? AND goal_id=?").bind(userId,id).run();await db.prepare("DELETE FROM journey_goals_v2 WHERE user_id=? AND id=?").bind(userId,id).run();
  } else if(action==="save-task"){
    const id=clean(body.id,100),goalId=clean(body.goalId,100),title=clean(body.title,160),description=clean(body.description,1000),typeKey=clean(body.typeKey,40),mode=clean(body.mode,20),frequency=mode==="once"?"once":clean(body.frequency,20),occurrences=Math.max(1,Math.min(10,Number(body.occurrences)||1)),scheduledDate=clean(body.scheduledDate,10),startDate=clean(body.startDate,10),endDate=clean(body.endDate,10),minutes=Math.max(5,Math.min(1440,Number(body.estimatedMinutes)||30)),priority=Math.max(1,Math.min(3,Number(body.priority)||2)),recordRequired=body.recordRequired===true?1:0;
    const weekdays=list(body.weekdays,7).map(Number).filter((item)=>item>=1&&item<=7),monthDays=list(body.monthDays,31).map(Number).filter((item)=>item>=1&&item<=31),times=list(body.times,10).map((item)=>clean(item,5)).filter((item)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(item));
    const goal=await db.prepare("SELECT id FROM journey_goals_v2 WHERE id=? AND user_id=?").bind(goalId,userId).first(),type=await db.prepare("SELECT id FROM task_types_v2 WHERE user_id=? AND type_key=? AND enabled=1").bind(userId,typeKey).first();
    if(!goal||!type||!title||!["once","recurring"].includes(mode)||!["once","daily","weekly","monthly"].includes(frequency)||!validDate(scheduledDate)||!validDate(startDate)||!validDate(endDate))return NextResponse.json({error:"invalid_task"},{status:400});
    const values=[goalId,title,description,typeKey,mode,frequency,occurrences,JSON.stringify(weekdays),JSON.stringify(monthDays),JSON.stringify(times),scheduledDate||null,startDate||null,endDate||null,minutes,priority,recordRequired,now];
    if(id){await db.prepare("UPDATE task_definitions_v2 SET goal_id=?,title=?,description=?,type_key=?,mode=?,frequency=?,occurrences=?,weekdays_json=?,month_days_json=?,times_json=?,scheduled_date=?,start_date=?,end_date=?,estimated_minutes=?,priority=?,record_required=?,updated_at=? WHERE id=? AND user_id=?").bind(...values,id,userId).run();await db.prepare("DELETE FROM task_instances_v2 WHERE user_id=? AND definition_id=? AND status!='completed' AND user_adjusted=0").bind(userId,id).run();}
    else await db.prepare("INSERT INTO task_definitions_v2 (id,user_id,goal_id,title,description,type_key,mode,frequency,occurrences,weekdays_json,month_days_json,times_json,scheduled_date,start_date,end_date,estimated_minutes,priority,record_required,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)").bind(crypto.randomUUID(),userId,...values.slice(0,-1),now,now).run();
    const plans=await db.prepare("SELECT DISTINCT p.period FROM monthly_plans_v2 p JOIN monthly_plan_goals_v2 pg ON pg.plan_id=p.id WHERE p.user_id=? AND pg.goal_id=? AND p.status!='draft'").bind(userId,goalId).all<{period:string}>();for(const plan of plans.results)await generatePlanInstances(db,userId,plan.period);
  } else if(action==="delete-task"){
    const id=clean(body.id,100);await db.prepare("DELETE FROM task_instances_v2 WHERE user_id=? AND definition_id=? AND status!='completed'").bind(userId,id).run();await db.prepare("DELETE FROM task_definitions_v2 WHERE user_id=? AND id=?").bind(userId,id).run();
  } else if(action==="save-task-type"){
    const id=clean(body.id,100),key=clean(body.typeKey,30).toLowerCase().replace(/[^a-z0-9_]/g,"_"),name=clean(body.name,30),color=clean(body.color,20)||"#50635c",icon=clean(body.icon,4)||"·";
    if(!key||!name)return NextResponse.json({error:"invalid_task_type"},{status:400});
    if(id)await db.prepare("UPDATE task_types_v2 SET name=?,color=?,icon=?,enabled=?,updated_at=? WHERE id=? AND user_id=?").bind(name,color,icon,body.enabled===false?0:1,now,id,userId).run();
    else {const order=await db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS value FROM task_types_v2 WHERE user_id=?").bind(userId).first<{value:number}>();await db.prepare("INSERT INTO task_types_v2 (id,user_id,type_key,name,color,icon,sort_order,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)").bind(crypto.randomUUID(),userId,key,name,color,icon,Number(order?.value||1),now,now).run();}
  } else if(action==="save-month-plan"){
    const period=clean(body.period,7),title=clean(body.title,160),requestedGoalIds=[...new Set(list(body.goalIds,100).map((item)=>clean(item,100)).filter(Boolean))];if(!/^\d{4}-\d{2}$/.test(period)||!requestedGoalIds.length)return NextResponse.json({error:"invalid_month_plan"},{status:400});
    const eligible=await db.prepare(`SELECT g.id FROM journey_goals_v2 g JOIN journey_stages_v2 s ON s.id=g.stage_id AND s.user_id=g.user_id WHERE g.user_id=? AND g.status!='completed' AND s.status='active' AND g.id IN (${requestedGoalIds.map(()=>"?").join(",")})`).bind(userId,...requestedGoalIds).all<{id:string}>(),goalIds=eligible.results.map((item)=>item.id);if(!goalIds.length)return NextResponse.json({error:"no_active_goals"},{status:409});
    let plan=await db.prepare("SELECT id FROM monthly_plans_v2 WHERE user_id=? AND period=?").bind(userId,period).first<{id:string}>();if(!plan){plan={id:crypto.randomUUID()};await db.prepare("INSERT INTO monthly_plans_v2 (id,user_id,period,title,status,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?)").bind(plan.id,userId,period,title||`${period} 月计划`,now,now).run();}else await db.prepare("UPDATE monthly_plans_v2 SET title=?,status='active',updated_at=? WHERE id=? AND user_id=?").bind(title||`${period} 月计划`,now,plan.id,userId).run();
    const existing=await db.prepare("SELECT goal_id FROM monthly_plan_goals_v2 WHERE user_id=? AND plan_id=?").bind(userId,plan.id).all<{goal_id:string}>();for(const row of existing.results.filter((item)=>!goalIds.includes(item.goal_id))){await db.prepare("DELETE FROM task_instances_v2 WHERE user_id=? AND plan_id=? AND goal_id=? AND status!='completed' AND user_adjusted=0").bind(userId,plan.id,row.goal_id).run();}
    await db.prepare("DELETE FROM monthly_plan_goals_v2 WHERE user_id=? AND plan_id=?").bind(userId,plan.id).run();for(let i=0;i<goalIds.length;i++){const valid=await db.prepare("SELECT id FROM journey_goals_v2 WHERE user_id=? AND id=?").bind(userId,goalIds[i]).first();if(valid)await db.prepare("INSERT INTO monthly_plan_goals_v2 (id,user_id,plan_id,goal_id,priority,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,plan.id,goalIds[i],i+1,now).run();}
    await generatePlanInstances(db,userId,period);
  } else if(action==="update-instance"){
    const id=clean(body.id,100),status=clean(body.status,20),date=clean(body.scheduledDate,10),time=clean(body.scheduledTime,5),priority=Math.max(1,Math.min(3,Number(body.priority)||2));
    const current=await db.prepare("SELECT i.status,COALESCE(d.record_required,0) AS record_required,r.id AS record_id FROM task_instances_v2 i LEFT JOIN task_definitions_v2 d ON d.id=i.definition_id AND d.user_id=i.user_id LEFT JOIN planning_records_v2 r ON r.instance_id=i.id AND r.user_id=i.user_id WHERE i.id=? AND i.user_id=?").bind(id,userId).first<{status:string;record_required:number;record_id:string|null}>();if(!current)return NextResponse.json({error:"not_found"},{status:404});
    const nextStatus=["pending","completed","paused"].includes(status)?status:current.status;if(!validDate(date)||(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))return NextResponse.json({error:"invalid_instance"},{status:400});
    if(nextStatus==="completed"&&current.record_required&&!current.record_id)return NextResponse.json({error:"record_required"},{status:409});
    await db.prepare("UPDATE task_instances_v2 SET status=?,scheduled_date=COALESCE(NULLIF(?,''),scheduled_date),scheduled_time=?,priority=?,user_adjusted=1,completed_at=?,updated_at=? WHERE id=? AND user_id=?").bind(nextStatus,date,time,priority,nextStatus==="completed"?now:null,now,id,userId).run();
    const instance=await db.prepare("SELECT goal_id FROM task_instances_v2 WHERE id=? AND user_id=?").bind(id,userId).first<{goal_id:string}>();if(instance)await syncPlanningProgress(db,userId,instance.goal_id,now);
  } else if(action==="set-week-selection"){
    const id=clean(body.id,100),selected=body.selected===true?1:0,{weekStart,weekEnd}=executionPeriods();
    const result=await db.prepare("UPDATE task_instances_v2 SET week_selected=?,updated_at=? WHERE id=? AND user_id=? AND scheduled_date>=? AND scheduled_date<=?").bind(selected,now,id,userId,weekStart,weekEnd).run();
    if(!result.meta.changes)return NextResponse.json({error:"not_found"},{status:404});
  } else if(action==="capacity-settings"){
    const days=list(body.days,7) as Array<Record<string,unknown>>;for(const day of days){const weekday=Math.max(1,Math.min(7,Number(day.weekday)||1)),available=day.available===false?0:1,minutes=Math.max(0,Math.min(1440,Number(day.minutes)||0)),slots=list(day.slots,8).map((item)=>clean(item,20));await db.prepare("UPDATE weekly_capacity_days_v2 SET available=?,minutes=?,slots_json=?,updated_at=? WHERE user_id=? AND weekday=?").bind(available,minutes,JSON.stringify(slots),now,userId,weekday).run();}
  } else if(action==="refresh-reports"){
    await generateReports(db,userId);
  } else return NextResponse.json({error:"unknown_action"},{status:400});

  return NextResponse.json(await planningSnapshot(db,userId));
}
