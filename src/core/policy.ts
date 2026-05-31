import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import type { AuditFinding, SkilllockPolicy } from "../types.js";
import { DEFAULT_POLICY, policySchema } from "../types.js";

export async function readPolicy(projectRoot: string, explicit?: string): Promise<SkilllockPolicy | null> {
  const policyPath = explicit ? path.resolve(explicit) : path.join(projectRoot, DEFAULT_POLICY);
  try {
    const raw = await readFile(policyPath, "utf8");
    return policySchema.parse(parseDocument(raw).toJSON());
  } catch {
    return null;
  }
}

export function filterAuditFindings(
  findings: AuditFinding[],
  policy: SkilllockPolicy | null,
): AuditFinding[] {
  if (!policy?.audit.denyRules.length) {
    return findings;
  }

  return findings.filter((finding) => policy.audit.denyRules.includes(finding.rule));
}

export function policyFailLevel(policy: SkilllockPolicy | null): "error" | "warning" | "info" {
  return policy?.audit.failOn ?? "warning";
}

export function isContextKindAllowed(kind: string, policy: SkilllockPolicy | null): boolean {
  const allowed = policy?.context.allowedKinds;
  if (!allowed || allowed.length === 0) {
    return true;
  }
  return allowed.includes(kind as (typeof allowed)[number]);
}
