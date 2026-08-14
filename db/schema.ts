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
  removedModulesPurged: integer("removed_modules_purged", { mode: "boolean" }).notNull().default(false),
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

export const journeyStagesV2 = sqliteTable("journey_stages_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),title:text("title").notNull(),objective:text("objective").notNull().default(""),status:text("status").notNull().default("planned"),sortOrder:integer("sort_order").notNull().default(1),startDate:text("start_date"),endDate:text("end_date"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[index("idx_stages_v2_user_sort").on(table.userId,table.sortOrder)]);
export const journeyGoalsV2 = sqliteTable("journey_goals_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),stageId:text("stage_id").notNull(),title:text("title").notNull(),description:text("description").notNull().default(""),acceptanceCriteria:text("acceptance_criteria").notNull().default(""),priority:integer("priority").notNull().default(2),status:text("status").notNull().default("planned"),sortOrder:integer("sort_order").notNull().default(1),startDate:text("start_date"),endDate:text("end_date"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[index("idx_goals_v2_stage_sort").on(table.userId,table.stageId,table.sortOrder)]);
export const taskTypesV2 = sqliteTable("task_types_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),typeKey:text("type_key").notNull(),name:text("name").notNull(),color:text("color").notNull(),icon:text("icon").notNull(),sortOrder:integer("sort_order").notNull().default(1),enabled:integer("enabled",{mode:"boolean"}).notNull().default(true),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[uniqueIndex("idx_task_types_v2_key").on(table.userId,table.typeKey)]);
export const taskDefinitionsV2 = sqliteTable("task_definitions_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),goalId:text("goal_id").notNull(),title:text("title").notNull(),description:text("description").notNull().default(""),typeKey:text("type_key").notNull().default("other"),mode:text("mode").notNull().default("once"),frequency:text("frequency").notNull().default("once"),occurrences:integer("occurrences").notNull().default(1),weekdaysJson:text("weekdays_json").notNull().default("[]"),monthDaysJson:text("month_days_json").notNull().default("[]"),timesJson:text("times_json").notNull().default("[]"),scheduledDate:text("scheduled_date"),startDate:text("start_date"),endDate:text("end_date"),estimatedMinutes:integer("estimated_minutes").notNull().default(30),priority:integer("priority").notNull().default(2),recordRequired:integer("record_required",{mode:"boolean"}).notNull().default(false),enabled:integer("enabled",{mode:"boolean"}).notNull().default(true),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[index("idx_tasks_v2_goal").on(table.userId,table.goalId)]);
export const planningRecordsV2 = sqliteTable("planning_records_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),instanceId:text("instance_id").notNull(),typeKey:text("type_key").notNull(),title:text("title").notNull(),content:text("content").notNull().default(""),duration:integer("duration").notNull().default(0),feeling:text("feeling").notNull().default(""),recordedAt:text("recorded_at").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[uniqueIndex("idx_planning_records_instance").on(table.userId,table.instanceId),index("idx_planning_records_type_date").on(table.userId,table.typeKey,table.recordedAt)]);
export const monthlyPlansV2 = sqliteTable("monthly_plans_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),period:text("period").notNull(),title:text("title").notNull().default(""),status:text("status").notNull().default("active"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[uniqueIndex("idx_month_plan_v2_period").on(table.userId,table.period)]);
export const monthlyPlanGoalsV2 = sqliteTable("monthly_plan_goals_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),planId:text("plan_id").notNull(),goalId:text("goal_id").notNull(),priority:integer("priority").notNull().default(2),createdAt:text("created_at").notNull(),
},(table)=>[uniqueIndex("idx_month_goal_v2").on(table.userId,table.planId,table.goalId)]);
export const taskInstancesV2 = sqliteTable("task_instances_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),planId:text("plan_id").notNull(),goalId:text("goal_id").notNull(),definitionId:text("definition_id").notNull(),title:text("title").notNull(),typeKey:text("type_key").notNull(),scheduledDate:text("scheduled_date").notNull(),scheduledTime:text("scheduled_time").notNull().default(""),estimatedMinutes:integer("estimated_minutes").notNull().default(30),priority:integer("priority").notNull().default(2),status:text("status").notNull().default("pending"),source:text("source").notNull().default("system"),userAdjusted:integer("user_adjusted",{mode:"boolean"}).notNull().default(false),occurrenceKey:text("occurrence_key").notNull(),completedAt:text("completed_at"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[uniqueIndex("idx_instances_v2_occurrence").on(table.userId,table.occurrenceKey),index("idx_instances_v2_date").on(table.userId,table.scheduledDate,table.status)]);
export const weeklyCapacityDaysV2 = sqliteTable("weekly_capacity_days_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),weekday:integer("weekday").notNull(),available:integer("available",{mode:"boolean"}).notNull().default(true),minutes:integer("minutes").notNull().default(60),slotsJson:text("slots_json").notNull().default("[]"),updatedAt:text("updated_at").notNull(),
},(table)=>[uniqueIndex("idx_capacity_v2_day").on(table.userId,table.weekday)]);
export const planningReportsV2 = sqliteTable("planning_reports_v2", {
  id:text("id").primaryKey(),userId:text("user_id").notNull(),reportType:text("report_type").notNull(),period:text("period").notNull(),status:text("status").notNull().default("final"),summaryJson:text("summary_json").notNull(),generatedAt:text("generated_at").notNull(),updatedAt:text("updated_at").notNull(),
},(table)=>[uniqueIndex("idx_reports_v2_period").on(table.userId,table.reportType,table.period)]);
