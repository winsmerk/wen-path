export const workRoutines = [
  { key: "daily_words", name: "每日单词", icon: "Aa", color: "#496b91", frequency: "daily", minutes: 15, description: "保存学习原图，整理划线词与原句。", criteria: "原图已归档，划线词已核对并整理。" },
  { key: "english_diary", name: "英语日记", icon: "En", color: "#397b91", frequency: "daily", minutes: 20, description: "保存英文定稿，列出需要掌握的重点词。", criteria: "英文日记定稿和重点词清单已保存。" },
  { key: "xiaohongshu", name: "小红书", icon: "红", color: "#a35454", frequency: "daily", minutes: 30, description: "整理最终标题、文案与配图，发布后补链接。", criteria: "最终文案已保存，实际发布情况单独记录。" },
  { key: "overseas", name: "海外账号", icon: "↗", color: "#7b5b8d", frequency: "weekly", minutes: 45, description: "确定本周选题与文案，记录平台和账号。", criteria: "本周选题、账号与最终文案已确认。" },
  { key: "kinikini", name: "Kinikini", icon: "K", color: "#8a6339", frequency: "once", minutes: 30, description: "核对 kinikini2.0 执行计划，明确下一项验收。", criteria: "确认源执行计划、本轮范围和下一项任务。" },
] as const;

// Stable per-user keys make retries safe without replacing existing user edits.
export async function enrollWorkRoutines(db: D1Database, userId: string, localDate: string, month: string, weekday: number) {
  const now = new Date().toISOString();
  const stageId = `workbench:${userId}`;
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT OR IGNORE INTO journey_stages_v2
    (id,user_id,title,objective,status,sort_order,created_at,updated_at) VALUES (?,?,'日常工作与生活','学习、内容创作与 Kinikini 项目推进','active',100,?,?)`).bind(stageId,userId,now,now)];
  for (const [index, routine] of workRoutines.entries()) {
    const goalId = `${stageId}:${routine.key}`, taskId = `${goalId}:task`;
    statements.push(db.prepare(`INSERT OR IGNORE INTO task_types_v2
      (id,user_id,type_key,name,color,icon,sort_order,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`)
      .bind(`${goalId}:type`,userId,routine.key,routine.name,routine.color,routine.icon,20+index,now,now));
    statements.push(db.prepare(`INSERT OR IGNORE INTO journey_goals_v2
      (id,user_id,stage_id,title,description,acceptance_criteria,status,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?,?)`)
      .bind(goalId,userId,stageId,routine.name,routine.description,routine.criteria,index+1,now,now));
    statements.push(db.prepare(`INSERT OR IGNORE INTO task_definitions_v2
      (id,user_id,goal_id,title,description,type_key,mode,frequency,weekdays_json,scheduled_date,start_date,estimated_minutes,record_required,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(taskId,userId,goalId,routine.key==="kinikini"?"Kinikini：核对执行计划与下一步":routine.name,routine.description,routine.key,routine.frequency==="once"?"once":"recurring",routine.frequency,routine.frequency==="weekly"?JSON.stringify([weekday]):"[]",routine.frequency==="once"?localDate:null,localDate,routine.minutes,now,now));
  }
  statements.push(db.prepare(`INSERT OR IGNORE INTO monthly_plans_v2 (id,user_id,period,title,status,created_at,updated_at) VALUES (?,?,?,?,'active',?,?)`).bind(`${stageId}:${month}`,userId,month,`${month} 月计划`,now,now));
  await db.batch(statements);
  const plan = await db.prepare("SELECT id FROM monthly_plans_v2 WHERE user_id=? AND period=?").bind(userId,month).first<{id:string}>();
  if (!plan) throw new Error("month_plan_unavailable");
  await db.batch(workRoutines.map((routine,index)=>db.prepare(`INSERT OR IGNORE INTO monthly_plan_goals_v2 (id,user_id,plan_id,goal_id,priority,created_at) VALUES (?,?,?,?,?,?)`).bind(`${plan.id}:workbench:${routine.key}`,userId,plan.id,`${stageId}:${routine.key}`,index+1,now)));
  // Preserve other goals and manually adjusted tasks in the existing monthly plan.
  await db.prepare("UPDATE monthly_plans_v2 SET status='active',updated_at=? WHERE id=? AND user_id=?").bind(now,plan.id,userId).run();
}
