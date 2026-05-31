import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runProjectCheck } from "../src/core/check.js";
import { buildLockfile } from "../src/core/lockfile.js";
import { buildCycloneDxSbom } from "../src/core/sbom.js";
import { validateSkill, validateLockfileStructure } from "../src/core/validate.js";
import { discoverSkills } from "../src/core/discover.js";

const VALID_SKILL = `---
name: demo-skill
description: Demo skill for validation tests with enough detail.
---

# Demo
`;

let tempRoot = "";
let projectRoot = "";

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "skilllock-check-"));
  projectRoot = path.join(tempRoot, "project");
  await mkdir(path.join(projectRoot, ".cursor", "skills", "demo-skill"), { recursive: true });
  await writeFile(path.join(projectRoot, ".cursor", "skills", "demo-skill", "SKILL.md"), VALID_SKILL, "utf8");
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("validate", () => {
  it("accepts a well-formed skill", async () => {
    const targets = [{ agent: "cursor" as const, scope: "project" as const, root: path.join(projectRoot, ".cursor", "skills") }];
    const skills = await discoverSkills(targets);
    const issues = await validateSkill(skills[0]!);
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("flags invalid skill names", async () => {
    await writeFile(
      path.join(projectRoot, ".cursor", "skills", "demo-skill", "SKILL.md"),
      VALID_SKILL.replace("demo-skill", "Bad_Name"),
      "utf8",
    );
    const targets = [{ agent: "cursor" as const, scope: "project" as const, root: path.join(projectRoot, ".cursor", "skills") }];
    const skills = await discoverSkills(targets);
    const issues = await validateSkill(skills[0]!);
    expect(issues.some((issue) => issue.rule === "invalid-name")).toBe(true);
  });
});

describe("check + cyclonedx", () => {
  it("passes check on a locked project", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeGlobal: false, includeContext: false });
    const lockPath = path.join(projectRoot, "skills.lock.yaml");
    await writeFile(lockPath, "# test\n", "utf8");
    await import("../src/core/lockfile.js").then((mod) => mod.writeLockfile(lockPath, lock));

    const report = await runProjectCheck({
      projectRoot,
      homeDir: tempRoot,
      lockfile: lockPath,
      skipTests: true,
      skipUntracked: true,
    });
    expect(report.verifyIssues).toHaveLength(0);
    expect(report.passed).toBe(true);
  });

  it("exports cyclonedx sbom", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeGlobal: false, includeContext: false });
    const cyclone = buildCycloneDxSbom(lock);
    expect(cyclone.bomFormat).toBe("CycloneDX");
    expect(cyclone.components.length).toBeGreaterThan(0);
  });

  it("detects duplicate ids in lock structure", () => {
    const issues = validateLockfileStructure({
      lockfileVersion: 2,
      generatedAt: "",
      projectRoot: "/tmp",
      skills: [
        {
          id: "cursor:project:a",
          name: "a",
          scope: "project",
          agent: "cursor",
          root: ".cursor/skills/a",
          files: [{ path: "SKILL.md", hash: "sha256:abc", size: 1 }],
        },
        {
          id: "cursor:project:a",
          name: "a2",
          scope: "project",
          agent: "cursor",
          root: ".cursor/skills/a2",
          files: [{ path: "SKILL.md", hash: "sha256:def", size: 1 }],
        },
      ],
    });
    expect(issues.some((issue) => issue.rule === "duplicate-skill-id")).toBe(true);
  });
});
