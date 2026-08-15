const fs = require('fs');
const testPath = 'apps/desktop/src/features/workspace/PartGraphMap.test.tsx';
let testContent = fs.readFileSync(testPath, 'utf8');

const testToReplace = `  it("does not infer resting state when the active role node is absent", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="missing-role" roleMap={roleMap} />);
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Resting").length).toBeGreaterThan(0);

    // Check that we have elements rendering "No direct handoffs" fallback
    expect(screen.queryAllByText("No direct handoffs").length).toBeGreaterThan(0);
  });`;

const newTest = `  it("does not infer resting state when the active role node is absent", () => {
    render(<PartGraphMap song={mockSong} activeRoleId="missing-role" roleMap={roleMap} />);
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.getAllByText("Resting")).toHaveLength(mockSong.sections.length);
    expect(screen.getAllByText("No direct handoffs")).toHaveLength(mockSong.sections.length);
  });`;

if (testContent.includes(testToReplace)) {
  testContent = testContent.replace(testToReplace, newTest);
  fs.writeFileSync(testPath, testContent, 'utf8');
  console.log("Successfully replaced test content.");
} else {
  console.log("Could not find exact text to replace. Here is the last 500 chars:");
  console.log(testContent.slice(-500));
}
