import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import type { DiscoveredSkill, LlmTestOptions, SkillTestResult, SkillTestsFile } from "../types.js";
import { DEFAULT_TESTS, skillTestsFileSchema } from "../types.js";
import { evaluateLlmResponse, runLlmGoldenTest } from "./llm-test.js";

export async function readTestsFile(projectRoot: string, explicit?: string): Promise<SkillTestsFile | null> {
  const testsPath = explicit ? path.resolve(explicit) : path.join(projectRoot, DEFAULT_TESTS);
  try {
    const raw = await readFile(testsPath, "utf8");
    return skillTestsFileSchema.parse(parseDocument(raw).toJSON());
  } catch {
    return null;
  }
}

export async function runSkillTests(
  skills: DiscoveredSkill[],
  testsFile: SkillTestsFile,
  llmOptions: LlmTestOptions = {},
): Promise<SkillTestResult[]> {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const results: SkillTestResult[] = [];

  for (const testCase of testsFile.tests) {
    const failures: string[] = [];
    const skill = byName.get(testCase.skill);

    if (!skill) {
      results.push({
        skill: testCase.skill,
        passed: false,
        failures: [`Skill "${testCase.skill}" not found`],
      });
      continue;
    }

    const skillMd = skill.files.find((file) => file.path.endsWith("SKILL.md"));
    const skillMdPath = path.join(skill.root, skillMd?.path ?? "SKILL.md");
    let content = "";
    try {
      content = await readFile(skillMdPath, "utf8");
    } catch {
      failures.push("SKILL.md could not be read");
    }

    for (const fragment of testCase.expectDescriptionContains ?? []) {
      if (!skill.description?.includes(fragment)) {
        failures.push(`description does not contain "${fragment}"`);
      }
    }

    for (const fragment of testCase.expectSkillMdContains ?? []) {
      if (!content.includes(fragment)) {
        failures.push(`SKILL.md does not contain "${fragment}"`);
      }
    }

    for (const pattern of testCase.expectSkillMdMatches ?? []) {
      if (!new RegExp(pattern, "m").test(content)) {
        failures.push(`SKILL.md does not match /${pattern}/`);
      }
    }

    if (testCase.expectCompatibility && skill.compatibility !== testCase.expectCompatibility) {
      failures.push(`expected compatibility "${testCase.expectCompatibility}", got "${skill.compatibility ?? ""}"`);
    }

    if (testCase.expectDependencies) {
      const deps = skill.dependencies ?? [];
      for (const dep of testCase.expectDependencies) {
        if (!deps.includes(dep)) {
          failures.push(`missing declared dependency "${dep}"`);
        }
      }
    }

    if (testCase.expectInstalledDependencies) {
      for (const dep of testCase.expectInstalledDependencies) {
        if (!byName.has(dep)) {
          failures.push(`dependency skill "${dep}" is not installed`);
        }
      }
    }

    const staticPrompt = testCase.prompt && !testCase.llmPrompt ? testCase.prompt : undefined;
    if (staticPrompt) {
      const keywords = staticPrompt
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 4);
      const haystack = `${skill.description ?? ""}\n${content}`.toLowerCase();
      const hits = keywords.filter((word) => haystack.includes(word));
      if (hits.length === 0) {
        failures.push(`prompt keywords not reflected in skill description/content: "${staticPrompt}"`);
      }
    }

    if (testCase.llmPrompt) {
      if (!llmOptions.enabled) {
        if (llmOptions.required) {
          failures.push("LLM golden test required but not enabled (pass --llm)");
        }
      } else {
        const llm = await runLlmGoldenTest(skill, content, testCase.llmPrompt, llmOptions);
        if (llm.skipped) {
          if (llmOptions.required) {
            failures.push(llm.error ?? "LLM test skipped");
          }
        } else if (!llm.ok || !llm.response) {
          failures.push(llm.error ?? "LLM golden test failed");
        } else {
          failures.push(
            ...evaluateLlmResponse(llm.response, testCase.expectLlmContains, testCase.expectLlmMatches),
          );
        }
      }
    }

    results.push({
      skill: testCase.skill,
      passed: failures.length === 0,
      failures,
    });
  }

  return results;
}
