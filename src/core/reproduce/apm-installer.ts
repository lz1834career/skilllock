import { writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import type { SkillsLock } from "../../types.js";
import { commandExists, runCommand } from "./shell.js";
import { npxCommand } from "./resolve-source.js";

export async function synthesizeApmManifest(projectRoot: string, lock: SkillsLock): Promise<string | null> {
  const apmEntries = [
    ...new Set(
      lock.skills
        .map((skill) => skill.source)
        .filter((source) => source && ["apm", "git", "vercel-skills"].includes(source.type))
        .map((source) => {
          const ref = source!.ref;
          return source!.resolved ? `${ref}#${source!.resolved}` : ref;
        }),
    ),
  ];

  const mcpEntries = [
    ...new Set(
      lock.manifests?.flatMap(
        (manifest) => manifest.entries?.filter((entry) => entry.startsWith("mcp:")).map((entry) => entry.slice(4)) ?? [],
      ) ?? [],
    ),
  ];

  if (apmEntries.length === 0 && mcpEntries.length === 0) {
    return null;
  }

  const doc = {
    name: path.basename(projectRoot),
    version: "1.0.0",
    dependencies: {
      apm: apmEntries,
      mcp: mcpEntries,
    },
  };

  const apmPath = path.join(projectRoot, "apm.yml");
  await writeFile(apmPath, stringify(doc, { lineWidth: 0 }), "utf8");
  return apmPath;
}

export async function runApmInstall(projectRoot: string, dryRun: boolean): Promise<{ ok: boolean; message: string }> {
  if (dryRun) {
    return { ok: true, message: "[dry-run] apm install" };
  }

  const attempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: "apm", args: ["install"] },
    { cmd: "uvx", args: ["apm", "install"] },
    { cmd: "uv", args: ["tool", "run", "apm", "install"] },
    { cmd: npxCommand(), args: ["-y", "@microsoft/apm", "install"] },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    if (!(await commandExists(attempt.cmd.split(" ")[0]!))) {
      continue;
    }
    const result = await runCommand(attempt.cmd, attempt.args, projectRoot, false);
    if (result.code === 0) {
      return { ok: true, message: `Installed via ${attempt.cmd} ${attempt.args.join(" ")}` };
    }
    errors.push(`${attempt.cmd}: ${result.stderr || result.stdout}`.trim());
  }

  return { ok: false, message: errors.join("; ") || "APM CLI not found (apm, uvx apm, npx @microsoft/apm)" };
}

export async function runBulkApmIfNeeded(
  projectRoot: string,
  lock: SkillsLock,
  apmSkillCount: number,
  dryRun: boolean,
): Promise<{ ok: boolean; message: string } | null> {
  if (apmSkillCount < 2) {
    return null;
  }

  const apmPath = await synthesizeApmManifest(projectRoot, lock);
  if (!apmPath) {
    return null;
  }

  return runApmInstall(projectRoot, dryRun);
}
