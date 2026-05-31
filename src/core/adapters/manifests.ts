import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import type { ManifestRecord, SkillSource } from "../../types.js";

export interface ApmManifest {
  path: string;
  skills: string[];
  mcp: string[];
}

export async function parseApmManifest(projectRoot: string): Promise<ApmManifest | null> {
  const apmPath = path.join(projectRoot, "apm.yml");
  let raw: string;
  try {
    raw = await readFile(apmPath, "utf8");
  } catch {
    try {
      raw = await readFile(path.join(projectRoot, "apm.yaml"), "utf8");
    } catch {
      return null;
    }
  }

  const doc = parseDocument(raw).toJSON() as {
    dependencies?: { apm?: string[]; mcp?: string[] };
  };

  return {
    path: path.basename(apmPath),
    skills: doc.dependencies?.apm ?? [],
    mcp: doc.dependencies?.mcp ?? [],
  };
}

export interface NpmSkillManifest {
  path: string;
  packages: string[];
  skilllockSources: SkillSource[];
}

export async function parseNpmManifest(projectRoot: string): Promise<NpmSkillManifest | null> {
  const packagePath = path.join(projectRoot, "package.json");
  let raw: string;
  try {
    raw = await readFile(packagePath, "utf8");
  } catch {
    return null;
  }

  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    skilllock?: { sources?: SkillSource[] };
  };

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const packages = Object.keys(deps).filter(
    (name) => name.includes("skill") || name.startsWith("@") || name.endsWith("-skills"),
  );

  return {
    path: "package.json",
    packages,
    skilllockSources: pkg.skilllock?.sources ?? [],
  };
}

export function apmEntryToSource(entry: string): SkillSource {
  const [ref, version] = entry.split("#");
  return {
    type: "apm",
    ref: ref.trim(),
    resolved: version?.trim(),
  };
}

export function npmPackageToSource(name: string, version: string): SkillSource {
  return {
    type: "npm",
    ref: `${name}@${version.replace(/^\^|~/, "")}`,
    resolved: version,
  };
}

export async function collectManifests(projectRoot: string): Promise<ManifestRecord[]> {
  const manifests: ManifestRecord[] = [];
  const apm = await parseApmManifest(projectRoot);
  if (apm) {
    manifests.push({
      type: "apm",
      path: apm.path,
      entries: [...apm.skills, ...apm.mcp.map((entry) => `mcp:${entry}`)],
    });
  }

  const npm = await parseNpmManifest(projectRoot);
  if (npm) {
    manifests.push({
      type: "npm",
      path: npm.path,
      entries: npm.packages,
    });
  }

  return manifests;
}

export function inferSourcesFromManifests(
  skillNames: string[],
  manifests: ManifestRecord[],
): Array<{ skill: string; source: SkillSource }> {
  const mappings: Array<{ skill: string; source: SkillSource }> = [];
  const apmManifest = manifests.find((manifest) => manifest.type === "apm");

  if (!apmManifest?.entries) {
    return mappings;
  }

  for (const skillName of skillNames) {
    const match = apmManifest.entries.find((entry: string) => {
      const tail = entry.split("/").pop() ?? entry;
      return tail === skillName || entry.endsWith(`/${skillName}`) || entry.includes(skillName);
    });
    if (match) {
      mappings.push({ skill: skillName, source: apmEntryToSource(match) });
    }
  }

  return mappings;
}
