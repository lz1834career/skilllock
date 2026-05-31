import type { ReproduceOptions, ReproduceResult, SkillsLock } from "../../types.js";
import {
  discoverContextFromLock,
  discoverFromLock,
  readLockfile,
  readSourcesFile,
  resolveLockfilePath,
} from "../lockfile.js";
import { readPolicy } from "../policy.js";
import { verifyAgainstLock } from "../verify.js";
import { runBulkApmIfNeeded } from "./apm-installer.js";
import { buildContextReproducePlan } from "./context-plan.js";
import { executePlanItem } from "./installers.js";
import { installMcpServersFromLock } from "./mcp-installer.js";
import { buildReproducePlan, planSummary } from "./plan.js";
import { restoreRulesFromSnapshots } from "./rules-restore.js";
import { restoreContextSnapshot } from "./snapshot.js";

export interface ContextReproduceResult {
  id: string;
  name: string;
  kind: string;
  success: boolean;
  method: "snapshot" | "mcp" | "rules" | "skipped" | "failed";
  message: string;
}

export interface ReproduceReport {
  planCount: number;
  results: ReproduceResult[];
  contextResults: ContextReproduceResult[];
  contextRestored: number;
  verifyIssues: number;
  apmBulk?: { ok: boolean; message: string };
}

type ReproducePart = NonNullable<ReproduceOptions["only"]>[number];

function runsPart(only: ReproducePart[] | undefined, part: ReproducePart): boolean {
  if (!only?.length) {
    return true;
  }
  return only.includes(part);
}

export async function reproduceFromLock(
  lock: SkillsLock,
  options: ReproduceOptions,
): Promise<ReproduceReport> {
  const only = options.only;
  const useCache = options.useCache !== false;
  const runSkills = runsPart(only, "skills");
  const runContext = runsPart(only, "context");
  const runRules = runsPart(only, "rules");
  const runMcp = runsPart(only, "mcp");
  const rulesOnly = Boolean(only?.length === 1 && only[0] === "rules");
  const mcpOnly = Boolean(only?.length === 1 && only[0] === "mcp");

  const sourcesFile = await readSourcesFile(options.projectRoot);
  const discovered = await discoverFromLock(lock, options.projectRoot, options.homeDir);
  const policy = await readPolicy(options.projectRoot);

  const plan = await buildReproducePlan(lock, discovered, sourcesFile, {
    scope: options.scope,
    projectRoot: options.projectRoot,
  });

  const filteredPlan =
    policy?.audit.denySkills.length ?
      plan.filter((item) => !policy.audit.denySkills.includes(item.skill.name))
    : plan;

  const apmItems = filteredPlan.filter((item) => item.installer === "apm" || item.source?.type === "apm");
  let apmBulk: { ok: boolean; message: string } | null = null;

  if (runSkills) {
    apmBulk = await runBulkApmIfNeeded(
      options.projectRoot,
      lock,
      apmItems.length,
      Boolean(options.dryRun),
    );
  }

  const results: ReproduceResult[] = [];
  if (runSkills && apmBulk?.ok) {
    for (const item of apmItems) {
      results.push({
        skill: item.skill.name,
        success: true,
        installer: "apm",
        message: apmBulk.message,
      });
    }
  }

  const remaining =
    runSkills && apmBulk?.ok ?
      filteredPlan.filter((item) => !apmItems.some((apmItem) => apmItem.skill.id === item.skill.id))
    : runSkills ? filteredPlan : [];

  for (const item of remaining) {
    const result = await executePlanItem(
      item,
      options.projectRoot,
      options.homeDir,
      Boolean(options.dryRun),
      useCache,
    );
    if (!result.success && item.installer === "skills" && item.source) {
      const gitRetry = await executePlanItem(
        { ...item, installer: "git" },
        options.projectRoot,
        options.homeDir,
        Boolean(options.dryRun),
        useCache,
      );
      if (gitRetry.success) {
        results.push(gitRetry);
        continue;
      }
      const snapshotRetry = await executePlanItem(
        { ...item, installer: "snapshot" },
        options.projectRoot,
        options.homeDir,
        Boolean(options.dryRun),
        useCache,
      );
      results.push(snapshotRetry.success ? snapshotRetry : result);
      continue;
    }
    results.push(result);
  }

  const contextResults: ContextReproduceResult[] = [];
  let contextRestored = 0;

  if (mcpOnly && !options.dryRun) {
    const mcpResults = await installMcpServersFromLock(options.projectRoot, lock, false);
    const ok = mcpResults.some((entry) => entry.ok);
    for (const artifact of lock.context?.filter((item) => item.kind === "mcp") ?? []) {
      contextResults.push({
        id: artifact.id,
        name: artifact.name,
        kind: artifact.kind,
        success: ok,
        method: ok ? "mcp" : "failed",
        message: mcpResults.map((entry) => entry.message).join("; ") || "MCP install",
      });
    }
    if (ok) {
      contextRestored = lock.context?.filter((item) => item.kind === "mcp").length ?? 0;
    }
  } else if (rulesOnly) {
    const ruleArtifacts = (lock.context ?? []).filter((item) => item.scope !== "global" || options.scope === "all");
    const ruleItems = ruleArtifacts.filter((item) => item.kind === "rule");

    for (const artifact of ruleItems) {
      if (options.dryRun) {
        contextResults.push({
          id: artifact.id,
          name: artifact.name,
          kind: artifact.kind,
          success: true,
          method: "rules",
          message: `[dry-run] restore rules for ${artifact.name}`,
        });
        continue;
      }

      const restored = await restoreRulesFromSnapshots(
        options.projectRoot,
        options.homeDir,
        artifact,
        false,
      );
      const success = restored.restored > 0 && restored.missing.length === 0;
      if (success) {
        contextRestored += 1;
      }
      contextResults.push({
        id: artifact.id,
        name: artifact.name,
        kind: artifact.kind,
        success,
        method: success ? "rules" : "failed",
        message:
          success ?
            `Restored ${restored.restored} rule file(s)`
          : `Missing rule snapshots: ${restored.missing.join(", ") || "manifest not found"}`,
      });
    }
  } else if (runContext || runRules || runMcp) {
    const discoveredContext = await discoverContextFromLock(lock, options.projectRoot, options.homeDir);
    const contextPlan = await buildContextReproducePlan(
      lock,
      discoveredContext,
      options.projectRoot,
      options.scope ?? "project",
    );

    const scopedPlan = contextPlan.filter((item) => {
      if (runContext) {
        return true;
      }
      if (runRules && item.artifact.kind === "rule") {
        return true;
      }
      if (runMcp && item.artifact.kind === "mcp") {
        return true;
      }
      return false;
    });

    if (!options.dryRun) {
      for (const item of scopedPlan) {
        if (item.restore === "snapshot") {
          try {
            await restoreContextSnapshot(options.projectRoot, options.homeDir, item.artifact);
            contextRestored += 1;
            contextResults.push({
              id: item.artifact.id,
              name: item.artifact.name,
              kind: item.artifact.kind,
              success: true,
              method: "snapshot",
              message: "Restored from snapshot",
            });
          } catch (error) {
            contextResults.push({
              id: item.artifact.id,
              name: item.artifact.name,
              kind: item.artifact.kind,
              success: false,
              method: "failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
          continue;
        }

        if (item.restore === "rules" && item.artifact.kind === "rule") {
          const restored = await restoreRulesFromSnapshots(
            options.projectRoot,
            options.homeDir,
            item.artifact,
            false,
          );
          const success = restored.restored > 0 && restored.missing.length === 0;
          if (success) {
            contextRestored += 1;
          }
          contextResults.push({
            id: item.artifact.id,
            name: item.artifact.name,
            kind: item.artifact.kind,
            success,
            method: success ? "rules" : "failed",
            message:
              success ?
                `Restored ${restored.restored} rule file(s)`
              : `Missing rule snapshots: ${restored.missing.join(", ") || "manifest not found"}`,
          });
          continue;
        }

        if (item.restore === "mcp" && item.artifact.kind === "mcp") {
          const mcpResults = await installMcpServersFromLock(options.projectRoot, lock, false);
          const ok = mcpResults.some((entry) => entry.ok);
          if (ok) {
            contextRestored += 1;
          }
          contextResults.push({
            id: item.artifact.id,
            name: item.artifact.name,
            kind: item.artifact.kind,
            success: ok,
            method: ok ? "mcp" : "failed",
            message: ok ? mcpResults.map((entry) => entry.message).join("; ") : "MCP install failed",
          });
          continue;
        }

        contextResults.push({
          id: item.artifact.id,
          name: item.artifact.name,
          kind: item.artifact.kind,
          success: false,
          method: "failed",
          message: "No snapshot; run skilllock snapshot or commit .skilllock/snapshots/",
        });
      }
    } else {
      for (const item of scopedPlan) {
        contextResults.push({
          id: item.artifact.id,
          name: item.artifact.name,
          kind: item.artifact.kind,
          success: true,
          method: item.restore === "none" ? "skipped" : item.restore,
          message: `[dry-run] restore ${item.artifact.name} via ${item.restore}`,
        });
      }
    }
  }

  let verifyIssues = 0;
  if (!options.skipVerify && !options.dryRun) {
    const afterSkills = await discoverFromLock(lock, options.projectRoot, options.homeDir);
    const afterContext = await discoverContextFromLock(lock, options.projectRoot, options.homeDir);
    verifyIssues = verifyAgainstLock(afterSkills, lock, afterContext).length;
  }

  return {
    planCount: runSkills ? filteredPlan.length : 0,
    results,
    contextResults,
    contextRestored,
    verifyIssues,
    apmBulk: apmBulk ?? undefined,
  };
}

export async function reproduceProject(options: ReproduceOptions & { lockfile?: string }): Promise<ReproduceReport> {
  const lockPath = resolveLockfilePath(options.projectRoot, options.lockfile);
  const lock = await readLockfile(lockPath);
  return reproduceFromLock(lock, options);
}

export { buildReproducePlan, planSummary };
