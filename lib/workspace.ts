import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { vision40 } from "@/lib/vision-journeys";
import type { WeComConfig } from "@/lib/memos";

export type WorkspaceIdentity = {
  userId: string;
  displayName: string;
};

export async function getWorkspaceIdentity(): Promise<WorkspaceIdentity | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const host = requestHeaders.get("host") ?? "";

  if (userId && email) {
    return { userId, displayName: email.split("@")[0] || "文子" };
  }

  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return { userId: "local-preview-user", displayName: "文子" };
  }

  return null;
}

export function getD1(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export function getOpenAIKey(): string | undefined {
  return env.OPENAI_API_KEY;
}

export function getWeComConfig(): WeComConfig | undefined {
  const corpId = env.WECOM_CORP_ID, agentId = env.WECOM_AGENT_ID, secret = env.WECOM_SECRET, userId = env.WECOM_USER_ID;
  return corpId && agentId && secret && userId ? { corpId, agentId, secret, userId } : undefined;
}

export function getMediaBucket(): R2Bucket | null {
  return env.MEDIA ?? null;
}

export function executionPeriods(date = new Date()) {
  const singapore = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const localDate = singapore.toISOString().slice(0,10);
  const mondayOffset = (singapore.getUTCDay() + 6) % 7;
  const monday = new Date(`${localDate}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);
  const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { weekStart: monday.toISOString().slice(0,10), weekEnd: sunday.toISOString().slice(0,10), month: localDate.slice(0,7), localDate };
}

let workspaceSchemaPromise: Promise<void> | null = null;
const seededWorkspaceUsers = new Set<string>();

async function initializeSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, vision TEXT NOT NULL,
      target_date TEXT NOT NULL, initialized INTEGER NOT NULL DEFAULT 0,
      weekly_capacity_minutes INTEGER NOT NULL DEFAULT 420,
      weekly_goal TEXT NOT NULL DEFAULT '',
      side_hustle_limit_minutes INTEGER NOT NULL DEFAULT 360,
      protected_day TEXT NOT NULL DEFAULT '周日',
      removed_modules_purged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journeys (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sequence_number INTEGER NOT NULL,
      title TEXT NOT NULL, area TEXT NOT NULL, stage TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL, status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0, next_action TEXT NOT NULL, deleted_at TEXT,
      evidence TEXT NOT NULL DEFAULT '', completed_at TEXT,
      evidence_review_status TEXT NOT NULL DEFAULT '', evidence_review_feedback TEXT NOT NULL DEFAULT '', evidence_score INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS monthly_outcomes (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
      expected_hours INTEGER NOT NULL, status TEXT NOT NULL,
      journey_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'milestone', period TEXT NOT NULL DEFAULT '',
      settled_at TEXT, rolled_from_id TEXT NOT NULL DEFAULT '', source_task_id TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journey_tasks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, journey_id TEXT NOT NULL,
      title TEXT NOT NULL, acceptance_criteria TEXT NOT NULL,
      estimated_minutes INTEGER NOT NULL DEFAULT 60, task_type TEXT NOT NULL DEFAULT 'general',
      execution_frequency TEXT NOT NULL DEFAULT 'monthly',
      main_task TEXT NOT NULL DEFAULT '', preferred_time TEXT NOT NULL DEFAULT '',
      preferred_weekday TEXT NOT NULL DEFAULT '', preferred_month_day INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual', completed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly_cycles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL, week_end TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '', capacity_minutes INTEGER NOT NULL DEFAULT 420, status TEXT NOT NULL DEFAULT 'active',
      completed_count INTEGER NOT NULL DEFAULT 0, total_count INTEGER NOT NULL DEFAULT 0, archived_at TEXT, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly_actions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, outcome_id TEXT NOT NULL,
      title TEXT NOT NULL, estimated_minutes INTEGER NOT NULL,
      scheduled_for TEXT NOT NULL, priority INTEGER NOT NULL,
      status TEXT NOT NULL, completed_at TEXT,
      task_type TEXT NOT NULL DEFAULT 'general', source TEXT NOT NULL DEFAULT 'manual',
      is_side_hustle INTEGER NOT NULL DEFAULT 0, cycle_id TEXT NOT NULL DEFAULT '', carried_from_id TEXT NOT NULL DEFAULT '', source_task_id TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
      duration INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL,
      achievement TEXT NOT NULL, low_value TEXT NOT NULL,
      next_priority TEXT NOT NULL, created_at TEXT NOT NULL,
      health_check TEXT NOT NULL DEFAULT '', market_evidence TEXT NOT NULL DEFAULT '',
      energy_score INTEGER NOT NULL DEFAULT 7, decision TEXT NOT NULL DEFAULT 'continue',
      kill_rule_count INTEGER NOT NULL DEFAULT 0, week_start TEXT NOT NULL DEFAULT '',
      auto_decision TEXT NOT NULL DEFAULT 'continue', auto_reasons TEXT NOT NULL DEFAULT '[]'
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS task_outputs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_id TEXT NOT NULL,
      task_type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0, feeling TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS financial_records (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_id TEXT,
      category TEXT NOT NULL, amount REAL NOT NULL, note TEXT NOT NULL,
      recorded_at TEXT NOT NULL, created_at TEXT NOT NULL,
      income_type TEXT NOT NULL DEFAULT '', source_name TEXT NOT NULL DEFAULT '',
      expense_scope TEXT NOT NULL DEFAULT 'personal', investment_principal REAL NOT NULL DEFAULT 0,
      investment_return REAL NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS memos (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '', remind_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', wechat_enabled INTEGER NOT NULL DEFAULT 1,
      delivery_status TEXT NOT NULL DEFAULT 'pending', attempt_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS financial_monthly_bills (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL,
      income_total REAL NOT NULL DEFAULT 0, salary_income REAL NOT NULL DEFAULT 0,
      non_salary_income REAL NOT NULL DEFAULT 0, expense_total REAL NOT NULL DEFAULT 0,
      business_expense REAL NOT NULL DEFAULT 0, investment_principal REAL NOT NULL DEFAULT 0,
      investment_return REAL NOT NULL DEFAULT 0, business_profit REAL NOT NULL DEFAULT 0,
      net_cash_flow REAL NOT NULL DEFAULT 0, settled_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS english_messages (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL,
      text TEXT NOT NULL, feedback TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS footprints (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      status TEXT NOT NULL, content TEXT NOT NULL, visited_at TEXT,
      latitude REAL, longitude REAL, geometry_json TEXT,
      geometry_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS footprint_images (
      id TEXT PRIMARY KEY, footprint_id TEXT NOT NULL, user_id TEXT NOT NULL,
      object_key TEXT NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, recorded_at TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_images (
      id TEXT PRIMARY KEY, journal_id TEXT NOT NULL, user_id TEXT NOT NULL,
      object_key TEXT NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS record_images (
      id TEXT PRIMARY KEY, record_type TEXT NOT NULL, record_id TEXT NOT NULL, user_id TEXT NOT NULL,
      object_key TEXT NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS evidence_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
      evidence_type TEXT NOT NULL, action_id TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS stop_rule_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, week_start TEXT NOT NULL, rule_code TEXT NOT NULL,
      severity TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journeys_user_status ON journeys(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journey_tasks_journey_status ON journey_tasks(user_id, journey_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_actions_user_status ON weekly_actions(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_checkins_user_type ON checkins(user_id, type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_outputs_user_action ON task_outputs(user_id, action_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_finance_user_date ON financial_records(user_id, recorded_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_memos_due ON memos(delivery_status, status, remind_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_memos_user_time ON memos(user_id, remind_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_bills_user_period ON financial_monthly_bills(user_id, period)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_english_user_date ON english_messages(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_footprints_user_status ON footprints(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_footprint_images_footprint ON footprint_images(footprint_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journal_entries_user_type_date ON journal_entries(user_id, type, recorded_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journal_images_journal ON journal_images(journal_id, user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_record_images_record ON record_images(user_id, record_type, record_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_weekly_cycles_user_start ON weekly_cycles(user_id, week_start)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_source ON evidence_events(user_id, source_type, source_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_evidence_user_type_date ON evidence_events(user_id, evidence_type, occurred_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_stop_events_user_week ON stop_rule_events(user_id, week_start)"),
  ]);

  const journeyColumns = await db.prepare("PRAGMA table_info(journeys)").all<{ name: string }>();
  if (!journeyColumns.results.some((column) => column.name === "deleted_at")) {
    await db.prepare("ALTER TABLE journeys ADD COLUMN deleted_at TEXT").run();
  }
  if (!journeyColumns.results.some((column) => column.name === "evidence")) await db.prepare("ALTER TABLE journeys ADD COLUMN evidence TEXT NOT NULL DEFAULT ''").run();
  if (!journeyColumns.results.some((column) => column.name === "completed_at")) await db.prepare("ALTER TABLE journeys ADD COLUMN completed_at TEXT").run();
  if (!journeyColumns.results.some((column) => column.name === "evidence_review_status")) await db.prepare("ALTER TABLE journeys ADD COLUMN evidence_review_status TEXT NOT NULL DEFAULT ''").run();
  if (!journeyColumns.results.some((column) => column.name === "evidence_review_feedback")) await db.prepare("ALTER TABLE journeys ADD COLUMN evidence_review_feedback TEXT NOT NULL DEFAULT ''").run();
  if (!journeyColumns.results.some((column) => column.name === "evidence_score")) await db.prepare("ALTER TABLE journeys ADD COLUMN evidence_score INTEGER NOT NULL DEFAULT 0").run();
  const journeyTaskColumns = await db.prepare("PRAGMA table_info(journey_tasks)").all<{ name: string }>();
  if (!journeyTaskColumns.results.some((column) => column.name === "execution_frequency")) await db.prepare("ALTER TABLE journey_tasks ADD COLUMN execution_frequency TEXT NOT NULL DEFAULT 'monthly'").run();
  if (!journeyTaskColumns.results.some((column) => column.name === "preferred_weekday")) await db.prepare("ALTER TABLE journey_tasks ADD COLUMN preferred_weekday TEXT NOT NULL DEFAULT ''").run();
  if (!journeyTaskColumns.results.some((column) => column.name === "preferred_month_day")) await db.prepare("ALTER TABLE journey_tasks ADD COLUMN preferred_month_day INTEGER NOT NULL DEFAULT 0").run();
  if (!journeyTaskColumns.results.some((column) => column.name === "main_task")) await db.prepare("ALTER TABLE journey_tasks ADD COLUMN main_task TEXT NOT NULL DEFAULT ''").run();
  if (!journeyTaskColumns.results.some((column) => column.name === "preferred_time")) await db.prepare("ALTER TABLE journey_tasks ADD COLUMN preferred_time TEXT NOT NULL DEFAULT ''").run();
  await db.prepare("UPDATE journey_tasks SET main_task=title WHERE main_task='' ").run();

  const profileColumns = await db.prepare("PRAGMA table_info(profiles)").all<{ name: string }>();
  if (!profileColumns.results.some((column) => column.name === "weekly_capacity_minutes")) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN weekly_capacity_minutes INTEGER NOT NULL DEFAULT 420").run();
  }
  if (!profileColumns.results.some((column) => column.name === "weekly_goal")) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN weekly_goal TEXT NOT NULL DEFAULT ''").run();
  }
  if (!profileColumns.results.some((column) => column.name === "side_hustle_limit_minutes")) await db.prepare("ALTER TABLE profiles ADD COLUMN side_hustle_limit_minutes INTEGER NOT NULL DEFAULT 360").run();
  if (!profileColumns.results.some((column) => column.name === "protected_day")) await db.prepare("ALTER TABLE profiles ADD COLUMN protected_day TEXT NOT NULL DEFAULT '周日'").run();
  if (!profileColumns.results.some((column) => column.name === "removed_modules_purged")) await db.prepare("ALTER TABLE profiles ADD COLUMN removed_modules_purged INTEGER NOT NULL DEFAULT 0").run();
  const outcomeColumns = await db.prepare("PRAGMA table_info(monthly_outcomes)").all<{ name: string }>();
  if (!outcomeColumns.results.some((column) => column.name === "journey_id")) await db.prepare("ALTER TABLE monthly_outcomes ADD COLUMN journey_id TEXT NOT NULL DEFAULT ''").run();
  if (!outcomeColumns.results.some((column) => column.name === "kind")) await db.prepare("ALTER TABLE monthly_outcomes ADD COLUMN kind TEXT NOT NULL DEFAULT 'milestone'").run();
  if (!outcomeColumns.results.some((column) => column.name === "period")) await db.prepare("ALTER TABLE monthly_outcomes ADD COLUMN period TEXT NOT NULL DEFAULT ''").run();
  if (!outcomeColumns.results.some((column) => column.name === "settled_at")) await db.prepare("ALTER TABLE monthly_outcomes ADD COLUMN settled_at TEXT").run();
  if (!outcomeColumns.results.some((column) => column.name === "rolled_from_id")) await db.prepare("ALTER TABLE monthly_outcomes ADD COLUMN rolled_from_id TEXT NOT NULL DEFAULT ''").run();
  if (!outcomeColumns.results.some((column) => column.name === "source_task_id")) await db.prepare("ALTER TABLE monthly_outcomes ADD COLUMN source_task_id TEXT NOT NULL DEFAULT ''").run();
  const actionColumns = await db.prepare("PRAGMA table_info(weekly_actions)").all<{ name: string }>();
  if (!actionColumns.results.some((column) => column.name === "task_type")) {
    await db.prepare("ALTER TABLE weekly_actions ADD COLUMN task_type TEXT NOT NULL DEFAULT 'general'").run();
  }
  if (!actionColumns.results.some((column) => column.name === "source")) {
    await db.prepare("ALTER TABLE weekly_actions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'").run();
  }
  if (!actionColumns.results.some((column) => column.name === "is_side_hustle")) await db.prepare("ALTER TABLE weekly_actions ADD COLUMN is_side_hustle INTEGER NOT NULL DEFAULT 0").run();
  if (!actionColumns.results.some((column) => column.name === "cycle_id")) await db.prepare("ALTER TABLE weekly_actions ADD COLUMN cycle_id TEXT NOT NULL DEFAULT ''").run();
  if (!actionColumns.results.some((column) => column.name === "carried_from_id")) await db.prepare("ALTER TABLE weekly_actions ADD COLUMN carried_from_id TEXT NOT NULL DEFAULT ''").run();
  if (!actionColumns.results.some((column) => column.name === "source_task_id")) await db.prepare("ALTER TABLE weekly_actions ADD COLUMN source_task_id TEXT NOT NULL DEFAULT ''").run();
  const reviewColumns = await db.prepare("PRAGMA table_info(reviews)").all<{ name: string }>();
  if (!reviewColumns.results.some((column) => column.name === "health_check")) await db.prepare("ALTER TABLE reviews ADD COLUMN health_check TEXT NOT NULL DEFAULT ''").run();
  if (!reviewColumns.results.some((column) => column.name === "market_evidence")) await db.prepare("ALTER TABLE reviews ADD COLUMN market_evidence TEXT NOT NULL DEFAULT ''").run();
  if (!reviewColumns.results.some((column) => column.name === "energy_score")) await db.prepare("ALTER TABLE reviews ADD COLUMN energy_score INTEGER NOT NULL DEFAULT 7").run();
  if (!reviewColumns.results.some((column) => column.name === "decision")) await db.prepare("ALTER TABLE reviews ADD COLUMN decision TEXT NOT NULL DEFAULT 'continue'").run();
  if (!reviewColumns.results.some((column) => column.name === "kill_rule_count")) await db.prepare("ALTER TABLE reviews ADD COLUMN kill_rule_count INTEGER NOT NULL DEFAULT 0").run();
  if (!reviewColumns.results.some((column) => column.name === "week_start")) await db.prepare("ALTER TABLE reviews ADD COLUMN week_start TEXT NOT NULL DEFAULT ''").run();
  if (!reviewColumns.results.some((column) => column.name === "auto_decision")) await db.prepare("ALTER TABLE reviews ADD COLUMN auto_decision TEXT NOT NULL DEFAULT 'continue'").run();
  if (!reviewColumns.results.some((column) => column.name === "auto_reasons")) await db.prepare("ALTER TABLE reviews ADD COLUMN auto_reasons TEXT NOT NULL DEFAULT '[]'").run();
  const financeColumns = await db.prepare("PRAGMA table_info(financial_records)").all<{ name: string }>();
  if (!financeColumns.results.some((column) => column.name === "income_type")) await db.prepare("ALTER TABLE financial_records ADD COLUMN income_type TEXT NOT NULL DEFAULT ''").run();
  if (!financeColumns.results.some((column) => column.name === "source_name")) await db.prepare("ALTER TABLE financial_records ADD COLUMN source_name TEXT NOT NULL DEFAULT ''").run();
  if (!financeColumns.results.some((column) => column.name === "expense_scope")) await db.prepare("ALTER TABLE financial_records ADD COLUMN expense_scope TEXT NOT NULL DEFAULT 'personal'").run();
  if (!financeColumns.results.some((column) => column.name === "investment_principal")) await db.prepare("ALTER TABLE financial_records ADD COLUMN investment_principal REAL NOT NULL DEFAULT 0").run();
  if (!financeColumns.results.some((column) => column.name === "investment_return")) await db.prepare("ALTER TABLE financial_records ADD COLUMN investment_return REAL NOT NULL DEFAULT 0").run();
  await db.prepare("UPDATE financial_records SET investment_principal=amount WHERE category='investment' AND investment_principal=0 AND amount>0").run();
  const footprintColumns = await db.prepare("PRAGMA table_info(footprints)").all<{ name: string }>();
  if (!footprintColumns.results.some((column) => column.name === "latitude")) {
    await db.prepare("ALTER TABLE footprints ADD COLUMN latitude REAL").run();
  }
  if (!footprintColumns.results.some((column) => column.name === "longitude")) {
    await db.prepare("ALTER TABLE footprints ADD COLUMN longitude REAL").run();
  }
  if (!footprintColumns.results.some((column) => column.name === "geometry_json")) {
    await db.prepare("ALTER TABLE footprints ADD COLUMN geometry_json TEXT").run();
  }
  if (!footprintColumns.results.some((column) => column.name === "geometry_version")) {
    await db.prepare("ALTER TABLE footprints ADD COLUMN geometry_version INTEGER NOT NULL DEFAULT 0").run();
  }

  await db.prepare("PRAGMA optimize").run();
}

export function ensureSchema(db: D1Database) {
  if (!workspaceSchemaPromise) {
    workspaceSchemaPromise = initializeSchema(db).catch((error) => {
      workspaceSchemaPromise = null;
      throw error;
    });
  }
  return workspaceSchemaPromise;
}

export async function seedWorkspace(db: D1Database, identity: WorkspaceIdentity) {
  if (seededWorkspaceUsers.has(identity.userId)) return;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO profiles
      (user_id, display_name, vision, target_date, initialized, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).bind(identity.userId, identity.displayName, vision40, "2034-08-11", now, now).run();
  const cleanup=await db.prepare("SELECT removed_modules_purged FROM profiles WHERE user_id=?").bind(identity.userId).first<{removed_modules_purged:number}>();
  if(!cleanup?.removed_modules_purged){
    const images=await db.prepare("SELECT object_key FROM footprint_images WHERE user_id=?").bind(identity.userId).all<{object_key:string}>();
    const bucket=getMediaBucket();
    for(const image of images.results) if(bucket) await bucket.delete(image.object_key);
    await db.prepare("DELETE FROM footprint_images WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("DELETE FROM footprints WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("DELETE FROM weekly_actions WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("DELETE FROM monthly_outcomes WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("DELETE FROM weekly_cycles WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("DELETE FROM journey_tasks WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("DELETE FROM journeys WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("UPDATE financial_records SET action_id=NULL WHERE user_id=?").bind(identity.userId).run();
    await db.prepare("UPDATE profiles SET removed_modules_purged=1,updated_at=? WHERE user_id=?").bind(now,identity.userId).run();
  }
  seededWorkspaceUsers.add(identity.userId);
}
