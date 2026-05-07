import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateAnnotationLabelsTable1683144500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "annotation_labels",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "label",
            type: "varchar",
          },
          {
            name: "coordinates",
            type: "json",
          },
          {
            name: "confidence",
            type: "decimal",
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: "annotationId",
            type: "uuid",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "annotation_labels",
      new TableForeignKey({
        columnNames: ["annotationId"],
        referencedColumnNames: ["id"],
        referencedTableName: "annotations",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("annotation_labels");
  }
}
