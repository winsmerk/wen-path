import { env } from "cloudflare:workers";
import { headers } from "next/headers";

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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_journeys_user_status ON journeys(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_actions_user_status ON weekly_actions(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_checkins_user_type ON checkins(user_id, type)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_outputs_user_action ON task_outputs(user_id, action_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_finance_user_date ON financial_records(user_id, recorded_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_english_user_date ON english_messages(user_id, created_at)"),
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

  await db.prepare("PRAGMA optimize").run();
}

const vision =
  "40岁时，身体健康有力量；拥有足够好的英语和职业能力，可以选择在哪里生活、和谁工作；收入不依赖单一雇主；有能力经营家庭，也持续探索世界。最重要的是，在大多数普通日子里，我喜欢自己的生活。";

const journeySeeds = [
  [1, "建立真实财务基线", "财务与资产", "完成净资产表、月支出与应急金标准", "整理现金、房产和固定支出"],
  [2, "建立可持续运动节奏", "健康", "连续4周每周运动至少3次", "完成本周第一次力量训练"],
  [3, "留下英语口语基准", "英语", "完成3分钟英文自我介绍录音", "写出英文自我介绍提纲"],
  [4, "整理职业项目地图", "职业", "列出10个项目并选出5个案例", "列出最重要的10个项目"],
  [5, "确定未来一年职业主线", "职业", "明确两项核心能力及90天验证项目", "评估当前能力差距"],
  [6, "完成第一个中英文案例", "职业", "形成可用于面试的双语案例", "选择最有代表性的项目"],
  [7, "验证一个AI工作流", "职业", "交付一个可演示的AI应用案例", "记录工作中的重复流程"],
  [8, "获得第一笔技术服务收入", "收入", "获得非工资技术收入并完成复盘", "定义一个可售卖的小服务"],
  [9, "建立关系复盘习惯", "关系与家庭", "完成4次非评分类关系事件复盘", "记录一次重要沟通"],
  [10, "设计年度探索预算", "探索与生活", "确定年度地点、时间与预算边界", "列出三个想探索的地方"],
  [11, "完成一次全英文模拟面试", "英语", "完成45分钟模拟并形成改进清单", "整理常见项目问题"],
  [12, "形成个人能力仪表盘", "职业", "建立可季度更新的能力基线", "列出10项关键能力"],
] as const;

const outcomeSeeds = [
  ["finance", "看清真实财务底盘", "完成净资产表、真实月支出和12个月应急金标准", 25, 5],
  ["exercise", "完成12次运动", "最低可接受10次，保持恢复良好", 17, 8],
  ["english", "完成12次英语练习", "最低10次，并保留一份口语基准录音", 8, 8],
  ["career", "形成5个职业案例初稿", "整理10个项目，5个形成初稿并确定职业主线", 10, 12],
] as const;

const actionSeeds = [
  ["a1", "finance", "整理现金、房产、收入与固定支出", 45, "周三", 1, "finance"],
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
  ).bind(identity.userId, identity.displayName, vision, "2034-08-11", now, now).run();

  const journeyStatements = journeySeeds.map((item) => {
    const [sequence, title, area, acceptance, nextAction] = item;
    return db.prepare(
      `INSERT OR IGNORE INTO journeys
        (id, user_id, sequence_number, title, area, stage, acceptance_criteria, status, progress, next_action)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `${identity.userId}-journey-${sequence}`,
      identity.userId,
      sequence,
      title,
      area,
      sequence <= 6 ? "建立基线" : "能力突破",
      acceptance,
      sequence <= 5 ? "active" : "planned",
      sequence === 1 ? 25 : sequence === 2 ? 17 : sequence === 3 ? 8 : 0,
      nextAction,
    );
  });

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

  await db.batch([...journeyStatements, ...outcomeStatements, ...actionStatements]);
  await db.batch([
    db.prepare("UPDATE weekly_actions SET task_type = 'finance', source = 'seed' WHERE id = ? AND task_type = 'general'").bind(`${identity.userId}-a1`),
    db.prepare("UPDATE weekly_actions SET task_type = 'english', source = 'seed' WHERE id = ? AND task_type = 'general'").bind(`${identity.userId}-a2`),
    db.prepare("UPDATE weekly_actions SET source = 'seed' WHERE id = ?").bind(`${identity.userId}-a3`),
    db.prepare("UPDATE weekly_actions SET task_type = 'exercise', source = 'seed' WHERE id = ? AND task_type = 'general'").bind(`${identity.userId}-a4`),
  ]);
}
