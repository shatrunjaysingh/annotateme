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

// Computes live progress for a list of projects from actual annotation data and
// merges it into the project objects. Falls back to stored values on SQL error.
async function attachLiveProgress(projects: Project[]): Promise<Project[]> {
  if (!projects.length) return projects;
  const ids = projects.map(p => p.id);
  try {
    // Total frames per project (sum of task.frameCount)
    const totalRows: any[] = await AppDataSource.query(
      `SELECT "projectId" AS pid, COALESCE(SUM("frameCount"), 0)::int AS total
       FROM tasks
       WHERE "projectId" = ANY($1::uuid[])
       GROUP BY "projectId"`,
      [ids]
    );

    // Distinct annotated frame numbers per project (via jobs → annotations)
    const annotatedRows: any[] = await AppDataSource.query(
      `SELECT t."projectId" AS pid, COUNT(DISTINCT a."frameNumber")::int AS annotated
       FROM annotations a
       JOIN jobs j  ON j.id  = a."jobId"
       JOIN tasks t ON t.id  = j."taskId"
       WHERE t."projectId" = ANY($1::uuid[])
         AND a."jobId" IS NOT NULL
       GROUP BY t."projectId"`,
      [ids]
    );

    const totalMap     = new Map<string, number>(totalRows.map((r: any)     => [r.pid, parseInt(r.total)     || 0]));
    const annotatedMap = new Map<string, number>(annotatedRows.map((r: any) => [r.pid, parseInt(r.annotated) || 0]));

    return projects.map(p => {
      const total     = totalMap.get(p.id)     ?? 0;
      const annotated = annotatedMap.get(p.id) ?? 0;
      return Object.assign(p, {
        totalItems:     total,
        annotatedItems: annotated,
        progress:       total > 0 ? Math.round((annotated / total) * 100) : 0,
      });
    });
  } catch (err) {
    console.error('[attachLiveProgress] progress query failed, using stored values:', err);
    return projects;
  }
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
      // Non-admin: projects they created, in their tenants, or where they have an assigned task/job
      const tenantIds = await getUserTenantIds(userId);
      const rows = await AppDataSource.query(
        `SELECT DISTINCT p.id FROM projects p
         LEFT JOIN organizations o  ON o.id  = p."organizationId"
         LEFT JOIN tasks t          ON t."projectId" = p.id
         LEFT JOIN jobs  j          ON j."taskId"    = t.id
         WHERE p."createdById" = $1
            OR (o.id IS NOT NULL AND o.id = ANY($2::uuid[]))
            OR t."assigneeId"  = $1
            OR j."assigneeId"  = $1`,
        [userId, tenantIds]
      );
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

    res.json(await attachLiveProgress(projects));
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

    const [withProgress] = await attachLiveProgress([project]);
    res.json(withProgress);
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

    const db = AppDataSource;
    const pid = req.params.id;

    // Must delete in FK dependency order before removing the project row.
    // Tasks cascade on delete, but the direct project→* links do not.
    await db.query(`DELETE FROM annotation_labels WHERE "annotationId" IN (SELECT id FROM annotations WHERE "projectId" = $1)`, [pid]);
    await db.query(`DELETE FROM annotations WHERE "projectId" = $1`, [pid]);
    await db.query(`DELETE FROM collaborations WHERE "projectId" = $1`, [pid]);
    await db.query(`DELETE FROM analytics WHERE "projectId" = $1`, [pid]);
    await db.query(`DELETE FROM labels WHERE "projectId" = $1`, [pid]);
    // Files linked directly to project (not via task) — task-linked files removed via task CASCADE
    await db.query(`DELETE FROM files WHERE "projectId" = $1 AND "taskId" IS NULL`, [pid]);
    // Tasks (and their jobs/files) cascade from the project FK
    await db.query(`DELETE FROM tasks WHERE "projectId" = $1`, [pid]);

    await projectRepository.remove(project);
    res.status(204).send();
  } catch (error: any) {
    console.error("Project delete error:", error);
    res.status(500).json({ error: error.message || "Failed to delete project" });
  }
});

export default router;
