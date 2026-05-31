import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
import {
  collectManifests,
  inferSourcesFromManifests,
  npmPackageToSource,
  parseNpmManifest,
} from "./adapters/manifests.js";
import {
  discoverContextArtifacts,
  encodeContextRoot,
} from "./context.js";
import {
  defaultDiscoveryTargets,
  discoverSkills,
  mergeSkillSources,
  toPosixPath,
} from "./discover.js";
import { encodeSkillRoot, targetsFromLock } from "./paths.js";
import { createSnapshotsFromDisk } from "./reproduce/snapshot.js";
import {
  DEFAULT_SOURCES,
  skillsLockSchema,
  sourcesFileSchema,
  type BuildLockOptions,
  type DiscoveredContext,
  type DiscoveredSkill,
  type LockedContext,
  type SkillsLock,
  type SourceMapping,
  type SourcesFile,
} from "../types.js";

function normalizeSkillForLock(
  skill: DiscoveredSkill,
  projectRoot: string,
  homeDir: string,
): SkillsLock["skills"][number] {
  return {
    id: skill.id,
    name: skill.name,
    scope: skill.scope,
    agent: skill.agent,
    root: encodeSkillRoot(skill.root, projectRoot, homeDir),
    description: skill.description,
    compatibility: skill.compatibility,
    dependencies: skill.dependencies,
    source: skill.source,
    files: skill.files.map((file) => ({
      ...file,
      path: file.path.split(path.sep).join("/"),
    })),
  };
}

function normalizeContextForLock(
  artifact: DiscoveredContext,
  projectRoot: string,
  homeDir: string,
): LockedContext {
  return {
    id: artifact.id,
    kind: artifact.kind,
    name: artifact.name,
    scope: artifact.scope,
    agent: artifact.agent,
    root: encodeContextRoot(artifact.root, projectRoot, homeDir, artifact.kind),
    files: artifact.files.map((file) => ({
      ...file,
      path: file.path.split(path.sep).join("/"),
    })),
  };
}

export async function readSourcesFile(projectRoot: string): Promise<SourcesFile | null> {
  const sourcesPath = path.join(projectRoot, DEFAULT_SOURCES);
  try {
    const raw = await readFile(sourcesPath, "utf8");
    return sourcesFileSchema.parse(parseDocument(raw).toJSON());
  } catch {
    return null;
  }
}

export async function writeSourcesFile(projectRoot: string, sources: SourcesFile): Promise<void> {
  const sourcesPath = path.join(projectRoot, DEFAULT_SOURCES);
  const yaml = stringify(sourcesFileSchema.parse(sources), { lineWidth: 0 });
  await writeFile(sourcesPath, `# Managed by skilllock import\n${yaml}`, "utf8");
}

export async function importSources(projectRoot: string): Promise<SourcesFile> {
  const manifests = await collectManifests(projectRoot);
  const discovered = await discoverSkills(
    defaultDiscoveryTargets(projectRoot, os.homedir(), ["cursor"]).filter(
      (target) => target.scope === "project",
    ),
  );

  const mappings: SourceMapping[] = inferSourcesFromManifests(
    discovered.map((skill) => skill.name),
    manifests,
  );

  const npm = await parseNpmManifest(projectRoot);
  if (npm) {
    const pkg = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(deps)) {
      if (!npm.packages.includes(name)) {
        continue;
      }
      const skillName = name.split("/").pop()?.replace(/^@/, "") ?? name;
      if (!mappings.some((mapping) => mapping.skill === skillName)) {
        mappings.push({ skill: skillName, source: npmPackageToSource(name, version) });
      }
    }
    for (const source of npm.skilllockSources) {
      const skillName = source.ref.split("@")[0]?.split("/").pop() ?? source.ref;
      if (!mappings.some((mapping) => mapping.skill === skillName)) {
        mappings.push({ skill: skillName, source });
      }
    }
  }

  const existing = await readSourcesFile(projectRoot);
  const merged = new Map<string, SourceMapping>();
  for (const mapping of existing?.mappings ?? []) {
    merged.set(mapping.skill, mapping);
  }
  for (const mapping of mappings) {
    merged.set(mapping.skill, mapping);
  }

  const result: SourcesFile = {
    version: 1,
    mappings: [...merged.values()].sort((a, b) => a.skill.localeCompare(b.skill)),
    manifests,
  };

  await writeSourcesFile(projectRoot, result);
  return result;
}

export async function buildLockfile(
  projectRoot: string,
  homeDir: string,
  options: BuildLockOptions = {},
): Promise<SkillsLock> {
  const includeGlobal = options.includeGlobal ?? false;
  const includeContext = options.includeContext ?? true;
  const agents = options.agents ?? ["cursor"];
  const mergeSources = options.mergeSources ?? true;

  const targets = defaultDiscoveryTargets(projectRoot, homeDir, agents).filter(
    (target) => includeGlobal || target.scope === "project",
  );

  let discovered = await discoverSkills(targets);

  if (mergeSources) {
    const sources = await readSourcesFile(projectRoot);
    const manifests = sources?.manifests ?? (await collectManifests(projectRoot));
    const inferred = inferSourcesFromManifests(
      discovered.map((skill) => skill.name),
      manifests,
    );
    const mappings = [...(sources?.mappings ?? []), ...inferred];
    discovered = mergeSkillSources(discovered, mappings);
  }

  const context = includeContext
    ? await discoverContextArtifacts(projectRoot, homeDir, agents)
    : [];

  const manifests = await collectManifests(projectRoot);

  return skillsLockSchema.parse({
    lockfileVersion: 2,
    generatedAt: new Date().toISOString(),
    projectRoot: toPosixPath(projectRoot),
    skills: discovered.map((skill) => normalizeSkillForLock(skill, projectRoot, homeDir)),
    context: context.map((artifact) => normalizeContextForLock(artifact, projectRoot, homeDir)),
    manifests: manifests.length > 0 ? manifests : undefined,
  });
}

export async function readLockfile(lockfilePath: string): Promise<SkillsLock> {
  const raw = await readFile(lockfilePath, "utf8");
  const parsed = parseDocument(raw).toJSON();
  return skillsLockSchema.parse(parsed);
}

export async function writeLockfile(lockfilePath: string, lock: SkillsLock): Promise<void> {
  const normalized = skillsLockSchema.parse({ ...lock, lockfileVersion: 2 });
  const yaml = stringify(normalized, { lineWidth: 0 });
  await writeFile(lockfilePath, `# Generated by skilllock. Do not edit hashes by hand.\n${yaml}`, "utf8");
}

export async function lockProject(
  projectRoot: string,
  homeDir: string,
  options: BuildLockOptions = {},
  lockfilePath?: string,
): Promise<{ lock: SkillsLock; lockfilePath: string; snapshot?: { skills: number; context: number; rules: number } }> {
  const lock = await buildLockfile(projectRoot, homeDir, options);
  const resolvedPath = lockfilePath ?? resolveLockfilePath(projectRoot);
  await writeLockfile(resolvedPath, lock);

  let snapshot: { skills: number; context: number; rules: number } | undefined;
  if (options.writeSnapshot) {
    snapshot = await createSnapshotsFromDisk(projectRoot, homeDir, lock);
  }

  return { lock, lockfilePath: resolvedPath, snapshot };
}

export async function discoverFromLock(
  lock: SkillsLock,
  projectRoot: string,
  homeDir: string,
): Promise<DiscoveredSkill[]> {
  const targets = targetsFromLock(lock.skills, projectRoot, homeDir);
  return discoverSkills(targets);
}

export async function discoverContextFromLock(
  lock: SkillsLock,
  projectRoot: string,
  homeDir: string,
): Promise<DiscoveredContext[]> {
  if (!lock.context?.length) {
    return [];
  }

  const agents = [...new Set(lock.context.map((artifact) => artifact.agent))];
  const discovered = await discoverContextArtifacts(projectRoot, homeDir, agents);
  const lockedIds = new Set(lock.context.map((artifact) => artifact.id));
  return discovered.filter((artifact) => lockedIds.has(artifact.id));
}

export function resolveLockfilePath(projectRoot: string, explicit?: string): string {
  return explicit ? path.resolve(explicit) : path.join(projectRoot, "skills.lock.yaml");
}
