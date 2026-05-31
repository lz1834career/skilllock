import type { VerifyIssue } from "../types.js";

const REMEDIATION: Record<VerifyIssue["kind"], string> = {
  "missing-skill": "Run `skilllock reproduce` or install the skill, then `skilllock lock`.",
  "extra-skill": "Add to lock with `skilllock lock`, or remove the skill directory.",
  "file-mismatch": "Files changed since lock; run `skilllock drift`, then `skilllock lock` if intentional.",
  "missing-file": "A locked file is missing; restore from snapshot or `skilllock reproduce`.",
  "extra-file": "Unexpected file in skill dir; remove it or update lock with `skilllock lock`.",
  "missing-context": "Context artifact missing; run `skilllock reproduce` or `skilllock snapshot` + restore.",
  "extra-context": "Untracked context on disk; add to lock or remove.",
  compatibility: "Install required tools or disable enforcement in skilllock.policy.yaml.",
  policy: "Fix policy violation or adjust skilllock.policy.yaml.",
  dependency: "Install declared dependencies or update SKILL.md metadata.skilllock.dependencies.",
};

export function explainVerifyIssue(issue: VerifyIssue): string {
  return REMEDIATION[issue.kind] ?? "Review the lockfile and filesystem state.";
}

export function explainVerifyIssues(issues: VerifyIssue[]): ExplainedIssue[] {
  return issues.map((issue) => ({
    ...issue,
    remediation: explainVerifyIssue(issue),
  }));
}

export interface ExplainDocument {
  version: 1;
  passed: boolean;
  issues: ExplainedIssue[];
  drift?: {
    hasDrift: boolean;
    skillChanges: number;
    contextChanges: number;
    summary: {
      added: number;
      removed: number;
      modified: number;
      unchanged: number;
    };
  };
}

export interface ExplainedIssue extends VerifyIssue {
  remediation: string;
}

export function buildExplainDocument(
  issues: VerifyIssue[],
  drift?: {
    hasDrift: boolean;
    skillChanges: number;
    contextChanges: number;
    summary: { added: number; removed: number; modified: number; unchanged: number };
  },
): ExplainDocument {
  const explained = explainVerifyIssues(issues);
  return {
    version: 1,
    passed: explained.length === 0 && !(drift?.hasDrift ?? false),
    issues: explained,
    drift: drift
      ? {
          hasDrift: drift.hasDrift,
          skillChanges: drift.skillChanges,
          contextChanges: drift.contextChanges,
          summary: drift.summary,
        }
      : undefined,
  };
}
