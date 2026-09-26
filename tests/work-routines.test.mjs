import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function moduleFrom(path, replace = value => value) {
  const source = ts.transpileModule(replace(readFileSync(new URL(path, import.meta.url), 'utf8')), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const {enrollWorkRoutines} = await moduleFrom('../lib/work-routines.ts');
const {ensurePlanningSchema,generatePlanInstances} = await moduleFrom('../lib/planning.ts', value => value.replace('import { executionPeriods } from "@/lib/workspace";', 'const executionPeriods = () => ({month:"2026-09",localDate:"2026-09-26",weekStart:"2026-09-21",weekEnd:"2026-09-27"});'));

test('routine enrollment is idempotent, user-scoped, preserves edits, and schedules selected weekdays', async () => {
  const sql = new DatabaseSync(':memory:');
  const db = {prepare(query){let values=[];const statement={bind(...args){values=args;return statement;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};},async first(){return sql.prepare(query).get(...values)??null;},async all(){return {results:sql.prepare(query).all(...values)};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  await ensurePlanningSchema(db);
  await enrollWorkRoutines(db,'alice','2026-09-26','2026-09',1);
  await generatePlanInstances(db,'alice','2026-09');
  const count=()=>sql.prepare("SELECT count(*) n FROM task_instances_v2 WHERE user_id='alice'").get().n;
  assert.equal(count(),17); // 3 daily × 5 days, Monday overseas, one project task.
  const overseas=sql.prepare("SELECT scheduled_date FROM task_instances_v2 WHERE type_key='overseas'").all();
  assert.deepEqual(overseas.map(row=>row.scheduled_date),['2026-09-28']);
  const instance=sql.prepare("SELECT id FROM task_instances_v2 WHERE type_key='daily_words' LIMIT 1").get();
  sql.prepare("UPDATE task_instances_v2 SET status='completed',user_adjusted=1,scheduled_date='2026-09-30' WHERE id=?").run(instance.id);
  sql.exec("UPDATE task_definitions_v2 SET title='My edited diary' WHERE type_key='english_diary'");
  await enrollWorkRoutines(db,'alice','2026-09-26','2026-09',5);
  await generatePlanInstances(db,'alice','2026-09');
  assert.equal(count(),17);
  assert.equal(sql.prepare('SELECT status FROM task_instances_v2 WHERE id=?').get(instance.id).status,'completed');
  assert.equal(sql.prepare("SELECT title FROM task_definitions_v2 WHERE type_key='english_diary'").get().title,'My edited diary');
  await enrollWorkRoutines(db,'bob','2026-09-26','2026-09',1);
  await generatePlanInstances(db,'bob','2026-09');
  assert.equal(sql.prepare('SELECT count(*) n FROM task_definitions_v2').get().n,10);
  assert.equal(count(),17);
  await enrollWorkRoutines(db,'alice','2026-10-01','2026-10',1);
  await generatePlanInstances(db,'alice','2026-10');
  assert.equal(sql.prepare("SELECT count(*) n FROM task_instances_v2 WHERE user_id='alice' AND type_key='kinikini'").get().n,1);
  assert.equal(sql.prepare("SELECT count(*) n FROM task_instances_v2 WHERE user_id='alice' AND scheduled_date LIKE '2026-10%' AND type_key='overseas'").get().n,4);
  sql.close();
});
