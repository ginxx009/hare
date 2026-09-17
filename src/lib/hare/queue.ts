export type ReviewJob = {
  userId: string;
  owner: string;
  repo: string;
  number: number;
  force?: boolean;
  useLiveModel?: boolean;
};

export type ReviewJobResult = { ok: boolean; error?: string };

const CONCURRENCY = 4;
const STALE_MS = 90 * 1000;

type QueuedJob = ReviewJob & {
  resolve: (result: ReviewJobResult) => void;
};

type QueueState = {
  pending: QueuedJob[];
  inflight: Map<string, Promise<ReviewJobResult>>;
  active: number;
};

const g = globalThis as typeof globalThis & { __hareReviewQueue?: QueueState };

function state(): QueueState {
  if (!g.__hareReviewQueue) {
    g.__hareReviewQueue = { pending: [], inflight: new Map(), active: 0 };
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

export function enqueueAndWait(job: ReviewJob): Promise<ReviewJobResult> {
  const s = state();
  const key = jobKey(job);
  const running = s.inflight.get(key);
  if (running && !job.force) return running;

  const waiting = s.pending.find((p) => jobKey(p) === key);
  if (waiting && !job.force) {
    return new Promise((resolve) => {
      const prev = waiting.resolve;
      waiting.resolve = (result) => {
        prev(result);
        resolve(result);
      };
    });
  }

  return new Promise((resolve) => {
    s.pending.push({ ...job, resolve });
    pump();
  });
}

export function enqueueReview(job: ReviewJob): boolean {
  void enqueueAndWait(job);
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
    s.active += 1;
    const run = import("./engine")
      .then(({ reviewPullForUser }) => reviewPullForUser(job))
      .catch((err) => {
        console.error("[hare] queued review failed", key, err);
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Review failed",
        };
      })
      .finally(() => {
        s.inflight.delete(key);
        s.active -= 1;
        pump();
      });
    s.inflight.set(key, run);
    void run.then(job.resolve, (err) =>
      job.resolve({
        ok: false,
        error: err instanceof Error ? err.message : "Review failed",
      }),
    );
  }
}
