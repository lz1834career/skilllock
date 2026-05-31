import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AuditFinding, DiscoveredSkill } from "../types.js";

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060\u180E]/;
const BIDI_OVERRIDE = /[\u202A-\u202E\u2066-\u2069]/;
const PRIVATE_USE = /[\uE000-\uF8FF]/;

const SUSPICIOUS_PATTERNS: Array<{ rule: string; severity: AuditFinding["severity"]; regex: RegExp; message: string }> = [
  {
    rule: "hidden-instruction",
    severity: "warning",
    regex: /(?:ignore (?:all )?previous instructions|disregard (?:all )?(?:prior|above) rules)/i,
    message: "Possible prompt-injection phrasing detected",
  },
  {
    rule: "exfiltration-hint",
    severity: "warning",
    regex: /(?:curl|fetch|wget).{0,40}(?:pastebin|webhook|discord\.com\/api|requestbin)/i,
    message: "Possible data exfiltration pattern detected",
  },
  {
    rule: "shell-destructive",
    severity: "error",
    regex: /\brm\s+-rf\s+\/(?:\s|$)/,
    message: "Destructive shell command targeting root filesystem",
  },
];

function lineColumnAt(content: string, index: number): { line: number; column: number } {
  const prefix = content.slice(0, index);
  const lines = prefix.split(/\r?\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function snippetAt(content: string, index: number, radius = 24): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + radius);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

async function auditTextFile(
  skill: DiscoveredSkill,
  relativePath: string,
  content: string,
): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  for (const pattern of SUSPICIOUS_PATTERNS) {
    const match = pattern.regex.exec(content);
    if (match?.index !== undefined) {
      const pos = lineColumnAt(content, match.index);
      findings.push({
        severity: pattern.severity,
        rule: pattern.rule,
        skillId: skill.id,
        file: relativePath,
        line: pos.line,
        column: pos.column,
        message: pattern.message,
        snippet: snippetAt(content, match.index),
      });
    }
  }

  for (const [index, char] of [...content].entries()) {
    if (ZERO_WIDTH.test(char) || BIDI_OVERRIDE.test(char) || PRIVATE_USE.test(char)) {
      const pos = lineColumnAt(content, index);
      findings.push({
        severity: "error",
        rule: "unicode-obfuscation",
        skillId: skill.id,
        file: relativePath,
        line: pos.line,
        column: pos.column,
        message: `Suspicious Unicode character U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`,
        snippet: snippetAt(content, index),
      });
    }
  }

  return findings;
}

export async function auditSkills(skills: DiscoveredSkill[]): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  for (const skill of skills) {
    for (const file of skill.files) {
      const absolutePath = path.join(skill.root, file.path);
      let content: string;
      try {
        content = await readFile(absolutePath, "utf8");
      } catch {
        continue;
      }

      const isText =
        file.path.endsWith(".md") ||
        file.path.endsWith(".txt") ||
        file.path.endsWith(".yaml") ||
        file.path.endsWith(".yml") ||
        file.path.endsWith(".json") ||
        file.path.endsWith(".sh") ||
        file.path.endsWith(".js") ||
        file.path.endsWith(".ts");

      if (!isText) {
        continue;
      }

      findings.push(...(await auditTextFile(skill, file.path, content)));
    }

    if (skill.name.includes("--") || skill.name.startsWith("-") || skill.name.endsWith("-")) {
      findings.push({
        severity: "warning",
        rule: "invalid-skill-name",
        skillId: skill.id,
        file: "SKILL.md",
        message: `Skill name "${skill.name}" violates agentskills.io naming rules`,
      });
    }
  }

  return findings.sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

export function auditExitCode(findings: AuditFinding[], failOn: AuditFinding["severity"]): number {
  const order = { error: 2, warning: 1, info: 0 };
  return findings.some((finding) => order[finding.severity] >= order[failOn]) ? 1 : 0;
}
