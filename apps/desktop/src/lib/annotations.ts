import { Annotation } from "@bandscope/shared-types";

/**
 * Merges two arrays of annotations, keeping unique ones and sorting by timestamp.
 * 
 * @param existing - The existing annotations.
 * @param incoming - The incoming annotations.
 * @returns The merged annotations array.
 */
export function mergeAnnotations(existing: Annotation[] = [], incoming: Annotation[] = []): Annotation[] {
  const merged = [...existing];
  const existingIds = new Set(existing.map((a) => a.id));

  for (const ann of incoming) {
    if (!existingIds.has(ann.id)) {
      merged.push(ann);
      existingIds.add(ann.id);
    }
  }

  const mergedWithIndex = merged.map((item, index) => ({ item, index }));
  mergedWithIndex.sort((a, b) => {
    const ta = Date.parse(a.item.timestamp);
    const tb = Date.parse(b.item.timestamp);
    const tsa = Number.isFinite(ta) ? ta : 0;
    const tsb = Number.isFinite(tb) ? tb : 0;
    if (tsa !== tsb) return tsa - tsb;
    return a.index - b.index;
  });
  return mergedWithIndex.map(x => x.item);
}
