const lastAt = new Map<string, number>();

/**
 * 简单内存限速（单实例部署适用）。
 * @returns 是否允许执行；被限速时返回建议等待秒数
 */
export function allowAction(key: string, cooldownMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const diff = now - (lastAt.get(key) ?? 0);
  if (diff < cooldownMs) {
    return { ok: false, retryAfterSec: Math.ceil((cooldownMs - diff) / 1000) };
  }
  lastAt.set(key, now);
  return { ok: true, retryAfterSec: 0 };
}
