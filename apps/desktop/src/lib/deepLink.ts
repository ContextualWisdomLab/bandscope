import { validateBandScopeUri } from "@bandscope/shared-types";

/**
 * Parsed details of a deep link
 */
export type ParsedDeepLink = {
  songId: string;
  sectionId: string;
};

/**
 * Parse a deep link URI
 * 
 * @param uri - The URI to parse
 * @returns The parsed deep link or null
 */
export function parseDeepLink(uri: string): ParsedDeepLink | null {
  if (!validateBandScopeUri(uri)) {
    return null;
  }

  // bandscope://song/[songId]/section/[sectionId]
  const match = uri.match(/^bandscope:\/\/song\/([a-zA-Z0-9-]+)\/section\/([a-zA-Z0-9-]+)$/);
  if (!match) {
    return null;
  }
  const [, songId, sectionId] = match;
  if (!songId || !sectionId) {
    return null;
  }

  return { songId, sectionId };
}
