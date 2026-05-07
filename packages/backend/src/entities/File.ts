import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Project } from "./Project";
import { Task } from "./Task";

@Entity("files")
export class File {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  originalName: string;

  @Column()
  fileName: string;

  @Column()
  mimeType: string;

  @Column()
  size: number;

  @Column()
  path: string;

  @Column({ nullable: true })
  url: string;

  @Column({ default: 0 })
  frameNumber: number;

  @Column({ default: "pending", type: "enum", enum: ["pending", "processing", "completed", "failed"] })
  status: "pending" | "processing" | "completed" | "failed";

  @CreateDateColumn()
  uploadedAt: Date;

  @ManyToOne(() => Project, (project) => project.files, { nullable: true })
  project: Project;

  @Column({ nullable: true })
  projectId: string;

  @ManyToOne(() => Task, (task) => task.files, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "taskId" })
  task: Task;

  @Column({ nullable: true })
  taskId: string;
}
