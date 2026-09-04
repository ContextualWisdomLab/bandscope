import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstNewDropout, hasTrustworthyAllActiveTimeline } from "./firstNewDropout";

function sectionWithInactiveRoles(
  template: RehearsalSong["sections"][number],
  id: string,
  label: string,
  start: number,
  inactiveRoleIds: readonly string[],
  activeOnlyRoles = false
): RehearsalSong["sections"][number] {
  const inactive = new Set(inactiveRoleIds);
  const partGraph = template.partGraph.map((node) => ({
    ...node,
    is_active: !inactive.has(node.role_id)
  }));
  return {
    ...template,
    id,
    label: label as RehearsalSong["sections"][number]["label"],
    timeRange: { start, end: start + 20 },
    partGraph,
    roles: activeOnlyRoles
      ? template.roles.filter((role) => !inactive.has(role.id))
      : template.roles
  };
}

function leftoverThenFullReturnThenDropout(
  dropoutRoleId = "lead-vocal",
  originalSitOutRoleIds: readonly string[] = ["bass-guitar", "keys-right"]
): RehearsalSong {
  const seed = createDemoRehearsalSong();
  const template = seed.sections[0]!;
  return {
    ...seed,
    sections: [
      sectionWithInactiveRoles(template, "verse-1", "verse", 0, originalSitOutRoleIds),
      sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
      sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [dropoutRoleId])
    ]
  };
}

function fullReturnWithSameSectionDropout(): RehearsalSong {
  const seed = createDemoRehearsalSong();
  const template = seed.sections[0]!;
  return {
    ...seed,
    sections: [
      sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
      sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["lead-vocal"])
    ]
  };
}

describe("hasTrustworthyAllActiveTimeline", () => {
  it("accepts the demo song where every graph node is active", () => {
    expect(hasTrustworthyAllActiveTimeline(createDemoRehearsalSong())).toBe(true);
  });

  it("rejects malformed roots and a later sit-out", () => {
    expect(hasTrustworthyAllActiveTimeline(null)).toBe(false);
    expect(hasTrustworthyAllActiveTimeline({})).toBe(false);
    expect(hasTrustworthyAllActiveTimeline(leftoverThenFullReturnThenDropout())).toBe(false);
    const unlabeled = createDemoRehearsalSong();
    unlabeled.sections[0] = {
      ...unlabeled.sections[0]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(hasTrustworthyAllActiveTimeline(unlabeled)).toBe(false);
    const emptyGraph = createDemoRehearsalSong();
    emptyGraph.sections[0] = { ...emptyGraph.sections[0]!, partGraph: [] };
    expect(hasTrustworthyAllActiveTimeline(emptyGraph)).toBe(false);
  });
});

describe("firstNewDropout", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstNewDropout(createDemoRehearsalSong())).toBeNull();
  });

  it("names the new dropout after a leftover return", () => {
    expect(firstNewDropout(leftoverThenFullReturnThenDropout())).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 2
    });
  });

  it("names a new dropout in the leftover-return section itself", () => {
    expect(firstNewDropout(fullReturnWithSameSectionDropout())).toEqual({
      sectionLabel: "chorus",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 1
    });
  });

  it("uses song-wide role names when inactive analysis roles are omitted from section roles", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "opening-1", "opening", 0, []),
        sectionWithInactiveRoles(template, "verse-1", "verse", 20, ["bass-guitar", "keys-right"], true),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 40, [], true),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 60, ["lead-vocal"], true)
      ]
    };

    expect(firstNewDropout(song)).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 3
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[2] = {
      ...song.sections[2]!,
      label: song.sections[1]!.label
    };

    expect(firstNewDropout(song)).toEqual({
      sectionLabel: "chorus",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 2
    });
  });

  it("skips a leftover sit-out until leftover parts fully return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
          "bass-guitar",
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right", "lead-vocal"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, [])
      ]
    };

    expect(firstNewDropout(song)).toBeNull();
  });

  it("names a new dropout that started during a leftover sit-out once leftover parts return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right", "lead-vocal"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"])
      ]
    };

    expect(firstNewDropout(song)).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "bridge",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 2
    });
  });

  it("does not treat a leftover sit-out as a new dropout", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"])
      ]
    };

    expect(firstNewDropout(song)).toBeNull();
  });

  it("does not treat a remaining leftover as a new dropout", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
          "bass-guitar",
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right", "lead-vocal"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"])
      ]
    };

    expect(firstNewDropout(song)).toBeNull();
  });

  it("does not treat a come-in without a leftover return as a new dropout", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [])
      ]
    };

    expect(firstNewDropout(song)).toBeNull();
  });

  it("does not treat a continued sit-out with nobody returning as a new dropout", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["keys-right", "lead-vocal"])
      ]
    };

    expect(firstNewDropout(song)).toBeNull();
  });

  it("does not treat a tutti leftover return without a later sit-out as a new dropout", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [])
      ]
    };

    expect(firstNewDropout(song)).toBeNull();
  });

  it("skips an all-active section after leftover return until a named new dropout exists", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(template, "tag-1", "tag", 40, []),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["lead-vocal"])
      ]
    };

    expect(firstNewDropout(song)).toEqual({
      sectionLabel: "outro",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 3
    });
  });

  it("keeps the selected new dropout and returning leftover on tonight's first new dropout", () => {
    const song = leftoverThenFullReturnThenDropout();
    expect(firstNewDropout(song, "lead-vocal")).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 2
    });
    expect(firstNewDropout(song, "keys-right")).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 2
    });
    expect(firstNewDropout(song, "missing-role")).toBeNull();
  });

  it("picks the selected new dropout when several parts newly sit out", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["keys-right", "lead-vocal"])
      ]
    };

    expect(firstNewDropout(song)).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand",
      sectionIndex: 2
    });
    expect(firstNewDropout(song, "lead-vocal")?.dropoutRoleId).toBe("lead-vocal");
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenFullReturnThenDropout();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as new-dropout evidence", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[2] = {
      ...song.sections[2]!,
      partGraph: song.sections[2]!.partGraph.map((node) => {
        if (node.role_id !== "lead-vocal") {
          return node;
        }
        const rest: Record<string, unknown> = {
          role_id: node.role_id,
          handoff_to: node.handoff_to,
          handoff_from: node.handoff_from
        };
        return rest as RehearsalSong["sections"][number]["partGraph"][number];
      })
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed on an own is_active accessor", () => {
    const song = leftoverThenFullReturnThenDropout();
    const lead = song.sections[2]!.partGraph.find((node) => node.role_id === "lead-vocal")!;
    const accessorNode: Record<string, unknown> = {
      role_id: lead.role_id,
      handoff_to: lead.handoff_to,
      handoff_from: lead.handoff_from
    };
    Object.defineProperty(accessorNode, "is_active", {
      enumerable: true,
      get: () => false
    });
    song.sections[2] = {
      ...song.sections[2]!,
      partGraph: song.sections[2]!.partGraph.map((node) =>
        node.role_id === "lead-vocal"
          ? (accessorNode as RehearsalSong["sections"][number]["partGraph"][number])
          : node
      )
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed when a Proxy get-trap supplies is_active", () => {
    const song = leftoverThenFullReturnThenDropout();
    const lead = song.sections[2]!.partGraph.find((node) => node.role_id === "lead-vocal")!;
    const target = {
      role_id: lead.role_id,
      handoff_to: lead.handoff_to,
      handoff_from: lead.handoff_from
    };
    const proxied = new Proxy(target, {
      get(record, property, receiver) {
        if (property === "is_active") {
          return false;
        }
        return Reflect.get(record, property, receiver);
      }
    });
    song.sections[2] = {
      ...song.sections[2]!,
      partGraph: song.sections[2]!.partGraph.map((node) =>
        node.role_id === "lead-vocal"
          ? (proxied as RehearsalSong["sections"][number]["partGraph"][number])
          : node
      )
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed on a sparse partGraph", () => {
    const song = leftoverThenFullReturnThenDropout();
    const sparse: RehearsalSong["sections"][number]["partGraph"] = [];
    sparse[0] = song.sections[0]!.partGraph[0]!;
    sparse[2] = song.sections[0]!.partGraph[2]!;
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: sparse
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenFullReturnThenDropout();
    const section = song.sections[2]!;
    const leadNode = section.partGraph.find((node) => node.role_id === "lead-vocal")!;
    const withoutLead = section.partGraph.filter((node) => node.role_id !== "lead-vocal");
    song.sections[2] = {
      ...section,
      partGraph: [...withoutLead, { ...leadNode, is_active: true }, { ...leadNode, is_active: false }]
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed on contradictory role names across sections", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[1] = {
      ...song.sections[1]!,
      roles: song.sections[1]!.roles.map((role) =>
        role.id === "lead-vocal" ? { ...role, name: "Other Vocal" } : role
      )
    };
    expect(firstNewDropout(song)).toBeNull();
    expect(hasTrustworthyAllActiveTimeline(song)).toBe(false);
  });

  it("fails closed on duplicate role identities in one section", () => {
    const song = leftoverThenFullReturnThenDropout();
    const verse = song.sections[0]!;
    song.sections[0] = {
      ...verse,
      roles: [...verse.roles, { ...verse.roles[0]! }]
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed when no named roles exist", () => {
    expect(
      firstNewDropout({
        sections: [{ label: "verse", roles: [], partGraph: [] }]
      } as unknown as RehearsalSong)
    ).toBeNull();
    expect(
      hasTrustworthyAllActiveTimeline({
        sections: [{ label: "verse", roles: [], partGraph: [] }]
      })
    ).toBe(false);
  });

  it("skips blank leftover-return labels until a named new dropout exists", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[2] = {
      ...song.sections[2]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[2] = {
      ...song.sections[2]!,
      partGraph: []
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstNewDropout(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[2] = {
      ...song.sections[2]!,
      partGraph: song.sections[2]!.partGraph.map((node) =>
        node.role_id === "lead-vocal"
          ? { ...node, is_active: 0 as unknown as boolean }
          : node
      )
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed on a sparse roles list", () => {
    const song = leftoverThenFullReturnThenDropout();
    const sparse: RehearsalSong["sections"][number]["roles"] = [];
    sparse[0] = song.sections[0]!.roles[0]!;
    sparse[2] = song.sections[0]!.roles[2]!;
    song.sections[0] = { ...song.sections[0]!, roles: sparse };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed when a role is missing own identity fields", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: [{ name: "Bass Guitar" } as RehearsalSong["sections"][number]["roles"][number]]
    };
    expect(firstNewDropout(song)).toBeNull();
  });

  it("fails closed on blank role names", () => {
    const song = leftoverThenFullReturnThenDropout();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstNewDropout(song)).toBeNull();
  });
});

describe("new-dropout copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{dropoutRoleName} newly sits out at {sectionLabel} after {returnSectionLabel} comes back from {fromSectionLabel}.",
        {
          dropoutRoleName: "Lead Vocal {sectionLabel}",
          sectionLabel: "bridge",
          returnSectionLabel: "chorus",
          fromSectionLabel: "verse"
        }
      )
    ).toBe("Lead Vocal {sectionLabel} newly sits out at bridge after chorus comes back from verse.");
  });
});
