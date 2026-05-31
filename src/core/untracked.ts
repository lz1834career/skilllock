import type { DiscoveredSkill, SkillAgent, SkillsLock } from "../types.js";
import { defaultDiscoveryTargets, discoverSkills } from "./discover.js";

export interface UntrackedSkill {
  skill: DiscoveredSkill;
  reason: "not-in-lock" | "extra-scope";
}

export async function findUntrackedSkills(
  projectRoot: string,
  homeDir: string,
  lock: SkillsLock,
  agents: SkillAgent[] = ["cursor"],
  includeGlobal = false,
): Promise<UntrackedSkill[]> {
  const targets = defaultDiscoveryTargets(projectRoot, homeDir, agents).filter(
    (target) => includeGlobal || target.scope === "project",
  );
  const discovered = await discoverSkills(targets);
  const lockedIds = new Set(lock.skills.map((skill) => skill.id));

  return discovered
    .filter((skill) => !lockedIds.has(skill.id))
    .map((skill) => ({
      skill,
      reason: "not-in-lock" as const,
    }));
}
