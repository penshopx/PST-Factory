const analysisWindows = new Map<string, { count: number; resetsAt: number }>();
const ANALYSIS_LIMIT = 5;
const ANALYSIS_WINDOW_MS = 10 * 60 * 1000;

export function consumeAnalysisQuota(userId: string) {
  const now = Date.now();
  const window = analysisWindows.get(userId);
  if (!window || window.resetsAt <= now) {
    analysisWindows.set(userId, { count: 1, resetsAt: now + ANALYSIS_WINDOW_MS });
    return true;
  }
  if (window.count >= ANALYSIS_LIMIT) return false;
  window.count += 1;
  return true;
}