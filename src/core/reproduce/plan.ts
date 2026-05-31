import type {  DiscoveredSkill,
  LockedSkill,
  ReproducePlanItem,
  ReproduceReason,
  SkillSource,
  SkillsLock,
  SourcesFile,
} from "../../types.js";
import { decodeSkillRoot } from "../paths.js";
import { verifySkillsAgainstLock } from "../verify.js";
import { resolveInstallSource } from "./resolve-source.js";
import { hasSnapshot } from "./snapshot.js";

function sourceForSkill(
  skill: LockedSkill,
  sourcesFile: SourcesFile | null,
): SkillSource | undefined {
  return skill.source ?? sourcesFile?.mappings.find((mapping) => mapping.skill === skill.name)?.source;
}

function chooseInstaller(source: SkillSource | undefined, skillName: string): ReproducePlanItem["installer"] {
  if (!source) {
    return "snapshot";
  }
  return resolveInstallSource(source, skillName).installer;
}

export function sortSkillsByDependencies(skills: LockedSkill[]): LockedSkill[] {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: LockedSkill[] = [];

  function visit(name: string): void {
    if (visited.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      return;
    }
    visiting.add(name);
    const skill = byName.get(name);
    for (const dep of skill?.dependencies ?? []) {
      if (byName.has(dep)) {
        visit(dep);
      }
    }
    visiting.delete(name);
    visited.add(name);
    if (skill) {
      sorted.push(skill);
    }
  }

  for (const skill of skills) {
    visit(skill.name);
  }

  return sorted;
}

export async function buildReproducePlan(
  lock: SkillsLock,
  discovered: DiscoveredSkill[],
  sourcesFile: SourcesFile | null,
  options: { scope?: "project" | "all"; projectRoot: string },
): Promise<ReproducePlanItem[]> {
  const scope = options.scope ?? "project";
  const lockedSkills = lock.skills.filter((skill) => scope === "all" || skill.scope === "project");
  const issues = verifySkillsAgainstLock(discovered, { ...lock, skills: lockedSkills });
  const issueBySkillId = new Map(issues.map((issue) => [issue.skillId, issue.kind]));

  const needsAction = lockedSkills.filter((skill) => {
    const issue = issueBySkillId.get(skill.id);
    return issue === "missing-skill" || issue === "file-mismatch" || issue === "missing-file" || issue === "extra-file";
  });

  const plan: ReproducePlanItem[] = [];
  for (const skill of needsAction) {
    const source = sourceForSkill(skill, sourcesFile);
    let reason: ReproduceReason = "missing";
    const issue = issueBySkillId.get(skill.id);
    if (issue === "file-mismatch" || issue === "extra-file" || issue === "missing-file") {
      reason = "hash-mismatch";
    }
    if (!source && !(await hasSnapshot(options.projectRoot, skill.name))) {
      reason = "missing-source";
    }

    plan.push({
      skill,
      source,
      reason,
      installer: chooseInstaller(source, skill.name),
    });
  }

  return sortSkillsByDependencies(plan.map((item) => item.skill)).map((skill) => {
    const existing = plan.find((item) => item.skill.id === skill.id);
    return existing!;
  });
}

export function targetSkillRoot(
  skill: LockedSkill,
  projectRoot: string,
  homeDir: string,
): string {
  return decodeSkillRoot(skill.root, projectRoot, homeDir);
}

export function planSummary(plan: ReproducePlanItem[]): {
  total: number;
  byInstaller: Record<string, number>;
  missingSource: number;
} {
  const byInstaller: Record<string, number> = {};
  let missingSource = 0;
  for (const item of plan) {
    byInstaller[item.installer] = (byInstaller[item.installer] ?? 0) + 1;
    if (item.reason === "missing-source") {
      missingSource += 1;
    }
  }
  return { total: plan.length, byInstaller, missingSource };
}
