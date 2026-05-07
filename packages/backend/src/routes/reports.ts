import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string | number | null) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(row => row.map(escape).join(",")).join("\n");
}

// Drill-down endpoint — returns detail rows for clicking a count cell
router.get("/drill", async (req: AuthRequest, res) => {
  const { type, orgId, userId, label } = req.query as Record<string, string>;
  try {
    if (type === "projects" && orgId) {
      const rows = await AppDataSource.query(`
        SELECT p.id, p.name, p.status, p."dataType",
               COUNT(DISTINCT t.id)::int AS task_count,
               p."createdAt"
        FROM projects p
        LEFT JOIN tasks t ON t."projectId"::text = p.id::text
        WHERE p."organizationId"::text = $1 OR ($1 = 'none' AND p."organizationId" IS NULL)
        GROUP BY p.id, p.name, p.status, p."dataType", p."createdAt"
        ORDER BY p."createdAt" DESC
      `, [orgId === "none" ? "none" : orgId]);
      return res.json({ type: "projects", columns: ["Name", "Status", "Type", "Tasks", "Created"], rows });
    }

    if (type === "tasks" && orgId) {
      const rows = await AppDataSource.query(`
        SELECT t.id, t.name, t.status, t.subset, t."frameCount", t."annotatedFrames",
               p.name AS project_name,
               COUNT(DISTINCT j.id)::int AS job_count
        FROM tasks t
        JOIN projects p ON p.id::text = t."projectId"::text
        LEFT JOIN jobs j ON j."taskId"::text = t.id::text
        WHERE ($1 = 'none' AND p."organizationId" IS NULL)
           OR (p."organizationId"::text = $1)
        GROUP BY t.id, t.name, t.status, t.subset, t."frameCount", t."annotatedFrames", p.name
        ORDER BY t."createdAt" DESC
      `, [orgId]);
      return res.json({ type: "tasks", columns: ["Task", "Project", "Status", "Subset", "Frames", "Annotated", "Jobs"], rows });
    }

    if (type === "jobs" && orgId) {
      const rows = await AppDataSource.query(`
        SELECT j.id, j.stage, j.state, j."frameStart", j."frameEnd",
               t.name AS task_name, p.name AS project_name,
               u.username AS assignee
        FROM jobs j
        JOIN tasks t ON t.id::text = j."taskId"::text
        JOIN projects p ON p.id::text = t."projectId"::text
        LEFT JOIN users u ON u.id::text = j."assigneeId"::text
        WHERE ($1 = 'none' AND p."organizationId" IS NULL)
           OR (p."organizationId"::text = $1)
        ORDER BY j."createdAt" DESC
      `, [orgId]);
      return res.json({ type: "jobs", columns: ["Stage", "State", "Task", "Project", "Frames", "Assignee"], rows });
    }

    if (type === "user_jobs" && userId) {
      const rows = await AppDataSource.query(`
        SELECT j.id, j.stage, j.state, j."frameStart", j."frameEnd",
               t.name AS task_name, p.name AS project_name,
               j."updatedAt"
        FROM jobs j
        JOIN tasks t ON t.id::text = j."taskId"::text
        JOIN projects p ON p.id::text = t."projectId"::text
        WHERE j."assigneeId"::text = $1
        ORDER BY j."updatedAt" DESC
      `, [userId]);
      return res.json({ type: "user_jobs", columns: ["Stage", "State", "Task", "Project", "Frames", "Updated"], rows });
    }

    if (type === "user_frames" && userId) {
      const rows = await AppDataSource.query(`
        SELECT a.id, a."frameNumber",
               j.stage, j.state,
               t.name AS task_name, p.name AS project_name,
               jsonb_array_length(COALESCE(a.shapes::jsonb, '[]'::jsonb)) AS shape_count,
               a."updatedAt"
        FROM annotations a
        JOIN jobs j ON j.id::text = a."jobId"::text
        JOIN tasks t ON t.id::text = j."taskId"::text
        JOIN projects p ON p.id::text = t."projectId"::text
        WHERE j."assigneeId"::text = $1
        ORDER BY a."updatedAt" DESC
      `, [userId]);
      return res.json({ type: "user_frames", columns: ["Frame #", "Task", "Project", "Stage", "Shapes", "Updated"], rows });
    }

    if (type === "label_jobs" && label) {
      const rows = await AppDataSource.query(`
        SELECT DISTINCT j.id, j.stage, j.state,
               t.name AS task_name, p.name AS project_name,
               u.username AS assignee
        FROM annotations a
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.shapes::jsonb, '[]'::jsonb)) AS shape
        JOIN jobs j ON j.id::text = a."jobId"::text
        JOIN tasks t ON t.id::text = j."taskId"::text
        JOIN projects p ON p.id::text = t."projectId"::text
        LEFT JOIN users u ON u.id::text = j."assigneeId"::text
        WHERE shape->>'label' = $1
        ORDER BY j.stage
      `, [label]);
      return res.json({ type: "label_jobs", columns: ["Stage", "State", "Task", "Project", "Assignee"], rows });
    }

    if (type === "label_frames" && label) {
      const rows = await AppDataSource.query(`
        SELECT a."frameNumber",
               COUNT(*)::int AS shape_count,
               t.name AS task_name, p.name AS project_name,
               j.stage, j.state
        FROM annotations a
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.shapes::jsonb, '[]'::jsonb)) AS shape
        JOIN jobs j ON j.id::text = a."jobId"::text
        JOIN tasks t ON t.id::text = j."taskId"::text
        JOIN projects p ON p.id::text = t."projectId"::text
        WHERE shape->>'label' = $1
        GROUP BY a."frameNumber", t.name, p.name, j.stage, j.state
        ORDER BY shape_count DESC
      `, [label]);
      return res.json({ type: "label_frames", columns: ["Frame #", "Shapes", "Task", "Project", "Stage", "State"], rows });
    }

    res.status(400).json({ error: "Invalid drill-down type or missing parameters" });
  } catch (error: any) {
    res.status(500).json({ error: "Drill-down failed", detail: error.message });
  }
});

router.get("/by-org", async (req: AuthRequest, res) => {
  try {
    const rows = await AppDataSource.query(`
      SELECT
        COALESCE(o.id::text, 'none')                                          AS org_id,
        COALESCE(o.name, 'No Organization')                                   AS org_name,
        COUNT(DISTINCT p.id)::int                                              AS project_count,
        COUNT(DISTINCT t.id)::int                                              AS task_count,
        COUNT(DISTINCT j.id)::int                                              AS job_count,
        COUNT(DISTINCT CASE WHEN j.state = 'completed' THEN j.id END)::int    AS completed_jobs,
        COUNT(DISTINCT a.id)::int                                              AS annotated_frames
      FROM projects p
      LEFT JOIN organizations o ON o.id::text = p."organizationId"::text
      LEFT JOIN tasks t ON t."projectId"::text = p.id::text
      LEFT JOIN jobs j ON j."taskId"::text = t.id::text
      LEFT JOIN annotations a ON a."jobId"::text = j.id::text
      GROUP BY o.id, o.name
      ORDER BY project_count DESC
    `);

    if (req.query.format === "csv") {
      const csv = toCSV(
        ["Organization", "Projects", "Tasks", "Jobs", "Completed Jobs", "Annotated Frames"],
        rows.map((r: any) => [r.org_name, r.project_count, r.task_count, r.job_count, r.completed_jobs, r.annotated_frames])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="report-by-org.csv"');
      return res.send(csv);
    }

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate org report", detail: error.message });
  }
});

router.get("/by-user", async (req: AuthRequest, res) => {
  try {
    const rows = await AppDataSource.query(`
      SELECT
        u.id                                                                   AS user_id,
        u.username,
        u.email,
        u.role,
        COUNT(DISTINCT j.id)::int                                              AS assigned_jobs,
        COUNT(DISTINCT CASE WHEN j.state = 'completed' THEN j.id END)::int    AS completed_jobs,
        COUNT(DISTINCT a.id)::int                                              AS annotated_frames
      FROM users u
      LEFT JOIN jobs j ON j."assigneeId"::text = u.id::text
      LEFT JOIN annotations a ON a."jobId"::text = j.id::text
      GROUP BY u.id, u.username, u.email, u.role
      ORDER BY annotated_frames DESC, assigned_jobs DESC
    `);

    if (req.query.format === "csv") {
      const csv = toCSV(
        ["Username", "Email", "Role", "Assigned Jobs", "Completed Jobs", "Annotated Frames"],
        rows.map((r: any) => [r.username, r.email, r.role, r.assigned_jobs, r.completed_jobs, r.annotated_frames])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="report-by-user.csv"');
      return res.send(csv);
    }

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate user report", detail: error.message });
  }
});

router.get("/by-label", async (req: AuthRequest, res) => {
  try {
    const rows = await AppDataSource.query(`
      SELECT
        shape->>'label'                AS label_name,
        COUNT(*)::int                  AS shape_count,
        COUNT(DISTINCT a."jobId")::int AS job_count,
        COUNT(DISTINCT t."projectId")::int AS project_count
      FROM annotations a
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN a.shapes IS NOT NULL
          THEN a.shapes::jsonb
          ELSE '[]'::jsonb
        END
      ) AS shape
      LEFT JOIN jobs j ON j.id::text = a."jobId"::text
      LEFT JOIN tasks t ON t.id::text = j."taskId"::text
      WHERE a.shapes IS NOT NULL
        AND jsonb_array_length(a.shapes::jsonb) > 0
        AND shape->>'label' IS NOT NULL
      GROUP BY label_name
      ORDER BY shape_count DESC
    `);

    if (req.query.format === "csv") {
      const csv = toCSV(
        ["Label", "Shape Count", "Jobs", "Projects"],
        rows.map((r: any) => [r.label_name, r.shape_count, r.job_count, r.project_count])
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="report-by-label.csv"');
      return res.send(csv);
    }

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate label report", detail: error.message });
  }
});

router.get("/summary", async (req: AuthRequest, res) => {
  try {
    const [summary] = await AppDataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM projects)     AS total_projects,
        (SELECT COUNT(*)::int FROM tasks)        AS total_tasks,
        (SELECT COUNT(*)::int FROM jobs)         AS total_jobs,
        (SELECT COUNT(*)::int FROM users)        AS total_users,
        (SELECT COUNT(*)::int FROM annotations)  AS total_annotated_frames,
        (SELECT COUNT(*)::int FROM jobs WHERE state = 'completed') AS completed_jobs
    `);
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate summary", detail: error.message });
  }
});

export default router;
