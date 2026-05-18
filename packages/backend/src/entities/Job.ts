import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn
} from "typeorm";
import { Task } from "./Task";
import { User } from "./User";

@Entity("jobs")
export class Job {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ default: "annotation", type: "enum", enum: ["annotation", "validation", "acceptance"] })
  stage: "annotation" | "validation" | "acceptance";

  @Column({ default: "new", type: "enum", enum: ["new", "in_progress", "completed", "rejected"] })
  state: "new" | "in_progress" | "completed" | "rejected";

  @Column({ default: "annotation", type: "enum", enum: ["annotation", "ground_truth"] })
  type: "annotation" | "ground_truth";

  @Column({ default: 0 })
  frameStart: number;

  @Column({ default: 0 })
  frameEnd: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Task, (task) => task.jobs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "taskId" })
  task: Task;

  @Column()
  taskId: string;

  // Annotator
  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: "assigneeId" })
  assignee: User;

  @Column({ nullable: true })
  assigneeId: string;

  // Validator (who approved at validation stage)
  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: "validatedById" })
  validatedBy: User;

  @Column({ nullable: true })
  validatedById: string;

  // Acceptor (who approved at acceptance stage)
  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: "acceptedById" })
  acceptedBy: User;

  @Column({ nullable: true })
  acceptedById: string;

  @Column({ nullable: true, type: 'text' })
  reviewNote: string;
}
