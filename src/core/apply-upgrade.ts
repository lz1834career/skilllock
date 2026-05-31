import type { ApplyUpgradeChange, SkillSource, SkillsLock, SourcesFile } from "../types.js";
import type { OutdatedSkill } from "./outdated.js";

export interface ApplyUpgradeResult {
  changes: ApplyUpgradeChange[];
  lock: SkillsLock;
  sourcesFile: SourcesFile | null;
}

function parseNpmName(ref: string): { name: string; version?: string } {
  if (ref.startsWith("@")) {
    const atIndex = ref.lastIndexOf("@");
    if (atIndex > 0) {
      return { name: ref.slice(0, atIndex), version: ref.slice(atIndex + 1) };
    }
    return { name: ref };
  }
  const atIndex = ref.lastIndexOf("@");
  if (atIndex > 0) {
    return { name: ref.slice(0, atIndex), version: ref.slice(atIndex + 1) };
  }
  return { name: ref };
}

export function formatSourceRef(source: SkillSource): string {
  const resolved = source.resolved ? `@${source.resolved}` : "";
  return `${source.type}:${source.ref}${resolved}`;
}

export function bumpSourceRef(source: SkillSource, latest: string): SkillSource {
  if (source.type === "npm") {
    const { name } = parseNpmName(source.ref);
    return { ...source, ref: `${name}@${latest}`, resolved: latest };
  }

  const hashIndex = source.ref.indexOf("#");
  const base = hashIndex >= 0 ? source.ref.slice(0, hashIndex) : source.ref;
  return { ...source, ref: `${base}#${latest}`, resolved: latest };
}

function isApplicable(entry: OutdatedSkill): entry is OutdatedSkill & { latest: string } {
  if (!entry.latest) {
    return false;
  }
  return entry.status === "outdated" || entry.status === "unpinned";
}

export function applyUpgrades(
  lock: SkillsLock,
  sourcesFile: SourcesFile | null,
  outdated: OutdatedSkill[],
  options: { skills?: string[] } = {},
): ApplyUpgradeResult {
  const allowed = options.skills ? new Set(options.skills) : undefined;
  const applicable = outdated.filter((entry) => isApplicable(entry) && (!allowed || allowed.has(entry.skill)));

  const nextLock: SkillsLock = structuredClone(lock);
  const nextSources: SourcesFile | null = sourcesFile ? structuredClone(sourcesFile) : null;
  const changes: ApplyUpgradeChange[] = [];

  for (const entry of applicable) {
    const lockedSkill = nextLock.skills.find((skill) => skill.name === entry.skill);
    const mapping = nextSources?.mappings.find((item) => item.skill === entry.skill);
    const currentSource = lockedSkill?.source ?? mapping?.source;
    if (!currentSource) {
      continue;
    }

    const latest = entry.latest;
    if (!latest) {
      continue;
    }

    const bumped = bumpSourceRef(currentSource, latest);
    const before = formatSourceRef(currentSource);
    const after = formatSourceRef(bumped);
    if (before === after) {
      continue;
    }

    let touchedLock = false;
    let touchedSources = false;

    if (lockedSkill) {
      lockedSkill.source = bumped;
      touchedLock = true;
    }
    if (mapping) {
      mapping.source = bumped;
      touchedSources = true;
    }

    const location: ApplyUpgradeChange["location"] =
      touchedLock && touchedSources ? "both"
      : touchedSources ? "sources-file"
      : "lockfile";

    changes.push({ skill: entry.skill, location, before, after });
  }

  return { changes, lock: nextLock, sourcesFile: nextSources };
}

export function summarizeApplyResult(result: ApplyUpgradeResult): { changed: number; skills: string[] } {
  return {
    changed: result.changes.length,
    skills: result.changes.map((change) => change.skill),
  };
}
