import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn
} from "typeorm";
import { Project } from "./Project";
import { User } from "./User";
import { Job } from "./Job";
import { File } from "./File";

@Entity("tasks")
export class Task {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ default: "annotation", type: "enum", enum: ["annotation", "validation", "acceptance", "completed"] })
  status: "annotation" | "validation" | "acceptance" | "completed";

  @Column({ default: "Train", type: "enum", enum: ["Train", "Test", "Validation"] })
  subset: "Train" | "Test" | "Validation";

  @Column({ nullable: true })
  thumbnailUrl: string;

  @Column({ default: 0 })
  frameCount: number;

  @Column({ default: 0 })
  annotatedFrames: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.tasks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: Project;

  @Column()
  projectId: string;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: "assigneeId" })
  assignee: User;

  @Column({ nullable: true })
  assigneeId: string;

  @OneToMany(() => Job, (job) => job.task, { cascade: true })
  jobs: Job[];

  @OneToMany(() => File, (file) => file.task, { cascade: true })
  files: File[];
}
