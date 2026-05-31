import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveredSkill, LockedContext, LockedSkill, SkillsLock } from "../types.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  skillId: string;
  file: string;
  rule: string;
  message: string;
}

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.+)\s*$/);
    if (field) {
      fields[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return fields;
}

export async function validateSkill(skill: DiscoveredSkill | LockedSkill): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const skillId = skill.id;
  const skillName = skill.name;
  const skillRoot = path.isAbsolute(skill.root) ? skill.root : undefined;
  const skillMdPath = skillRoot
    ? path.join(skillRoot, "SKILL.md")
    : skill.files.find((file) => file.path.endsWith("SKILL.md"))?.path ?? "SKILL.md";

  let content = "";
  if (skillRoot) {
    try {
      content = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
    } catch {
      issues.push({
        severity: "error",
        skillId,
        file: "SKILL.md",
        rule: "missing-skill-md",
        message: "SKILL.md is missing",
      });
      return issues;
    }
  }

  const frontmatter = content ? parseFrontmatter(content) : null;
  if (!frontmatter) {
    issues.push({
      severity: "error",
      skillId,
      file: "SKILL.md",
      rule: "missing-frontmatter",
      message: "SKILL.md must start with YAML frontmatter",
    });
    return issues;
  }

  const name = frontmatter.name ?? skill.name;
  if (!NAME_PATTERN.test(name)) {
    issues.push({
      severity: "error",
      skillId,
      file: "SKILL.md",
      rule: "invalid-name",
      message: `Skill name "${name}" violates agentskills.io naming rules`,
    });
  }

  if (skillRoot && path.basename(skillRoot) !== name) {
    issues.push({
      severity: "warning",
      skillId,
      file: "SKILL.md",
      rule: "name-dir-mismatch",
      message: `Directory "${path.basename(skillRoot)}" should match frontmatter name "${name}"`,
    });
  }

  const description = frontmatter.description ?? ("description" in skill ? skill.description : undefined);
  if (!description || description.length < 10) {
    issues.push({
      severity: "warning",
      skillId,
      file: "SKILL.md",
      rule: "weak-description",
      message: "description should be at least 10 characters and explain when to use the skill",
    });
  }

  if (description && description.length > 1024) {
    issues.push({
      severity: "error",
      skillId,
      file: "SKILL.md",
      rule: "description-too-long",
      message: "description exceeds 1024 characters",
    });
  }

  if (content.split(/\r?\n/).length > 500) {
    issues.push({
      severity: "warning",
      skillId,
      file: "SKILL.md",
      rule: "skill-md-long",
      message: "SKILL.md exceeds 500 lines; move detail to references/",
    });
  }

  return issues;
}

export async function validateSkills(skills: Array<DiscoveredSkill | LockedSkill>): Promise<ValidationIssue[]> {
  const all: ValidationIssue[] = [];
  for (const skill of skills) {
    all.push(...(await validateSkill(skill)));
  }
  return all.sort((a, b) => {
    const order = { error: 0, warning: 1 };
    return order[a.severity] - order[b.severity];
  });
}

export function validateLockfileStructure(lock: SkillsLock): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const skill of lock.skills) {
    if (ids.has(skill.id)) {
      issues.push({
        severity: "error",
        skillId: skill.id,
        file: "skills.lock.yaml",
        rule: "duplicate-skill-id",
        message: `Duplicate skill id "${skill.id}"`,
      });
    }
    ids.add(skill.id);

    if (!skill.files.some((file) => file.path.endsWith("SKILL.md"))) {
      issues.push({
        severity: "error",
        skillId: skill.id,
        file: "skills.lock.yaml",
        rule: "missing-skill-md-entry",
        message: `Locked skill "${skill.name}" has no SKILL.md file entry`,
      });
    }
  }

  for (const artifact of lock.context ?? []) {
    if (artifact.files.length === 0) {
      issues.push({
        severity: "error",
        skillId: artifact.id,
        file: "skills.lock.yaml",
        rule: "empty-context",
        message: `Context "${artifact.name}" has no locked files`,
      });
    }
  }

  return issues;
}

export function validationExitCode(issues: ValidationIssue[], failOn: "error" | "warning" = "error"): number {
  const order = { error: 2, warning: 1 };
  const threshold = failOn === "warning" ? 1 : 2;
  return issues.some((issue) => order[issue.severity] >= threshold) ? 1 : 0;
}
