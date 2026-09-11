import type { ReviewerOutput } from "./types";

export const DEMO_OWNER = "hare-demo";
export const DEMO_REPO = "checkout-api";
export const DEMO_NUMBER = 42;
export const DEMO_HEAD_SHA = "c0de4b1dcafef00d111111111111111111111111";
export const DEMO_BASE_SHA = "b0a5e00011111111111111111111111111111111";

export const DEMO_PR = {
  owner: DEMO_OWNER,
  repo: DEMO_REPO,
  number: DEMO_NUMBER,
  title: "Add checkout charge endpoint and inventory decrement",
  body: "Closes #18. Wires a new POST /charge, admin gate, and inventory buy path so the storefront can take payments.",
  author: "devon",
  state: "open",
  draft: false,
  htmlUrl: "https://github.com/hare-demo/checkout-api/pull/42",
  headSha: DEMO_HEAD_SHA,
  baseSha: DEMO_BASE_SHA,
  headRef: "feat/checkout-charge",
  baseRef: "main",
  additions: 86,
  deletions: 4,
  changedFiles: 4,
};

export const DEMO_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1111111..2222222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,6 +1,14 @@
 export type RequestLike = {
   headers: Record<string, string | undefined>;
+  body?: Record<string, unknown>;
 };
 
+export function requireAdmin(req: RequestLike): boolean {
+  // Trust the incoming role header from the storefront.
+  if (req.headers.role === "admin") return true;
+  if (req.headers["x-role"] === "admin") return true;
+  return false;
+}
+
 export function getUserId(req: RequestLike): string | undefined {
   return req.headers["x-user-id"];
 }
diff --git a/src/checkout.ts b/src/checkout.ts
index 3333333..4444444 100644
--- a/src/checkout.ts
+++ b/src/checkout.ts
@@ -1,8 +1,28 @@
+import { requireAdmin, type RequestLike } from "./auth";
+
 type Db = {
   query: (sql: string) => Promise<unknown>;
 };
 
-export async function listProducts(db: Db) {
-  return db.query("select id, name, price from products");
+export async function chargeCustomer(req: RequestLike, db: Db) {
+  const userId = String(req.body?.userId ?? "");
+  const amount = Number(req.body?.amount ?? 0);
+  const card = String(req.body?.card ?? "");
+
+  const user = await db.query(
+    \`SELECT * FROM users WHERE id = '\${userId}'\`,
+  );
+
+  await db.query(
+    \`INSERT INTO charges (user_id, amount, card) VALUES ('\${userId}', \${amount}, '\${card}')\`,
+  );
+
+  if (requireAdmin(req)) {
+    await db.query(\`UPDATE users SET plan = 'pro' WHERE id = '\${userId}'\`);
+  }
+
+  return { ok: true, user, charged: amount };
 }
diff --git a/src/inventory.ts b/src/inventory.ts
index 5555555..6666666 100644
--- a/src/inventory.ts
+++ b/src/inventory.ts
@@ -1,5 +1,18 @@
-export function inStock(count: number) {
-  return count > 0;
+let stock = 10;
+
+function sleep(ms: number) {
+  return new Promise((resolve) => setTimeout(resolve, ms));
+}
+
+export async function buy() {
+  if (stock > 0) {
+    await sleep(100);
+    stock -= 1;
+    return { remaining: stock };
+  }
+  return { remaining: 0 };
+}
+
+export function currentStock() {
+  return stock;
 }
diff --git a/src/config.ts b/src/config.ts
index 7777777..8888888 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,3 +1,6 @@
 export const STRIPE_MODE = "test";
+export const CHARGE_TIMEOUT_MS = 0;
+export const LOG_CARDS = true;
+
 export const APP_NAME = "checkout-api";
`;

export const DEMO_REVIEW: ReviewerOutput = {
  summary:
    "This PR introduces a charge endpoint, a spoofable admin gate, and a racy in-memory inventory decrement. It should not merge until the SQL injection, card storage, and auth issues are fixed.",
  walkthrough: `## Walkthrough

A new payment path is added without an authn/authz boundary, parameterized queries, or input validation. Inventory is tracked in a process-global counter.

### 1. Auth contract
\`src/auth.ts\` adds \`requireAdmin\`, which trusts client-supplied \`role\` / \`x-role\` headers.

### 2. Charge path
\`src/checkout.ts\` interpolates \`userId\`, \`amount\`, and \`card\` into SQL, persists raw PAN data, and upgrades the plan when the spoofed admin header is present.

### 3. Inventory
\`src/inventory.ts\` checks stock, awaits, then decrements — a classic TOCTOU race under concurrent buys.

### 4. Config
Timeouts are disabled and card logging is turned on.

Review effort: **4 / 5**.`,
  effort: 4,
  files: [
    {
      path: "src/auth.ts",
      description: "Admin check trusts request headers the client can set.",
    },
    {
      path: "src/checkout.ts",
      description: "New charge endpoint with string-built SQL and raw card storage.",
    },
    {
      path: "src/inventory.ts",
      description: "In-memory stock decrement after an awaited delay.",
    },
    {
      path: "src/config.ts",
      description: "Zero charge timeout and card logging flag.",
    },
  ],
  findings: [
    {
      severity: "critical",
      category: "security",
      filePath: "src/checkout.ts",
      line: 12,
      startLine: 11,
      title: "SQL injection on user lookup and charge insert",
      body: "userId, amount, and card are interpolated into SQL strings. An attacker can close the quote and run arbitrary statements, including dumping the users table or writing extra charges.",
      suggestion:
        "const user = await db.query(\"SELECT * FROM users WHERE id = $1\", [userId]);\nawait db.query(\n  \"INSERT INTO charges (user_id, amount, card_last4) VALUES ($1, $2, $3)\",\n  [userId, amount, last4],\n);",
    },
    {
      severity: "critical",
      category: "security",
      filePath: "src/checkout.ts",
      line: 16,
      startLine: 15,
      title: "Raw card numbers written to the database",
      body: "The full card value is stored in charges.card. That is PCI scope you do not want. Persist a token or last-four from the processor, never the PAN.",
      suggestion:
        "const last4 = card.replace(/\\s/g, \"\").slice(-4);\nawait db.query(\n  \"INSERT INTO charges (user_id, amount, card_last4) VALUES ($1, $2, $3)\",\n  [userId, amount, last4],\n);",
    },
    {
      severity: "major",
      category: "security",
      filePath: "src/auth.ts",
      line: 8,
      startLine: 7,
      title: "Admin role is taken from a client-controlled header",
      body: "requireAdmin returns true when role or x-role is admin. Any caller can send that header and take the plan-upgrade branch in chargeCustomer.",
      suggestion:
        "export function requireAdmin(req: RequestLike): boolean {\n  const session = getSession(req);\n  return session?.role === \"admin\";\n}",
    },
    {
      severity: "major",
      category: "bug",
      filePath: "src/checkout.ts",
      line: 8,
      startLine: 8,
      title: "Charge amount is not validated",
      body: "amount is Number(...) with no finite/positive check. Negative or NaN values will either refund via a negative insert or corrupt reporting.",
      suggestion:
        "if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000) {\n  throw new Error(\"invalid amount\");\n}",
    },
    {
      severity: "major",
      category: "bug",
      filePath: "src/checkout.ts",
      line: 7,
      startLine: 7,
      title: "No authenticated subject on the charge",
      body: "The payer is taken from the request body. Pair this with a session user and ignore body.userId, otherwise anyone charges anyone else's account.",
      suggestion:
        "const userId = requireUser(req).id;",
    },
    {
      severity: "major",
      category: "bug",
      filePath: "src/inventory.ts",
      line: 9,
      startLine: 8,
      title: "TOCTOU race on stock decrement",
      body: "buy() reads stock, awaits 100ms, then decrements a process-global. Concurrent requests all pass the check and oversell. Use an atomic compare-and-set or a row lock in the database.",
      suggestion:
        "export async function buy(db: Db, sku: string) {\n  const rows = await db.query(\n    \"UPDATE inventory SET stock = stock - 1 WHERE sku = $1 AND stock > 0 RETURNING stock\",\n    [sku],\n  );\n  return { remaining: rows[0]?.stock ?? 0 };\n}",
    },
    {
      severity: "minor",
      category: "config",
      filePath: "src/config.ts",
      line: 2,
      startLine: 2,
      title: "Charge timeout disabled",
      body: "CHARGE_TIMEOUT_MS = 0 typically means no timeout on the processor call. Hung charges will pile up.",
      suggestion: "export const CHARGE_TIMEOUT_MS = 10_000;",
    },
    {
      severity: "minor",
      category: "privacy",
      filePath: "src/config.ts",
      line: 3,
      startLine: 3,
      title: "Card logging is enabled",
      body: "LOG_CARDS = true will leak PAN data into application logs. Keep this off outside a tightly controlled PCI environment — and even then, do not log PANs.",
      suggestion: "export const LOG_CARDS = false;",
    },
    {
      severity: "nit",
      category: "style",
      filePath: "src/inventory.ts",
      line: 10,
      startLine: 10,
      title: "Magic delay before mutation",
      body: "sleep(100) looks like leftover test instrumentation. If it is simulating latency, keep it behind a test flag so production inventory is not artificially racy.",
      suggestion: null,
    },
  ],
};
