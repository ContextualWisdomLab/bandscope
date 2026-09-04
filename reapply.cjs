const fs = require('fs');
const path = require('path');

function patchScoreViewTest() {
    const filePath = path.resolve('apps/desktop/src/features/score/ScoreView.test.tsx');
    let content = fs.readFileSync(filePath, 'utf-8');

    const searchTest = `it("keeps unavailable score storage actions focusable when no project workspace is active", () => {`;
    const addTest = `it("ignores clicks while attaching", async () => {
    const song = makeSong([]);
    render(<ScoreView song={song} projectId="123" onSongUpdate={vi.fn()} />);
    const addBtn = screen.getByRole("button", { name: "Add score" });

    // In our mock, attachScorePdf returns a promise.
    // We can mock it to not resolve immediately, simulating a pending attach
    let resolveAttach: (val: unknown) => void;
    mockInvoke.mockReturnValueOnce(new Promise((resolve) => {
        resolveAttach = resolve;
    }));

    await act(async () => {
        fireEvent.click(addBtn);
    });

    // Second click should hit \`!isAttaching\` branch and do nothing
    await act(async () => {
        fireEvent.click(addBtn);
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Resolve the promise to cleanup
    await act(async () => {
        resolveAttach({ id: "new-score", fileName: "new.pdf" });
    });
  });

  `;

    if (content.includes(searchTest) && !content.includes("ignores clicks while attaching")) {
        content = content.replace(searchTest, addTest + searchTest);
        if (!content.includes('act,')) {
            content = content.replace('fireEvent, render, screen', 'act, fireEvent, render, screen');
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log("Patched ScoreView.test.tsx");
    } else {
        console.log("Could not find search block in ScoreView.test.tsx");
    }
}

function patchScoreView() {
    const filePath = path.resolve('apps/desktop/src/features/score/ScoreView.tsx');
    let content = fs.readFileSync(filePath, 'utf-8');

    const search1 = `function bridgeErrorDetail(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const firstLine = raw?.split(/\\r?\\n/)[0]?.trim();
  return firstLine ? firstLine : fallback;
}`;
    const replace1 = `function bridgeErrorDetail(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const firstLine = raw?.split(/\\r?\\n/)[0]?.trim();
  if (!firstLine) return fallback;

  // Protect against dependency information leakage (paths and secrets)
  if (firstLine.includes("/") || firstLine.includes("\\\\") || firstLine.toLowerCase().includes("token=")) {
    return fallback;
  }

  return firstLine;
}`;

    if (content.includes(search1)) {
        content = content.replace(search1, replace1);
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log("Patched ScoreView.tsx");
    } else {
        console.log("Could not find search blocks in ScoreView.tsx");
    }
}

patchScoreViewTest();
patchScoreView();
