import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePrismaSchema,
  parseSqlTables,
  scanMigrationIssues,
} from "./migrations.ts";

const SCHEMA = `
model Tenant {
  id        String @id @default(uuid()) @db.Uuid
  chatLeads ChatLead[]
  @@map("tenants")
}

model ChatLead {
  id       String @id @default(uuid()) @db.Uuid
  tenantId String @map("tenant_id")
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  @@map("chat_leads")
}
`;

const BAD_SQL = `-- CreateTable
CREATE TABLE "chat_leads" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "chat_leads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "chat_leads" ADD CONSTRAINT "chat_leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`;

const GOOD_SQL = `CREATE TABLE "chat_leads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    CONSTRAINT "chat_leads_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "chat_leads" ADD CONSTRAINT "chat_leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
`;

function diffFor(path: string, body: string): string {
  const lines = body.split("\n");
  return [
    `diff --git a/${path} b/${path}`,
    `--- /dev/null`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((l) => `+${l}`),
  ].join("\n");
}

describe("parsePrismaSchema", () => {
  it("reads @@map and @db.Uuid", () => {
    const models = parsePrismaSchema(SCHEMA);
    const tenants = models.get("tenants");
    assert.ok(tenants);
    const id = tenants.fields.get("id");
    assert.equal(id?.native, "uuid");
    const leads = models.get("chat_leads");
    const tenantId = [...leads!.fields.values()].find((f) => f.column === "tenant_id");
    assert.equal(tenantId?.native, "text");
  });
});

describe("parseSqlTables", () => {
  it("extracts columns and FKs", () => {
    const tables = parseSqlTables(BAD_SQL);
    const leads = tables.find((t) => t.name === "chat_leads" && t.columns.size > 0);
    assert.ok(leads);
    assert.equal(leads.columns.get("tenant_id")?.sqlType, "text");
    const fk = tables.flatMap((t) => t.fks).find((f) => f.column === "tenant_id");
    assert.equal(fk?.refTable, "tenants");
  });
});

describe("scanMigrationIssues", () => {
  it("flags TEXT FK to Prisma UUID id (JOSIE chat_leads case)", () => {
    const path = "prisma/migrations/20260911000001_add_chat_leads/migration.sql";
    const diff = diffFor(path, BAD_SQL);
    const findings = scanMigrationIssues({
      files: [{ path, status: "added", additions: 12, deletions: 0, patch: undefined }],
      diff,
      contextFiles: [{ path: "prisma/schema.prisma", content: SCHEMA }],
    });
    assert.ok(
      findings.some((f) => /foreign key type mismatch/i.test(f.title) && f.severity === "major"),
      JSON.stringify(findings.map((f) => f.title)),
    );
  });

  it("is silent when SQL UUID matches Prisma @db.Uuid", () => {
    const path = "prisma/migrations/20260911000001_add_chat_leads/migration.sql";
    const findings = scanMigrationIssues({
      files: [{ path, status: "added", additions: 8, deletions: 0 }],
      diff: diffFor(path, GOOD_SQL),
      contextFiles: [{ path: "prisma/schema.prisma", content: SCHEMA }],
    });
    assert.equal(
      findings.filter((f) => /mismatch/i.test(f.title)).length,
      0,
      JSON.stringify(findings),
    );
  });

  it("flags DROP TABLE as critical", () => {
    const path = "prisma/migrations/20260101_drop/migration.sql";
    const sql = `DROP TABLE "old_events";`;
    const findings = scanMigrationIssues({
      files: [{ path, status: "added", additions: 1, deletions: 0 }],
      diff: diffFor(path, sql),
    });
    assert.equal(findings[0]?.severity, "critical");
  });

  it("prefers HEAD schema over a truncated PR patch (JOSIE #93)", () => {
    const sqlPath = "prisma/migrations/20260917000002_agent_key_sessions/migration.sql";
    const sql = `CREATE TABLE "agent_key_sessions" (
  "id" UUID NOT NULL,
  "api_key_id" UUID NOT NULL,
  CONSTRAINT "agent_key_sessions_pkey" PRIMARY KEY ("id")
);`;
    const headSchema = `
model AgentKeySession {
  id       String @id @default(uuid()) @db.Uuid
  apiKeyId String @unique @map("api_key_id") @db.Uuid
  @@map("agent_key_sessions")
}
`;
    const truncatedPatch = `
model AgentKeySession {
  id       String @id @default(uuid())
  apiKeyId String @unique @map("api_key_id")
  @@map("agent_key_sessions")
}
`;
    const findings = scanMigrationIssues({
      files: [
        { path: sqlPath, status: "added", additions: 6, deletions: 0 },
        { path: "prisma/schema.prisma", status: "modified", additions: 20, deletions: 0 },
      ],
      diff:
        diffFor(sqlPath, sql) +
        "\n" +
        diffFor("prisma/schema.prisma", truncatedPatch),
      contextFiles: [{ path: "prisma/schema.prisma", content: headSchema }],
    });
    assert.equal(
      findings.filter((f) => /does not match Prisma String/i.test(f.title)).length,
      0,
      JSON.stringify(findings),
    );
  });

  it("flags SET NOT NULL without default", () => {
    const path = "prisma/migrations/20260102_nn/migration.sql";
    const sql = `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;`;
    const findings = scanMigrationIssues({
      files: [{ path, status: "added", additions: 1, deletions: 0 }],
      diff: diffFor(path, sql),
    });
    assert.ok(findings.some((f) => /NOT NULL/i.test(f.title)));
  });
});
