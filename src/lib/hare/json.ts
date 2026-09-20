/** Pull a JSON object from model text (fences, leading prose, truncated tails). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Reviewer returned no JSON");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  const start = raw.indexOf("{");
  if (start < 0) {
    throw new Error(
      `Reviewer returned no JSON (${raw.slice(0, 80).replace(/\s+/g, " ") || "empty"})`,
    );
  }
  const slice = raw.slice(start);
  const end = slice.lastIndexOf("}");
  const candidates = [end > 0 ? slice.slice(0, end + 1) : slice, slice];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastErr = err;
    }
  }
  const repaired = repairTruncatedObject(slice);
  if (repaired) return repaired;
  throw new Error(
    lastErr instanceof Error
      ? `Reviewer JSON parse failed: ${lastErr.message}`
      : "Reviewer returned no JSON",
  );
}

function repairTruncatedObject(raw: string): unknown | null {
  let buf = raw.trim();
  if (!buf.startsWith("{")) return null;
  buf = buf.replace(/,\s*$/, "");
  const opens = (buf.match(/\{/g) ?? []).length;
  const closes = (buf.match(/\}/g) ?? []).length;
  const q = (buf.match(/"/g) ?? []).length;
  if (q % 2 === 1) buf += '"';
  buf += "}".repeat(Math.max(0, opens - closes));
  try {
    return JSON.parse(buf);
  } catch {
    return null;
  }
}
