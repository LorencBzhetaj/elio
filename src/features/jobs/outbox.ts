import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { outboxJobs } from '../../db/schema';

export type JobType = 'purchase-email' | 'access-link-email' | 'owner-alert';

/** Insert-once job. The unique key makes enqueueing idempotent across retries and duplicate events. */
export async function enqueueJob(db: Db | Parameters<Parameters<Db['transaction']>[0]>[0], job: { uniqueKey: string; type: JobType; payload: Record<string, unknown>; maxAttempts?: number }) {
  await db
    .insert(outboxJobs)
    .values({ uniqueKey: job.uniqueKey, type: job.type, payload: job.payload, maxAttempts: job.maxAttempts ?? 6 })
    .onConflictDoNothing();
}

/** 1 min, 5 min, 15 min, 1 h, 6 h … */
export function backoffMs(attempt: number): number {
  const steps = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];
  return steps[Math.min(attempt - 1, steps.length - 1)];
}

export type JobHandler = (payload: Record<string, unknown>, job: { id: string; attempts: number }) => Promise<void>;

export interface RunResult {
  claimed: number;
  done: number;
  retried: number;
  failed: number;
}

/**
 * Claims due jobs with SKIP LOCKED (safe with several workers), runs them, and schedules retries.
 * When a job exhausts its attempts it is marked failed and an owner alert is enqueued.
 * A failed email never changes payment or entitlement state.
 */
export async function runOutboxOnce(db: Db, handlers: Record<JobType, JobHandler>, now = new Date(), batch = 10): Promise<RunResult> {
  const lease = new Date(now.getTime() + 5 * 60_000);
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: outboxJobs.id })
      .from(outboxJobs)
      .where(
        or(
          and(eq(outboxJobs.status, 'pending'), lte(outboxJobs.nextAttemptAt, now)),
          and(eq(outboxJobs.status, 'processing'), lte(outboxJobs.lockedUntil, now)),
        ),
      )
      .orderBy(outboxJobs.nextAttemptAt)
      .limit(batch)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(outboxJobs)
      .set({ status: 'processing', lockedUntil: lease, attempts: sql`${outboxJobs.attempts} + 1`, updatedAt: now })
      .where(inArray(outboxJobs.id, due.map((d) => d.id)))
      .returning();
  });

  const result: RunResult = { claimed: claimed.length, done: 0, retried: 0, failed: 0 };
  for (const job of claimed) {
    const handler = handlers[job.type as JobType];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job.payload, { id: job.id, attempts: job.attempts });
      await db.update(outboxJobs).set({ status: 'done', lockedUntil: null, lastError: null, updatedAt: new Date() }).where(eq(outboxJobs.id, job.id));
      result.done++;
    } catch (err) {
      const message = String((err as Error)?.message ?? err).slice(0, 500);
      if (job.attempts >= job.maxAttempts) {
        await db.update(outboxJobs).set({ status: 'failed', lockedUntil: null, lastError: message, updatedAt: new Date() }).where(eq(outboxJobs.id, job.id));
        if (job.type !== 'owner-alert') {
          await enqueueJob(db, {
            uniqueKey: `owner-alert:job-failed:${job.id}`,
            type: 'owner-alert',
            payload: { kind: 'job_failed', jobId: job.id, jobType: job.type, error: message },
          });
        }
        result.failed++;
      } else {
        await db
          .update(outboxJobs)
          .set({ status: 'pending', lockedUntil: null, lastError: message, nextAttemptAt: new Date(now.getTime() + backoffMs(job.attempts)), updatedAt: new Date() })
          .where(eq(outboxJobs.id, job.id));
        result.retried++;
      }
    }
  }
  return result;
}
