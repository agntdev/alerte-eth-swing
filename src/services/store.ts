// Persistent store — durable domain data that must survive a restart.
// Uses the toolkit's Redis-backed session storage via a simple key-value
// wrapper. Each entity type lives under its own key prefix to avoid
// collision. No keyspace scans — reads go through explicit index records.

import type { RedisLike } from "../toolkit/session/redis.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserData {
  telegram_id: number;
  notification_settings: {
    alerts_enabled: boolean;
    mute_until?: number; // unix-ms timestamp; alerts suppressed while now() < mute_until
  };
  last_ack_time?: number; // unix-ms
}

export interface Signal {
  id: string;
  type: "buy" | "sell";
  reason: string;
  timestamp: number; // unix-ms
  price: number;
  timeframe: string;
  confidence: number; // 0-100
  indicators: {
    ema20: number;
    ema50: number;
    rsi: number;
    macd: number;
    atr: number;
  };
}

export interface AlertHistory {
  signal_id: string;
  user_id: number;
  sent_at: number; // unix-ms
  ack_time?: number; // unix-ms
}

export interface IndicatorState {
  ema20: number;
  ema50: number;
  rsi: number;
  macd: number;
  macd_signal: number;
  macd_histogram: number;
  atr: number;
  timeframe: string;
  updated_at: number;
}

export interface MarketCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Store class — wraps a RedisLike client with typed helpers
// ---------------------------------------------------------------------------

export class Store {
  constructor(private readonly client: RedisLike) {}

  // -- User -----------------------------------------------------------------

  private userKey(id: number): string {
    return `user:${id}`;
  }

  async getUser(id: number): Promise<UserData | null> {
    const raw = await this.client.get(this.userKey(id));
    if (!raw) return null;
    try { return JSON.parse(raw) as UserData; } catch { return null; }
  }

  async setUser(data: UserData): Promise<void> {
    await this.client.set(this.userKey(data.telegram_id), JSON.stringify(data));
  }

  // Maintain a user index (list of user ids) without keyspace scan.
  private userIdxKey(): string {
    return "idx:users";
  }

  async addUserId(id: number): Promise<void> {
    const key = this.userIdxKey();
    const raw = await this.client.get(key);
    const ids: number[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(id)) {
      ids.push(id);
      await this.client.set(key, JSON.stringify(ids));
    }
  }

  async getAllUserIds(): Promise<number[]> {
    const raw = await this.client.get(this.userIdxKey());
    return raw ? JSON.parse(raw) : [];
  }

  // -- Signals --------------------------------------------------------------

  private signalKey(id: string): string {
    return `signal:${id}`;
  }

  private signalIdxKey(): string {
    return "idx:signals";
  }

  async saveSignal(sig: Signal): Promise<void> {
    await this.client.set(this.signalKey(sig.id), JSON.stringify(sig));
    const raw = await this.client.get(this.signalIdxKey());
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(sig.id)) {
      ids.push(sig.id);
      await this.client.set(this.signalIdxKey(), JSON.stringify(ids));
    }
  }

  async getSignal(id: string): Promise<Signal | null> {
    const raw = await this.client.get(this.signalKey(id));
    if (!raw) return null;
    try { return JSON.parse(raw) as Signal; } catch { return null; }
  }

  /** Get signals from the last N milliseconds. */
  async getRecentSignals(windowMs: number, nowMs: number): Promise<Signal[]> {
    const idsRaw = await this.client.get(this.signalIdxKey());
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    const cutoff = nowMs - windowMs;
    const signals: Signal[] = [];
    for (const id of ids) {
      const sig = await this.getSignal(id);
      if (sig && sig.timestamp >= cutoff) signals.push(sig);
    }
    return signals.sort((a, b) => b.timestamp - a.timestamp);
  }

  // -- Alert history --------------------------------------------------------

  private alertKey(signalId: string, userId: number): string {
    return `alert:${signalId}:${userId}`;
  }

  private alertIdxKey(): string {
    return "idx:alerts";
  }

  async saveAlert(alert: AlertHistory): Promise<void> {
    await this.client.set(
      this.alertKey(alert.signal_id, alert.user_id),
      JSON.stringify(alert),
    );
    const raw = await this.client.get(this.alertIdxKey());
    const keys: string[] = raw ? JSON.parse(raw) : [];
    const key = `${alert.signal_id}:${alert.user_id}`;
    if (!keys.includes(key)) {
      keys.push(key);
      await this.client.set(this.alertIdxKey(), JSON.stringify(keys));
    }
  }

  async getAlert(signalId: string, userId: number): Promise<AlertHistory | null> {
    const raw = await this.client.get(this.alertKey(signalId, userId));
    if (!raw) return null;
    try { return JSON.parse(raw) as AlertHistory; } catch { return null; }
  }

  async ackAlert(signalId: string, userId: number, ackTime: number): Promise<boolean> {
    const alert = await this.getAlert(signalId, userId);
    if (!alert || alert.ack_time) return false;
    alert.ack_time = ackTime;
    await this.saveAlert(alert);
    // Also update user's last_ack_time
    const user = await this.getUser(userId);
    if (user) {
      user.last_ack_time = ackTime;
      await this.setUser(user);
    }
    return true;
  }

  /** Get alert history for a user within a time window. */
  async getUserAlerts(userId: number, windowMs: number, nowMs: number): Promise<AlertHistory[]> {
    const idxRaw = await this.client.get(this.alertIdxKey());
    const keys: string[] = idxRaw ? JSON.parse(idxRaw) : [];
    const cutoff = nowMs - windowMs;
    const alerts: AlertHistory[] = [];
    for (const key of keys) {
      const [signalId, uid] = key.split(":");
      if (Number(uid) !== userId) continue;
      const alert = await this.getAlert(signalId, userId);
      if (alert && alert.sent_at >= cutoff) alerts.push(alert);
    }
    return alerts.sort((a, b) => b.sent_at - a.sent_at);
  }

  // -- Indicator state ------------------------------------------------------

  private indicatorKey(): string {
    return "indicators:eth";
  }

  async getIndicators(): Promise<IndicatorState | null> {
    const raw = await this.client.get(this.indicatorKey());
    if (!raw) return null;
    try { return JSON.parse(raw) as IndicatorState; } catch { return null; }
  }

  async setIndicators(state: IndicatorState): Promise<void> {
    await this.client.set(this.indicatorKey(), JSON.stringify(state));
  }

  // -- Market candles -------------------------------------------------------

  private candleKey(): string {
    return "market:eth:candles";
  }

  async getCandles(): Promise<MarketCandle[]> {
    const raw = await this.client.get(this.candleKey());
    if (!raw) return [];
    try { return JSON.parse(raw) as MarketCandle[]; } catch { return []; }
  }

  async setCandles(candles: MarketCandle[]): Promise<void> {
    await this.client.set(this.candleKey(), JSON.stringify(candles));
  }

  // -- Signal dedup (24h per type) ------------------------------------------

  private lastSignalKey(type: string): string {
    return `dedup:signal:${type}`;
  }

  async getLastSignalTime(type: string): Promise<number> {
    const raw = await this.client.get(this.lastSignalKey(type));
    return raw ? Number(raw) : 0;
  }

  async setLastSignalTime(type: string, ts: number): Promise<void> {
    await this.client.set(this.lastSignalKey(type), String(ts));
  }
}

// ---------------------------------------------------------------------------
// Singleton — lazy init from env or in-memory fallback
// ---------------------------------------------------------------------------

class InMemoryClient implements RedisLike {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.store.get(key) ?? null; }
  async set(key: string, value: string): Promise<unknown> { this.store.set(key, value); return true; }
  async del(key: string): Promise<unknown> { this.store.delete(key); return true; }
  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, "");
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }
}

let singleton: Store | null = null;

/** Get or create the global store instance. Uses Redis when REDIS_URL is set,
 *  falls back to in-memory (for dev/test). */
export function getStore(): Store {
  if (singleton) return singleton;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      // Lazy-load ioredis (CJS) to avoid pulling it in when REDIS_URL is unset.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const IORedis = require("ioredis");
      const client = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
      singleton = new Store(client as RedisLike);
      return singleton;
    } catch {
      // Fall through to in-memory
    }
  }
  singleton = new Store(new InMemoryClient());
  return singleton;
}

/** Reset the singleton (test-only). */
export function resetStore(): void {
  singleton = null;
}
