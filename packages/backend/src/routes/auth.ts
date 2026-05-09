import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
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

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await userRepository.findOne({ where: { email } });
    // Always return success to avoid leaking whether an email exists
    if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await userRepository.save(user);

    const domain = process.env.APP_DOMAIN;
    const appUrl = domain ? `https://${domain}` : (process.env.APP_URL || "http://localhost:4200");
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || "noreply@annotateme.com",
        to: email,
        subject: "AnnotateMe — Password Reset",
        html: `
          <p>You requested a password reset for your AnnotateMe account.</p>
          <p><a href="${resetUrl}" style="padding:10px 20px;background:#1890ff;color:#fff;border-radius:6px;text-decoration:none">Reset Password</a></p>
          <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          <p style="color:#999;font-size:12px">${resetUrl}</p>
        `,
      });
    } else {
      // Dev mode: log and return link so it can be used without SMTP
      console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
      return res.json({ message: "If that email exists, a reset link has been sent.", devResetUrl: resetUrl });
    }

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password are required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const user = await userRepository.findOne({ where: { resetPasswordToken: token } });
    if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ error: "Reset link is invalid or has expired" });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null as any;
    user.resetPasswordExpires = null as any;
    await userRepository.save(user);

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;
