import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from "typeorm";
import { User } from "./User";
import { Project } from "./Project";

@Entity("organizations")
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  logo: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.ownedOrganizations)
  owner: User;

  @OneToMany(() => Project, (project) => project.organization)
  projects: Project[];
}
