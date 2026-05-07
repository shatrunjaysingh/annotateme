const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Mock auth routes
app.post("/api/auth/register", (req, res) => {
  const { email, username, password } = req.body;
  const token = "mock-jwt-token-" + Math.random().toString(36);
  res.json({ 
    user: { id: "mock-id", email, username },
    token 
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const token = "mock-jwt-token-" + Math.random().toString(36);
  res.json({ 
    user: { id: "mock-id", email, username: email.split("@")[0] },
    token 
  });
});

// Mock projects routes
app.get("/api/projects", (req, res) => {
  res.json([
    {
      id: "1",
      name: "Object Detection - Dataset 1",
      description: "Annotate objects in images",
      dataType: "image",
      labelSet: ["car", "person", "bicycle", "dog", "cat"],
      totalItems: 100,
      annotatedItems: 45,
      progress: 45,
      status: "active",
      createdAt: new Date(),
    },
    {
      id: "2",
      name: "Text Classification - Sentiment",
      description: "Classify sentiment of reviews",
      dataType: "text",
      labelSet: ["positive", "negative", "neutral"],
      totalItems: 200,
      annotatedItems: 120,
      progress: 60,
      status: "active",
      createdAt: new Date(),
    },
  ]);
});

app.get("/api/projects/:id", (req, res) => {
  res.json({
    id: req.params.id,
    name: "Sample Project",
    description: "Sample project description",
    dataType: "image",
    labelSet: ["car", "person", "bicycle"],
    totalItems: 100,
    annotatedItems: 45,
    progress: 45,
  });
});

app.post("/api/projects", (req, res) => {
  res.status(201).json({
    id: "new-project-id",
    ...req.body,
    createdAt: new Date(),
  });
});

// Mock labels routes
app.get("/api/labels/:projectId", (req, res) => {
  res.json({
    count: 5,
    labels: [
      { id: "1", name: "car", color: "#FF6B6B", source: "auto_extracted", category: "vehicle" },
      { id: "2", name: "person", color: "#4ECDC4", source: "auto_extracted", category: "human" },
      { id: "3", name: "bicycle", color: "#45B7D1", source: "user_created", category: "vehicle" },
    ],
  });
});

app.post("/api/labels/:projectId/extract-labels", (req, res) => {
  res.json({
    message: "Labels extracted successfully",
    count: 3,
    extracted_labels: [
      { name: "car", color: "#FF6B6B", count: 0, category: "vehicle" },
      { name: "person", color: "#4ECDC4", count: 0, category: "human" },
      { name: "bicycle", color: "#45B7D1", count: 0, category: "vehicle" },
    ],
  });
});

app.post("/api/labels/:projectId/auto-create-labels", (req, res) => {
  res.status(201).json({
    message: "Labels created automatically",
    created_count: 3,
    labels: [
      { id: "1", name: "car", color: "#FF6B6B", source: "auto_extracted" },
      { id: "2", name: "person", color: "#4ECDC4", source: "auto_extracted" },
      { id: "3", name: "bicycle", color: "#45B7D1", source: "auto_extracted" },
    ],
  });
});

app.get("/api/labels/:projectId/stats", (req, res) => {
  res.json({
    total_labels: 5,
    auto_extracted: 3,
    user_created: 2,
    by_category: {
      vehicle: 2,
      human: 2,
      general: 1,
    },
  });
});

// Mock annotations routes
app.get("/api/annotations/project/:projectId", (req, res) => {
  res.json([
    { id: "1", fileId: "img1.jpg", status: "completed", data: { objects: [] } },
    { id: "2", fileId: "img2.jpg", status: "in_progress", data: { objects: [] } },
  ]);
});

// Mock analytics routes
app.get("/api/analytics/project/:projectId", (req, res) => {
  res.json({
    total_metrics: 4,
    metrics: {
      completion_rate: 45,
      avg_annotation_time: 5.5,
      total_annotations: 45,
      avg_confidence: 0.87,
    },
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Mock API server running on port ${PORT}`);
});
