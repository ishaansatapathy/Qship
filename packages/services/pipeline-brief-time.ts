export type BriefPeriod = "morning" | "afternoon" | "evening";

/** Hour (0–23) in the user's local timezone. */
export function localHourFromTimezoneOffset(offsetMinutes: number): number {
  const d = new Date(Date.now() - offsetMinutes * 60_000);
  return d.getUTCHours();
}

export function briefPeriodFromHour(hour: number): BriefPeriod {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function greetingFromHour(hour: number): string {
  const period = briefPeriodFromHour(hour);
  if (period === "morning") return "Good morning";
  if (period === "afternoon") return "Good afternoon";
  return "Good evening";
}

export function briefTitleFromHour(hour: number): string {
  const period = briefPeriodFromHour(hour);
  if (period === "morning") return "Morning brief";
  if (period === "afternoon") return "Afternoon brief";
  return "Evening brief";
}

export function briefKindFromHour(hour: number): string {
  const period = briefPeriodFromHour(hour);
  if (period === "morning") return "morning";
  if (period === "afternoon") return "afternoon";
  return "evening";
}
