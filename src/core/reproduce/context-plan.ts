import type { DiscoveredContext, LockedContext, SkillsLock } from "../../types.js";
import { verifyContextAgainstLock } from "../verify.js";
import { hasContextSnapshot } from "./snapshot.js";
import { hasRuleSnapshots } from "./rules-restore.js";

export interface ContextPlanItem {
  artifact: LockedContext;
  reason: "missing" | "hash-mismatch";
  restore: "snapshot" | "rules" | "mcp" | "none";
}

export async function buildContextReproducePlan(
  lock: SkillsLock,
  discovered: DiscoveredContext[],
  projectRoot: string,
  scope: "project" | "all" = "project",
): Promise<ContextPlanItem[]> {
  if (!lock.context?.length) {
    return [];
  }

  const scoped = lock.context.filter((item) => scope === "all" || item.scope === "project");
  const issues = verifyContextAgainstLock(discovered, { ...lock, context: scoped });
  const issueById = new Map(issues.map((issue) => [issue.skillId, issue.kind]));

  const plan: ContextPlanItem[] = [];
  for (const artifact of scoped) {
    const issue = issueById.get(artifact.id);
    if (!issue) {
      continue;
    }

    const reason = issue === "missing-context" ? "missing" : "hash-mismatch";
    let restore: ContextPlanItem["restore"] = "none";

    if (await hasContextSnapshot(projectRoot, artifact.id)) {
      restore = "snapshot";
    } else if (artifact.kind === "rule" && (await hasRuleSnapshots(projectRoot))) {
      restore = "rules";
    } else if (artifact.kind === "mcp") {
      restore = "mcp";
    }

    plan.push({ artifact, reason, restore });
  }

  return plan;
}

export function extractMcpServerRefs(lock: SkillsLock): string[] {
  const refs = lock.manifests?.flatMap(
    (manifest) => manifest.entries?.filter((entry) => entry.startsWith("mcp:")).map((entry) => entry.slice(4)) ?? [],
  ) ?? [];
  return [...new Set(refs)];
}
