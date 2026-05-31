import type { LockedSkill, SkillsLock, SourcesFile } from "../types.js";

export interface SkillExplanation {
  skill: LockedSkill;
  source?: LockedSkill["source"];
  sourceOrigin: "lockfile" | "sources-file" | "none";
  dependents: string[];
  fileCount: number;
  missingDependencies: string[];
}

export function explainSkill(
  lock: SkillsLock,
  skillName: string,
  sourcesFile: SourcesFile | null,
): SkillExplanation | null {
  const skill = lock.skills.find((entry) => entry.name === skillName);
  if (!skill) {
    return null;
  }

  const mapped = sourcesFile?.mappings.find((entry) => entry.skill === skillName)?.source;
  const source = skill.source ?? mapped;
  const sourceOrigin = skill.source ? "lockfile" : mapped ? "sources-file" : "none";

  const byName = new Set(lock.skills.map((entry) => entry.name));
  const missingDependencies = (skill.dependencies ?? []).filter((dep) => !byName.has(dep));
  const dependents = lock.skills
    .filter((entry) => entry.dependencies?.includes(skillName))
    .map((entry) => entry.name);

  return {
    skill,
    source,
    sourceOrigin,
    dependents,
    fileCount: skill.files.length,
    missingDependencies,
  };
}
