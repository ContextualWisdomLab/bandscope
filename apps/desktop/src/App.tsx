import { useEffect, useMemo, useState, useRef } from "react";
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
import { generateBndscpArchive } from "./lib/export";
import { parseBndscpArchive, mockResolveMissingAudio } from "./lib/import";
import { createTranslator, detectPreferredLocale } from "./i18n";
import { Workspace } from "./features/workspace/Workspace";
import { EmptyState } from "./features/workspace/WorkspaceStates";

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
  const [missingAudio, setMissingAudio] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let unmounted = false;
    let unlistenFn: (() => void) | undefined;
    const updateMissingAudio = (ws: RehearsalWorkspace) => {
      const missing = ws.songs.filter(s => s.packState === "missing_audio").map(s => s.id);
      setMissingAudio(missing);
    };

    const unlistenPromise = subscribeToWorkspaceUpdates((ws) => {
      if (!unmounted) {
        setWorkspace(ws);
        updateMissingAudio(ws);
      }
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
        updateMissingAudio(ws);
      }
    });

    return () => {
      unmounted = true;
      if (unlistenFn) unlistenFn();
      else unlistenPromise.then(u => u && u());
    };
  }, []);

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
    // TODO: loadProject needs to be updated to return a RehearsalWorkspace instead of RehearsalSong (Issue #xx)
    try {
      const song = await loadProject();
      setWorkspace({
        id: "loaded-ws",
        title: "Loaded Workspace",
        workspaceVersion: 1,
        songs: [{
          id: "loaded-pack",
          packState: "ready",
          sourceLabel: song.title,
          song: song
        }]
      });
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
    // Note: saveProject needs to be updated to accept a RehearsalWorkspace.
    // For now we just save the first ready song.
    if (!workspace) return;
    const readyPack = workspace.songs.find(s => s.packState === "ready");
    if (!readyPack || readyPack.packState !== "ready") return;
    try {
      await saveProject(readyPack.song);
    } catch (e) {
      if (e instanceof Error && e.message !== "User cancelled") {
        setWorkspaceError(`Failed to save project: ${e.message}`);
      }
    }
  };

  /**
   * Handles exporting the workspace for sharing.
   */
  const handleShareWorkspace = async () => {
    if (!workspace) return;
    try {
      const blob = await generateBndscpArchive(workspace, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace.title.replace(/\s+/g, "_") || "workspace"}.bndscp`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setWorkspaceError(`Failed to share workspace: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  /**
   * Handles importing a workspace from a .bndscp file.
   */
  const handleImportWorkspace = async () => {
    fileInputRef.current?.click();
  };

  /**
   * Handles changes to the hidden file input for importing a workspace.
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await parseBndscpArchive(file);
      setWorkspace(result.metadata.workspace);
      setMissingAudio(result.requiresMissingAudio);
      setWorkspaceError(null);
    } catch (err) {
      setWorkspaceError(`Failed to import workspace: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsImporting(false);
      // Reset the input value so the same file can be imported again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  /**
   * Resolves missing audio for a pack.
   */
  const handleResolveMissingAudio = async (packId: string, sourceLabel: string) => {
    try {
      const file = await mockResolveMissingAudio(packId, sourceLabel);
      if (file) {
        enqueueSong({
          sourceKind: "local_audio",
          projectId: packId,
          sourceLabel: file.name,
          roleFocus: defaultRequest.roleFocus
        });
        // missingAudio will be updated by workspace state
      }
    } catch (e) {
      setWorkspaceError(`Failed to resolve audio: ${e instanceof Error ? e.message : "Unknown error"}`);
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
        {workspace.songs.map(pack => {
          const isMissingAudio = missingAudio.includes(pack.id);
          
          return (
            <div key={pack.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px", border: "1px solid #eee", marginBottom: "8px", borderRadius: "4px" }}>
              <div>
                <strong>{pack.sourceLabel}</strong>
                <span style={{ marginLeft: "12px", color: pack.packState === "failed" ? "red" : isMissingAudio ? "orange" : "gray" }}>
                  {isMissingAudio ? "Missing Audio" : progressMessage(t, pack.packState)}
                </span>
                {pack.packState === "failed" && !isMissingAudio && <div style={{ color: "red", fontSize: "0.8em" }}>{pack.error?.message}</div>}
              </div>
              <div>
                {isMissingAudio ? (
                  <button onClick={() => handleResolveMissingAudio(pack.id, pack.sourceLabel)} style={{ backgroundColor: "#faad14", color: "white", border: "none", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}>
                    Locate Audio
                  </button>
                ) : pack.packState === "ready" ? (
                  <button onClick={() => setSelectedPackId(pack.id)}>Open Rehearsal Pack</button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * The currently selected pack.
   */
  const selectedPack = workspace?.songs.find(s => s.id === selectedPackId);

  return (
    <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0" }}>{workspace?.title || t("appTitle")}</h1>
          <p style={{ color: "#666", margin: "0" }}>{t("appSubtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
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
          <button 
            type="button" 
            onClick={handleShareWorkspace} 
            aria-disabled={!workspace}
            style={{ 
              padding: "8px 16px", 
              cursor: workspace ? "pointer" : "not-allowed", 
              borderRadius: "4px", 
              backgroundColor: workspace ? "#1890ff" : "#f5f5f5", 
              color: workspace ? "white" : "inherit",
              border: "1px solid #ccc",
              opacity: workspace ? 1 : 0.5
            }}
          >
            Share Workspace
          </button>
        </div>
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
          onClick={handleImportWorkspace} 
          disabled={isStarting || isImporting}
          style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
        >
          {isImporting ? "Importing..." : "Import Workspace"}
        </button>
        <input 
          type="file" 
          accept=".bndscp" 
          style={{ display: "none" }} 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          data-testid="workspace-import-input"
        />

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
      </div>

      <section>
        {selectedPack && selectedPack.packState === "ready" ? (
          <div>
            <button onClick={() => setSelectedPackId(null)} style={{ marginBottom: "16px" }}>&larr; Back to Workspace</button>
            <Workspace song={selectedPack.song} />
          </div>
        ) : (
          renderWorkspaceList()
        )}
      </section>
    </main>
  );
}
