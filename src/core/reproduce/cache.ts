import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SkillSource } from "../../types.js";
import { CACHE_DIR } from "../../types.js";

export interface CacheEntry {
  key: string;
  sourceType: SkillSource["type"];
  sourceRef: string;
  path: string;
  fetchedAt: string;
}

export interface CacheIndex {
  version: 1;
  entries: CacheEntry[];
}

function cacheRoot(projectRoot: string): string {
  return path.join(projectRoot, CACHE_DIR);
}

function indexPath(projectRoot: string): string {
  return path.join(cacheRoot(projectRoot), "index.json");
}

export function cacheKeyForSource(source: SkillSource, skillName: string): string {
  return createHash("sha256").update(`${source.type}:${source.ref}:${skillName}`).digest("hex").slice(0, 16);
}

async function readIndex(projectRoot: string): Promise<CacheIndex> {
  try {
    const raw = await readFile(indexPath(projectRoot), "utf8");
    return JSON.parse(raw) as CacheIndex;
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeIndex(projectRoot: string, index: CacheIndex): Promise<void> {
  await mkdir(cacheRoot(projectRoot), { recursive: true });
  await writeFile(indexPath(projectRoot), JSON.stringify(index, null, 2), "utf8");
}

export async function getCachedSkillDir(
  projectRoot: string,
  source: SkillSource,
  skillName: string,
): Promise<string | null> {
  const key = cacheKeyForSource(source, skillName);
  const index = await readIndex(projectRoot);
  const entry = index.entries.find((item) => item.key === key);
  if (!entry) {
    return null;
  }
  const absolute = path.join(projectRoot, entry.path);
  try {
    await readFile(path.join(absolute, "SKILL.md"));
    return absolute;
  } catch {
    return null;
  }
}

export async function storeSkillInCache(
  projectRoot: string,
  source: SkillSource,
  skillName: string,
  skillDir: string,
): Promise<string> {
  const key = cacheKeyForSource(source, skillName);
  const relative = path.join(CACHE_DIR, "skills", key);
  const absolute = path.join(projectRoot, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await rm(absolute, { recursive: true, force: true });
  await cp(skillDir, absolute, { recursive: true });

  const index = await readIndex(projectRoot);
  const without = index.entries.filter((item) => item.key !== key);
  without.push({
    key,
    sourceType: source.type,
    sourceRef: source.ref,
    path: relative.split(path.sep).join("/"),
    fetchedAt: new Date().toISOString(),
  });
  await writeIndex(projectRoot, { version: 1, entries: without });
  return absolute;
}

export function gitCacheDir(projectRoot: string, gitUrl: string, pin?: string): string {
  const key = createHash("sha256").update(`${gitUrl}:${pin ?? "HEAD"}`).digest("hex").slice(0, 16);
  return path.join(projectRoot, CACHE_DIR, "git", key);
}

export async function getGitCacheRepo(projectRoot: string, gitUrl: string, pin?: string): Promise<string | null> {
  const dir = gitCacheDir(projectRoot, gitUrl, pin);
  try {
    await readFile(path.join(dir, ".git", "HEAD"));
    return dir;
  } catch {
    try {
      await readFile(path.join(dir, "SKILL.md"));
      return dir;
    } catch {
      return null;
    }
  }
}

export async function storeGitCacheRepo(
  projectRoot: string,
  gitUrl: string,
  pin: string | undefined,
  repoDir: string,
): Promise<string> {
  const dir = gitCacheDir(projectRoot, gitUrl, pin);
  await mkdir(path.dirname(dir), { recursive: true });
  await rm(dir, { recursive: true, force: true });
  await cp(repoDir, dir, { recursive: true });
  return dir;
}

export async function listCacheEntries(projectRoot: string): Promise<CacheEntry[]> {
  return (await readIndex(projectRoot)).entries;
}

export interface CacheStats {
  entries: number;
  skillDirs: number;
  gitDirs: number;
}

export async function cacheStats(projectRoot: string): Promise<CacheStats> {
  const entries = await listCacheEntries(projectRoot);
  let skillDirs = 0;
  let gitDirs = 0;

  try {
    const skillsDir = path.join(cacheRoot(projectRoot), "skills");
    skillDirs = (await readdir(skillsDir)).length;
  } catch {
    // empty
  }

  try {
    const gitDir = path.join(cacheRoot(projectRoot), "git");
    gitDirs = (await readdir(gitDir)).length;
  } catch {
    // empty
  }

  return { entries: entries.length, skillDirs, gitDirs };
}

export async function clearCache(projectRoot: string, key?: string): Promise<number> {
  const index = await readIndex(projectRoot);
  const toRemove = key ? index.entries.filter((entry) => entry.key === key) : index.entries;
  let removed = 0;

  for (const entry of toRemove) {
    const absolute = path.join(projectRoot, entry.path);
    await rm(absolute, { recursive: true, force: true });
    removed += 1;
  }

  if (key) {
    await writeIndex(projectRoot, {
      version: 1,
      entries: index.entries.filter((entry) => entry.key !== key),
    });
  } else {
    await rm(cacheRoot(projectRoot), { recursive: true, force: true });
  }

  return removed;
}
