import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { Project } from "./Project";

@Entity("analytics")
export class Analytics {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  metric: string;

  @Column()
  value: number;

  @Column({ type: "json", nullable: true })
  details: Record<string, any>;

  @CreateDateColumn()
  recordedAt: Date;

  @ManyToOne(() => Project, (project) => project.analytics)
  project: Project;
}
