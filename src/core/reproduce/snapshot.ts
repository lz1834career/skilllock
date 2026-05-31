import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LockedContext, SkillsLock } from "../../types.js";
import { CONTEXT_SNAPSHOT_DIR, SNAPSHOT_DIR } from "../../types.js";
import { discoverContextFromLock, discoverFromLock } from "../lockfile.js";
import { decodeContextRoot } from "../context.js";
import { writeRuleSnapshots } from "./rules-restore.js";

export function snapshotPath(projectRoot: string, skillName: string): string {
  return path.join(projectRoot, SNAPSHOT_DIR, skillName);
}

export function contextSnapshotPath(projectRoot: string, contextId: string): string {
  return path.join(projectRoot, CONTEXT_SNAPSHOT_DIR, sanitizeId(contextId));
}

function sanitizeId(value: string): string {
  return value.replace(/[:/\\]/g, "__");
}

export function snapshotExists(_projectRoot: string, _skillName: string): boolean {
  return false;
}

export async function hasContextSnapshot(projectRoot: string, contextId: string): Promise<boolean> {
  try {
    await readdir(contextSnapshotPath(projectRoot, contextId));
    return true;
  } catch {
    return false;
  }
}

export async function hasSnapshot(projectRoot: string, skillName: string): Promise<boolean> {
  try {
    await readFile(path.join(snapshotPath(projectRoot, skillName), "SKILL.md"));
    return true;
  } catch {
    return false;
  }
}

export async function writeSkillSnapshot(
  projectRoot: string,
  skillName: string,
  sourceRoot: string,
): Promise<void> {
  const dest = snapshotPath(projectRoot, skillName);
  await rm(dest, { recursive: true, force: true });
  await cp(sourceRoot, dest, { recursive: true });
}

export async function restoreSkillSnapshot(
  targetRoot: string,
  projectRoot: string,
  skillName: string,
): Promise<void> {
  const source = snapshotPath(projectRoot, skillName);
  await mkdir(path.dirname(targetRoot), { recursive: true });
  await rm(targetRoot, { recursive: true, force: true });
  await cp(source, targetRoot, { recursive: true });
}

export async function writeContextSnapshot(
  projectRoot: string,
  contextId: string,
  sourceRoot: string,
  isDirectory: boolean,
): Promise<void> {
  const dest = contextSnapshotPath(projectRoot, contextId);
  await rm(dest, { recursive: true, force: true });
  if (isDirectory) {
    await cp(sourceRoot, dest, { recursive: true });
    return;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(sourceRoot, path.join(dest, path.basename(sourceRoot)));
}

export async function restoreContextSnapshot(
  projectRoot: string,
  homeDir: string,
  locked: LockedContext,
): Promise<void> {
  const sourceDir = contextSnapshotPath(projectRoot, locked.id);
  const target = decodeContextRoot(locked.root, projectRoot, homeDir);
  await mkdir(path.dirname(target), { recursive: true });

  const entries = await readdir(sourceDir).catch(() => []);
  if (entries.length === 1 && locked.kind !== "rule") {
    await cp(path.join(sourceDir, entries[0]!), target);
    return;
  }
  await rm(target, { recursive: true, force: true });
  await cp(sourceDir, target, { recursive: true });
}

export async function createSnapshotsFromDisk(
  projectRoot: string,
  homeDir: string,
  lock: SkillsLock,
): Promise<{ skills: number; context: number; rules: number }> {
  const skills = await discoverFromLock(lock, projectRoot, homeDir);
  let skillCount = 0;
  for (const skill of skills) {
    await writeSkillSnapshot(projectRoot, skill.name, skill.root);
    skillCount += 1;
  }

  const context = await discoverContextFromLock(lock, projectRoot, homeDir);
  let contextCount = 0;
  let rulesCount = 0;
  for (const artifact of context) {
    const locked = lock.context?.find((item) => item.id === artifact.id);
    if (!locked) {
      continue;
    }
    await writeContextSnapshot(
      projectRoot,
      artifact.id,
      artifact.root,
      artifact.kind === "rule",
    );
    contextCount += 1;
    if (artifact.kind === "rule") {
      rulesCount += await writeRuleSnapshots(projectRoot, artifact.root, locked);
    }
  }

  await writeFile(
    path.join(projectRoot, SNAPSHOT_DIR, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        skills: skills.map((skill) => skill.name),
        context: context.map((item) => item.id),
        rulesFiles: rulesCount,
      },
      null,
      2,
    ),
    "utf8",
  );

  return { skills: skillCount, context: contextCount, rules: rulesCount };
}

export async function listMissingSnapshots(
  projectRoot: string,
  planSkillNames: string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const name of planSkillNames) {
    if (!(await hasSnapshot(projectRoot, name))) {
      missing.push(name);
    }
  }
  return missing;
}
