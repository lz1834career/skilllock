import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runProjectCheck } from "../src/core/check.js";
import { buildLockfile, writeLockfile } from "../src/core/lockfile.js";
import { clearCache, storeSkillInCache, listCacheEntries } from "../src/core/reproduce/cache.js";
import { buildSkillForest, formatSkillTree } from "../src/core/tree.js";
import { collectDependencyEdges, formatMermaidGraph, mermaidNodeId } from "../src/core/graph.js";
import { explainSkill } from "../src/core/why.js";
import { findUntrackedSkills } from "../src/core/untracked.js";
import { buildUpgradePlan } from "../src/core/upgrade.js";
import { applyUpgrades, bumpSourceRef } from "../src/core/apply-upgrade.js";
import { buildExplainDocument, explainVerifyIssues } from "../src/core/explain.js";
import { runUpgradeApply } from "../src/core/upgrade-runner.js";

let tempRoot = "";
let projectRoot = "";

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "skilllock-eco-"));
  projectRoot = path.join(tempRoot, "project");
  await mkdir(path.join(projectRoot, ".cursor", "skills", "parent-skill"), { recursive: true });
  await mkdir(path.join(projectRoot, ".cursor", "skills", "child-skill"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".cursor", "skills", "parent-skill", "SKILL.md"),
    `---
name: parent-skill
description: parent
metadata:
  skilllock:
    dependencies:
      - child-skill
---
`,
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, ".cursor", "skills", "child-skill", "SKILL.md"),
    `---
name: child-skill
description: child
---
`,
    "utf8",
  );
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("tree + why + untracked", () => {
  it("renders dependency tree and explains skill provenance", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    await mkdir(path.join(projectRoot, ".cursor", "skills", "rogue-skill"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".cursor", "skills", "rogue-skill", "SKILL.md"),
      `---
name: rogue-skill
description: not locked
---
`,
      "utf8",
    );

    const forest = buildSkillForest(lock);
    const lines = formatSkillTree(forest);
    expect(lines.some((line) => line.includes("parent-skill"))).toBe(true);
    expect(lines.some((line) => line.includes("child-skill"))).toBe(true);

    const why = explainSkill(lock, "parent-skill", null);
    expect(why?.dependents).toHaveLength(0);
    expect(why?.skill.dependencies).toContain("child-skill");

    const untracked = await findUntrackedSkills(projectRoot, tempRoot, lock);
    expect(untracked.map((entry) => entry.skill.name)).toContain("rogue-skill");
    expect(untracked.map((entry) => entry.skill.name)).not.toContain("parent-skill");
  });
});

describe("graph", () => {
  it("renders Mermaid edges for declared dependencies", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    const edges = collectDependencyEdges(lock);
    expect(edges).toEqual([{ from: "parent-skill", to: "child-skill" }]);

    const mermaid = formatMermaidGraph(lock);
    expect(mermaid).toContain("flowchart TD");
    expect(mermaid).toContain(`${mermaidNodeId("parent-skill")} --> ${mermaidNodeId("child-skill")}`);
    expect(mermaid).toContain("parent-skill (cursor/project)");
  });
});

describe("cache clear", () => {
  it("clears stored cache entries", async () => {
    const source = { type: "manual" as const, ref: "./vendor/x" };
    await storeSkillInCache(
      projectRoot,
      source,
      "parent-skill",
      path.join(projectRoot, ".cursor", "skills", "parent-skill"),
    );
    expect((await listCacheEntries(projectRoot)).length).toBe(1);
    const removed = await clearCache(projectRoot);
    expect(removed).toBe(1);
    expect((await listCacheEntries(projectRoot)).length).toBe(0);
  });
});
describe("apply upgrade", () => {
  it("bumps npm and git source refs", () => {
    const npm = bumpSourceRef({ type: "npm", ref: "@team/demo@1.0.0" }, "1.1.0");
    expect(npm.ref).toBe("@team/demo@1.1.0");
    expect(npm.resolved).toBe("1.1.0");

    const git = bumpSourceRef({ type: "git", ref: "owner/repo/skills/demo#abc" }, "def123");
    expect(git.ref).toBe("owner/repo/skills/demo#def123");
    expect(git.resolved).toBe("def123");
  });

  it("writes bumped sources into lock and sources file", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    lock.skills[0]!.source = { type: "npm", ref: "@team/demo@1.0.0", resolved: "1.0.0" };
    const sources: import("../src/types.js").SourcesFile = {
      version: 1,
      mappings: [{ skill: lock.skills[0]!.name, source: { type: "npm", ref: "@team/demo@1.0.0" } }],
    };
    const result = applyUpgrades(
      lock,
      sources,
      [
        {
          skill: lock.skills[0]!.name,
          source: lock.skills[0]!.source!,
          current: "1.0.0",
          latest: "1.1.0",
          status: "outdated",
          message: "new version",
        },
      ],
    );
    expect(result.changes).toHaveLength(1);
    expect(result.lock.skills[0]?.source?.ref).toContain("1.1.0");
    expect(result.sourcesFile?.mappings[0]?.source.ref).toContain("1.1.0");
  });
});

describe("upgrade plan", () => {
  it("builds steps for outdated skills", () => {
    const plan = buildUpgradePlan([
      {
        skill: "demo-skill",
        source: { type: "npm", ref: "@team/demo@1.0.0" },
        current: "1.0.0",
        latest: "1.1.0",
        status: "outdated",
        message: "Newer version available",
      },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.steps.some((step) => step.includes("skilllock lock"))).toBe(true);
  });
});

describe("check untracked", () => {
  it("fails check when untracked skills exist", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    const lockPath = path.join(projectRoot, "skills.lock.yaml");
    await writeLockfile(lockPath, lock);
    await mkdir(path.join(projectRoot, ".cursor", "skills", "shadow-skill"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".cursor", "skills", "shadow-skill", "SKILL.md"),
      `---
name: shadow-skill
description: shadow
---
`,
      "utf8",
    );

    const report = await runProjectCheck({
      projectRoot,
      homeDir: tempRoot,
      lockfile: lockPath,
      skipTests: true,
    });
    expect(report.untrackedSkills.some((entry) => entry.skill.name === "shadow-skill")).toBe(true);
    expect(report.passed).toBe(false);
  });
});

describe("explain", () => {
  it("adds remediation hints to verify issues", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    await mkdir(path.join(projectRoot, ".cursor", "skills", "ghost-skill"), { recursive: true });
    const explained = explainVerifyIssues([
      {
        kind: "missing-skill",
        skillId: "cursor:project:ghost-skill",
        message: "Skill ghost-skill is in lockfile but not installed",
      },
    ]);
    expect(explained[0]?.remediation).toContain("reproduce");
  });
});

describe("upgrade apply check", () => {
  it("runs check after apply when enabled", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    lock.skills[0]!.source = { type: "manual", ref: "./local" };
    const lockPath = path.join(projectRoot, "skills.lock.yaml");
    await writeLockfile(lockPath, lock);

    const report = await runUpgradeApply(projectRoot, tempRoot, {
      lockfile: lockPath,
      offline: true,
      check: true,
      skipCheck: false,
    });
    expect(report.changes).toHaveLength(0);
  });
});

describe("explain json and policy", () => {
  it("builds explain document with remediation", () => {
    const doc = buildExplainDocument(
      [{ kind: "missing-skill", skillId: "x", message: "missing" }],
      undefined,
    );
    expect(doc.version).toBe(1);
    expect(doc.issues[0]?.remediation).toContain("reproduce");
    expect(doc.passed).toBe(false);
  });

  it("respects policy drift.failOn false in check", async () => {
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    const lockPath = path.join(projectRoot, "skills.lock.yaml");
    await writeLockfile(lockPath, lock);
    await writeFile(
      path.join(projectRoot, "skilllock.policy.yaml"),
      `version: 1
drift:
  failOn: false
untracked:
  failOn: false
`,
      "utf8",
    );

    const report = await runProjectCheck({
      projectRoot,
      homeDir: tempRoot,
      lockfile: lockPath,
      policy: path.join(projectRoot, "skilllock.policy.yaml"),
      skipTests: true,
      skipAudit: true,
      skipValidate: true,
    });
    expect(report.drift?.hasDrift).toBeUndefined();
    expect(report.verifyIssues.some((issue) => issue.skillId === "skilllock:drift")).toBe(false);
  });
});

describe("check llm option", () => {
  it("passes check without llm by default even when tests define llmPrompt", async () => {
    await writeFile(
      path.join(projectRoot, "skills.test.yaml"),
      `version: 1
tests:
  - skill: parent-skill
    llmPrompt: "Should parent-skill be used?"
`,
      "utf8",
    );
    const lock = await buildLockfile(projectRoot, tempRoot, { includeContext: false });
    const lockPath = path.join(projectRoot, "skills.lock.yaml");
    await writeLockfile(lockPath, lock);

    const report = await runProjectCheck({
      projectRoot,
      homeDir: tempRoot,
      lockfile: lockPath,
      llm: false,
      skipUntracked: true,
    });
    expect(report.passed).toBe(true);
  });
});
