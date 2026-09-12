import { parseUnifiedDiff } from "./diff.ts";
import type { ChangedFile, ReviewerOutput, Severity } from "./types.ts";

export type MigrationFinding = ReviewerOutput["findings"][number];

type SqlType = "uuid" | "text" | "int" | "bigint" | "bool" | "timestamp" | "json" | "bytes" | "numeric" | "other";

type SqlColumn = { name: string; sqlType: SqlType; rawType: string; line: number | null };
type SqlFk = {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  line: number | null;
};
type SqlTable = { name: string; columns: Map<string, SqlColumn>; fks: SqlFk[] };

type PrismaField = {
  name: string;
  column: string;
  prismaType: string;
  native: SqlType;
  rawNative: string | null;
};
type PrismaModel = { name: string; table: string; fields: Map<string, PrismaField> };

const MIGRATION_PATH =
  /(^|\/)(prisma\/migrations\/.+\/migration\.sql|migrations\/.+\.sql|drizzle\/.+\.sql)$/i;

const SQL_TYPE_ALIASES: Array<[RegExp, SqlType]> = [
  [/\buuid\b/i, "uuid"],
  [/\b(character varying|varchar|nvarchar|char|text|citext)\b/i, "text"],
  [/\b(bigserial|int8|bigint)\b/i, "bigint"],
  [/\b(serial|smallint|int2|int4|integer|int)\b/i, "int"],
  [/\b(boolean|bool)\b/i, "bool"],
  [/\b(timestamptz|timestamp|date|time)\b/i, "timestamp"],
  [/\bjsonb?\b/i, "json"],
  [/\bbytea\b/i, "bytes"],
  [/\b(numeric|decimal|double|real|float|money)\b/i, "numeric"],
];

export function isMigrationPath(path: string): boolean {
  return MIGRATION_PATH.test(path) || /(^|\/)schema\.prisma$/i.test(path);
}

function normalizeSqlType(raw: string): SqlType {
  const t = raw.trim();
  for (const [re, kind] of SQL_TYPE_ALIASES) {
    if (re.test(t)) return kind;
  }
  return "other";
}

function prismaNative(prismaType: string, attrs: string): SqlType {
  const db = attrs.match(/@db\.(\w+)/);
  if (db) return normalizeSqlType(db[1] ?? "");
  switch (prismaType) {
    case "String":
      return "text";
    case "Int":
      return "int";
    case "BigInt":
      return "bigint";
    case "Boolean":
      return "bool";
    case "DateTime":
      return "timestamp";
    case "Bytes":
      return "bytes";
    case "Json":
      return "json";
    case "Float":
    case "Decimal":
      return "numeric";
    default:
      return "other";
  }
}

function unquote(id: string): string {
  return id.replace(/["'`[\]]/g, "").trim();
}

export function parsePrismaSchema(source: string): Map<string, PrismaModel> {
  const models = new Map<string, PrismaModel>();
  const blocks = source.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g);
  for (const m of blocks) {
    const name = m[1] ?? "";
    const body = m[2] ?? "";
    const map = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    const table = map?.[1] ?? name;
    const fields = new Map<string, PrismaField>();
    for (const line of body.split("\n")) {
      const field = line.match(
        /^\s*(\w+)\s+(\w+)(\??)(?:\s+([^\n]+))?$/,
      );
      if (!field) continue;
      const fieldName = field[1] ?? "";
      if (fieldName.startsWith("@@") || fieldName === "model") continue;
      const prismaType = field[2] ?? "";
      if (!/^(String|Int|BigInt|Boolean|DateTime|Bytes|Json|Float|Decimal)$/.test(prismaType)) {
        continue;
      }
      const attrs = field[4] ?? "";
      const colMap = attrs.match(/@map\(\s*"([^"]+)"\s*\)/);
      const nativeAttr = attrs.match(/@db\.(\w+)/);
      fields.set(fieldName, {
        name: fieldName,
        column: colMap?.[1] ?? fieldName,
        prismaType,
        native: prismaNative(prismaType, attrs),
        rawNative: nativeAttr?.[1] ?? null,
      });
    }
    const model: PrismaModel = { name, table, fields };
    models.set(name.toLowerCase(), model);
    models.set(table.toLowerCase(), model);
  }
  return models;
}

function lineOf(haystack: string, needle: string, offset = 0): number | null {
  const idx = haystack.indexOf(needle, offset);
  if (idx < 0) return null;
  return haystack.slice(0, idx).split("\n").length;
}

export function parseSqlTables(sql: string): SqlTable[] {
  const tables: SqlTable[] = [];
  const createRe =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+("?[\w.]+"?)\s*\(([\s\S]*?)\)\s*;/gi;
  for (const m of sql.matchAll(createRe)) {
    const name = unquote((m[1] ?? "").replace(/^\w+\./, ""));
    const body = m[2] ?? "";
    const start = m.index ?? 0;
    const baseLine = sql.slice(0, start).split("\n").length;
    const columns = new Map<string, SqlColumn>();
    const fks: SqlFk[] = [];

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim().replace(/,$/, "");
      const col = line.match(
        /^"?(\w+)"?\s+((?:[\w\s]|varying|precision)+?(?:\([^)]+\))?)(?:\s+|$)/i,
      );
      if (
        col &&
        !/^(constraint|primary|foreign|unique|check|exclude)\b/i.test(col[1] ?? "")
      ) {
        const colName = unquote(col[1] ?? "");
        columns.set(colName.toLowerCase(), {
          name: colName,
          sqlType: normalizeSqlType(col[2] ?? ""),
          rawType: (col[2] ?? "").trim(),
          line: baseLine + body.slice(0, body.indexOf(rawLine)).split("\n").length - 1,
        });
      }

      const inlineFk = line.match(
        /^"?(\w+)"?\s+.+\bREFERENCES\s+"?([\w.]+)"?\s*\(\s*"?(\w+)"?\s*\)/i,
      );
      if (inlineFk) {
        fks.push({
          table: name,
          column: unquote(inlineFk[1] ?? ""),
          refTable: unquote((inlineFk[2] ?? "").replace(/^\w+\./, "")),
          refColumn: unquote(inlineFk[3] ?? ""),
          line: lineOf(sql, rawLine, start),
        });
      }
    }

    const tableFkRe =
      /FOREIGN\s+KEY\s*\(\s*"?(\w+)"?\s*\)\s*REFERENCES\s+"?([\w.]+)"?\s*\(\s*"?(\w+)"?\s*\)/gi;
    for (const fk of body.matchAll(tableFkRe)) {
      fks.push({
        table: name,
        column: unquote(fk[1] ?? ""),
        refTable: unquote((fk[2] ?? "").replace(/^\w+\./, "")),
        refColumn: unquote(fk[3] ?? ""),
        line: lineOf(sql, fk[0] ?? "", start),
      });
    }

    tables.push({ name, columns, fks });
  }

  const alterFkRe =
    /ALTER\s+TABLE\s+"?([\w.]+)"?[\s\S]{0,200}?FOREIGN\s+KEY\s*\(\s*"?(\w+)"?\s*\)\s*REFERENCES\s+"?([\w.]+)"?\s*\(\s*"?(\w+)"?\s*\)/gi;
  for (const m of sql.matchAll(alterFkRe)) {
    tables.push({
      name: unquote((m[1] ?? "").replace(/^\w+\./, "")),
      columns: new Map(),
      fks: [
        {
          table: unquote((m[1] ?? "").replace(/^\w+\./, "")),
          column: unquote(m[2] ?? ""),
          refTable: unquote((m[3] ?? "").replace(/^\w+\./, "")),
          refColumn: unquote(m[4] ?? ""),
          line: lineOf(sql, m[0] ?? ""),
        },
      ],
    });
  }

  return tables;
}

function prismaFieldByColumn(model: PrismaModel, column: string): PrismaField | undefined {
  const lower = column.toLowerCase();
  for (const f of model.fields.values()) {
    if (f.column.toLowerCase() === lower || f.name.toLowerCase() === lower) return f;
  }
  return undefined;
}

function snapLine(diff: string, path: string, fallback: number | null): number | null {
  const parsed = parseUnifiedDiff(diff).find((f) => f.path === path);
  if (!parsed) return fallback;
  if (fallback && parsed.addedLines.has(fallback)) return fallback;
  const first = [...parsed.addedLines][0];
  return first ?? fallback;
}

function finding(
  path: string,
  line: number | null,
  title: string,
  body: string,
  suggestion: string | null,
  severity: Severity = "major",
): MigrationFinding {
  return {
    severity,
    category: "bug",
    filePath: path,
    line,
    startLine: line,
    title,
    body,
    suggestion,
  };
}

function newFileContent(file: ChangedFile, diff: string): string {
  if (file.patch) {
    return file.patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1))
      .join("\n");
  }
  const parsed = parseUnifiedDiff(diff).find((f) => f.path === file.path);
  if (!parsed) return "";
  return parsed.lines
    .filter((l) => l.type === "add" || l.type === "ctx")
    .map((l) => l.text)
    .join("\n");
}

export function scanMigrationIssues(input: {
  files: ChangedFile[];
  diff: string;
  contextFiles?: Array<{ path: string; content: string }>;
}): MigrationFinding[] {
  const findings: MigrationFinding[] = [];
  const schemaText = [
    ...(input.contextFiles ?? [])
      .filter((f) => /schema\.prisma$/i.test(f.path))
      .map((f) => f.content),
    ...input.files
      .filter((f) => /schema\.prisma$/i.test(f.path))
      .map((f) => newFileContent(f, input.diff)),
  ].join("\n");
  const prisma = schemaText ? parsePrismaSchema(schemaText) : new Map<string, PrismaModel>();

  const sqlByTable = new Map<string, SqlTable>();

  for (const file of input.files) {
    if (!MIGRATION_PATH.test(file.path)) continue;
    const sql = newFileContent(file, input.diff);
    if (!sql.trim()) continue;

    if (/\bDROP\s+TABLE\b/i.test(sql)) {
      const line = snapLine(input.diff, file.path, lineOf(sql, "DROP TABLE"));
      findings.push(
        finding(
          file.path,
          line,
          "Migration drops a table",
          "This SQL includes DROP TABLE. On production that is data loss unless the table is empty and unused. Confirm this is intentional and reversible.",
          null,
          "critical",
        ),
      );
    }
    if (/\bDROP\s+COLUMN\b/i.test(sql)) {
      findings.push(
        finding(
          file.path,
          snapLine(input.diff, file.path, lineOf(sql, "DROP COLUMN")),
          "Migration drops a column",
          "DROP COLUMN is not backwards compatible. Running this while old app instances are still up will fail those queries. Split expand/contract if this table is live.",
          null,
          "major",
        ),
      );
    }

    const alterNotNull = sql.match(
      /ALTER\s+TABLE[\s\S]{0,80}?ALTER\s+COLUMN\s+"?(\w+)"?\s+SET\s+NOT\s+NULL/i,
    );
    if (alterNotNull && !/SET\s+DEFAULT/i.test(sql)) {
      findings.push(
        finding(
          file.path,
          snapLine(input.diff, file.path, lineOf(sql, alterNotNull[0] ?? "")),
          "NOT NULL added without a default",
          `Column \`${alterNotNull[1]}\` is set NOT NULL. Existing NULL rows will fail the migration (Postgres 23502). Add a default or backfill first.`,
          null,
        ),
      );
    }

    for (const table of parseSqlTables(sql)) {
      const existing = sqlByTable.get(table.name.toLowerCase());
      if (existing) {
        for (const [k, v] of table.columns) existing.columns.set(k, v);
        existing.fks.push(...table.fks);
      } else {
        sqlByTable.set(table.name.toLowerCase(), table);
      }

      for (const col of table.columns.values()) {
        const model = prisma.get(table.name.toLowerCase());
        const field = model ? prismaFieldByColumn(model, col.name) : undefined;
        if (field && field.native !== "other" && col.sqlType !== "other" && field.native !== col.sqlType) {
          findings.push(
            finding(
              file.path,
              snapLine(input.diff, file.path, col.line),
              `SQL type ${col.rawType} does not match Prisma ${field.prismaType}${field.rawNative ? ` @db.${field.rawNative}` : ""}`,
              `\`${table.name}.${col.name}\` is ${col.rawType} in this migration, but prisma/schema.prisma maps \`${field.name}\` to ${field.native}. Postgres will reject FKs and Prisma will generate the wrong native type. Align SQL with \`@db.${col.sqlType === "uuid" ? "Uuid" : col.rawType}\` or change the SQL column.`,
              col.sqlType === "uuid"
                ? `"${col.name}" UUID NOT NULL`
                : null,
            ),
          );
        }
      }

      for (const fk of table.fks) {
        const srcCol =
          table.columns.get(fk.column.toLowerCase()) ??
          sqlByTable.get(fk.table.toLowerCase())?.columns.get(fk.column.toLowerCase());
        const refTable = sqlByTable.get(fk.refTable.toLowerCase());
        const refCol = refTable?.columns.get(fk.refColumn.toLowerCase());

        const srcType = srcCol?.sqlType;
        let destType = refCol?.sqlType;
        let destLabel = refCol ? `${fk.refTable}.${fk.refColumn} (${refCol.rawType})` : "";

        if (!destType) {
          const model = prisma.get(fk.refTable.toLowerCase());
          const field = model ? prismaFieldByColumn(model, fk.refColumn) : undefined;
          if (field) {
            destType = field.native;
            destLabel = `${model?.table ?? fk.refTable}.${field.column} (Prisma ${field.prismaType}${field.rawNative ? ` @db.${field.rawNative}` : ""})`;
          }
        }

        if (srcType && destType && srcType !== destType && srcType !== "other" && destType !== "other") {
          findings.push(
            finding(
              file.path,
              snapLine(input.diff, file.path, fk.line ?? srcCol?.line ?? null),
              `Foreign key type mismatch: ${fk.column} is ${srcType}, referenced ${fk.refColumn} is ${destType}`,
              `Postgres error 42804: \`${fk.table}.${fk.column}\` (${srcCol?.rawType ?? srcType}) cannot reference ${destLabel || `${fk.refTable}.${fk.refColumn}`}. This fails at \`migrate deploy\`, not at Prisma generate. Change the new column to ${destType} (for Prisma UUID ids that is \`UUID\`, not \`TEXT\`).`,
              srcCol
                ? `"${srcCol.name}" ${destType === "uuid" ? "UUID" : destType.toUpperCase()} NOT NULL`
                : null,
            ),
          );
        }
      }
    }
  }

  return findings.slice(0, 6);
}

export function mergeMigrationFindings(
  output: ReviewerOutput,
  extra: MigrationFinding[],
): ReviewerOutput {
  if (!extra.length) return output;
  const seen = new Set(output.findings.map((f) => `${f.filePath}:${f.title}`));
  const merged = [...extra.filter((f) => !seen.has(`${f.filePath}:${f.title}`)), ...output.findings].slice(0, 8);
  const blocking = extra.filter((f) => f.severity === "critical" || f.severity === "major");
  let summary = output.summary;
  if (blocking.length && !/migration|foreign key|uuid|schema/i.test(summary)) {
    summary = `${blocking[0]!.title}. ${summary}`.slice(0, 800);
  }
  return { ...output, summary, findings: merged };
}
