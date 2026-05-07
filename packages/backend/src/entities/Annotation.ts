import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from "typeorm";
import { Project } from "./Project";
import { AnnotationLabel } from "./AnnotationLabel";

@Entity("annotations")
export class Annotation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ nullable: true })
  fileId: string;

  @Column({ nullable: true })
  jobId: string;

  @Column({ default: 0 })
  frameNumber: number;

  @Column({ type: "json", nullable: true })
  data: Record<string, any>;

  @Column({ type: "json", nullable: true })
  shapes: any[];

  @Column({ type: "json", nullable: true })
  tags: any[];

  @Column({ type: "json", nullable: true })
  tracks: any[];

  @Column({ nullable: true })
  notes: string;

  @Column({ default: "pending", type: "enum", enum: ["pending", "in_progress", "completed", "rejected"] })
  status: "pending" | "in_progress" | "completed" | "rejected";

  @Column({ default: 0 })
  confidence: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.annotations)
  project: Project;

  @OneToMany(() => AnnotationLabel, (label) => label.annotation)
  labels: AnnotationLabel[];
}
