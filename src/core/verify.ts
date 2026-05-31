import type { LockedContext, SkillsLock, VerifyIssue } from "../types.js";
import type { DiscoveredContext, DiscoveredSkill } from "../types.js";

function fileMap(entity: { files: Array<{ path: string; hash: string }> }): Map<string, string> {
  return new Map(entity.files.map((file) => [file.path, file.hash]));
}

function verifyEntityFiles(
  locked: { id: string; name: string; files: LockedSkill["files"] },
  current: { files: LockedSkill["files"] },
  kindLabel: string,
): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const lockedFiles = fileMap(locked);
  const currentFiles = fileMap(current);

  for (const [filePath, hash] of lockedFiles) {
    const currentHash = currentFiles.get(filePath);
    if (!currentHash) {
      issues.push({
        kind: "missing-file",
        skillId: locked.id,
        message: `Missing file ${filePath} in ${kindLabel} "${locked.name}"`,
      });
      continue;
    }
    if (currentHash !== hash) {
      issues.push({
        kind: "file-mismatch",
        skillId: locked.id,
        message: `Hash mismatch for ${filePath} in ${kindLabel} "${locked.name}"`,
      });
    }
  }

  for (const filePath of currentFiles.keys()) {
    if (!lockedFiles.has(filePath)) {
      issues.push({
        kind: "extra-file",
        skillId: locked.id,
        message: `Unexpected file ${filePath} in ${kindLabel} "${locked.name}"`,
      });
    }
  }

  return issues;
}

type LockedSkill = SkillsLock["skills"][number];

export function verifySkillsAgainstLock(discovered: DiscoveredSkill[], lock: SkillsLock): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const discoveredById = new Map(discovered.map((skill) => [skill.id, skill]));
  const lockedById = new Map(lock.skills.map((skill) => [skill.id, skill]));

  for (const locked of lock.skills) {
    const current = discoveredById.get(locked.id);
    if (!current) {
      issues.push({
        kind: "missing-skill",
        skillId: locked.id,
        message: `Locked skill "${locked.name}" is missing from the filesystem`,
      });
      continue;
    }
    issues.push(...verifyEntityFiles(locked, current, "skill"));
  }

  for (const current of discovered) {
    if (!lockedById.has(current.id)) {
      issues.push({
        kind: "extra-skill",
        skillId: current.id,
        message: `Untracked skill "${current.name}" (${current.scope}) is present on disk`,
      });
    }
  }

  return issues;
}

export function verifyContextAgainstLock(
  discovered: DiscoveredContext[],
  lock: SkillsLock,
): VerifyIssue[] {
  if (!lock.context?.length) {
    return [];
  }

  const issues: VerifyIssue[] = [];
  const discoveredById = new Map(discovered.map((artifact) => [artifact.id, artifact]));
  const lockedById = new Map(lock.context.map((artifact) => [artifact.id, artifact]));

  for (const locked of lock.context) {
    const current = discoveredById.get(locked.id);
    if (!current) {
      issues.push({
        kind: "missing-context",
        skillId: locked.id,
        message: `Locked context "${locked.name}" (${locked.kind}) is missing`,
      });
      continue;
    }
    issues.push(...verifyEntityFiles(locked, current, locked.kind));
  }

  for (const current of discovered) {
    if (!lockedById.has(current.id)) {
      issues.push({
        kind: "extra-context",
        skillId: current.id,
        message: `Untracked context "${current.name}" (${current.kind}) is present on disk`,
      });
    }
  }

  return issues;
}

export function verifyAgainstLock(
  discovered: DiscoveredSkill[],
  lock: SkillsLock,
  discoveredContext: DiscoveredContext[] = [],
): VerifyIssue[] {
  return [
    ...verifySkillsAgainstLock(discovered, lock),
    ...verifyContextAgainstLock(discoveredContext, lock),
  ];
}

export interface ContextDiffEntry {
  id: string;
  status: "added" | "removed" | "modified";
  name: string;
}

export function diffContextLocks(before: LockedContext[], after: LockedContext[]): ContextDiffEntry[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(after.map((item) => [item.id, item]));
  const allIds = new Set([...beforeById.keys(), ...afterById.keys()]);
  const entries: ContextDiffEntry[] = [];

  for (const id of [...allIds].sort()) {
    const left = beforeById.get(id);
    const right = afterById.get(id);
    if (!left && right) {
      entries.push({ id, status: "added", name: right.name });
      continue;
    }
    if (left && !right) {
      entries.push({ id, status: "removed", name: left.name });
      continue;
    }
    if (!left || !right) {
      continue;
    }
    const changed = JSON.stringify(left.files) !== JSON.stringify(right.files);
    if (changed) {
      entries.push({ id, status: "modified", name: right.name });
    }
  }

  return entries;
}
