/**
 * Copy tonight's first instrument check onto the local clipboard.
 *
 * The payload is the same buyer-visible sentence already shown on the ready
 * map. Blank or non-string values fail closed instead of inventing a check.
 * Clipboard failures stay redacted so the UI can name the next action without
 * dumping implementation detail or local environment data.
 */

export type FirstRangeCopyResult = "copied" | "unavailable";

/** Narrow clipboard port so tests can inject success and failure without DOM authority. */
export type ClipboardTextWriter = {
  writeText: (text: string) => Promise<boolean>;
};

/** Return whether untrusted copy text is a non-blank string. */
function isNonBlankCopyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Use the platform clipboard API when a user-gesture writeText exists. */
function clipboardApiWriter(): ClipboardTextWriter | null {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") {
    return null;
  }

  return {
    writeText: async (text: string): Promise<boolean> => {
      await clipboard.writeText(text);
      return true;
    }
  };
}

/** Fall back to a hidden textarea copy when the clipboard API is absent. */
function execCommandWriter(): ClipboardTextWriter | null {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return null;
  }

  return {
    writeText: async (text: string): Promise<boolean> => {
      const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.setAttribute("aria-hidden", "true");
      textarea.tabIndex = -1;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        return document.execCommand("copy");
      } catch {
        return false;
      } finally {
        textarea.remove();
        if (previouslyFocused?.isConnected) {
          try {
            previouslyFocused.focus({ preventScroll: true });
          } catch {
            // Focus restoration is best-effort and must not turn a successful copy into an error.
          }
        }
      }
    }
  };
}

/**
 * Write tonight's first-check sentence to the clipboard.
 *
 * Injected writers are exclusive so tests stay deterministic. Production
 * tries the clipboard API first, then execCommand, and otherwise reports
 * that copy is unavailable.
 */
export async function copyFirstRangeAction(
  text: unknown,
  writer?: ClipboardTextWriter
): Promise<FirstRangeCopyResult> {
  if (!isNonBlankCopyText(text)) {
    return "unavailable";
  }

  const writers: ClipboardTextWriter[] = writer
    ? [writer]
    : [clipboardApiWriter(), execCommandWriter()].filter((candidate): candidate is ClipboardTextWriter => candidate !== null);

  for (const candidate of writers) {
    try {
      if (await candidate.writeText(text)) {
        return "copied";
      }
    } catch {
      continue;
    }
  }

  return "unavailable";
}
