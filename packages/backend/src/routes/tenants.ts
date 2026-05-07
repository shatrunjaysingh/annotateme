import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { authMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

// GET / — list tenants
router.get("/", async (req: AuthRequest, res) => {
  try {
    const isAdmin = req.user!.role === "admin";
    let rows: any[];

    if (isAdmin) {
      rows = await AppDataSource.query(`
        SELECT o.id, o.name, o.description, o."createdAt", o."updatedAt",
               COUNT(uo."usersId") AS "memberCount"
        FROM organizations o
        LEFT JOIN user_organizations uo ON uo."organizationsId" = o.id
        GROUP BY o.id
        ORDER BY o."createdAt" DESC
      `);
    } else {
      rows = await AppDataSource.query(`
        SELECT o.id, o.name, o.description, o."createdAt", o."updatedAt",
               COUNT(uo2."usersId") AS "memberCount"
        FROM organizations o
        JOIN user_organizations uo ON uo."organizationsId" = o.id AND uo."usersId" = $1
        LEFT JOIN user_organizations uo2 ON uo2."organizationsId" = o.id
        GROUP BY o.id
        ORDER BY o."createdAt" DESC
      `, [req.user!.id]);
    }

    res.json(rows.map((r: any) => ({ ...r, memberCount: parseInt(r.memberCount, 10) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// POST / — create tenant (admin only)
router.post("/", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const [org] = await AppDataSource.query(`
      INSERT INTO organizations (id, name, description, "createdAt", "updatedAt", "ownerId")
      VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), $3)
      RETURNING *
    `, [name, description || null, req.user!.id]);

    // Auto-assign creator as member
    await AppDataSource.query(`
      INSERT INTO user_organizations ("usersId", "organizationsId")
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [req.user!.id, org.id]);

    res.status(201).json(org);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

// PATCH /:id — update tenant (admin only)
router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, description } = req.body;
    const [org] = await AppDataSource.query(`
      UPDATE organizations
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          "updatedAt" = NOW()
      WHERE id = $3
      RETURNING *
    `, [name || null, description !== undefined ? description : null, req.params.id]);

    if (!org) return res.status(404).json({ error: "Tenant not found" });

    res.json(org);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

// DELETE /:id — delete tenant (admin only)
router.delete("/:id", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    await AppDataSource.query(`DELETE FROM organizations WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete tenant" });
  }
});

// GET /:id/users — list users in tenant
router.get("/:id/users", async (req: AuthRequest, res) => {
  try {
    const rows = await AppDataSource.query(`
      SELECT u.id, u.username, u.email, u.role, u."firstName", u."lastName", u."isActive", u."createdAt"
      FROM users u
      JOIN user_organizations uo ON uo."usersId" = u.id
      WHERE uo."organizationsId" = $1
      ORDER BY u.username ASC
    `, [req.params.id]);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch tenant users" });
  }
});

// POST /:id/users — assign user to tenant
router.post("/:id/users", async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    // Check if already a member
    const existing = await AppDataSource.query(`
      SELECT 1 FROM user_organizations WHERE "usersId" = $1 AND "organizationsId" = $2
    `, [userId, req.params.id]);

    if (existing.length > 0) {
      return res.status(409).json({ error: "User is already a member of this tenant" });
    }

    await AppDataSource.query(`
      INSERT INTO user_organizations ("usersId", "organizationsId") VALUES ($1, $2)
    `, [userId, req.params.id]);

    res.status(201).json({ message: "User added to tenant" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add user to tenant" });
  }
});

// DELETE /:id/users/:userId — remove user from tenant
router.delete("/:id/users/:userId", async (req: AuthRequest, res) => {
  try {
    await AppDataSource.query(`
      DELETE FROM user_organizations WHERE "usersId" = $1 AND "organizationsId" = $2
    `, [req.params.userId, req.params.id]);

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to remove user from tenant" });
  }
});

export default router;
