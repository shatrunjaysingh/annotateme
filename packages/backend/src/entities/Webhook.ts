import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity("webhooks")
export class Webhook {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  url: string;

  @Column("simple-array")
  events: string[]; // e.g. ["job.completed", "job.stage_changed"]

  @Column({ nullable: true })
  secret: string | null; // used to sign payloads

  @Column({ nullable: true })
  projectId: string | null; // null = fires for all projects

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
