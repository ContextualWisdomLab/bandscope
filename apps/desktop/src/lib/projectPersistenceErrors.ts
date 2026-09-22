const PROJECT_REVISION_CONFLICT_MESSAGE = "Project changed since it was opened.";

/** Return the bounded Project Persistence CAS conflict without exposing native paths or internals. */
export function isProjectRevisionConflict(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.trim() === PROJECT_REVISION_CONFLICT_MESSAGE;
  }
  return typeof error === "string" && error.trim() === PROJECT_REVISION_CONFLICT_MESSAGE;
}
