import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { Annotation } from "./Annotation";

@Entity("annotation_labels")
export class AnnotationLabel {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  label: string;

  @Column({ type: "json" })
  coordinates: Record<string, any>;

  @Column({ nullable: true })
  confidence: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Annotation, (annotation) => annotation.labels)
  annotation: Annotation;
}
