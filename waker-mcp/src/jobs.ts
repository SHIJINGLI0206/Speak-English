export type WakeStatus = "queued" | "claimed" | "packet_sent" | "failed";

export interface WakeJob {
  id: string;
  owner_id: string;
  status: WakeStatus;
  created_at: number;
  expires_at: number;
  claimed_at: number | null;
  updated_at: number;
  detail: string | null;
}

const QUEUE_TTL_SECONDS = 90;
const DEDUPE_SECONDS = 60;

export async function enqueueWake(db: D1Database, ownerId: string, now = Math.floor(Date.now() / 1000)): Promise<WakeJob> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO wake_jobs (id, owner_id, status, created_at, expires_at, updated_at)
     SELECT ?, ?, 'queued', ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM wake_jobs WHERE owner_id = ? AND created_at > ?
     )`,
  ).bind(id, ownerId, now, now + QUEUE_TTL_SECONDS, now, ownerId, now - DEDUPE_SECONDS).run();

  const job = await db.prepare(
    `SELECT * FROM wake_jobs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(ownerId).first<WakeJob>();
  if (!job) throw new Error("Wake request could not be queued");
  return job;
}

export async function getWakeJob(db: D1Database, ownerId: string, id: string): Promise<WakeJob | null> {
  return db.prepare(`SELECT * FROM wake_jobs WHERE id = ? AND owner_id = ?`).bind(id, ownerId).first<WakeJob>();
}

export async function claimWake(db: D1Database, now = Math.floor(Date.now() / 1000)): Promise<WakeJob | null> {
  return db.prepare(
    `UPDATE wake_jobs
     SET status = 'claimed', claimed_at = ?, updated_at = ?
     WHERE id = (
       SELECT id FROM wake_jobs
       WHERE status = 'queued' AND expires_at > ?
       ORDER BY created_at ASC LIMIT 1
     ) AND status = 'queued'
     RETURNING *`,
  ).bind(now, now, now).first<WakeJob>();
}

export async function finishWake(db: D1Database, id: string, status: "packet_sent" | "failed", now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE wake_jobs SET status = ?, updated_at = ?
     WHERE id = ? AND status = 'claimed' AND claimed_at > ?`,
  ).bind(status, now, id, now - 120).run();
  return result.meta.changes === 1;
}
