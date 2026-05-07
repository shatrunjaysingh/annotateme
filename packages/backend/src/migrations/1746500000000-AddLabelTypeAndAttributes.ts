import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLabelTypeAndAttributes1746500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labels" ADD COLUMN IF NOT EXISTS "type" varchar NOT NULL DEFAULT 'any'`);
    await queryRunner.query(`ALTER TABLE "labels" ADD COLUMN IF NOT EXISTS "attributes" jsonb NOT NULL DEFAULT '[]'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "labels" DROP COLUMN IF EXISTS "attributes"`);
    await queryRunner.query(`ALTER TABLE "labels" DROP COLUMN IF EXISTS "type"`);
  }
}
