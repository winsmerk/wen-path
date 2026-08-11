import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  vision: text("vision").notNull(),
  targetDate: text("target_date").notNull(),
  initialized: integer("initialized", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const journeys = sqliteTable(
  "journeys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    title: text("title").notNull(),
    area: text("area").notNull(),
    stage: text("stage").notNull(),
    acceptanceCriteria: text("acceptance_criteria").notNull(),
    status: text("status").notNull(),
    progress: integer("progress").notNull().default(0),
    nextAction: text("next_action").notNull(),
  },
  (table) => [index("idx_journeys_user_status").on(table.userId, table.status)],
);

export const monthlyOutcomes = sqliteTable("monthly_outcomes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  progress: integer("progress").notNull().default(0),
  expectedHours: integer("expected_hours").notNull(),
  status: text("status").notNull(),
});

export const weeklyActions = sqliteTable(
  "weekly_actions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    outcomeId: text("outcome_id").notNull(),
    title: text("title").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    scheduledFor: text("scheduled_for").notNull(),
    priority: integer("priority").notNull(),
    status: text("status").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [index("idx_actions_user_status").on(table.userId, table.status)],
);

export const checkins = sqliteTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    duration: integer("duration").notNull(),
    note: text("note").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_checkins_user_type").on(table.userId, table.type)],
);

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(),
  achievement: text("achievement").notNull(),
  lowValue: text("low_value").notNull(),
  nextPriority: text("next_priority").notNull(),
  createdAt: text("created_at").notNull(),
});
