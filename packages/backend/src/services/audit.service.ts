import { AppDataSource } from "../database/data-source";
import { TaskAudit, TaskAuditAction } from "../entities/TaskAudit";
import { JobAudit, JobAuditAction } from "../entities/JobAudit";

export async function logTaskAudit(params: {
  taskId: string;
  userId?: string;
  action: TaskAuditAction;
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
}): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(TaskAudit);
    await repo.save(repo.create({
      taskId: params.taskId,
      userId: params.userId ?? null,
      action: params.action,
      changes: params.changes ?? null,
      note: params.note ?? null,
    }));
  } catch {
    // Audit failures must never break the main request
  }
}

export async function logJobAudit(params: {
  jobId: string;
  taskId?: string;
  userId?: string;
  action: JobAuditAction;
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
}): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(JobAudit);
    await repo.save(repo.create({
      jobId: params.jobId,
      taskId: params.taskId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      changes: params.changes ?? null,
      note: params.note ?? null,
    }));
  } catch {
    // Audit failures must never break the main request
  }
}

/**
 * Computes a diff between two plain objects, returning only fields that changed.
 * Skips undefined values in `next` (fields not being updated).
 */
export function diffFields<T extends Record<string, unknown>>(
  prev: T,
  next: Partial<T>,
  fields: (keyof T)[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (next[field] === undefined) continue;
    if (prev[field] !== next[field]) {
      changes[field as string] = { from: prev[field], to: next[field] };
    }
  }
  return changes;
}
