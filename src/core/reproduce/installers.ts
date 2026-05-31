import { access, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReproducePlanItem, ReproduceResult } from "../../types.js";
import { resolveInstallSource, skillsAgentFlag, npxCommand } from "./resolve-source.js";
import {
  getCachedSkillDir,
  getGitCacheRepo,
  storeGitCacheRepo,
  storeSkillInCache,
} from "./cache.js";
import { commandExists, runCommand } from "./shell.js";
import { hasSnapshot, restoreSkillSnapshot } from "./snapshot.js";
import { targetSkillRoot } from "./plan.js";

async function copyDirectory(source: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await rm(dest, { recursive: true, force: true });
  await cp(source, dest, { recursive: true });
}

async function cacheInstalledSkill(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  useCache: boolean,
  dryRun: boolean,
): Promise<void> {
  if (dryRun || !useCache || !item.source) {
    return;
  }
  const targetRoot = targetSkillRoot(item.skill, projectRoot, homeDir);
  try {
    await access(path.join(targetRoot, "SKILL.md"));
    await storeSkillInCache(projectRoot, item.source, item.skill.name, targetRoot);
  } catch {
    // installed elsewhere or incomplete
  }
}

async function installWithSkillsCli(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  dryRun: boolean,
  useCache: boolean,
): Promise<ReproduceResult> {
  if (!item.source) {
    return { skill: item.skill.name, success: false, installer: "skills", message: "Missing source" };
  }

  const parsed = resolveInstallSource(item.source, item.skill.name);
  if (!parsed.repo) {
    return { skill: item.skill.name, success: false, installer: "skills", message: "Could not parse repo" };
  }

  const args = [
    "-y",
    "skills",
    "add",
    parsed.repo,
    "-s",
    parsed.skillSelector ?? item.skill.name,
    "-a",
    skillsAgentFlag(item.skill.agent),
    "--copy",
  ];

  const result = await runCommand(npxCommand(), args, projectRoot, dryRun);
  if (result.code !== 0) {
    return {
      skill: item.skill.name,
      success: false,
      installer: "skills",
      message: result.stderr || result.stdout || "skills add failed",
    };
  }

  if (!dryRun) {
    await cacheInstalledSkill(item, projectRoot, homeDir, useCache, dryRun);
  }

  return {
    skill: item.skill.name,
    success: true,
    installer: "skills",
    message: dryRun ? result.stdout.trim() : `Installed via skills add ${parsed.repo}`,
  };
}

async function installWithSkillpm(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  dryRun: boolean,
  useCache: boolean,
): Promise<ReproduceResult> {
  if (!item.source) {
    return { skill: item.skill.name, success: false, installer: "skillpm", message: "Missing source" };
  }

  const parsed = resolveInstallSource(item.source, item.skill.name);
  const packageRef = parsed.packageRef ?? item.source.ref;
  const result = await runCommand(
    npxCommand(),
    ["-y", "skillpm", "install", packageRef],
    projectRoot,
    dryRun,
  );

  if (result.code !== 0) {
    return {
      skill: item.skill.name,
      success: false,
      installer: "skillpm",
      message: result.stderr || result.stdout || "skillpm install failed",
    };
  }

  if (!dryRun) {
    await cacheInstalledSkill(item, projectRoot, homeDir, useCache, dryRun);
  }

  return {
    skill: item.skill.name,
    success: true,
    installer: "skillpm",
    message: dryRun ? result.stdout.trim() : `Installed via skillpm ${packageRef}`,
  };
}

async function installFromGit(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  dryRun: boolean,
  useCache: boolean,
): Promise<ReproduceResult> {
  if (!item.source) {
    return { skill: item.skill.name, success: false, installer: "git", message: "Missing source" };
  }

  const parsed = resolveInstallSource(item.source, item.skill.name);
  if (!parsed.gitUrl) {
    return { skill: item.skill.name, success: false, installer: "git", message: "Could not parse git URL" };
  }

  if (!(await commandExists("git")) && !dryRun && !(useCache && (await getGitCacheRepo(projectRoot, parsed.gitUrl, parsed.pin)))) {
    return { skill: item.skill.name, success: false, installer: "git", message: "git is not available on PATH" };
  }

  const targetRoot = targetSkillRoot(item.skill, projectRoot, homeDir);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skilllock-git-"));
  let cloneDir = path.join(tempRoot, "repo");

  try {
    if (!dryRun) {
      const cachedRepo = useCache ? await getGitCacheRepo(projectRoot, parsed.gitUrl, parsed.pin) : null;
      if (cachedRepo) {
        cloneDir = cachedRepo;
      } else {
        const cloneArgs = ["clone", "--depth", "1", parsed.gitUrl, cloneDir];
        const clone = await runCommand("git", cloneArgs, projectRoot, false);
        if (clone.code !== 0) {
          return {
            skill: item.skill.name,
            success: false,
            installer: "git",
            message: clone.stderr || "git clone failed",
          };
        }

        if (parsed.pin) {
          await runCommand("git", ["checkout", parsed.pin], cloneDir, false);
        }

        if (useCache) {
          await storeGitCacheRepo(projectRoot, parsed.gitUrl, parsed.pin, cloneDir);
        }
      }

      const candidates = [
        path.join(cloneDir, parsed.gitPath ?? "", item.skill.name),
        path.join(cloneDir, parsed.gitPath ?? ""),
        path.join(cloneDir, "skills", item.skill.name),
        path.join(cloneDir, item.skill.name),
      ];

      let sourceDir: string | undefined;
      for (const candidate of candidates) {
        try {
          await access(path.join(candidate, "SKILL.md"));
          sourceDir = candidate;
          break;
        } catch {
          // continue
        }
      }

      if (!sourceDir) {
        return {
          skill: item.skill.name,
          success: false,
          installer: "git",
          message: `Could not locate SKILL.md for ${item.skill.name} in ${parsed.gitUrl}`,
        };
      }

      await copyDirectory(sourceDir, targetRoot);
      if (useCache && item.source) {
        await storeSkillInCache(projectRoot, item.source, item.skill.name, targetRoot);
      }
    }

    return {
      skill: item.skill.name,
      success: true,
      installer: "git",
      message: dryRun ? `[dry-run] git clone ${parsed.gitUrl}` : `Installed from ${parsed.gitUrl}`,
    };
  } finally {
    if (cloneDir.startsWith(tempRoot)) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function installFromSnapshot(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  dryRun: boolean,
): Promise<ReproduceResult> {
  if (!(await hasSnapshot(projectRoot, item.skill.name))) {
    return {
      skill: item.skill.name,
      success: false,
      installer: "snapshot",
      message: `No snapshot at .skilllock/snapshots/${item.skill.name}. Run skilllock snapshot first.`,
    };
  }

  const targetRoot = targetSkillRoot(item.skill, projectRoot, homeDir);
  if (!dryRun) {
    await restoreSkillSnapshot(targetRoot, projectRoot, item.skill.name);
  }

  return {
    skill: item.skill.name,
    success: true,
    installer: "snapshot",
    message: dryRun ? `[dry-run] restore snapshot ${item.skill.name}` : `Restored snapshot ${item.skill.name}`,
  };
}

async function installFromCopy(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  dryRun: boolean,
  useCache: boolean,
): Promise<ReproduceResult> {
  const parsed = item.source ? resolveInstallSource(item.source, item.skill.name) : undefined;
  const localPath = parsed?.localPath;
  if (!localPath) {
    return installFromSnapshot(item, projectRoot, homeDir, dryRun);
  }

  const sourcePath = path.resolve(projectRoot, localPath);
  const targetRoot = targetSkillRoot(item.skill, projectRoot, homeDir);

  if (useCache && item.source) {
    const cached = await getCachedSkillDir(projectRoot, item.source, item.skill.name);
    if (cached && !dryRun) {
      await copyDirectory(cached, targetRoot);
      return {
        skill: item.skill.name,
        success: true,
        installer: "copy",
        message: `Restored from cache for ${localPath}`,
      };
    }
  }

  if (!dryRun) {
    await copyDirectory(sourcePath, targetRoot);
    if (useCache && item.source) {
      await storeSkillInCache(projectRoot, item.source, item.skill.name, targetRoot);
    }
  }

  return {
    skill: item.skill.name,
    success: true,
    installer: "copy",
    message: dryRun ? `[dry-run] copy ${sourcePath}` : `Copied from ${localPath}`,
  };
}

async function installWithApm(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  dryRun: boolean,
  useCache: boolean,
): Promise<ReproduceResult> {
  const { runApmInstall, synthesizeApmManifest } = await import("./apm-installer.js");
  if (!dryRun && item.source?.type === "apm") {
    await synthesizeApmManifest(projectRoot, {
      lockfileVersion: 2,
      generatedAt: "",
      projectRoot,
      skills: [item.skill],
    });
    const apm = await runApmInstall(projectRoot, false);
    if (apm.ok) {
      return { skill: item.skill.name, success: true, installer: "apm", message: apm.message };
    }
  }

  const skillsResult = await installWithSkillsCli(item, projectRoot, homeDir, dryRun, useCache);
  if (skillsResult.success) {
    return { ...skillsResult, installer: "apm" };
  }

  const gitResult = await installFromGit(item, projectRoot, homeDir, dryRun, useCache);
  return { ...gitResult, installer: "apm" };
}

export async function executePlanItem(
  item: ReproducePlanItem,
  projectRoot: string,
  homeDir: string,
  dryRun: boolean,
  useCache = true,
): Promise<ReproduceResult> {
  if (item.reason === "missing-source" && !(await hasSnapshot(projectRoot, item.skill.name))) {
    return {
      skill: item.skill.name,
      success: false,
      installer: item.installer,
      message: `Skill "${item.skill.name}" has no source and no snapshot`,
    };
  }

  switch (item.installer) {
    case "skills":
      return installWithSkillsCli(item, projectRoot, homeDir, dryRun, useCache);
    case "skillpm":
      return installWithSkillpm(item, projectRoot, homeDir, dryRun, useCache);
    case "git":
      return installFromGit(item, projectRoot, homeDir, dryRun, useCache);
    case "snapshot":
      return installFromSnapshot(item, projectRoot, homeDir, dryRun);
    case "copy":
      return installFromCopy(item, projectRoot, homeDir, dryRun, useCache);
    case "apm":
      return installWithApm(item, projectRoot, homeDir, dryRun, useCache);
    default:
      return installFromSnapshot(item, projectRoot, homeDir, dryRun);
  }
}
