import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runProjectCheck } from "../src/core/check.js";
import { resolveLockfilePath } from "../src/core/lockfile.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = path.join(repoRoot, "examples", "demo-project");

describe("examples/demo-project", () => {
  it("passes check with committed lockfile", async () => {
    const report = await runProjectCheck({
      projectRoot: demoRoot,
      homeDir: demoRoot,
      lockfile: resolveLockfilePath(demoRoot),
      skipTests: true,
      skipAudit: true,
      skipValidate: true,
    });
    expect(report.passed).toBe(true);
  });
});
