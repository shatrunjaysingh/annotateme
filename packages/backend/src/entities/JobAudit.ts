import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index
} from "typeorm";
import { Job } from "./Job";
import { User } from "./User";

export type JobAuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "stage_changed"
  | "state_changed"
  | "assigned"
  | "annotation_saved"
  | "annotations_cleared";

@Entity("job_audits")
@Index(["jobId", "createdAt"])
@Index(["taskId", "createdAt"])
export class JobAudit {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  jobId: string;

  @ManyToOne(() => Job, { onDelete: "CASCADE", nullable: false, eager: false })
  @JoinColumn({ name: "jobId" })
  job: Job;

  // Denormalised for efficient task-level queries even after job deletion
  @Column({ nullable: true })
  taskId: string;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true, eager: false })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({
    type: "enum",
    enum: [
      "created",
      "updated",
      "deleted",
      "stage_changed",
      "state_changed",
      "assigned",
      "annotation_saved",
      "annotations_cleared",
    ],
  })
  action: JobAuditAction;

  // Stores { fieldName: { from: oldValue, to: newValue } } pairs
  @Column({ type: "jsonb", nullable: true })
  changes: Record<string, { from: unknown; to: unknown }> | null;

  @Column({ nullable: true, type: "text" })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
