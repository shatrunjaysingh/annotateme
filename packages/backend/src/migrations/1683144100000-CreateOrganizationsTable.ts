import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateOrganizationsTable1683144100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "organizations",
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
            name: "logo",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "ownerId",
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
      "organizations",
      new TableForeignKey({
        columnNames: ["ownerId"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("organizations");
  }
}
