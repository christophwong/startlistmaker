/** "2026-09-06" → "Sun, Sep 6, 2026" (rendered at noon to avoid TZ day shifts). */
export function formatEventDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
