import type { LockedSkill, SkillSource, SkillsLock, SourcesFile } from "../types.js";
import { resolveInstallSource } from "./reproduce/resolve-source.js";
import { runCommand } from "./reproduce/shell.js";

export type OutdatedStatus = "current" | "outdated" | "unpinned" | "unknown" | "local";

export interface OutdatedSkill {
  skill: string;
  source: SkillSource;
  current: string;
  latest?: string;
  status: OutdatedStatus;
  message: string;
}

function sourceForSkill(skill: LockedSkill, sourcesFile: SourcesFile | null): SkillSource | undefined {
  return skill.source ?? sourcesFile?.mappings.find((entry) => entry.skill === skill.name)?.source;
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

async function fetchNpmLatest(packageRef: string): Promise<string | null> {
  const { name } = parseNpmName(packageRef);
  const encoded = name.replace("/", "%2F");
  try {
    const response = await fetch(`https://registry.npmjs.org/${encoded}/latest`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { version?: string };
    return payload.version ?? null;
  } catch {
    return null;
  }
}

async function fetchGitHead(gitUrl: string): Promise<string | null> {
  const result = await runCommand("git", ["ls-remote", gitUrl, "HEAD"], process.cwd());
  if (result.code !== 0) {
    return null;
  }
  const line = result.stdout.trim().split("\n")[0];
  return line?.split("\t")[0]?.slice(0, 12) ?? null;
}

export async function checkOutdatedSkills(
  lock: SkillsLock,
  sourcesFile: SourcesFile | null,
  options: { offline?: boolean } = {},
): Promise<OutdatedSkill[]> {
  const results: OutdatedSkill[] = [];

  for (const skill of lock.skills) {
    const source = sourceForSkill(skill, sourcesFile);
    if (!source) {
      results.push({
        skill: skill.name,
        source: { type: "manual", ref: "(none)" },
        current: "(none)",
        status: "unknown",
        message: "No source recorded; run skilllock import or add source to lock",
      });
      continue;
    }

    if (source.type === "manual") {
      results.push({
        skill: skill.name,
        source,
        current: source.ref,
        status: "local",
        message: "Local/manual source has no remote version to compare",
      });
      continue;
    }

    if (options.offline) {
      results.push({
        skill: skill.name,
        source,
        current: source.resolved ?? source.ref,
        status: "unknown",
        message: "Offline mode; remote check skipped",
      });
      continue;
    }

    const parsed = resolveInstallSource(source, skill.name);

    if (source.type === "npm") {
      const { version } = parseNpmName(source.ref);
      const current = source.resolved ?? version ?? source.ref;
      const latest = await fetchNpmLatest(source.ref);
      if (!latest) {
        results.push({
          skill: skill.name,
          source,
          current,
          status: "unknown",
          message: "Could not resolve npm latest version",
        });
        continue;
      }
      results.push({
        skill: skill.name,
        source,
        current,
        latest,
        status: current === latest ? "current" : "outdated",
        message: current === latest ? "Up to date" : `Newer version available: ${latest}`,
      });
      continue;
    }

    if (parsed.gitUrl) {
      const current = source.resolved ?? parsed.pin ?? "(unpinned)";
      if (!parsed.pin && !source.resolved) {
        const latest = await fetchGitHead(parsed.gitUrl);
        results.push({
          skill: skill.name,
          source,
          current,
          latest: latest ?? undefined,
          status: "unpinned",
          message: latest
            ? `Source is unpinned; default branch HEAD is ${latest}`
            : "Source is unpinned; pin a ref in lock for reproducibility",
        });
        continue;
      }

      const latest = await fetchGitHead(parsed.gitUrl);
      if (!latest) {
        results.push({
          skill: skill.name,
          source,
          current: String(current),
          status: "unknown",
          message: "Could not resolve git remote HEAD",
        });
        continue;
      }

      const currentShort = String(current).slice(0, 12);
      const matches =
        latest.startsWith(currentShort) ||
        currentShort.startsWith(latest) ||
        String(current) === latest;

      results.push({
        skill: skill.name,
        source,
        current: String(current),
        latest,
        status: matches ? "current" : "outdated",
        message: matches ? "Pinned ref matches remote HEAD" : `Remote HEAD moved to ${latest}`,
      });
      continue;
    }

    results.push({
      skill: skill.name,
      source,
      current: source.ref,
      status: "unknown",
      message: "Source type does not support remote version check yet",
    });
  }

  return results;
}

export function summarizeOutdated(results: OutdatedSkill[]): {
  outdated: number;
  unpinned: number;
  unknown: number;
  current: number;
  local: number;
} {
  return {
    outdated: results.filter((entry) => entry.status === "outdated").length,
    unpinned: results.filter((entry) => entry.status === "unpinned").length,
    unknown: results.filter((entry) => entry.status === "unknown").length,
    current: results.filter((entry) => entry.status === "current").length,
    local: results.filter((entry) => entry.status === "local").length,
  };
}
