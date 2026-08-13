import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  vision: text("vision").notNull(),
  targetDate: text("target_date").notNull(),
  initialized: integer("initialized", { mode: "boolean" }).notNull().default(false),
  weeklyCapacityMinutes: integer("weekly_capacity_minutes").notNull().default(420),
  weeklyGoal: text("weekly_goal").notNull().default(""),
  sideHustleLimitMinutes: integer("side_hustle_limit_minutes").notNull().default(360),
  protectedDay: text("protected_day").notNull().default("周日"),
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
    evidence: text("evidence").notNull().default(""),
    completedAt: text("completed_at"),
    evidenceReviewStatus: text("evidence_review_status").notNull().default(""),
    evidenceReviewFeedback: text("evidence_review_feedback").notNull().default(""),
    evidenceScore: integer("evidence_score").notNull().default(0),
  },
  (table) => [index("idx_journeys_user_status").on(table.userId, table.status)],
);

export const journeyTasks = sqliteTable(
  "journey_tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    journeyId: text("journey_id").notNull(),
    title: text("title").notNull(),
    acceptanceCriteria: text("acceptance_criteria").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull().default(60),
    taskType: text("task_type").notNull().default("general"),
    executionFrequency: text("execution_frequency").notNull().default("monthly"),
    mainTask: text("main_task").notNull().default(""),
    preferredTime: text("preferred_time").notNull().default(""),
    preferredWeekday: text("preferred_weekday").notNull().default(""),
    preferredMonthDay: integer("preferred_month_day").notNull().default(0),
    priority: integer("priority").notNull().default(1),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("manual"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_journey_tasks_journey_status").on(table.userId, table.journeyId, table.status)],
);

export const monthlyOutcomes = sqliteTable("monthly_outcomes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  progress: integer("progress").notNull().default(0),
  expectedHours: integer("expected_hours").notNull(),
  status: text("status").notNull(),
  journeyId: text("journey_id").notNull().default(""),
  kind: text("kind").notNull().default("milestone"),
  period: text("period").notNull().default(""),
  settledAt: text("settled_at"),
  rolledFromId: text("rolled_from_id").notNull().default(""),
  sourceTaskId: text("source_task_id").notNull().default(""),
});

export const weeklyCycles = sqliteTable("weekly_cycles", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), weekStart: text("week_start").notNull(), weekEnd: text("week_end").notNull(),
  goal: text("goal").notNull().default(""), capacityMinutes: integer("capacity_minutes").notNull().default(420), status: text("status").notNull().default("active"),
  completedCount: integer("completed_count").notNull().default(0), totalCount: integer("total_count").notNull().default(0), archivedAt: text("archived_at"), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_weekly_cycles_user_start").on(table.userId, table.weekStart)]);

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
    isSideHustle: integer("is_side_hustle", { mode: "boolean" }).notNull().default(false),
    cycleId: text("cycle_id").notNull().default(""),
    carriedFromId: text("carried_from_id").notNull().default(""),
    sourceTaskId: text("source_task_id").notNull().default(""),
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
  healthCheck: text("health_check").notNull().default(""),
  marketEvidence: text("market_evidence").notNull().default(""),
  energyScore: integer("energy_score").notNull().default(7),
  decision: text("decision").notNull().default("continue"),
  killRuleCount: integer("kill_rule_count").notNull().default(0),
  weekStart: text("week_start").notNull().default(""),
  autoDecision: text("auto_decision").notNull().default("continue"),
  autoReasons: text("auto_reasons").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const evidenceEvents = sqliteTable("evidence_events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), sourceType: text("source_type").notNull(), sourceId: text("source_id").notNull(),
  evidenceType: text("evidence_type").notNull(), actionId: text("action_id").notNull().default(""), occurredAt: text("occurred_at").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_evidence_source").on(table.userId,table.sourceType,table.sourceId),index("idx_evidence_user_type_date").on(table.userId, table.evidenceType, table.occurredAt)]);

export const stopRuleEvents = sqliteTable("stop_rule_events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), weekStart: text("week_start").notNull(), ruleCode: text("rule_code").notNull(),
  severity: text("severity").notNull(), reason: text("reason").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_stop_events_user_week").on(table.userId, table.weekStart)]);

export const taskOutputs = sqliteTable("task_outputs", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), actionId: text("action_id").notNull(),
  taskType: text("task_type").notNull(), title: text("title").notNull(), content: text("content").notNull(),
  duration: integer("duration").notNull().default(0), feeling: text("feeling").notNull().default(""), createdAt: text("created_at").notNull(),
});
export const financialRecords = sqliteTable("financial_records", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), actionId: text("action_id"), category: text("category").notNull(),
  amount: integer("amount").notNull(), note: text("note").notNull(), recordedAt: text("recorded_at").notNull(), createdAt: text("created_at").notNull(),
  incomeType: text("income_type").notNull().default(""), sourceName: text("source_name").notNull().default(""), expenseScope: text("expense_scope").notNull().default("personal"),
  investmentPrincipal: real("investment_principal").notNull().default(0), investmentReturn: real("investment_return").notNull().default(0),
});
export const financialMonthlyBills = sqliteTable("financial_monthly_bills", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),period:text("period").notNull(),incomeTotal:real("income_total").notNull().default(0),salaryIncome:real("salary_income").notNull().default(0),nonSalaryIncome:real("non_salary_income").notNull().default(0),expenseTotal:real("expense_total").notNull().default(0),businessExpense:real("business_expense").notNull().default(0),investmentPrincipal:real("investment_principal").notNull().default(0),investmentReturn:real("investment_return").notNull().default(0),businessProfit:real("business_profit").notNull().default(0),netCashFlow:real("net_cash_flow").notNull().default(0),settledAt:text("settled_at").notNull(),
},(table)=>[uniqueIndex("idx_finance_bills_user_period").on(table.userId,table.period)]);
export const englishMessages = sqliteTable("english_messages", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), role: text("role").notNull(), text: text("text").notNull(),
  feedback: text("feedback").notNull(), createdAt: text("created_at").notNull(),
});

export const footprints = sqliteTable("footprints", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(), status: text("status").notNull(),
  content: text("content").notNull(), visitedAt: text("visited_at"), latitude: real("latitude"), longitude: real("longitude"),
  geometryJson: text("geometry_json"), geometryVersion: integer("geometry_version").notNull().default(0),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const footprintImages = sqliteTable("footprint_images", {
  id: text("id").primaryKey(), footprintId: text("footprint_id").notNull(), userId: text("user_id").notNull(), objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(), createdAt: text("created_at").notNull(),
});
export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), type: text("type").notNull(), title: text("title").notNull(),
  content: text("content").notNull(), recordedAt: text("recorded_at").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_journal_entries_user_type_date").on(table.userId, table.type, table.recordedAt)]);
export const journalImages = sqliteTable("journal_images", {
  id: text("id").primaryKey(), journalId: text("journal_id").notNull(), userId: text("user_id").notNull(), objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_journal_images_journal").on(table.journalId, table.userId)]);
export const recordImages = sqliteTable("record_images", {
  id: text("id").primaryKey(), recordType: text("record_type").notNull(), recordId: text("record_id").notNull(), userId: text("user_id").notNull(),
  objectKey: text("object_key").notNull(), contentType: text("content_type").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_record_images_record").on(table.userId, table.recordType, table.recordId)]);
