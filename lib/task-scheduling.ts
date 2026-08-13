export const weekDays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export type SchedulingPreference = {
  execution_frequency: "once" | "daily" | "weekly" | "monthly";
  preferred_weekday: string;
  preferred_month_day: number;
};

export function resolveTaskDay(
  task: SchedulingPreference,
  planning: { month: string; weekStart: string; weekEnd: string; protectedDay: string },
) {
  void planning.protectedDay;
  if (task.execution_frequency === "once") return "本周择时";
  if (task.execution_frequency === "daily") return "每日";
  if (task.execution_frequency === "weekly") {
    return weekDays.includes(task.preferred_weekday as (typeof weekDays)[number])
      ? task.preferred_weekday
      : "本周择时";
  }

  const preferredDay = Math.trunc(Number(task.preferred_month_day));
  if (!preferredDay) return "本周择时";

  const [year, month] = planning.month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dueDate = new Date(Date.UTC(year, month - 1, Math.min(preferredDay, lastDay)));
  const isoDate = dueDate.toISOString().slice(0, 10);
  if (isoDate < planning.weekStart || isoDate > planning.weekEnd) return null;
  return weekDays[(dueDate.getUTCDay() + 6) % 7];
}
