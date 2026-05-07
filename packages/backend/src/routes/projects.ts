import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { Project } from "../entities/Project";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const projectRepository = AppDataSource.getRepository(Project);

async function getUserTenantIds(userId: string): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT "organizationsId" FROM user_organizations WHERE "usersId" = $1`,
    [userId]
  );
  return rows.map((r: any) => r.organizationsId);
}

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { name, description, dataType, labelSet, organizationId } = req.body;

    const project = projectRepository.create({
      name,
      description,
      dataType,
      labelSet,
      createdBy: { id: req.user!.id } as any,
      organization: { id: organizationId } as any,
    });

    await projectRepository.save(project);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/", async (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user!.role === "admin" || req.user!.role === "manager";
    const { tenantId } = req.query;
    const userId = req.user!.id;

    let projects: Project[];

    if (tenantId) {
      // Filter by specific tenant; verify access
      if (!isAdmin) {
        const tenantIds = await getUserTenantIds(userId);
        if (!tenantIds.includes(tenantId as string)) {
          return res.status(403).json({ error: "Access denied to this tenant" });
        }
      }
      projects = await projectRepository.find({
        where: { organization: { id: tenantId as string } },
        relations: ["organization", "createdBy", "collaborators", "tasks"],
        order: { createdAt: "DESC" },
      });
    } else if (isAdmin) {
      projects = await projectRepository.find({
        relations: ["organization", "createdBy", "collaborators", "tasks"],
        order: { createdAt: "DESC" },
      });
    } else {
      // Non-admin without tenantId: show projects in their tenants OR created by them
      const tenantIds = await getUserTenantIds(userId);
      if (tenantIds.length === 0) {
        // No tenants: only own projects
        projects = await projectRepository.find({
          where: { createdBy: { id: userId } },
          relations: ["organization", "createdBy", "collaborators", "tasks"],
          order: { createdAt: "DESC" },
        });
      } else {
        // Projects in their tenants OR created by them
        const rows = await AppDataSource.query(`
          SELECT DISTINCT p.id FROM projects p
          LEFT JOIN organizations o ON o.id = p."organizationId"
          WHERE p."createdById" = $1
             OR (o.id IS NOT NULL AND o.id = ANY($2::uuid[]))
        `, [userId, tenantIds]);
        const ids = rows.map((r: any) => r.id);
        if (ids.length === 0) {
          projects = [];
        } else {
          projects = await projectRepository
            .createQueryBuilder("p")
            .leftJoinAndSelect("p.organization", "organization")
            .leftJoinAndSelect("p.createdBy", "createdBy")
            .leftJoinAndSelect("p.collaborators", "collaborators")
            .leftJoinAndSelect("p.tasks", "tasks")
            .where("p.id IN (:...ids)", { ids })
            .orderBy("p.createdAt", "DESC")
            .getMany();
        }
      }
    }

    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const project = await projectRepository.findOne({
      where: { id: req.params.id },
      relations: ["organization", "createdBy", "files", "annotations", "collaborators"],
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const { name, description, status, labelSet } = req.body;
    const project = await projectRepository.findOne({ where: { id: req.params.id } });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (name) project.name = name;
    if (description) project.description = description;
    if (status) project.status = status;
    if (labelSet) project.labelSet = labelSet;

    await projectRepository.save(project);
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const project = await projectRepository.findOne({ where: { id: req.params.id } });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await projectRepository.remove(project);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
