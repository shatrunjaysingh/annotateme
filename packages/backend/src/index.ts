import "reflect-metadata";
import path from "path";
import express, { Express } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { AppDataSource } from "./database/data-source";
import authRoutes from "./routes/auth";
import projectRoutes from "./routes/projects";
import annotationRoutes from "./routes/annotations";
import analyticsRoutes from "./routes/analytics";
import importExportRoutes from "./routes/import-export";
import extendedFormatsRoutes from "./routes/extended-formats";
import labelsRoutes from "./routes/labels";
import taskRoutes from "./routes/tasks";
import jobRoutes from "./routes/jobs";
import userRoutes from "./routes/users";
import fileRoutes from "./routes/files";
import reportRoutes from "./routes/reports";
import tenantRoutes from "./routes/tenants";
import aiRoutes from "./routes/ai";
import auditRoutes from "./routes/audits";
import webhookRoutes from "./routes/webhooks";
import shapeIssuesRouter from "./routes/shapeIssues";

const app: Express = express();
const httpServer = createServer(app);

// WebSocket for real-time collaboration
const io = new SocketServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  socket.on("join-job", (jobId: string) => socket.join(`job-${jobId}`));
  socket.on("leave-job", (jobId: string) => socket.leave(`job-${jobId}`));
  socket.on("annotation-update", (data: any) => {
    socket.to(`job-${data.jobId}`).emit("annotation-update", data);
  });
  socket.on("cursor-move", (data: any) => {
    socket.to(`job-${data.jobId}`).emit("cursor-move", data);
  });
});

// Export io for use in routes
export { io };

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Serve uploaded files
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(UPLOAD_DIR));

// Serve frontend build in production
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));
}

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/users", userRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/annotations", annotationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/import-export", importExportRoutes);
app.use("/api/formats", extendedFormatsRoutes);
app.use("/api/labels", labelsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/audits", auditRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/shape-issues", shapeIssuesRouter);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Frontend fallback in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

const PORT = process.env.PORT || 3000;

AppDataSource.initialize()
  .then(() => {
    console.log("Database connection established");
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
