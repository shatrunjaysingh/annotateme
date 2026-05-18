import { Router } from "express";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { User } from "../entities/User";
import { authMiddleware, roleMiddleware, AuthRequest } from "../middlewares/auth";

const router = Router();
router.use(authMiddleware);

const userRepo = AppDataSource.getRepository(User);

router.get("/me", async (req: AuthRequest, res) => {
  try {
    const user = await userRepo.findOne({ where: { id: req.user!.id }, select: ["id", "email", "username", "firstName", "lastName", "role", "isActive", "createdAt"] });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.get("/", async (req: AuthRequest, res) => {
  try {
    const users = await userRepo.find({ select: ["id", "email", "username", "firstName", "lastName", "role", "isActive", "createdAt"] });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const user = await userRepo.findOne({ where: { id: req.params.id }, select: ["id", "email", "username", "firstName", "lastName", "role", "isActive", "createdAt"] });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    if (req.user!.id !== req.params.id && req.user!.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const user = await userRepo.findOne({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const { username, firstName, lastName, role, isActive, password } = req.body;
    if (username !== undefined) user.username = username;
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (role !== undefined && req.user!.role === "admin") user.role = role;
    if (isActive !== undefined && req.user!.role === "admin") user.isActive = isActive;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      user.password = await bcrypt.hash(password, 10);
    }

    await userRepo.save(user);
    res.json({ id: user.id, email: user.email, username: user.username, role: user.role, isActive: user.isActive });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/:id", roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
  try {
    const user = await userRepo.findOne({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await userRepo.remove(user);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
