import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateAnnotationsTable1683144400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "annotations",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "fileId",
            type: "varchar",
          },
          {
            name: "data",
            type: "json",
          },
          {
            name: "notes",
            type: "text",
            isNullable: true,
          },
          {
            name: "status",
            type: "enum",
            enum: ["pending", "in_progress", "completed", "rejected"],
            default: "'pending'",
          },
          {
            name: "confidence",
            type: "decimal",
            precision: 3,
            scale: 2,
            default: 0,
          },
          {
            name: "projectId",
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
      "annotations",
      new TableForeignKey({
        columnNames: ["projectId"],
        referencedColumnNames: ["id"],
        referencedTableName: "projects",
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createIndex("annotations", {
      columnNames: ["projectId"],
      name: "idx_annotations_projectId",
    });

    await queryRunner.createIndex("annotations", {
      columnNames: ["status"],
      name: "idx_annotations_status",
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("annotations");
  }
}
