import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { Project } from "./Project";
import { User } from "./User";

@Entity("collaborations")
export class Collaboration {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ default: "viewer", type: "enum", enum: ["viewer", "annotator", "manager", "admin"] })
  role: "viewer" | "annotator" | "manager" | "admin";

  @Column({ default: true })
  canEdit: boolean;

  @Column({ default: false })
  canDelete: boolean;

  @Column({ default: false })
  canInvite: boolean;

  @CreateDateColumn()
  joinedAt: Date;

  @ManyToOne(() => Project, (project) => project.collaborators)
  project: Project;

  @ManyToOne(() => User, (user) => user.collaborations)
  user: User;
}
