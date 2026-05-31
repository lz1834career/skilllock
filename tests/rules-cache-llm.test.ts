import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashBuffer } from "../src/core/discover.js";
import { evaluateLlmResponse } from "../src/core/llm-test.js";
import { lockProject } from "../src/core/lockfile.js";
import { getCachedSkillDir, listCacheEntries, storeSkillInCache } from "../src/core/reproduce/cache.js";
import { buildContextReproducePlan } from "../src/core/reproduce/context-plan.js";
import {
  hasRuleSnapshots,
  restoreRulesFromSnapshots,
  writeRuleSnapshots,
} from "../src/core/reproduce/rules-restore.js";
import { runSkillTests } from "../src/core/test-runner.js";
import type { LockedContext, SkillsLock } from "../src/types.js";

let tempRoot = "";
let projectRoot = "";

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "skilllock-v05-"));
  projectRoot = path.join(tempRoot, "project");
  await mkdir(path.join(projectRoot, ".cursor", "skills", "demo-skill"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".cursor", "skills", "demo-skill", "SKILL.md"),
    `---
name: demo-skill
description: Demo skill for tests.
---

# Demo
`,
    "utf8",
  );
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("lock --snapshot flow", () => {
  it("writes snapshots when writeSnapshot is true", async () => {
    const { snapshot } = await lockProject(projectRoot, tempRoot, { writeSnapshot: true });
    expect(snapshot?.skills).toBe(1);
    await readFile(path.join(projectRoot, ".skilllock", "snapshots", "demo-skill", "SKILL.md"));
  });
});

describe("registry cache", () => {
  it("stores and retrieves cached skill dirs", async () => {
    const source = { type: "manual" as const, ref: "./vendor/demo" };
    const skillDir = path.join(projectRoot, ".cursor", "skills", "demo-skill");
    await storeSkillInCache(projectRoot, source, "demo-skill", skillDir);
    const cached = await getCachedSkillDir(projectRoot, source, "demo-skill");
    expect(cached).toBeTruthy();
    const entries = await listCacheEntries(projectRoot);
    expect(entries).toHaveLength(1);
  });
});

describe("rules reproduce", () => {
  it("snapshots and restores individual rule files", async () => {
    const rulesRoot = path.join(projectRoot, ".cursor", "rules");
    await mkdir(rulesRoot, { recursive: true });
    const content = "# Style rules\n";
    await writeFile(path.join(rulesRoot, "style.mdc"), content, "utf8");

    const locked: LockedContext = {
      id: "cursor:project:rules",
      name: "cursor rules",
      kind: "rule",
      agent: "cursor",
      scope: "project",
      root: ".cursor/rules",
      files: [{ path: "style.mdc", hash: hashBuffer(Buffer.from(content)), size: Buffer.byteLength(content) }],
    };

    const count = await writeRuleSnapshots(projectRoot, rulesRoot, locked);
    expect(count).toBe(1);
    expect(await hasRuleSnapshots(projectRoot)).toBe(true);

    await rm(path.join(rulesRoot, "style.mdc"));
    const restored = await restoreRulesFromSnapshots(projectRoot, tempRoot, locked, false);
    expect(restored.restored).toBe(1);
    expect(await readFile(path.join(rulesRoot, "style.mdc"), "utf8")).toContain("Style rules");
  });

  it("plans rules restore when per-file snapshots exist", async () => {
    const lock: SkillsLock = {
      lockfileVersion: 2,
      generatedAt: new Date().toISOString(),
      projectRoot,
      skills: [],
      context: [
        {
          id: "cursor:project:rules",
          name: "cursor rules",
          kind: "rule",
          agent: "cursor",
          scope: "project",
          root: ".cursor/rules",
          files: [{ path: "style.mdc", hash: "x", size: 1 }],
        },
      ],
    };

    await mkdir(path.join(projectRoot, ".skilllock", "snapshots", "rules"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".skilllock", "snapshots", "rules", "manifest.json"),
      JSON.stringify({ "style.mdc": { hash: "x" } }),
      "utf8",
    );

    const plan = await buildContextReproducePlan(lock, [], projectRoot, "project");
    expect(plan[0]?.restore).toBe("rules");
  });
});

describe("llm golden test helpers", () => {
  it("evaluates YES/NO responses and expected fragments", () => {
    expect(evaluateLlmResponse("YES — skill applies", ["applies"]).length).toBe(0);
    expect(evaluateLlmResponse("maybe", ["applies"]).length).toBeGreaterThan(0);
  });

  it("skips llm tests unless enabled", async () => {
    const skills = [
      {
        id: "cursor:project:demo-skill",
        name: "demo-skill",
        scope: "project" as const,
        agent: "cursor" as const,
        root: path.join(projectRoot, ".cursor", "skills", "demo-skill"),
        description: "Demo skill for tests.",
        files: [{ path: "SKILL.md", hash: "x", size: 1 }],
      },
    ];
    const results = await runSkillTests(
      skills,
      {
        version: 1,
        tests: [{ skill: "demo-skill", llmPrompt: "When should I use demo-skill?" }],
      },
      { enabled: false },
    );
    expect(results[0]?.passed).toBe(true);
  });
});
