import path from "node:path";
import type { SkillDiscoveryTarget } from "../types.js";
import { toPosixPath } from "./discover.js";

const HOME_PREFIX = "$HOME/";

export function encodeSkillRoot(skillRoot: string, projectRoot: string, homeDir: string): string {
  const normalizedHome = toPosixPath(homeDir);
  const normalizedRoot = toPosixPath(skillRoot);
  const normalizedProject = toPosixPath(projectRoot);

  if (normalizedRoot.startsWith(`${normalizedHome}/`)) {
    return HOME_PREFIX + normalizedRoot.slice(normalizedHome.length + 1);
  }

  return toPosixPath(path.relative(normalizedProject, skillRoot) || ".");
}

export function decodeSkillRoot(encodedRoot: string, projectRoot: string, homeDir: string): string {
  if (encodedRoot.startsWith(HOME_PREFIX)) {
    return path.join(homeDir, encodedRoot.slice(HOME_PREFIX.length).split("/").join(path.sep));
  }
  return path.resolve(projectRoot, encodedRoot.split("/").join(path.sep));
}

export function targetsFromLock(
  skills: Array<{ agent: SkillDiscoveryTarget["agent"]; scope: SkillDiscoveryTarget["scope"]; root: string }>,
  projectRoot: string,
  homeDir: string,
): SkillDiscoveryTarget[] {
  const groups = new Map<string, SkillDiscoveryTarget>();

  for (const skill of skills) {
    const skillRoot = decodeSkillRoot(skill.root, projectRoot, homeDir);
    const parentRoot = path.dirname(skillRoot);
    const key = `${skill.agent}:${skill.scope}:${parentRoot}`;

    if (!groups.has(key)) {
      groups.set(key, {
        agent: skill.agent,
        scope: skill.scope,
        root: parentRoot,
      });
    }
  }

  return [...groups.values()];
}
