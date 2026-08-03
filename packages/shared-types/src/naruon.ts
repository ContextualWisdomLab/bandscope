  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Snapshot caller-owned data so validation and canonicalization see one value. */
function snapshotBoundaryValue(value: unknown): BoundarySnapshot {
  try {
    return { ok: true, value: structuredClone(value) };
  } catch {
    return { ok: false, error: "root is not structured-cloneable" };
  }
}

/** Return whether a structured-cloned value is a plain non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

/** Return whether an array is bounded and has every numeric index materialized. */
function isDenseArray(value: unknown, maximumLength: number): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const length = Number(value.length);
  if (!Number.isSafeInteger(length) || length > maximumLength) return false;
  for (let index = 0; index < length; index += 1) {
    if (!(index in value)) return false;
  }
  return true;
}

/** Return the first key outside an exact allowlist. */
function unexpectedKey(