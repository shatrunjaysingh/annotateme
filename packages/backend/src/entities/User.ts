import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToMany, JoinTable } from "typeorm";
import { Organization } from "./Organization";
import { Project } from "./Project";
import { Collaboration } from "./Collaboration";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ default: "user", type: "enum", enum: ["admin", "manager", "user"] })
  role: "admin" | "manager" | "user";

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Organization, (org) => org.owner)
  ownedOrganizations: Organization[];

  @ManyToMany(() => Organization)
  @JoinTable({ name: "user_organizations" })
  organizations: Organization[];

  @OneToMany(() => Project, (project) => project.createdBy)
  projects: Project[];

  @OneToMany(() => Collaboration, (collab) => collab.user)
  collaborations: Collaboration[];
}
