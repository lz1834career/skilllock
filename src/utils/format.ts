import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import type { AuditFinding, ReproduceResult, SkillDiffEntry, SkillTestResult, VerifyIssue } from "../types.js";
import type { ValidationIssue } from "../core/validate.js";
import type { ApplyUpgradeReport } from "../types.js";
import type { CheckReport } from "../core/check.js";
import type { ContextReproduceResult } from "../core/reproduce/reproduce.js";

export function resolveProjectRoot(cwd = process.cwd()): string {
  return path.resolve(cwd);
}

export function resolveHomeDir(): string {
  return process.env.SKILLLOCK_HOME ?? os.homedir();
}

export function printVerifyIssues(issues: VerifyIssue[]): void {
  if (issues.length === 0) {
    console.log(pc.green("✓ All locked agent context matches the filesystem"));
    return;
  }

  for (const issue of issues) {
    const color =
      issue.kind === "file-mismatch" ||
      issue.kind === "missing-skill" ||
      issue.kind === "missing-context" ||
      issue.kind === "policy"
        ? pc.red
        : pc.yellow;
    console.log(color(`• [${issue.kind}] ${issue.skillId}: ${issue.message}`));
  }
}

export function printDiff(entries: SkillDiffEntry[]): void {
  for (const entry of entries) {
    if (entry.status === "unchanged") {
      continue;
    }

    const label =
      entry.status === "added"
        ? pc.green("+")
        : entry.status === "removed"
          ? pc.red("-")
          : pc.yellow("~");

    console.log(`${label} ${entry.skillId} (${entry.status})`);
    for (const change of entry.fileChanges) {
      const prefix =
        change.status === "added" ? pc.green("  +") : change.status === "removed" ? pc.red("  -") : pc.yellow("  ~");
      console.log(`${prefix} ${change.path}`);
    }
  }
}

export function printContextDiff(
  entries: Array<{ id: string; status: "added" | "removed" | "modified"; name: string }>,
): void {
  for (const entry of entries) {
    if (entry.status === "modified") {
      console.log(pc.yellow(`~ ${entry.id} (${entry.name})`));
    } else if (entry.status === "added") {
      console.log(pc.green(`+ ${entry.id} (${entry.name})`));
    } else {
      console.log(pc.red(`- ${entry.id} (${entry.name})`));
    }
  }
}

export function printAuditFindings(findings: AuditFinding[]): void {
  if (findings.length === 0) {
    console.log(pc.green("✓ No audit findings"));
    return;
  }

  for (const finding of findings) {
    const color =
      finding.severity === "error" ? pc.red : finding.severity === "warning" ? pc.yellow : pc.cyan;
    const location =
      finding.line !== undefined
        ? `${finding.file}:${finding.line}:${finding.column ?? 1}`
        : finding.file;
    console.log(color(`• [${finding.severity}] ${finding.rule} ${finding.skillId} @ ${location}`));
    console.log(`  ${finding.message}`);
    if (finding.snippet) {
      console.log(pc.dim(`  snippet: ${finding.snippet}`));
    }
  }
}

export function printTestResults(results: SkillTestResult[]): void {
  for (const result of results) {
    if (result.passed) {
      console.log(pc.green(`✓ ${result.skill}`));
      continue;
    }
    console.log(pc.red(`✗ ${result.skill}`));
    for (const failure of result.failures) {
      console.log(pc.dim(`  - ${failure}`));
    }
  }
}

export function printReproduceResults(results: ReproduceResult[]): void {
  for (const result of results) {
    const color = result.success ? pc.green : pc.red;
    const mark = result.success ? "✓" : "✗";
    console.log(color(`${mark} ${result.skill} [${result.installer}] ${result.message}`));
  }
}

export function printContextReproduceResults(results: ContextReproduceResult[]): void {
  for (const result of results) {
    if (result.method === "skipped") {
      continue;
    }
    const color = result.success ? pc.green : pc.red;
    const mark = result.success ? "✓" : "✗";
    console.log(color(`${mark} ${result.name} [${result.method}] ${result.message}`));
  }
}

export function printValidationIssues(issues: ValidationIssue[]): void {
  if (issues.length === 0) {
    console.log(pc.green("✓ No validation issues"));
    return;
  }
  for (const issue of issues) {
    const color = issue.severity === "error" ? pc.red : pc.yellow;
    console.log(color(`• [${issue.severity}] ${issue.rule} ${issue.skillId} @ ${issue.file}`));
    console.log(`  ${issue.message}`);
  }
}

export function printApplyUpgradeReport(report: ApplyUpgradeReport): void {
  if (report.changes.length === 0) {
    console.log(pc.green("✓ No applicable upgrades"));
    return;
  }

  const prefix = report.dryRun ? "[dry-run] " : "";
  for (const change of report.changes) {
    console.log(pc.bold(`${prefix}${change.skill}`) + pc.dim(` (${change.location})`));
    console.log(pc.dim(`  ${change.before}`));
    console.log(pc.yellow(`→ ${change.after}`));
  }

  if (report.dryRun) {
    console.log(pc.dim(`\n${prefix}Would update ${report.changes.length} skill(s)`));
    return;
  }

  if (report.reproduced) {
    console.log(pc.dim(`• reproduced installed skills`));
  }
  if (report.relocked) {
    console.log(pc.dim(`• refreshed lockfile hashes`));
  }
  if (report.verifyIssues > 0) {
    console.log(pc.red(`✗ verify reported ${report.verifyIssues} issue(s) after apply`));
  } else if (report.checkPassed === false) {
    console.log(pc.red("✗ check failed after apply"));
  } else if (report.checkPassed === true) {
    console.log(pc.green("✓ check passed after apply"));
  } else if (report.reproduced || report.relocked) {
    console.log(pc.green("✓ upgrade apply complete"));
  } else {
    console.log(pc.green(`✓ updated ${report.changes.length} skill source(s)`));
  }
}

export function printCheckReport(report: CheckReport): void {
  console.log(pc.bold("\nVerify"));
  printVerifyIssues(report.verifyIssues);

  if (report.validationIssues.length > 0) {
    console.log(pc.bold("\nValidate"));
    printValidationIssues(report.validationIssues);
  }

  if (report.dependencyIssues.length > 0) {
    console.log(pc.bold("\nDependencies"));
    printVerifyIssues(report.dependencyIssues);
  }

  if (report.policyIssues.length > 0) {
    console.log(pc.bold("\nPolicy"));
    printVerifyIssues(report.policyIssues);
  }

  if (report.auditFindings.length > 0) {
    console.log(pc.bold("\nAudit"));
    printAuditFindings(report.auditFindings);
  }

  if (report.testResults.length > 0) {
    console.log(pc.bold("\nTests"));
    printTestResults(report.testResults);
  }

  if (report.untrackedSkills.length > 0) {
    console.log(pc.bold("\nUntracked"));
    for (const entry of report.untrackedSkills) {
      console.log(pc.yellow(`• ${entry.skill.name} (${entry.skill.agent}/${entry.skill.scope})`));
      console.log(pc.dim(`  ${entry.skill.root}`));
    }
  }

  if (report.drift?.hasDrift) {
    console.log(pc.bold("\nDrift"));
    console.log(
      pc.yellow(
        `• ${report.drift.skillChanges} skill change(s), ${report.drift.contextChanges} context change(s) vs fresh lock`,
      ),
    );
  }

  console.log("");
  if (report.passed) {
    console.log(pc.green("✓ check passed"));
  } else {
    console.log(pc.red("✗ check failed"));
  }
}
