import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHitPlan } from "./firstHitPlan";

function demoHitSong() {
  return createDemoRehearsalSong();
}

describe("resolveFirstHitPlan malformed runtime metadata", () => {
  it("fails closed when role identity or rehearsal priority is not trustworthy", () => {
    for (const mutate of [
      (role: Record<string, unknown>) => {
        role.id = "   ";
      },
      (role: Record<string, unknown>) => {
        role.name = "   ";
      },
      (role: Record<string, unknown>) => {
        role.rehearsalPriority = "urgent";
      }
    ]) {
      const song = demoHitSong();
      const role = song.sections[0]!.roles[0]! as unknown as Record<string, unknown>;
      mutate(role);
      expect(resolveFirstHitPlan(song)).toBeNull();
    }
  });

  it("fails closed when section role or graph collections are absent", () => {
    const withoutRoles = demoHitSong();
    delete (withoutRoles.sections[0] as unknown as Record<string, unknown>).roles;
    expect(resolveFirstHitPlan(withoutRoles)).toBeNull();

    const withoutGraph = demoHitSong();
    delete (withoutGraph.sections[0] as unknown as Record<string, unknown>).partGraph;
    expect(resolveFirstHitPlan(withoutGraph)).toBeNull();
  });

  it("never invokes an accessor stored at an array index", () => {
    const song = demoHitSong();
    const roles = song.sections[0]!.roles;
    const firstRole = roles[0]!;
    let getterReads = 0;
    Object.defineProperty(roles, 0, {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        return firstRole;
      }
    });

    expect(resolveFirstHitPlan(song)).toBeNull();
    expect(getterReads).toBe(0);
  });

  it("rejects an array Proxy that reports an invalid owned length descriptor", () => {
    const song = demoHitSong();
    const sections = song.sections;
    song.sections = new Proxy(sections, {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (property === "length" && descriptor) {
          return { ...descriptor, value: -1 };
        }
        return descriptor;
      }
    });

    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("contains descriptor traps that throw at the song boundary", () => {
    const song = demoHitSong();
    const proxied = new Proxy(song, {
      getOwnPropertyDescriptor() {
        throw new Error("untrusted descriptor trap");
      }
    });

    expect(resolveFirstHitPlan(proxied)).toBeNull();
  });

  it("skips malformed section records and malformed graph identities", () => {
    const malformedSection = demoHitSong();
    malformedSection.sections = [null as never];
    expect(resolveFirstHitPlan(malformedSection)).toBeNull();

    const malformedGraph = demoHitSong();
    malformedGraph.sections[0]!.partGraph[0]!.role_id = "   ";
    expect(resolveFirstHitPlan(malformedGraph)).toBeNull();
  });
});
