import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateCollaborationsTable1683144600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "collaborations",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "role",
            type: "enum",
            enum: ["viewer", "annotator", "manager", "admin"],
            default: "'viewer'",
          },
          {
            name: "canEdit",
            type: "boolean",
            default: true,
          },
          {
            name: "canDelete",
            type: "boolean",
            default: false,
          },
          {
            name: "canInvite",
            type: "boolean",
            default: false,
          },
          {
            name: "projectId",
            type: "uuid",
          },
          {
            name: "userId",
            type: "uuid",
          },
          {
            name: "joinedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "collaborations",
      new TableForeignKey({
        columnNames: ["projectId"],
        referencedColumnNames: ["id"],
        referencedTableName: "projects",
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "collaborations",
      new TableForeignKey({
        columnNames: ["userId"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createIndex("collaborations", {
      columnNames: ["projectId", "userId"],
      name: "idx_collaborations_project_user",
      isUnique: true,
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("collaborations");
  }
}
