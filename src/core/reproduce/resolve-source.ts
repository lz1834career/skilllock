import type { ReproduceInstaller, SkillAgent, SkillSource } from "../../types.js";

export interface ParsedInstallSource {
  installer: ReproduceInstaller;
  repo?: string;
  skillSelector?: string;
  packageRef?: string;
  gitUrl?: string;
  gitPath?: string;
  localPath?: string;
  pin?: string;
}

const GITHUB_SHORTHAND = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?(?:#[\w./@-]+)?$/;

function splitRef(ref: string): { base: string; pin?: string } {
  const hashIndex = ref.indexOf("#");
  if (hashIndex === -1) {
    return { base: ref };
  }
  return { base: ref.slice(0, hashIndex), pin: ref.slice(hashIndex + 1) };
}

function parseGithubPath(ref: string, skillName: string): ParsedInstallSource {
  const { base, pin } = splitRef(ref);
  const segments = base.split("/").filter(Boolean);

  if (segments.length >= 3) {
    const repo = `${segments[0]}/${segments[1]}`;
    const pathPart = segments.slice(2).join("/");
    const tail = segments.at(-1) ?? skillName;
    return {
      installer: "skills",
      repo,
      skillSelector: tail === skillName ? skillName : tail,
      gitUrl: `https://github.com/${repo}.git`,
      gitPath: pathPart,
      pin,
    };
  }

  if (segments.length === 2) {
    return {
      installer: "skills",
      repo: base,
      skillSelector: skillName,
      gitUrl: `https://github.com/${base}.git`,
      pin,
    };
  }

  return {
    installer: "git",
    gitUrl: base.startsWith("http") ? base : `https://github.com/${base}.git`,
    gitPath: skillName,
    pin,
  };
}

export function resolveInstallSource(source: SkillSource, skillName: string): ParsedInstallSource {
  const { base, pin } = splitRef(source.ref);

  switch (source.type) {
    case "npm":
      return {
        installer: "skillpm",
        packageRef: source.ref.includes("@") ? source.ref : `${source.ref}@${source.resolved ?? "latest"}`,
        pin: source.resolved ?? pin,
      };
    case "vercel-skills":
      return parseGithubPath(base, skillName);
    case "apm":
      if (GITHUB_SHORTHAND.test(base) || !base.startsWith("http")) {
        return parseGithubPath(base, skillName);
      }
      return { installer: "apm", repo: base, skillSelector: skillName, pin: source.resolved ?? pin };
    case "git":
      if (GITHUB_SHORTHAND.test(base)) {
        return parseGithubPath(base, skillName);
      }
      return {
        installer: "git",
        gitUrl: base,
        gitPath: skillName,
        pin: source.resolved ?? pin,
      };
    case "manual":
      return {
        installer: base.includes("/") || base.includes("\\") ? "copy" : "snapshot",
        localPath: base,
      };
    default:
      return { installer: "snapshot" };
  }
}

export function skillsAgentFlag(agent: SkillAgent): string {
  return agent === "claude" ? "claude-code" : "cursor";
}

export function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}
