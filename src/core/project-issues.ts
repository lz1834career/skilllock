import type { SkillAgent, SkilllockPolicy, SkillsLock, VerifyIssue } from "../types.js";
import { checkCompatibility, checkDependencies, checkPolicySkills } from "./compatibility.js";
import {
  buildLockfile,
  discoverContextFromLock,
  discoverFromLock,
} from "./lockfile.js";
import { findUntrackedSkills } from "./untracked.js";
import { diffContextLocks, verifyAgainstLock } from "./verify.js";
import { diffLocks, summarizeDiff } from "./diff.js";

export interface DriftReport {
  hasDrift: boolean;
  summary: ReturnType<typeof summarizeDiff>;
  skillChanges: number;
  contextChanges: number;
}

export async function detectProjectDrift(
  lock: SkillsLock,
  projectRoot: string,
  homeDir: string,
): Promise<DriftReport> {
  const after = await buildLockfile(projectRoot, homeDir, {
    includeGlobal: lock.skills.some((skill) => skill.scope === "global"),
    includeContext: Boolean(lock.context?.length),
    agents: [...new Set(lock.skills.map((skill) => skill.agent))],
  });
  const entries = diffLocks(lock, after);
  const summary = summarizeDiff(entries);
  const contextDiff = diffContextLocks(lock.context ?? [], after.context ?? []);
  const skillChanges = summary.added + summary.removed + summary.modified;
  const contextChanges = contextDiff.length;

  return {
    hasDrift: skillChanges > 0 || contextChanges > 0,
    summary,
    skillChanges,
    contextChanges,
  };
}

export interface CollectIssuesOptions {
  agents?: SkillAgent[];
  includeGlobal?: boolean;
  skipUntracked?: boolean;
  skipDrift?: boolean;
}

export async function collectProjectIssues(
  lock: SkillsLock,
  projectRoot: string,
  homeDir: string,
  policy: SkilllockPolicy | null,
  options: CollectIssuesOptions = {},
): Promise<{ issues: VerifyIssue[]; drift?: DriftReport }> {
  const skills = await discoverFromLock(lock, projectRoot, homeDir);
  const context = await discoverContextFromLock(lock, projectRoot, homeDir);
  const issues = verifyAgainstLock(skills, lock, context);

  for (const skill of skills) {
    if (policy?.compatibility.enforce ?? true) {
      issues.push(...checkCompatibility(skill));
    }
  }
  issues.push(...checkDependencies(skills));
  if (policy) {
    issues.push(...checkPolicySkills(skills, policy));
  }

  const failOnUntracked = policy?.untracked.failOn ?? true;
  if (failOnUntracked && !options.skipUntracked) {
    const untracked = await findUntrackedSkills(
      projectRoot,
      homeDir,
      lock,
      options.agents ?? ["cursor"],
      options.includeGlobal ?? false,
    );
    for (const entry of untracked) {
      issues.push({
        kind: "extra-skill",
        skillId: entry.skill.id,
        message: `Untracked skill "${entry.skill.name}" at ${entry.skill.root}`,
      });
    }
  }

  let drift: DriftReport | undefined;
  const failOnDrift = policy?.drift.failOn ?? true;
  if (failOnDrift && !options.skipDrift) {
    drift = await detectProjectDrift(lock, projectRoot, homeDir);
    if (drift.hasDrift) {
      issues.push({
        kind: "file-mismatch",
        skillId: "skilllock:drift",
        message: `Lockfile drift detected (${drift.skillChanges} skill change(s), ${drift.contextChanges} context change(s)); run skilllock drift`,
      });
    }
  }

  return { issues, drift };
}
