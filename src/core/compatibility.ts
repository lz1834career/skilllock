import { execSync } from "node:child_process";
import type { DiscoveredSkill, SkilllockPolicy, VerifyIssue } from "../types.js";

function commandExists(command: string): boolean {
  try {
    execSync(process.platform === "win32" ? `where ${command}` : `command -v ${command}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function checkCompatibility(skill: DiscoveredSkill): VerifyIssue[] {
  if (!skill.compatibility) {
    return [];
  }

  const issues: VerifyIssue[] = [];
  const text = skill.compatibility.toLowerCase();

  if (text.includes("node")) {
    const match = skill.compatibility.match(/node\s*(\d+)/i);
    const required = match ? Number(match[1]) : undefined;
    const currentMajor = Number(process.versions.node.split(".")[0]);
    if (required && currentMajor < required) {
      issues.push({
        kind: "compatibility",
        skillId: skill.id,
        message: `Skill "${skill.name}" requires Node ${required}+, found ${process.versions.node}`,
      });
    }
  }

  for (const tool of ["git", "docker", "jq", "python", "uv"]) {
    if (text.includes(tool) && !commandExists(tool === "python" ? "python" : tool)) {
      issues.push({
        kind: "compatibility",
        skillId: skill.id,
        message: `Skill "${skill.name}" requires ${tool}, but it is not available on PATH`,
      });
    }
  }

  if (text.includes("internet") || text.includes("network access")) {
    // Informational only; do not fail verify.
  }

  return issues;
}

export function checkDependencies(skills: DiscoveredSkill[]): VerifyIssue[] {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const issues: VerifyIssue[] = [];

  for (const skill of skills) {
    for (const dependency of skill.dependencies ?? []) {
      if (!byName.has(dependency)) {
        issues.push({
          kind: "dependency",
          skillId: skill.id,
          message: `Skill "${skill.name}" depends on missing skill "${dependency}"`,
        });
      }
    }
  }

  return issues;
}

export function checkPolicySkills(skills: DiscoveredSkill[], policy: SkilllockPolicy): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const allow = policy.audit.allowSkills;

  for (const skill of skills) {
    if (policy.audit.denySkills.includes(skill.name)) {
      issues.push({
        kind: "policy",
        skillId: skill.id,
        message: `Skill "${skill.name}" is denied by policy`,
      });
    }
    if (allow && allow.length > 0 && !allow.includes(skill.name)) {
      issues.push({
        kind: "policy",
        skillId: skill.id,
        message: `Skill "${skill.name}" is not in policy allowSkills`,
      });
    }
    if (policy.lockfile.requireSources && !skill.source) {
      issues.push({
        kind: "policy",
        skillId: skill.id,
        message: `Skill "${skill.name}" is missing a declared source`,
      });
    }
  }

  return issues;
}
