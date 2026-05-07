import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Organization } from "../entities/Organization";
import { Project } from "../entities/Project";
import { Annotation } from "../entities/Annotation";
import { AnnotationLabel } from "../entities/AnnotationLabel";
import { File } from "../entities/File";
import { Collaboration } from "../entities/Collaboration";
import { Analytics } from "../entities/Analytics";
import { Task } from "../entities/Task";
import { Job } from "../entities/Job";
import { Label } from "../entities/Label";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "annotateme",
  password: process.env.DB_PASSWORD || "annotateme",
  database: process.env.DB_NAME || "annotateme",
  synchronize: true,
  logging: process.env.NODE_ENV === "development",
  entities: [User, Organization, Project, Annotation, AnnotationLabel, File, Collaboration, Analytics, Task, Job, Label],
  migrations: [],
  subscribers: [],
  extra: {
    max: 20,
    min: 5,
    acquire: 30000,
    idle: 10000,
  },
});
