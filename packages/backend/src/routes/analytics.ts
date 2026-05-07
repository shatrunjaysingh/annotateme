import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Analytics } from "../entities/Analytics";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const analyticsRepository = AppDataSource.getRepository(Analytics);

router.get("/project/:projectId", async (req: AuthRequest, res) => {
  try {
    const analytics = await analyticsRepository.find({
      where: { project: { id: req.params.projectId } },
    });

    const summary = {
      totalMetrics: analytics.length,
      metrics: analytics.reduce((acc, a) => {
        acc[a.metric] = a.value;
        return acc;
      }, {} as Record<string, number>),
      details: analytics,
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { metric, value, projectId, details } = req.body;

    const analytics = analyticsRepository.create({
      metric,
      value,
      details,
      project: { id: projectId } as any,
    });

    await analyticsRepository.save(analytics);
    res.status(201).json(analytics);
  } catch (error) {
    res.status(500).json({ error: "Failed to record analytics" });
  }
});

export default router;
