import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollaborationPanel } from "./CollaborationPanel";
import { CommentThread } from "./CommentThread";
import { AssignmentPanel } from "./AssignmentPanel";
import { ApprovalList } from "./ApprovalList";
import type { CollaborationSession, RehearsalSong } from "@bandscope/shared-types";
import { createDemoRehearsalSong } from "@bandscope/shared-types";

const mockSession: CollaborationSession = {
  id: "session-1",
  workspaceId: "workspace-1",
  state: "active",
  participants: [
    { id: "p-1", displayName: "Alice", role: "bass" },
    { id: "p-2", displayName: "Bob", role: "keys" }
  ],
  comments: [
    {
      id: "c-1",
      authorId: "p-1",
      target: { kind: "section", sectionId: "verse-1" },
      body: "Needs more punch here",
      status: "active",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z"
    },
    {
      id: "c-2",
      authorId: "p-2",
      target: { kind: "role", sectionId: "verse-1", roleId: "bass-guitar" },
      body: "I'll simplify this run",
      status: "resolved",
      createdAt: "2026-06-15T10:05:00.000Z",
      updatedAt: "2026-06-15T10:10:00.000Z",
      parentId: "c-1"
    }
  ],
  approvals: [
    {
      roleId: "bass-guitar",
      sectionId: "verse-1",
      status: "approved",
      reviewerId: "p-1",
      comment: "Sounds good",
      updatedAt: "2026-06-15T12:00:00.000Z"
    }
  ],
  assignments: [
    {
      id: "a-1",
      participantId: "p-1",
      roleId: "bass-guitar",
      status: "in_progress",
      notes: "Focus on the turnaround",
      assignedAt: "2026-06-15T09:00:00.000Z"
    }
  ],
  createdAt: "2026-06-15T08:00:00.000Z",
  updatedAt: "2026-06-15T12:00:00.000Z"
};

describe("CollaborationPanel", () => {
  const song: RehearsalSong = createDemoRehearsalSong();

  it("renders empty state when no session is provided", () => {
    render(<CollaborationPanel session={null} song={song} />);
    expect(screen.getByTestId("collaboration-empty")).toBeTruthy();
  });

  it("renders the full collaboration panel with session data", () => {
    render(<CollaborationPanel session={mockSession} song={song} />);
    expect(screen.getByTestId("collaboration-panel")).toBeTruthy();
    expect(screen.getByText("Collaboration")).toBeTruthy();
    expect(screen.getByText("Comments")).toBeTruthy();
    expect(screen.getByText("Assignments")).toBeTruthy();
    expect(screen.getByText("Approvals")).toBeTruthy();
  });

  it("displays participant count", () => {
    render(<CollaborationPanel session={mockSession} song={song} />);
    expect(screen.getByText("2 participants")).toBeTruthy();
  });
});

describe("CommentThread", () => {
  it("renders empty state when no comments are provided", () => {
    render(<CommentThread comments={[]} participants={[]} />);
    expect(screen.getByTestId("comments-empty")).toBeTruthy();
  });

  it("renders top-level comments with author names", () => {
    render(
      <CommentThread
        comments={mockSession.comments}
        participants={mockSession.participants}
      />
    );
    expect(screen.getByTestId("comment-thread")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Needs more punch here")).toBeTruthy();
  });

  it("renders nested replies under parent comments", () => {
    render(
      <CommentThread
        comments={mockSession.comments}
        participants={mockSession.participants}
      />
    );
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("I'll simplify this run")).toBeTruthy();
  });

  it("shows resolved badge for resolved comments", () => {
    const resolvedComment = {
      ...mockSession.comments[0],
      id: "c-resolved",
      status: "resolved" as const
    };
    render(
      <CommentThread
        comments={[resolvedComment]}
        participants={mockSession.participants}
      />
    );
    expect(screen.getByText("Resolved")).toBeTruthy();
  });

  it("calls onResolve when resolve button is clicked", () => {
    const onResolve = vi.fn();
    render(
      <CommentThread
        comments={[mockSession.comments[0]]}
        participants={mockSession.participants}
        onResolve={onResolve}
      />
    );
    const resolveButton = screen.getByRole("button", { name: /resolve/i });
    fireEvent.click(resolveButton);
    expect(onResolve).toHaveBeenCalledWith("c-1");
  });

  it("falls back to authorId when participant is not found", () => {
    const unknownAuthorComment = {
      ...mockSession.comments[0],
      id: "c-unknown",
      authorId: "unknown-person"
    };
    render(
      <CommentThread
        comments={[unknownAuthorComment]}
        participants={mockSession.participants}
      />
    );
    expect(screen.getByText("unknown-person")).toBeTruthy();
  });
});

describe("AssignmentPanel", () => {
  const roleNames = new Map([["bass-guitar", "Bass Guitar"]]);

  it("renders empty state when no assignments are provided", () => {
    render(
      <AssignmentPanel
        assignments={[]}
        participants={mockSession.participants}
        roleNames={roleNames}
      />
    );
    expect(screen.getByTestId("assignments-empty")).toBeTruthy();
  });

  it("renders assignments with participant names and role info", () => {
    render(
      <AssignmentPanel
        assignments={mockSession.assignments}
        participants={mockSession.participants}
        roleNames={roleNames}
      />
    );
    expect(screen.getByTestId("assignment-panel")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bass Guitar")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
  });

  it("shows assignment notes when present", () => {
    render(
      <AssignmentPanel
        assignments={mockSession.assignments}
        participants={mockSession.participants}
        roleNames={roleNames}
      />
    );
    expect(screen.getByText("Focus on the turnaround")).toBeTruthy();
  });

  it("renders all assignment status types", () => {
    const allStatusAssignments = [
      { ...mockSession.assignments[0], id: "a-assigned", status: "assigned" as const },
      { ...mockSession.assignments[0], id: "a-progress", status: "in_progress" as const },
      { ...mockSession.assignments[0], id: "a-done", status: "done" as const }
    ];
    render(
      <AssignmentPanel
        assignments={allStatusAssignments}
        participants={mockSession.participants}
        roleNames={roleNames}
      />
    );
    expect(screen.getByText("Assigned")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
  });
});

describe("ApprovalList", () => {
  const roleNames = new Map([["bass-guitar", "Bass Guitar"]]);
  const sectionLabels = new Map([["verse-1", "verse"]]);

  it("renders empty state when no approvals are provided", () => {
    render(
      <ApprovalList
        approvals={[]}
        participants={mockSession.participants}
        roleNames={roleNames}
        sectionLabels={sectionLabels}
      />
    );
    expect(screen.getByTestId("approvals-empty")).toBeTruthy();
  });

  it("renders approvals with role name, section label, and status", () => {
    render(
      <ApprovalList
        approvals={mockSession.approvals}
        participants={mockSession.participants}
        roleNames={roleNames}
        sectionLabels={sectionLabels}
      />
    );
    expect(screen.getByTestId("approval-list")).toBeTruthy();
    expect(screen.getByText("Bass Guitar")).toBeTruthy();
    expect(screen.getByText("verse")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("shows reviewer name and comment", () => {
    render(
      <ApprovalList
        approvals={mockSession.approvals}
        participants={mockSession.participants}
        roleNames={roleNames}
        sectionLabels={sectionLabels}
      />
    );
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Sounds good")).toBeTruthy();
  });

  it("renders all approval status types", () => {
    const allStatusApprovals = [
      { ...mockSession.approvals[0], status: "pending" as const },
      { ...mockSession.approvals[0], status: "approved" as const },
      { ...mockSession.approvals[0], status: "changes_requested" as const }
    ];
    render(
      <ApprovalList
        approvals={allStatusApprovals}
        participants={mockSession.participants}
        roleNames={roleNames}
        sectionLabels={sectionLabels}
      />
    );
    expect(screen.getByText("Pending review")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("Changes requested")).toBeTruthy();
  });
});
