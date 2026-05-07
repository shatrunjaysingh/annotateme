import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateFilesTable1683144300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "files",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "originalName",
            type: "varchar",
          },
          {
            name: "fileName",
            type: "varchar",
          },
          {
            name: "mimeType",
            type: "varchar",
          },
          {
            name: "size",
            type: "integer",
          },
          {
            name: "path",
            type: "varchar",
          },
          {
            name: "status",
            type: "enum",
            enum: ["pending", "processing", "completed", "failed"],
            default: "'pending'",
          },
          {
            name: "projectId",
            type: "uuid",
          },
          {
            name: "uploadedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "files",
      new TableForeignKey({
        columnNames: ["projectId"],
        referencedColumnNames: ["id"],
        referencedTableName: "projects",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("files");
  }
}
