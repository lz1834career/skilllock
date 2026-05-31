import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveInstallSource } from "../src/core/reproduce/resolve-source.js";
import { buildReproducePlan, sortSkillsByDependencies } from "../src/core/reproduce/plan.js";
import {
  createSnapshotsFromDisk,
  hasSnapshot,
  restoreSkillSnapshot,
} from "../src/core/reproduce/snapshot.js";
import { executePlanItem } from "../src/core/reproduce/installers.js";
import { buildLockfile, writeLockfile } from "../src/core/lockfile.js";
import { verifyAgainstLock } from "../src/core/verify.js";
import { discoverFromLock } from "../src/core/lockfile.js";

const SAMPLE_SKILL = `---
name: demo-skill
description: Demo skill for tests. Use when testing skilllock.
metadata:
  skilllock:
    dependencies:
      - helper-skill
---

# Demo Skill
`;

const HELPER_SKILL = `---
name: helper-skill
description: helper
---

# Helper
`;

let tempRoot = "";
let projectRoot = "";

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "skilllock-repro-"));
  projectRoot = path.join(tempRoot, "project");
  await mkdir(path.join(projectRoot, ".cursor", "skills", "demo-skill"), { recursive: true });
  await writeFile(path.join(projectRoot, ".cursor", "skills", "demo-skill", "SKILL.md"), SAMPLE_SKILL, "utf8");
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("resolve source", () => {
  it("maps npm/apm/git refs to installers", () => {
    expect(resolveInstallSource({ type: "npm", ref: "@team/pkg@1.0.0" }, "demo").installer).toBe("skillpm");
    expect(
      resolveInstallSource({ type: "apm", ref: "anthropics/skills/skills/demo-skill" }, "demo-skill").installer,
    ).toBe("skills");
    expect(resolveInstallSource({ type: "manual", ref: "./vendor/demo-skill" }, "demo").installer).toBe("copy");
  });
});

describe("reproduce plan", () => {
  it("orders dependencies before dependents", () => {
    const sorted = sortSkillsByDependencies([
      {
        id: "cursor:project:demo-skill",
        name: "demo-skill",
        scope: "project",
        agent: "cursor",
        root: ".cursor/skills/demo-skill",
        dependencies: ["helper-skill"],
        files: [],
      },
      {
        id: "cursor:project:helper-skill",
        name: "helper-skill",
        scope: "project",
        agent: "cursor",
        root: ".cursor/skills/helper-skill",
        files: [],
      },
    ]);
    expect(sorted.map((skill) => skill.name)).toEqual(["helper-skill", "demo-skill"]);
  });

  it("plans missing skills from lockfile", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeGlobal: false, includeContext: false });
    lock.skills[0] = {
      ...lock.skills[0]!,
      source: { type: "manual", ref: "./backup/demo-skill" },
    };
    await rm(path.join(projectRoot, ".cursor", "skills", "demo-skill"), { recursive: true, force: true });

    const plan = await buildReproducePlan(lock, [], null, { projectRoot, scope: "project" });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.installer).toBe("copy");
    expect(plan[0]?.source?.ref).toBe("./backup/demo-skill");
  });

  it("marks skills without source or snapshot as missing-source", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeGlobal: false, includeContext: false });
    await rm(path.join(projectRoot, ".cursor", "skills", "demo-skill"), { recursive: true, force: true });

    const plan = await buildReproducePlan(lock, [], null, { projectRoot, scope: "project" });
    expect(plan[0]?.reason).toBe("missing-source");
  });
});

describe("snapshot reproduce", () => {
  it("restores skills from snapshot offline", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeGlobal: false, includeContext: false });
    await createSnapshotsFromDisk(projectRoot, tempRoot, lock);
    expect(await hasSnapshot(projectRoot, "demo-skill")).toBe(true);

    await rm(path.join(projectRoot, ".cursor", "skills", "demo-skill"), { recursive: true, force: true });

    const item = {
      skill: lock.skills[0]!,
      reason: "missing" as const,
      installer: "snapshot" as const,
    };
    const result = await executePlanItem(item, projectRoot, tempRoot, false);
    expect(result.success).toBe(true);

    const discovered = await discoverFromLock(lock, projectRoot, tempRoot);
    expect(verifyAgainstLock(discovered, lock)).toHaveLength(0);
  });
});
