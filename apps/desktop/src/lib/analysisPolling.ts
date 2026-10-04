import type { AnalysisJobStatus } from "@bandscope/shared-types";

/** Copy only the expected in-flight job to schedule another poll; preserve all other status objects. */
export function retryAnalysisJobStatus(current: AnalysisJobStatus | null, expectedJobId: string): AnalysisJobStatus | null {
  return current?.jobId === expectedJobId && (current.state === "queued" || current.state === "running")
    ? { ...current }
    : current;
}
