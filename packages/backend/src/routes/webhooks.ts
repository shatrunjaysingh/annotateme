import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Webhook } from "../entities/Webhook";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const webhookRepo = AppDataSource.getRepository(Webhook);

// GET /api/webhooks — list all (admin only)
router.get("/", async (req: AuthRequest, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const webhooks = await webhookRepo.find({ order: { createdAt: "DESC" } });
    res.json(webhooks);
  } catch {
    res.status(500).json({ error: "Failed to fetch webhooks" });
  }
});

// POST /api/webhooks — create (admin only)
router.post("/", async (req: AuthRequest, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { url, events, secret, projectId } = req.body;

    if (!url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "url and events are required" });
    }

    const webhook = webhookRepo.create({
      url,
      events,
      secret: secret ?? null,
      projectId: projectId ?? null,
      active: true,
    });

    await webhookRepo.save(webhook);
    res.status(201).json(webhook);
  } catch {
    res.status(500).json({ error: "Failed to create webhook" });
  }
});

// PATCH /api/webhooks/:id — toggle active (admin only)
router.patch("/:id", async (req: AuthRequest, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const webhook = await webhookRepo.findOne({ where: { id: req.params.id } });
    if (!webhook) return res.status(404).json({ error: "Webhook not found" });

    const { active } = req.body;
    if (active !== undefined) webhook.active = Boolean(active);

    await webhookRepo.save(webhook);
    res.json(webhook);
  } catch {
    res.status(500).json({ error: "Failed to update webhook" });
  }
});

// DELETE /api/webhooks/:id — delete (admin only)
router.delete("/:id", async (req: AuthRequest, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const webhook = await webhookRepo.findOne({ where: { id: req.params.id } });
    if (!webhook) return res.status(404).json({ error: "Webhook not found" });

    await webhookRepo.remove(webhook);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

export default router;
