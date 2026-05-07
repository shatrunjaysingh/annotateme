import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateAnalyticsTable1683144700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "analytics",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "metric",
            type: "varchar",
          },
          {
            name: "value",
            type: "decimal",
            precision: 10,
            scale: 2,
          },
          {
            name: "details",
            type: "json",
            isNullable: true,
          },
          {
            name: "projectId",
            type: "uuid",
          },
          {
            name: "recordedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "analytics",
      new TableForeignKey({
        columnNames: ["projectId"],
        referencedColumnNames: ["id"],
        referencedTableName: "projects",
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createIndex("analytics", {
      columnNames: ["projectId", "metric"],
      name: "idx_analytics_project_metric",
    });

    await queryRunner.createIndex("analytics", {
      columnNames: ["recordedAt"],
      name: "idx_analytics_recordedAt",
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("analytics");
  }
}
