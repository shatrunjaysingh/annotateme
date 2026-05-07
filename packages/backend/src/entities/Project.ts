import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from "typeorm";
import { Organization } from "./Organization";
import { User } from "./User";
import { Annotation } from "./Annotation";
import { File } from "./File";
import { Collaboration } from "./Collaboration";
import { Analytics } from "./Analytics";
import { Task } from "./Task";

@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: "in_progress" })
  status: string;

  @Column({ default: "image", type: "enum", enum: ["image", "text", "audio", "video"] })
  dataType: "image" | "text" | "audio" | "video";

  @Column({ type: "json", default: () => "'[]'" })
  labelSet: string[];

  @Column({ default: 0 })
  totalItems: number;

  @Column({ default: 0 })
  annotatedItems: number;

  @Column({ default: 0 })
  progress: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, (org) => org.projects)
  organization: Organization;

  @ManyToOne(() => User, (user) => user.projects)
  createdBy: User;

  @OneToMany(() => File, (file) => file.project)
  files: File[];

  @OneToMany(() => Annotation, (annotation) => annotation.project)
  annotations: Annotation[];

  @OneToMany(() => Collaboration, (collab) => collab.project)
  collaborators: Collaboration[];

  @OneToMany(() => Analytics, (analytics) => analytics.project)
  analytics: Analytics[];

  @OneToMany(() => Task, (task) => task.project)
  tasks: Task[];
}
