import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  dryRun = false,
): Promise<CommandResult> {
  const printable = `${command} ${args.join(" ")}`.trim();
  if (dryRun) {
    return { code: 0, stdout: `[dry-run] ${printable}\n`, stderr: "" };
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await runCommand(probe, [command], process.cwd());
  return result.code === 0;
}
