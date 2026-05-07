import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from "typeorm";
import { Project } from "./Project";

@Entity("labels")
export class Label {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  color: string; // Hex color code

  @Column({ default: "standard", type: "enum", enum: ["standard", "auto_extracted", "user_created"] })
  source: "standard" | "auto_extracted" | "user_created";

  @Column({ nullable: true })
  category: string; // For grouping related labels

  @Column({ default: 0 })
  usageCount: number;

  @Column({ default: "any" })
  type: string; // any | rectangle | polygon | polyline | points | ellipse | cuboid | skeleton | mask | tag

  @Column({ type: "jsonb", nullable: true, default: () => "'[]'" })
  attributes: Array<{
    id?: number;
    name: string;
    input_type: "select" | "radio" | "checkbox" | "text" | "number";
    mutable: boolean;
    values: string[];
    default_value?: string;
  }>;

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, { nullable: true })
  project: Project;
}
