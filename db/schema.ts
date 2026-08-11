import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  vision: text("vision").notNull(),
  targetDate: text("target_date").notNull(),
  initialized: integer("initialized", { mode: "boolean" }).notNull().default(false),
  weeklyCapacityMinutes: integer("weekly_capacity_minutes").notNull().default(420),
  weeklyGoal: text("weekly_goal").notNull().default(""),
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
    deletedAt: text("deleted_at"),
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
    taskType: text("task_type").notNull().default("general"),
    source: text("source").notNull().default("manual"),
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

export const taskOutputs = sqliteTable("task_outputs", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), actionId: text("action_id").notNull(),
  taskType: text("task_type").notNull(), title: text("title").notNull(), content: text("content").notNull(),
  duration: integer("duration").notNull().default(0), feeling: text("feeling").notNull().default(""), createdAt: text("created_at").notNull(),
});
export const financialRecords = sqliteTable("financial_records", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), actionId: text("action_id"), category: text("category").notNull(),
  amount: integer("amount").notNull(), note: text("note").notNull(), recordedAt: text("recorded_at").notNull(), createdAt: text("created_at").notNull(),
});
export const englishMessages = sqliteTable("english_messages", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), role: text("role").notNull(), text: text("text").notNull(),
  feedback: text("feedback").notNull(), createdAt: text("created_at").notNull(),
});

export const footprints = sqliteTable("footprints", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(), status: text("status").notNull(),
  content: text("content").notNull(), visitedAt: text("visited_at"), latitude: real("latitude"), longitude: real("longitude"),
  geometryJson: text("geometry_json"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const footprintImages = sqliteTable("footprint_images", {
  id: text("id").primaryKey(), footprintId: text("footprint_id").notNull(), userId: text("user_id").notNull(), objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(), createdAt: text("created_at").notNull(),
});
