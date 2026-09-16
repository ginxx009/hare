
export type ReviewJob = {
  userId: string;
  owner: string;
  repo: string;
  number: number;
  force?: boolean;
};

const CONCURRENCY = 4;
const STALE_MS = 8 * 60 * 1000;

type QueueState = {
  pending: ReviewJob[];
  inflight: Set<string>;
  active: number;
};

const g = globalThis as typeof globalThis & { __hareReviewQueue?: QueueState };

function state(): QueueState {
  if (!g.__hareReviewQueue) {
    g.__hareReviewQueue = { pending: [], inflight: new Set(), active: 0 };
  }
  return g.__hareReviewQueue;
}

export function jobKey(job: ReviewJob): string {
  return `${job.userId}:${job.owner}/${job.repo}#${job.number}`;
}

export function isStaleRunning(createdAt: string | null | undefined): boolean {
  if (!createdAt) return true;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > STALE_MS;
}

export function enqueueReview(job: ReviewJob): boolean {
  const s = state();
  const key = jobKey(job);
  const waiting = s.pending.find((p) => jobKey(p) === key);
  if (waiting) {
    if (job.force) waiting.force = true;
    return false;
  }
  if (s.inflight.has(key)) {
    if (job.force) s.pending.push({ ...job, force: true });
    return job.force === true;
  }
  s.pending.push(job);
  pump();
  return true;
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]!);
    }
  }
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function pump(): void {
  const s = state();
  while (s.active < CONCURRENCY && s.pending.length > 0) {
    const job = s.pending.shift()!;
    const key = jobKey(job);
    s.inflight.add(key);
    s.active += 1;
    void import("./engine")
      .then(({ reviewPullForUser }) => reviewPullForUser(job))
      .catch((err) => {
        console.error("[hare] queued review failed", key, err);
      })
      .finally(() => {
        s.inflight.delete(key);
        s.active -= 1;
        pump();
      });
  }
}
