import type { SkillDiffEntry, SkillsLock } from "../types.js";

function skillFileMap(skill: SkillsLock["skills"][number]): Map<string, string> {
  return new Map(skill.files.map((file) => [file.path, file.hash]));
}

export function diffLocks(before: SkillsLock, after: SkillsLock): SkillDiffEntry[] {
  const beforeById = new Map(before.skills.map((skill) => [skill.id, skill]));
  const afterById = new Map(after.skills.map((skill) => [skill.id, skill]));
  const allIds = new Set([...beforeById.keys(), ...afterById.keys()]);
  const entries: SkillDiffEntry[] = [];

  for (const skillId of [...allIds].sort()) {
    const left = beforeById.get(skillId);
    const right = afterById.get(skillId);

    if (!left && right) {
      entries.push({
        skillId,
        status: "added",
        fileChanges: right.files.map((file) => ({
          path: file.path,
          status: "added",
          afterHash: file.hash,
        })),
      });
      continue;
    }

    if (left && !right) {
      entries.push({
        skillId,
        status: "removed",
        fileChanges: left.files.map((file) => ({
          path: file.path,
          status: "removed",
          beforeHash: file.hash,
        })),
      });
      continue;
    }

    if (!left || !right) {
      continue;
    }

    const leftFiles = skillFileMap(left);
    const rightFiles = skillFileMap(right);
    const filePaths = new Set([...leftFiles.keys(), ...rightFiles.keys()]);
    const fileChanges: SkillDiffEntry["fileChanges"] = [];

    for (const filePath of [...filePaths].sort()) {
      const beforeHash = leftFiles.get(filePath);
      const afterHash = rightFiles.get(filePath);

      if (!beforeHash && afterHash) {
        fileChanges.push({ path: filePath, status: "added", afterHash });
      } else if (beforeHash && !afterHash) {
        fileChanges.push({ path: filePath, status: "removed", beforeHash });
      } else if (beforeHash && afterHash && beforeHash !== afterHash) {
        fileChanges.push({ path: filePath, status: "modified", beforeHash, afterHash });
      }
    }

    entries.push({
      skillId,
      status: fileChanges.length === 0 ? "unchanged" : "modified",
      fileChanges,
    });
  }

  return entries;
}

export function summarizeDiff(entries: SkillDiffEntry[]): {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
} {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.status === "added" ? "added" : entry.status === "removed" ? "removed" : entry.status === "modified" ? "modified" : "unchanged"] += 1;
      return acc;
    },
    { added: 0, removed: 0, modified: 0, unchanged: 0 },
  );
}
