import type { SkillsLock } from "../../types.js";
import { runCommand } from "./shell.js";
import { npxCommand } from "./resolve-source.js";
import { extractMcpServerRefs } from "./context-plan.js";

export async function installMcpServersFromLock(
  projectRoot: string,
  lock: SkillsLock,
  dryRun: boolean,
): Promise<Array<{ ref: string; ok: boolean; message: string }>> {
  const refs = extractMcpServerRefs(lock);
  const results: Array<{ ref: string; ok: boolean; message: string }> = [];

  for (const ref of refs) {
    if (dryRun) {
      results.push({ ref, ok: true, message: `[dry-run] add-mcp ${ref}` });
      continue;
    }

    const result = await runCommand(npxCommand(), ["-y", "add-mcp", ref], projectRoot, false);
    results.push({
      ref,
      ok: result.code === 0,
      message: result.code === 0 ? "Installed via add-mcp" : result.stderr || result.stdout || "add-mcp failed",
    });
  }

  return results;
}
