import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type {
  DiscoveredSkill,
  LockedFile,
  SkillAgent,
  SkillDiscoveryTarget,
  SkillSource,
} from "../types.js";

const SKILL_FILE = "SKILL.md";

function normalizeRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

/** Normalize CRLF to LF before hashing so lockfiles match across Windows and Unix checkouts. */
export function normalizeLineEndingsForHash(buffer: Buffer): Buffer {
  if (!buffer.includes(0x0d)) {
    return buffer;
  }
  return Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

export function lockedFileFingerprint(buffer: Buffer): { hash: string; size: number } {
  const normalized = normalizeLineEndingsForHash(buffer);
  return {
    hash: `sha256:${createHash("sha256").update(normalized).digest("hex")}`,
    size: normalized.byteLength,
  };
}

export function hashBuffer(buffer: Buffer): string {
  return lockedFileFingerprint(buffer).hash;
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function listSkillFiles(skillRoot: string): Promise<string[]> {
  return fg(["**/*"], {
    cwd: skillRoot,
    onlyFiles: true,
    dot: false,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });
}

interface ParsedFrontmatter {
  name: string;
  description?: string;
  compatibility?: string;
  dependencies?: string[];
  source?: SkillSource;
}

function parseYamlScalar(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)\\s*$`, "m"));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
}

function parseFrontmatter(skillRoot: string, skillMd: string): ParsedFrontmatter {
  const dirName = path.basename(skillRoot);
  const frontmatter = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    return { name: dirName };
  }

  const block = frontmatter[1];
  const name = parseYamlScalar(block, "name") ?? dirName;
  const descriptionMatch = block.match(/^description:\s*>?\s*([\s\S]*?)(?:\n[A-Za-z_][\w-]*:|\n---|$)/m);

  let dependencies: string[] | undefined;
  const skilllockSection = block.match(/skilllock:\s*\n((?:[ \t]+.*\n?)*)/);
  if (skilllockSection?.[1]?.includes("dependencies:")) {
    const depsSection = skilllockSection[1].slice(skilllockSection[1].indexOf("dependencies:"));
    dependencies = [...depsSection.matchAll(/^\s+-\s+(.+)\s*$/gm)].map((match) => match[1].trim());
    if (dependencies.length === 0) {
      dependencies = undefined;
    }
  }

  let source: SkillSource | undefined;
  const sourceType = block.match(/metadata:\s*[\s\S]*?skilllock:[\s\S]*?source:[\s\S]*?type:\s*(\S+)/)?.[1];
  const sourceRef = block.match(/metadata:\s*[\s\S]*?skilllock:[\s\S]*?source:[\s\S]*?ref:\s*(.+)/)?.[1]?.trim();
  const sourceResolved = block.match(/metadata:\s*[\s\S]*?skilllock:[\s\S]*?source:[\s\S]*?resolved:\s*(.+)/)?.[1]?.trim();
  if (sourceType && sourceRef) {
    source = {
      type: sourceType as SkillSource["type"],
      ref: sourceRef.replace(/^['"]|['"]$/g, ""),
      resolved: sourceResolved?.replace(/^['"]|['"]$/g, ""),
    };
  }

  return {
    name,
    description: descriptionMatch?.[1]?.trim().replace(/\n\s+/g, " "),
    compatibility: parseYamlScalar(block, "compatibility"),
    dependencies,
    source,
  };
}

async function discoverSkillAtRoot(
  target: SkillDiscoveryTarget,
  skillRoot: string,
): Promise<DiscoveredSkill | null> {
  const skillMdPath = path.join(skillRoot, SKILL_FILE);
  let skillMd: string;
  try {
    skillMd = (await readFile(skillMdPath, "utf8")).toString();
  } catch {
    return null;
  }

  const relativePaths = await listSkillFiles(skillRoot);
  const files: LockedFile[] = [];

  for (const relativePath of relativePaths.sort()) {
    const absolutePath = path.join(skillRoot, relativePath);
    const buffer = await readFile(absolutePath);
    const fingerprint = lockedFileFingerprint(buffer);
    files.push({
      path: normalizeRelativePath(skillRoot, absolutePath),
      hash: fingerprint.hash,
      size: fingerprint.size,
    });
  }

  const parsed = parseFrontmatter(skillRoot, skillMd);
  const id = `${target.agent}:${target.scope}:${parsed.name}`;

  return {
    id,
    name: parsed.name,
    scope: target.scope,
    agent: target.agent,
    root: skillRoot,
    description: parsed.description,
    compatibility: parsed.compatibility,
    dependencies: parsed.dependencies,
    source: parsed.source,
    files,
  };
}

export async function discoverSkills(targets: SkillDiscoveryTarget[]): Promise<DiscoveredSkill[]> {
  const skills: DiscoveredSkill[] = [];

  for (const target of targets) {
    let entries: string[] = [];
    try {
      entries = await fg("*", {
        cwd: target.root,
        onlyDirectories: true,
        dot: false,
        ignore: ["node_modules", ".git"],
      });
    } catch {
      continue;
    }

    for (const entry of entries.sort()) {
      const skill = await discoverSkillAtRoot(target, path.join(target.root, entry));
      if (skill) {
        skills.push(skill);
      }
    }
  }

  return skills.sort((a, b) => a.id.localeCompare(b.id));
}

const AGENT_SKILL_DIRS: Record<SkillAgent, { project: string; global: string }> = {
  cursor: {
    project: ".cursor/skills",
    global: ".cursor/skills",
  },
  claude: {
    project: ".claude/skills",
    global: ".claude/skills",
  },
};

export function defaultDiscoveryTargets(
  projectRoot: string,
  homeDir: string,
  agents: SkillAgent[] = ["cursor"],
): SkillDiscoveryTarget[] {
  const targets: SkillDiscoveryTarget[] = [];

  for (const agent of agents) {
    targets.push(
      {
        agent,
        scope: "project",
        root: path.join(projectRoot, ...AGENT_SKILL_DIRS[agent].project.split("/")),
      },
      {
        agent,
        scope: "global",
        root: path.join(homeDir, ...AGENT_SKILL_DIRS[agent].global.split("/")),
      },
    );
  }

  return targets;
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function mergeSkillSources(
  skills: DiscoveredSkill[],
  mappings: Array<{ skill: string; source: SkillSource }>,
): DiscoveredSkill[] {
  const byName = new Map(mappings.map((mapping) => [mapping.skill, mapping.source]));

  return skills.map((skill) => ({
    ...skill,
    source: skill.source ?? byName.get(skill.name),
  }));
}
