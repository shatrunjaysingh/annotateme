import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { User } from "../entities/User";

const router = Router();
const userRepository = AppDataSource.getRepository(User);

router.post("/register", async (req, res) => {
  try {
    const { email, username, password, firstName, lastName, role } = req.body;

    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = userRepository.create({
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      role: role || 'user',
    });

    await userRepository.save(user);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: "7d" }
    );

    res.status(201).json({ user: { id: user.id, email, username, role: user.role }, token });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: "7d" }
    );

    const userWithOrgs = await userRepository.findOne({
      where: { id: user.id },
      relations: ['organizations'],
    });
    const tenants = (userWithOrgs?.organizations || []).map(o => ({ id: o.id, name: o.name }));

    res.json({ user: { id: user.id, email, username: user.username, role: user.role }, token, tenants });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
