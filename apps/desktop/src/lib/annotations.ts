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

  // Sort by timestamp to maintain log order
  merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return merged;
}
