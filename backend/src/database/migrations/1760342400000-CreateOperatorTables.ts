import { MigrationInterface, QueryRunner } from 'typeorm';

/** Gateway-owned tables only; the Python governance service manages its own schema. */
export class CreateOperatorTables1760342400000 implements MigrationInterface {
  name = 'CreateOperatorTables1760342400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "operators" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "name" varchar(200) NOT NULL,
        "role" varchar(20) NOT NULL,
        "password_hash" varchar(100) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_login_at" timestamptz,
        CONSTRAINT "PK_operators_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_operators_email" UNIQUE ("email"),
        CONSTRAINT "CHK_operators_role" CHECK ("role" IN ('auditor', 'approver', 'operator', 'admin'))
      )`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "login_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "success" boolean NOT NULL,
        "reason" varchar(100),
        "ip" varchar(64),
        "user_agent" varchar(512),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_login_events_id" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_login_events_email" ON "login_events" ("email")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_login_events_created_at" ON "login_events" ("created_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "login_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "operators"`);
  }
}
