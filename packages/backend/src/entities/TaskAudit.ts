import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index
} from "typeorm";
import { Task } from "./Task";
import { User } from "./User";

export type TaskAuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "job_added"
  | "job_removed";

@Entity("task_audits")
@Index(["taskId", "createdAt"])
export class TaskAudit {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  taskId: string;

  @ManyToOne(() => Task, { onDelete: "CASCADE", nullable: false, eager: false })
  @JoinColumn({ name: "taskId" })
  task: Task;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true, eager: false })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({
    type: "enum",
    enum: ["created", "updated", "deleted", "job_added", "job_removed"],
  })
  action: TaskAuditAction;

  // Stores { fieldName: { from: oldValue, to: newValue } } pairs
  @Column({ type: "jsonb", nullable: true })
  changes: Record<string, { from: unknown; to: unknown }> | null;

  @Column({ nullable: true, type: "text" })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
