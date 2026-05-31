import type { AuditFinding, SkillTestResult, VerifyIssue } from "../types.js";
import type { ValidationIssue } from "./validate.js";
import { auditExitCode, auditSkills } from "./audit.js";
import { checkCompatibility, checkDependencies, checkPolicySkills } from "./compatibility.js";
import {
  discoverContextFromLock,
  discoverFromLock,
  readLockfile,
  readSourcesFile,
  resolveLockfilePath,
} from "./lockfile.js";
import { readPolicy } from "./policy.js";
import { readTestsFile, runSkillTests } from "./test-runner.js";
import { validateLockfileStructure, validateSkills } from "./validate.js";
import { verifyAgainstLock } from "./verify.js";
import { findUntrackedSkills, type UntrackedSkill } from "./untracked.js";
import { detectProjectDrift, type DriftReport } from "./project-issues.js";
import type { SkillAgent } from "../types.js";

export interface CheckReport {
  verifyIssues: VerifyIssue[];
  validationIssues: ValidationIssue[];
  auditFindings: AuditFinding[];
  testResults: SkillTestResult[];
  dependencyIssues: VerifyIssue[];
  policyIssues: VerifyIssue[];
  untrackedSkills: UntrackedSkill[];
  drift?: DriftReport;
  passed: boolean;
}

export interface CheckOptions {
  projectRoot: string;
  homeDir: string;
  lockfile?: string;
  policy?: string;
  tests?: string;
  skipAudit?: boolean;
  skipTests?: boolean;
  skipValidate?: boolean;
  llm?: boolean;
  requireLlm?: boolean;
  skipUntracked?: boolean;
  skipDrift?: boolean;
  agents?: SkillAgent[];
  includeGlobal?: boolean;
}

export async function runProjectCheck(options: CheckOptions): Promise<CheckReport> {
  const lockPath = resolveLockfilePath(options.projectRoot, options.lockfile);
  const lock = await readLockfile(lockPath);
  const policy = await readPolicy(options.projectRoot, options.policy);

  const skills = await discoverFromLock(lock, options.projectRoot, options.homeDir);
  const context = await discoverContextFromLock(lock, options.projectRoot, options.homeDir);

  const verifyIssues = verifyAgainstLock(skills, lock, context);
  const validationIssues = options.skipValidate
    ? []
    : [...validateLockfileStructure(lock), ...(await validateSkills(skills))];

  const dependencyIssues = checkDependencies(skills);
  const policyIssues = policy ? checkPolicySkills(skills, policy) : [];

  for (const skill of skills) {
    if (policy?.compatibility.enforce ?? true) {
      dependencyIssues.push(...checkCompatibility(skill));
    }
  }

  let auditFindings: AuditFinding[] = [];
  if (!options.skipAudit) {
    auditFindings = await auditSkills(skills);
    if (policy?.audit.denyRules.length) {
      auditFindings = auditFindings.filter((finding) => policy.audit.denyRules.includes(finding.rule));
    }
  }

  let testResults: SkillTestResult[] = [];
  if (!options.skipTests) {
    const testsFile = await readTestsFile(options.projectRoot, options.tests);
    if (testsFile?.tests.length) {
      testResults = await runSkillTests(skills, testsFile, {
        enabled: Boolean(options.llm),
        required: Boolean(options.requireLlm),
      });
    }
  }

  if (policy?.lockfile.requireSources) {
    for (const skill of skills) {
      const locked = lock.skills.find((entry) => entry.id === skill.id);
      if (locked && !locked.source) {
        const sources = await readSourcesFile(options.projectRoot);
        const mapped = sources?.mappings.find((entry) => entry.skill === skill.name);
        if (!mapped) {
          policyIssues.push({
            kind: "policy",
            skillId: skill.id,
            message: `Skill "${skill.name}" has no source in lockfile or .skilllock-sources.yaml`,
          });
        }
      }
    }
  }

  let untrackedSkills: UntrackedSkill[] = [];
  const failOnUntracked = policy?.untracked.failOn ?? true;
  if (!options.skipUntracked && failOnUntracked) {
    untrackedSkills = await findUntrackedSkills(
      options.projectRoot,
      options.homeDir,
      lock,
      options.agents ?? ["cursor"],
      options.includeGlobal ?? false,
    );
    for (const entry of untrackedSkills) {
      verifyIssues.push({
        kind: "extra-skill",
        skillId: entry.skill.id,
        message: `Untracked skill "${entry.skill.name}" at ${entry.skill.root} (run skilllock lock to track or remove it)`,
      });
    }
  }

  let drift: DriftReport | undefined;
  const failOnDrift = policy?.drift.failOn ?? true;
  if (!options.skipDrift && failOnDrift) {
    drift = await detectProjectDrift(lock, options.projectRoot, options.homeDir);
    if (drift.hasDrift) {
      verifyIssues.push({
        kind: "file-mismatch",
        skillId: "skilllock:drift",
        message: `Lockfile drift detected (${drift.skillChanges} skill change(s), ${drift.contextChanges} context change(s)); run skilllock drift`,
      });
    }
  }

  const failAudit = !options.skipAudit && auditExitCode(auditFindings, policy?.audit.failOn ?? "warning") !== 0;
  const failTests = testResults.some((result) => !result.passed);

  const passed =
    verifyIssues.length === 0 &&
    validationIssues.filter((issue) => issue.severity === "error").length === 0 &&
    dependencyIssues.length === 0 &&
    policyIssues.length === 0 &&
    !failAudit &&
    !failTests;

  return {
    verifyIssues,
    validationIssues,
    auditFindings,
    testResults,
    dependencyIssues,
    policyIssues,
    untrackedSkills,
    drift,
    passed,
  };
}
