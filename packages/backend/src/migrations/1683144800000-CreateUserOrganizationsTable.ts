import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateUserOrganizationsTable1683144800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "user_organizations",
        columns: [
          {
            name: "userId",
            type: "uuid",
            isPrimary: true,
          },
          {
            name: "organizationId",
            type: "uuid",
            isPrimary: true,
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey("user_organizations", {
      columnNames: ["userId"],
      referencedColumnNames: ["id"],
      referencedTableName: "users",
      onDelete: "CASCADE",
    });

    await queryRunner.createForeignKey("user_organizations", {
      columnNames: ["organizationId"],
      referencedColumnNames: ["id"],
      referencedTableName: "organizations",
      onDelete: "CASCADE",
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("user_organizations");
  }
}
