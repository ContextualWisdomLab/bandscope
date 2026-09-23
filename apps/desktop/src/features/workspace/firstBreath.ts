/**
 * Temporary compatibility aliases for the pre-existing workspace call site.
 *
 * Canonical domain authority is `firstSectionFinish.ts`: `timeRange.end`
 * establishes structural section-finish evidence and does not establish a
 * breath event. Remove this adapter when the Workspace/i18n compatibility
 * identifiers are migrated in the owning UI lane.
 */
export {
  firstSectionFinish as firstBreath,
  formatSectionFinishTime as formatBreathTime
} from "./firstSectionFinish";
export type { FirstSectionFinish as FirstBreath } from "./firstSectionFinish";
