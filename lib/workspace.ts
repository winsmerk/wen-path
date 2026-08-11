import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { vision40, visionJourneyImportId, visionJourneySeeds } from "@/lib/vision-journeys";

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

export function getMediaBucket(): R2Bucket | null {
  return env.MEDIA ?? null;
}

export async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, vision TEXT NOT NULL,
      target_date TEXT NOT NULL, initialized INTEGER NOT NULL DEFAULT 0,
      weekly_capacity_minutes INTEGER NOT NULL DEFAULT 420,
      weekly_goal TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS journeys (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sequence_number INTEGER NOT NULL,
      title TEXT NOT NULL, area TEXT NOT NULL, stage TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL, status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0, next_action TEXT NOT NULL, deleted_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS monthly_outcomes (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
      expected_hours INTEGER NOT NULL, status TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly_actions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, outcome_id TEXT NOT NULL,
      title TEXT NOT NULL, estimated_minutes INTEGER NOT NULL,
      scheduled_for TEXT NOT NULL, priority INTEGER NOT NULL,
      status TEXT NOT NULL, completed_at TEXT,
      task_type TEXT NOT NULL DEFAULT 'general', source TEXT NOT NULL DEFAULT 'manual'
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
      duration INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL,
      achievement TEXT NOT NULL, low_value TEXT NOT NULL,
      next_priority TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS task_outputs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_id TEXT NOT NULL,
      task_type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0, feeling TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS financial_records (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_id TEXT,
      category TEXT NOT NULL, amount REAL NOT NULL, note TEXT NOT NULL,
      recorded_at TEXT NOT NULL, created_at TEXT NOT NULL
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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journeys_user_status ON journeys(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_actions_user_status ON weekly_actions(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_checkins_user_type ON checkins(user_id, type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_outputs_user_action ON task_outputs(user_id, action_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_finance_user_date ON financial_records(user_id, recorded_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_english_user_date ON english_messages(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_footprints_user_status ON footprints(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_footprint_images_footprint ON footprint_images(footprint_id, user_id)"),
  ]);

  const journeyColumns = await db.prepare("PRAGMA table_info(journeys)").all<{ name: string }>();
  if (!journeyColumns.results.some((column) => column.name === "deleted_at")) {
    await db.prepare("ALTER TABLE journeys ADD COLUMN deleted_at TEXT").run();
  }

  const profileColumns = await db.prepare("PRAGMA table_info(profiles)").all<{ name: string }>();
  if (!profileColumns.results.some((column) => column.name === "weekly_capacity_minutes")) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN weekly_capacity_minutes INTEGER NOT NULL DEFAULT 420").run();
  }
  if (!profileColumns.results.some((column) => column.name === "weekly_goal")) {
    await db.prepare("ALTER TABLE profiles ADD COLUMN weekly_goal TEXT NOT NULL DEFAULT ''").run();
  }
  const actionColumns = await db.prepare("PRAGMA table_info(weekly_actions)").all<{ name: string }>();
  if (!actionColumns.results.some((column) => column.name === "task_type")) {
    await db.prepare("ALTER TABLE weekly_actions ADD COLUMN task_type TEXT NOT NULL DEFAULT 'general'").run();
  }
  if (!actionColumns.results.some((column) => column.name === "source")) {
    await db.prepare("ALTER TABLE weekly_actions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'").run();
  }
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

const outcomeSeeds = [
  ["finance", "看清真实财务底盘", "完成净资产表、真实月支出和12个月应急金标准", 25, 5],
  ["exercise", "完成12次运动", "最低可接受10次，保持恢复良好", 17, 8],
  ["english", "完成12次英语练习", "最低10次，并保留一份口语基准录音", 8, 8],
  ["career", "形成5个职业案例初稿", "整理10个项目，5个形成初稿并确定职业主线", 10, 12],
] as const;

const actionSeeds = [
  ["a1", "finance", "整理现金、固定资产、投资、收入与固定支出", 45, "周三", 1, "finance"],
  ["a2", "english", "录制3分钟英文自我介绍", 35, "周四", 2, "english"],
  ["a3", "career", "列出10个重要职业项目", 60, "周六", 3, "general"],
  ["a4", "exercise", "完成3次运动", 135, "本周", 4, "exercise"],
] as const;

export async function seedWorkspace(db: D1Database, identity: WorkspaceIdentity) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO profiles
      (user_id, display_name, vision, target_date, initialized, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).bind(identity.userId, identity.displayName, vision40, "2034-08-11", now, now).run();

  const importMarkerId = `${identity.userId}-${visionJourneyImportId}-100`;
  const imported = await db.prepare("SELECT id FROM journeys WHERE id=? AND user_id=?").bind(importMarkerId, identity.userId).first();
  if (!imported) {
    const journeyStatements = visionJourneySeeds.map(([sequence, title, area, stage, acceptance, nextAction]) => db.prepare(
      `INSERT INTO journeys
        (id, user_id, sequence_number, title, area, stage, acceptance_criteria, status, progress, next_action)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).bind(`${identity.userId}-${visionJourneyImportId}-${sequence}`, identity.userId, sequence, title, area, stage, acceptance, sequence <= 5 ? "active" : "planned", nextAction));
    await db.batch([
      db.prepare("DELETE FROM journeys WHERE user_id=?").bind(identity.userId),
      db.prepare("UPDATE profiles SET vision=?,updated_at=? WHERE user_id=?").bind(vision40, now, identity.userId),
      ...journeyStatements,
    ]);
  }

  const outcomeStatements = outcomeSeeds.map(([id, title, acceptance, progress, hours]) =>
    db.prepare(
      `INSERT OR IGNORE INTO monthly_outcomes
        (id, user_id, title, acceptance_criteria, progress, expected_hours, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    ).bind(`${identity.userId}-${id}`, identity.userId, title, acceptance, progress, hours),
  );

  const actionStatements = actionSeeds.map(([id, outcomeId, title, minutes, day, priority, taskType]) =>
    db.prepare(
      `INSERT OR IGNORE INTO weekly_actions
        (id, user_id, outcome_id, title, estimated_minutes, scheduled_for, priority, status, task_type, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'seed')`,
    ).bind(`${identity.userId}-${id}`, identity.userId, `${identity.userId}-${outcomeId}`, title, minutes, day, priority, taskType),
  );

  await db.batch([...outcomeStatements, ...actionStatements]);
  await db.batch([
    db.prepare("UPDATE weekly_actions SET task_type = 'finance', source = 'seed', title = '整理现金、固定资产、投资、收入与固定支出' WHERE id = ?").bind(`${identity.userId}-a1`),
    db.prepare("UPDATE weekly_actions SET task_type = 'english', source = 'seed' WHERE id = ? AND task_type = 'general'").bind(`${identity.userId}-a2`),
    db.prepare("UPDATE weekly_actions SET source = 'seed' WHERE id = ?").bind(`${identity.userId}-a3`),
    db.prepare("UPDATE weekly_actions SET task_type = 'exercise', source = 'seed' WHERE id = ? AND task_type = 'general'").bind(`${identity.userId}-a4`),
  ]);
}
