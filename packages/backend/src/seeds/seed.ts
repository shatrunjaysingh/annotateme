import { AppDataSource } from "../database/data-source";
import { User } from "../entities/User";
import { Organization } from "../entities/Organization";
import { Project } from "../entities/Project";
import { File } from "../entities/File";
import { Annotation } from "../entities/Annotation";
import { AnnotationLabel } from "../entities/AnnotationLabel";
import { Collaboration } from "../entities/Collaboration";
import { Analytics } from "../entities/Analytics";
import bcrypt from "bcryptjs";

async function seedDatabase() {
  try {
    await AppDataSource.initialize();
    console.log("Database connection established");

    const userRepository = AppDataSource.getRepository(User);
    const organizationRepository = AppDataSource.getRepository(Organization);
    const projectRepository = AppDataSource.getRepository(Project);
    const fileRepository = AppDataSource.getRepository(File);
    const annotationRepository = AppDataSource.getRepository(Annotation);
    const collaborationRepository = AppDataSource.getRepository(Collaboration);
    const analyticsRepository = AppDataSource.getRepository(Analytics);

    // Clear existing data
    console.log("Clearing existing data...");
    await annotationRepository.clear();
    await fileRepository.clear();
    await collaborationRepository.clear();
    await projectRepository.clear();
    await organizationRepository.clear();
    await userRepository.clear();
    await analyticsRepository.clear();

    // Create seed users
    console.log("Creating seed users...");
    const admin = userRepository.create({
      email: "admin@annotateme.com",
      username: "admin",
      password: await bcrypt.hash("password123", 10),
      firstName: "Admin",
      lastName: "User",
      role: "admin",
    });

    const manager = userRepository.create({
      email: "manager@annotateme.com",
      username: "manager",
      password: await bcrypt.hash("password123", 10),
      firstName: "Manager",
      lastName: "User",
      role: "manager",
    });

    const annotator1 = userRepository.create({
      email: "annotator1@annotateme.com",
      username: "annotator1",
      password: await bcrypt.hash("password123", 10),
      firstName: "John",
      lastName: "Annotator",
      role: "user",
    });

    const annotator2 = userRepository.create({
      email: "annotator2@annotateme.com",
      username: "annotator2",
      password: await bcrypt.hash("password123", 10),
      firstName: "Jane",
      lastName: "Annotator",
      role: "user",
    });

    await userRepository.save([admin, manager, annotator1, annotator2]);
    console.log("✓ Created 4 seed users");

    // Create organizations
    console.log("Creating organizations...");
    const org1 = organizationRepository.create({
      name: "TechCorp",
      description: "Technology annotation company",
      owner: admin,
    });

    const org2 = organizationRepository.create({
      name: "DataLabs",
      description: "Data annotation laboratory",
      owner: manager,
    });

    await organizationRepository.save([org1, org2]);
    console.log("✓ Created 2 organizations");

    // Create projects
    console.log("Creating projects...");
    const project1 = projectRepository.create({
      name: "Object Detection - Dataset 1",
      description: "Annotate objects in images",
      dataType: "image",
      labelSet: ["car", "person", "bicycle", "dog", "cat"],
      totalItems: 100,
      annotatedItems: 45,
      progress: 45,
      organization: org1,
      createdBy: admin,
      status: "active",
    });

    const project2 = projectRepository.create({
      name: "Text Classification - Sentiment",
      description: "Classify sentiment of reviews",
      dataType: "text",
      labelSet: ["positive", "negative", "neutral"],
      totalItems: 200,
      annotatedItems: 120,
      progress: 60,
      organization: org1,
      createdBy: manager,
      status: "active",
    });

    const project3 = projectRepository.create({
      name: "Audio Transcription",
      description: "Transcribe and label audio clips",
      dataType: "audio",
      labelSet: ["speech", "music", "noise", "silence"],
      totalItems: 50,
      annotatedItems: 50,
      progress: 100,
      organization: org2,
      createdBy: manager,
      status: "completed",
    });

    await projectRepository.save([project1, project2, project3]);
    console.log("✓ Created 3 projects");

    // Create files
    console.log("Creating sample files...");
    const files = [];
    for (let i = 1; i <= 10; i++) {
      const file = fileRepository.create({
        originalName: `sample_image_${i}.jpg`,
        fileName: `sample_image_${i}_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        size: Math.floor(Math.random() * 5000000) + 1000000,
        path: `/uploads/project1/sample_image_${i}.jpg`,
        status: i <= 5 ? "completed" : "pending",
        project: project1,
      });
      files.push(file);
    }
    await fileRepository.save(files);
    console.log("✓ Created 10 sample files");

    // Create annotations
    console.log("Creating sample annotations...");
    const annotations = [];
    for (let i = 0; i < 5; i++) {
      const annotation = annotationRepository.create({
        fileId: files[i].id,
        data: {
          boxes: [
            {
              x: Math.random() * 100,
              y: Math.random() * 100,
              width: Math.random() * 50 + 10,
              height: Math.random() * 50 + 10,
              label: "car",
            },
          ],
        },
        notes: `Sample annotation for file ${i + 1}`,
        status: "completed",
        confidence: Math.random() * 0.5 + 0.5,
        project: project1,
      });
      annotations.push(annotation);
    }
    await annotationRepository.save(annotations);
    console.log("✓ Created 5 sample annotations");

    // Create annotation labels
    console.log("Creating annotation labels...");
    for (let annotation of annotations) {
      const label = AppDataSource.getRepository(AnnotationLabel).create({
        label: "car",
        coordinates: { x: 10, y: 20, width: 50, height: 60 },
        confidence: 0.95,
        annotation,
      });
      await AppDataSource.getRepository(AnnotationLabel).save(label);
    }
    console.log("✓ Created annotation labels");

    // Create collaborations
    console.log("Creating collaborations...");
    const collab1 = collaborationRepository.create({
      role: "annotator",
      canEdit: true,
      canDelete: false,
      canInvite: false,
      project: project1,
      user: annotator1,
    });

    const collab2 = collaborationRepository.create({
      role: "annotator",
      canEdit: true,
      canDelete: false,
      canInvite: false,
      project: project1,
      user: annotator2,
    });

    const collab3 = collaborationRepository.create({
      role: "manager",
      canEdit: true,
      canDelete: true,
      canInvite: true,
      project: project2,
      user: manager,
    });

    await collaborationRepository.save([collab1, collab2, collab3]);
    console.log("✓ Created collaborations");

    // Create analytics
    console.log("Creating analytics records...");
    const analytics = [
      analyticsRepository.create({
        metric: "completion_rate",
        value: 45,
        details: { date: new Date() },
        project: project1,
      }),
      analyticsRepository.create({
        metric: "avg_annotation_time",
        value: 5.5,
        details: { unit: "minutes" },
        project: project1,
      }),
      analyticsRepository.create({
        metric: "total_annotations",
        value: 45,
        details: { completed: 45, pending: 55 },
        project: project1,
      }),
      analyticsRepository.create({
        metric: "avg_confidence",
        value: 0.87,
        details: { min: 0.65, max: 0.99 },
        project: project1,
      }),
      analyticsRepository.create({
        metric: "completion_rate",
        value: 60,
        details: { date: new Date() },
        project: project2,
      }),
      analyticsRepository.create({
        metric: "completion_rate",
        value: 100,
        details: { date: new Date() },
        project: project3,
      }),
    ];
    await analyticsRepository.save(analytics);
    console.log("✓ Created 6 analytics records");

    console.log("\n✅ Database seeding completed successfully!");
    console.log("\nSeed Data Summary:");
    console.log("==================");
    console.log("Users (4):");
    console.log("  - admin@annotateme.com (admin)");
    console.log("  - manager@annotateme.com (manager)");
    console.log("  - annotator1@annotateme.com (user)");
    console.log("  - annotator2@annotateme.com (user)");
    console.log("\nPassword for all users: password123");
    console.log("\nOrganizations (2): TechCorp, DataLabs");
    console.log("Projects (3): Various annotation tasks");
    console.log("Sample Files (10): Image files ready for annotation");
    console.log("Sample Annotations (5): Pre-annotated examples");

    await AppDataSource.destroy();
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();
