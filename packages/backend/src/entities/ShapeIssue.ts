import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { User } from "./User";

@Entity("shape_issues")
export class ShapeIssue {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  jobId: string;

  @Column({ type: "int" })
  frameNumber: number;

  @Column({ nullable: true })
  shapeId: string; // UUID of the shape this comment is pinned to (null = frame-level)

  @Column({ type: "text" })
  comment: string;

  @Column({ default: "open" })
  status: string; // "open" | "resolved"

  @Column({ nullable: true })
  resolvedBy: string | null;

  @Column({ nullable: true, type: "timestamp" })
  resolvedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, eager: true })
  author: User | null;

  @Column({ nullable: true })
  authorId: string;

  @CreateDateColumn()
  createdAt: Date;
}
