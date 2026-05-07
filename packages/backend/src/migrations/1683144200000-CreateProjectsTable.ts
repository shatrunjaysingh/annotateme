import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateProjectsTable1683144200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "projects",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "name",
            type: "varchar",
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "status",
            type: "enum",
            enum: ["active", "archived", "completed"],
            default: "'active'",
          },
          {
            name: "dataType",
            type: "enum",
            enum: ["image", "text", "audio", "video"],
            default: "'image'",
          },
          {
            name: "labelSet",
            type: "json",
            default: "'[]'",
          },
          {
            name: "totalItems",
            type: "integer",
            default: 0,
          },
          {
            name: "annotatedItems",
            type: "integer",
            default: 0,
          },
          {
            name: "progress",
            type: "integer",
            default: 0,
          },
          {
            name: "organizationId",
            type: "uuid",
          },
          {
            name: "createdById",
            type: "uuid",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "projects",
      new TableForeignKey({
        columnNames: ["organizationId"],
        referencedColumnNames: ["id"],
        referencedTableName: "organizations",
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "projects",
      new TableForeignKey({
        columnNames: ["createdById"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("projects");
  }
}
