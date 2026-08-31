import 'server-only';

import { KV_TOKEN, KV_URL, hasDurableStore } from './env';

/**
 * Key/value storage.
 *
 * Upstash Redis over REST when configured — it is the one that works on
 * serverless, where there is no shared filesystem and no long-lived process.
 *
 * The in-memory fallback exists so the app runs locally without credentials.
 * It is explicitly NOT durable: on serverless each invocation may get a fresh
 * instance, so writes vanish. `hasDurableStore` is exported so callers can
 * refuse to touch money when the store cannot be trusted.
 */
const memory = new Map<string, string>();

async function kv(command: unknown[]): Promise<unknown> {
  const response = await fetch(KV_URL as string, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Store request failed: ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result;
}

export async function get<T>(key: string): Promise<T | null> {
  const raw = hasDurableStore ? ((await kv(['GET', key])) as string | null) : (memory.get(key) ?? null);
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function set(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  if (hasDurableStore) await kv(['SET', key, raw]);
  else memory.set(key, raw);
}

/** Set only if absent. Used to claim a username without a race. */
export async function setIfAbsent(key: string, value: unknown): Promise<boolean> {
  const raw = JSON.stringify(value);
  if (hasDurableStore) return (await kv(['SET', key, raw, 'NX'])) !== null;
  if (memory.has(key)) return false;
  memory.set(key, raw);
  return true;
}

export async function del(key: string): Promise<void> {
  if (hasDurableStore) await kv(['DEL', key]);
  else memory.delete(key);
}

/** Append to a list, newest first, capped. */
export async function push(key: string, id: string, cap = 500): Promise<void> {
  if (hasDurableStore) {
    await kv(['LPUSH', key, id]);
    await kv(['LTRIM', key, 0, cap - 1]);
    return;
  }
  const list = (await get<string[]>(key)) ?? [];
  await set(key, [id, ...list].slice(0, cap));
}

export async function list(key: string, limit = 100): Promise<string[]> {
  if (hasDurableStore) return ((await kv(['LRANGE', key, 0, limit - 1])) as string[]) ?? [];
  return ((await get<string[]>(key)) ?? []).slice(0, limit);
}
