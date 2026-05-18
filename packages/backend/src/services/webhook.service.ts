import crypto from "crypto";
import fetch from "node-fetch";
import { AppDataSource } from "../database/data-source";
import { Webhook } from "../entities/Webhook";

/**
 * Fire webhooks for a given event. Fire-and-forget — never throws.
 *
 * @param event     e.g. "job.completed", "job.stage_changed"
 * @param payload   arbitrary object included in the POST body
 * @param projectId if provided, only webhooks whose projectId matches (or is null) will fire
 */
export function fireWebhook(event: string, payload: object, projectId?: string): void {
  // Run async work in the background without blocking the caller
  _fire(event, payload, projectId).catch(() => {});
}

async function _fire(event: string, payload: object, projectId?: string): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Webhook);

    // Fetch active webhooks that listen for this event
    const webhooks = await repo
      .createQueryBuilder("w")
      .where("w.active = true")
      .getMany();

    const matching = webhooks.filter((wh) => {
      if (!wh.events.includes(event)) return false;
      // If webhook is scoped to a project, it must match the incoming projectId
      if (wh.projectId !== null && wh.projectId !== projectId) return false;
      return true;
    });

    if (matching.length === 0) return;

    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

    await Promise.allSettled(
      matching.map((wh) => _deliver(wh, body))
    );
  } catch {
    // Webhook failures must never propagate
  }
}

async function _deliver(wh: Webhook, body: string): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (wh.secret) {
      const sig = crypto
        .createHmac("sha256", wh.secret)
        .update(body)
        .digest("hex");
      headers["X-Signature"] = `sha256=${sig}`;
    }

    await fetch(wh.url, {
      method: "POST",
      headers,
      body,
      // 10-second timeout so a slow endpoint doesn't linger indefinitely
      timeout: 10000,
    } as any);
  } catch {
    // Delivery failures are silently swallowed
  }
}
