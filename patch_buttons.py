import re

def update_file():
    with open('apps/desktop/src/App.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Choose local audio
    search_1 = '''                <Button
                  onClick={handleChooseLocalAudio}
                  disabled={analysisInFlight || isStarting || isImporting}
                  variant="secondary"
                  className="min-h-11 w-full border border-cyan-300/20 bg-cyan-300/10 font-semibold text-cyan-50 hover:bg-cyan-300/20 xl:w-auto"
                  aria-label="Choose local audio"
                >'''
    replace_1 = '''                <span
                  tabIndex={analysisInFlight || isStarting || isImporting ? 0 : undefined}
                  title={analysisInFlight || isStarting ? t("actionDisabledAnalysis") : isImporting ? t("actionDisabledImporting") : undefined}
                  className={analysisInFlight || isStarting || isImporting ? "inline-block cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-lg w-full xl:w-auto" : "w-full xl:w-auto"}
                >
                  <Button
                    onClick={handleChooseLocalAudio}
                    disabled={analysisInFlight || isStarting || isImporting}
                    variant="secondary"
                    className="min-h-11 w-full border border-cyan-300/20 bg-cyan-300/10 font-semibold text-cyan-50 hover:bg-cyan-300/20"
                    aria-label="Choose local audio"
                  >'''
    content = content.replace(search_1, replace_1)

    # Close span for 1
    search_1_end = '''                  <Upload className="mr-2 size-4" aria-hidden="true" />
                  {t("chooseLocalAudio")}
                </Button>'''
    replace_1_end = '''                  <Upload className="mr-2 size-4" aria-hidden="true" />
                  {t("chooseLocalAudio")}
                  </Button>
                </span>'''
    content = content.replace(search_1_end, replace_1_end)

    # 2. Import YouTube
    search_2 = '''                  <Button
                    onClick={handleImportYoutube}
                    disabled={!youtubeUrl || analysisInFlight || isStarting || isImporting}
                    variant="outline"
                    className="min-h-10 w-full border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white sm:w-auto"
                    aria-label="Import YouTube"
                  >'''
    replace_2 = '''                  <span
                    tabIndex={!youtubeUrl || analysisInFlight || isStarting || isImporting ? 0 : undefined}
                    title={!youtubeUrl ? t("importYoutubeDisabledEmpty") : analysisInFlight || isStarting ? t("actionDisabledAnalysis") : isImporting ? t("actionDisabledImporting") : undefined}
                    className={!youtubeUrl || analysisInFlight || isStarting || isImporting ? "inline-block cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-lg w-full sm:w-auto" : "w-full sm:w-auto"}
                  >
                    <Button
                      onClick={handleImportYoutube}
                      disabled={!youtubeUrl || analysisInFlight || isStarting || isImporting}
                      variant="outline"
                      className="min-h-10 w-full border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
                      aria-label="Import YouTube"
                    >'''
    content = content.replace(search_2, replace_2)

    # Close span for 2
    search_2_end = '''                    {isImporting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
                    {isImporting ? t("importingYoutube") : t("importYoutube")}
                  </Button>'''
    replace_2_end = '''                    {isImporting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
                    {isImporting ? t("importingYoutube") : t("importYoutube")}
                    </Button>
                  </span>'''
    content = content.replace(search_2_end, replace_2_end)

    # 3. Open Project
    search_3 = '''                <Button
                  onClick={handleLoadProject}
                  disabled={analysisInFlight || isStarting}
                  variant="outline"
                  className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
                  aria-label="Open Project"
                >'''
    replace_3 = '''                <span
                  tabIndex={analysisInFlight || isStarting ? 0 : undefined}
                  title={analysisInFlight || isStarting ? t("actionDisabledAnalysis") : undefined}
                  className={analysisInFlight || isStarting ? "inline-block cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-lg" : undefined}
                >
                  <Button
                    onClick={handleLoadProject}
                    disabled={analysisInFlight || isStarting}
                    variant="outline"
                    className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
                    aria-label="Open Project"
                  >'''
    content = content.replace(search_3, replace_3)

    # Close span for 3
    search_3_end = '''                  <FolderOpen className="mr-2 size-4" aria-hidden="true" />
                  Open Project
                </Button>'''
    replace_3_end = '''                  <FolderOpen className="mr-2 size-4" aria-hidden="true" />
                  Open Project
                  </Button>
                </span>'''
    content = content.replace(search_3_end, replace_3_end)

    # 4. Start analysis
    search_4 = '''                <Button
                  onClick={handleStartAnalysis}
                  disabled={analysisInFlight || isStarting || !selectedBootstrap || isImporting}
                  size="lg"
                  className="min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.28)] hover:from-cyan-300 hover:to-violet-400"
                  aria-label={isStarting ? t("startingAnalysis") : t("startAnalysis")}
                >'''
    replace_4 = '''                <span
                  tabIndex={analysisInFlight || isStarting || !selectedBootstrap || isImporting ? 0 : undefined}
                  title={analysisInFlight || isStarting ? t("actionDisabledAnalysis") : isImporting ? t("actionDisabledImporting") : !selectedBootstrap ? t("startAnalysisDisabledNoAudio") : undefined}
                  className={analysisInFlight || isStarting || !selectedBootstrap || isImporting ? "inline-block cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-lg" : undefined}
                >
                  <Button
                    onClick={handleStartAnalysis}
                    disabled={analysisInFlight || isStarting || !selectedBootstrap || isImporting}
                    size="lg"
                    className="min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.28)] hover:from-cyan-300 hover:to-violet-400"
                    aria-label={isStarting ? t("startingAnalysis") : t("startAnalysis")}
                  >'''
    content = content.replace(search_4, replace_4)

    search_4_end = '''                  )}
                  {isStarting ? t("startingAnalysis") : t("startAnalysis")}
                </Button>'''
    replace_4_end = '''                  )}
                  {isStarting ? t("startingAnalysis") : t("startAnalysis")}
                  </Button>
                </span>'''
    content = content.replace(search_4_end, replace_4_end)

    with open('apps/desktop/src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

update_file()
