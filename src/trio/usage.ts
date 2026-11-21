// Counts Gemini voice requests made from this browser, per model, per Pacific-time day (Google's daily limits
// reset at midnight Pacific). It's this browser's count only: anything else using the same Google project counts too.
const KEY = "trio-voice-usage";
export interface Usage { day: string; byModel: Record<string, number>; minute: number[] }

export function pacificDay(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
export function loadUsage(): Usage {
  try {
    const u = JSON.parse(localStorage.getItem(KEY) || "null");
    if (u && u.day === pacificDay()) return { minute: [], ...u };
  } catch { /* ignore */ }
  return { day: pacificDay(), byModel: {}, minute: [] };
}
export function recordRequest(model: string): Usage {
  const u = loadUsage();
  u.byModel[model] = (u.byModel[model] || 0) + 1;
  const now = Date.now();
  u.minute = [...u.minute.filter((t) => now - t < 60000), now];
  try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* ignore */ }
  return u;
}
export function untilReset() {
  const now = new Date();
  const pt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const next = new Date(pt); next.setHours(24, 0, 0, 0);
  const mins = Math.round((next.getTime() - pt.getTime()) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}
export const RATE_LIMIT_URL = "https://aistudio.google.com/rate-limit?timeRange=last-28-days";
