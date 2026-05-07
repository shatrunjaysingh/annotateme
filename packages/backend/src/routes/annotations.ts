import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Annotation } from "../entities/Annotation";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const annotationRepository = AppDataSource.getRepository(Annotation);

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { fileId, data, notes, projectId } = req.body;

    const annotation = annotationRepository.create({
      fileId,
      data,
      notes,
      project: { id: projectId } as any,
    });

    await annotationRepository.save(annotation);
    res.status(201).json(annotation);
  } catch (error) {
    res.status(500).json({ error: "Failed to create annotation" });
  }
});

router.get("/project/:projectId", async (req: AuthRequest, res) => {
  try {
    const annotations = await annotationRepository.find({
      where: { project: { id: req.params.projectId } },
      relations: ["labels"],
    });
    res.json(annotations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch annotations" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const { data, notes, status, confidence } = req.body;
    const annotation = await annotationRepository.findOne({ where: { id: req.params.id } });

    if (!annotation) {
      return res.status(404).json({ error: "Annotation not found" });
    }

    if (data) annotation.data = data;
    if (notes) annotation.notes = notes;
    if (status) annotation.status = status;
    if (confidence) annotation.confidence = confidence;

    await annotationRepository.save(annotation);
    res.json(annotation);
  } catch (error) {
    res.status(500).json({ error: "Failed to update annotation" });
  }
});

export default router;
