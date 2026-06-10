import { useEffect, useMemo, useState } from "react";
import {
  SUPPORTED_AUDIO_FORMATS,
  type RehearsalWorkspace,
  type SongRehearsalPack
} from "@bandscope/shared-types";
import {
  createDefaultAnalysisRequest,
  selectLocalAudioSource,
  importYoutubeUrl,
  loadProject,
  saveProject
} from "./lib/analysis";
import {
  enqueueSong,
  subscribeToWorkspaceUpdates,
  getWorkspaceState
} from "./lib/job_runner";
import { createTranslator, detectPreferredLocale } from "./i18n";
import { Workspace } from "./features/workspace/Workspace";
import { EmptyState } from "./features/workspace/WorkspaceStates";
import { parseDeepLink } from "./lib/deepLink";
import { mergeAnnotations } from "./lib/annotations";

/**
 * Returns a translated progress message for a given pack state.
 */
function progressMessage(
  t: ReturnType<typeof createTranslator>,
  state: SongRehearsalPack["packState"]
): string {
  switch (state) {
    case "queued":
      return t("analysisStateQueued");
    case "analyzing":
      return t("analysisStateRunning");
    case "ready":
      return t("analysisStateSucceeded");
    case "failed":
      return t("analysisStateFailed");
    default:
      return "";
  }
}

/**
 * Main application component for the BandScope desktop app.
 */
export function App() {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const defaultRequest = useMemo(() => createDefaultAnalysisRequest(), []);
  
  const [workspace, setWorkspace] = useState<RehearsalWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const [isStarting] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);

  useEffect(() => {
    let unmounted = false;
    let unlistenFn: (() => void) | undefined;
    const unlistenPromise = subscribeToWorkspaceUpdates((ws) => {
      if (!unmounted) setWorkspace(ws);
    });
    
    unlistenPromise.then(u => {
      if (!unmounted) {
        unlistenFn = u;
      } else if (u) {
        u();
      }
    });

    getWorkspaceState().then(ws => {
      if (!unmounted && ws) {
        setWorkspace(ws);
        
        // Check for deep link on load
        if (window.location.hash.startsWith("#bandscope://")) {
          const uri = window.location.hash.slice(1);
          const parsed = parseDeepLink(uri);
          if (parsed) {
            const targetPack = ws.songs.find(s => "song" in s && s.song?.id === parsed.songId);
            if (targetPack) {
              setSelectedPackId(targetPack.id);
            } else {
              setDeepLinkError("Song not found. Ask the leader to share the .bndscp file first");
            }
          }
          window.location.hash = ""; // Clear hash after processing
        }
      }
    });

    /**
     * Handle hash changes for deep linking
     */
    const handleHashChange = () => {
      if (window.location.hash.startsWith("#bandscope://")) {
        const uri = window.location.hash.slice(1);
        const parsed = parseDeepLink(uri);
        if (parsed && workspace) {
          const targetPack = workspace.songs.find(s => "song" in s && s.song?.id === parsed.songId);
          if (targetPack) {
            setSelectedPackId(targetPack.id);
            setDeepLinkError(null);
          } else {
            setDeepLinkError("Song not found. Ask the leader to share the .bndscp file first");
          }
        }
        window.location.hash = ""; // Clear hash after processing
      }
    };
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      unmounted = true;
      window.removeEventListener("hashchange", handleHashChange);
      if (unlistenFn) unlistenFn();
      else unlistenPromise.then(u => u && u());
    };
  }, [workspace]);

  /**
   * Handles selecting a local audio file and enqueueing a new song analysis job.
   */
  const handleChooseLocalAudio = async () => {
    setSelectionError(null);
    const selection = await selectLocalAudioSource();
    if (selection.ok) {
      enqueueSong({
        sourceKind: "local_audio",
        projectId: selection.bootstrap.projectId,
        sourceLabel: selection.bootstrap.source.fileName,
        roleFocus: defaultRequest.roleFocus
      }).catch(err => setSelectionError(err instanceof Error ? err.message : "Failed to enqueue song"));
      return;
    }
    setSelectionError(selection.error.message || t("unsupportedLocalAudio"));
  };

  /**
   * Handles importing a YouTube URL for analysis.
   */
  const handleImportYoutube = async () => {
    setSelectionError(null);
    setIsImporting(true);
    try {
      const selection = await importYoutubeUrl(youtubeUrl);
      if (selection.ok) {
        enqueueSong({
          sourceKind: "local_audio",
          projectId: selection.bootstrap.projectId,
          sourceLabel: "YouTube Import",
          roleFocus: defaultRequest.roleFocus
        });
        setYoutubeUrl("");
      } else {
        setSelectionError(selection.error.message);
      }
    } catch {
      setSelectionError(t("youtubeImportFailed"));
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * Handles enqueueing a default demo song.
   */
  const handleDemoSong = () => {
    enqueueSong(defaultRequest).catch(err => setSelectionError(err instanceof Error ? err.message : "Failed to enqueue song"));
  };

  /**
   * Handles loading an existing project from disk.
   */
  const handleLoadProject = async () => {
    try {
      const loadedWorkspace = await loadProject();
      setWorkspace(loadedWorkspace);
      setWorkspaceError(null);
    } catch (e) {
      if (e instanceof Error && e.message !== "User cancelled") {
        setWorkspaceError(`Failed to load project: ${e.message}`);
      }
    }
  };

  /**
   * Handles saving the current project to disk.
   */
  const handleSaveProject = async () => {
    if (!workspace) return;
    try {
      await saveProject(workspace);
    } catch (e) {
      if (e instanceof Error && e.message !== "User cancelled") {
        setWorkspaceError(`Failed to save project: ${e.message}`);
      }
    }
  };

  /**
   * Renders the list of songs in the current workspace.
   */
  const renderWorkspaceList = () => {
    if (!workspace) return <EmptyState />;
    
    return (
      <div style={{ marginBottom: "24px" }}>
        <h3>Songs in Workspace</h3>
        {workspace.songs.map(pack => (
          <div key={pack.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px", border: "1px solid #eee", marginBottom: "8px", borderRadius: "4px" }}>
            <div>
              <strong>{pack.sourceLabel}</strong>
              <span style={{ marginLeft: "12px", color: pack.packState === "failed" ? "red" : "gray" }}>
                {progressMessage(t, pack.packState)}
              </span>
              {pack.packState === "failed" && "error" in pack && <div style={{ color: "red", fontSize: "0.8em" }}>{pack.error.message}</div>}
            </div>
            <div>
              {pack.packState === "ready" && (
                <button onClick={() => setSelectedPackId(pack.id)}>Open Rehearsal Pack</button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const selectedPack = workspace?.songs.find(s => s.id === selectedPackId);

  return (
    <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0" }}>{workspace?.title || t("appTitle")}</h1>
          <p style={{ color: "#666", margin: "0" }}>{t("appSubtitle")}</p>
        </div>
        <button 
            type="button" 
            onClick={handleSaveProject} 
            aria-disabled={!workspace}
            style={{ 
              padding: "8px 16px", 
              cursor: workspace ? "pointer" : "not-allowed", 
              borderRadius: "4px", 
              backgroundColor: workspace ? "#fff" : "#f5f5f5", 
              border: "1px solid #ccc",
              opacity: workspace ? 1 : 0.5
            }}
          >
            Save Project
          </button>
      </header>

      <div style={{ marginBottom: "24px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <button 
          type="button" 
          onClick={handleChooseLocalAudio} 
          disabled={isStarting || isImporting}
          style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
        >
          {t("chooseLocalAudio")}
        </button>
        
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input 
            type="text" 
            placeholder={t("youtubePlaceholder")} 
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            disabled={isStarting || isImporting}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "200px" }}
          />
          <button 
            type="button" 
            onClick={handleImportYoutube} 
            disabled={!youtubeUrl || isStarting || isImporting}
            style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
          >
            {isImporting ? t("importingYoutube") : t("importYoutube")}
          </button>
        </div>

        <button 
          type="button" 
          onClick={handleLoadProject} 
          disabled={isStarting}
          style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
        >
          Open Project
        </button>

        <button 
          type="button" 
          onClick={handleDemoSong} 
          disabled={isStarting || isImporting}
          style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px", backgroundColor: "#1890ff", color: "white", border: "none" }}
        >
          Add Demo Song
        </button>
      </div>

      <div style={{ marginBottom: "24px", fontSize: "0.9em", color: "#666" }}>
        <p style={{ margin: "4px 0" }}>
          {t("supportedFormats")}: {SUPPORTED_AUDIO_FORMATS.join(", ")}
        </p>
        {selectionError && <p style={{ margin: "4px 0", color: "#a8071a" }}>{selectionError}</p>}
        {workspaceError && <p style={{ margin: "4px 0", color: "#a8071a" }}>{workspaceError}</p>}
        {deepLinkError && (
          <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#fff1f0", border: "1px solid #ffa39e", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ margin: "0 0 12px 0", color: "#a8071a", fontWeight: "bold" }}>{deepLinkError}</p>
            <button onClick={() => setDeepLinkError(null)} style={{ padding: "6px 12px", cursor: "pointer", borderRadius: "4px", border: "1px solid #d9d9d9", backgroundColor: "#fff" }}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      <section>
        {selectedPack && selectedPack.packState === "ready" && "song" in selectedPack ? (
          <div>
            <button onClick={() => setSelectedPackId(null)} style={{ marginBottom: "16px" }}>&larr; Back to Workspace</button>
            <Workspace 
              song={selectedPack.song} 
              annotations={selectedPack.annotations}
              onAddAnnotation={(ann) => {
                if (workspace) {
                  const updatedWorkspace = structuredClone(workspace);
                  const pack = updatedWorkspace.songs.find(s => s.id === selectedPack.id);
                  if (pack) {
                    pack.annotations = mergeAnnotations(pack.annotations, [ann]);
                    setWorkspace(updatedWorkspace);
                    saveProject(updatedWorkspace).catch(e => {
                      if (e instanceof Error && e.message !== "User cancelled") {
                        setWorkspaceError(`Failed to auto-save annotations: ${e.message}`);
                      }
                    });
                  }
                }
              }}
            />
          </div>
        ) : (
          renderWorkspaceList()
        )}
      </section>
    </main>
  );
}
