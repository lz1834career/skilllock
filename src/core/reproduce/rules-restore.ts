import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LockedContext, SkillsLock } from "../../types.js";
import { RULES_SNAPSHOT_DIR } from "../../types.js";
import { decodeContextRoot } from "../context.js";
import { hashBuffer } from "../discover.js";

function rulesSnapshotRoot(projectRoot: string): string {
  return path.join(projectRoot, RULES_SNAPSHOT_DIR);
}

function sanitizeRulePath(relativePath: string): string {
  return relativePath.replace(/[:\\]/g, "__");
}

export async function writeRuleSnapshots(
  projectRoot: string,
  rulesRoot: string,
  locked?: LockedContext,
): Promise<number> {
  const files = locked?.files ?? [];
  let count = 0;
  const manifest: Record<string, { hash: string; size: number }> = {};

  for (const file of files) {
    const sourcePath = path.join(rulesRoot, file.path);
    let buffer: Buffer;
    try {
      buffer = await readFile(sourcePath);
    } catch {
      continue;
    }
    const destName = sanitizeRulePath(file.path);
    const destPath = path.join(rulesSnapshotRoot(projectRoot), destName);
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, buffer);
    manifest[file.path] = { hash: hashBuffer(buffer), size: buffer.byteLength };
    count += 1;
  }

  if (count > 0) {
    await writeFile(
      path.join(rulesSnapshotRoot(projectRoot), "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );
  }

  return count;
}

export async function hasRuleSnapshots(projectRoot: string): Promise<boolean> {
  try {
    await readFile(path.join(rulesSnapshotRoot(projectRoot), "manifest.json"));
    return true;
  } catch {
    return false;
  }
}

export async function restoreRulesFromSnapshots(
  projectRoot: string,
  homeDir: string,
  locked: LockedContext,
  dryRun: boolean,
): Promise<{ restored: number; missing: string[] }> {
  const targetRoot = decodeContextRoot(locked.root, projectRoot, homeDir);
  let manifest: Record<string, { hash: string }> = {};
  try {
    manifest = JSON.parse(await readFile(path.join(rulesSnapshotRoot(projectRoot), "manifest.json"), "utf8"));
  } catch {
    return { restored: 0, missing: locked.files.map((file) => file.path) };
  }

  let restored = 0;
  const missing: string[] = [];

  for (const file of locked.files) {
    const snapshotFile = path.join(rulesSnapshotRoot(projectRoot), sanitizeRulePath(file.path));
    const targetFile = path.join(targetRoot, file.path);

    try {
      const buffer = await readFile(snapshotFile);
      if (hashBuffer(buffer) !== file.hash) {
        missing.push(file.path);
        continue;
      }
      if (!dryRun) {
        await mkdir(path.dirname(targetFile), { recursive: true });
        await writeFile(targetFile, buffer);
      }
      restored += 1;
    } catch {
      missing.push(file.path);
    }
  }

  return { restored, missing };
}

export async function restoreAllRulesFromLock(
  projectRoot: string,
  homeDir: string,
  lock: SkillsLock,
  dryRun: boolean,
): Promise<{ restored: number; artifacts: number }> {
  const ruleArtifacts = (lock.context ?? []).filter((item) => item.kind === "rule");
  let restored = 0;

  for (const artifact of ruleArtifacts) {
    const result = await restoreRulesFromSnapshots(projectRoot, homeDir, artifact, dryRun);
    restored += result.restored;
  }

  return { restored, artifacts: ruleArtifacts.length };
}

export async function listRuleSnapshotFiles(projectRoot: string): Promise<string[]> {
  try {
    return (await readdir(rulesSnapshotRoot(projectRoot))).filter((name) => name !== "manifest.json");
  } catch {
    return [];
  }
}
