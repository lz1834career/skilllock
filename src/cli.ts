import { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { auditExitCode, auditSkills } from "./core/audit.js";
import { checkCompatibility, checkDependencies, checkPolicySkills } from "./core/compatibility.js";
import { diffLocks, summarizeDiff } from "./core/diff.js";
import { defaultDiscoveryTargets, discoverSkills } from "./core/discover.js";
import {
  buildLockfile,
  discoverContextFromLock,
  discoverFromLock,
  importSources,
  lockProject,
  readLockfile,
  readSourcesFile,
  resolveLockfilePath,
  writeLockfile,
} from "./core/lockfile.js";
import { filterAuditFindings, policyFailLevel, readPolicy } from "./core/policy.js";
import { buildCycloneDxSbom, buildSbom } from "./core/sbom.js";
import { readTestsFile, runSkillTests } from "./core/test-runner.js";
import { runProjectCheck } from "./core/check.js";
import { synthesizeApmManifest } from "./core/reproduce/apm-installer.js";
import {
  buildReproducePlan,
  planSummary,
  reproduceProject,
} from "./core/reproduce/reproduce.js";
import { createSnapshotsFromDisk } from "./core/reproduce/snapshot.js";
import { listCacheEntries, clearCache, cacheStats } from "./core/reproduce/cache.js";
import { buildSkillForest, formatSkillTree } from "./core/tree.js";
import { formatMermaidGraph } from "./core/graph.js";
import { explainSkill } from "./core/why.js";
import { findUntrackedSkills } from "./core/untracked.js";
import { checkOutdatedSkills, summarizeOutdated } from "./core/outdated.js";
import { buildUpgradePlan, formatUpgradePlan } from "./core/upgrade.js";
import { runUpgradeApply } from "./core/upgrade-runner.js";
import { explainVerifyIssues, buildExplainDocument } from "./core/explain.js";
import { collectProjectIssues } from "./core/project-issues.js";
import { diffContextLocks, verifyAgainstLock } from "./core/verify.js";
import { validateLockfileStructure, validateSkills, validationExitCode } from "./core/validate.js";
import { DEFAULT_LOCKFILE, DEFAULT_POLICY, DEFAULT_TESTS, type SkillAgent } from "./types.js";
import {
  printApplyUpgradeReport,
  printAuditFindings,
  printCheckReport,
  printContextDiff,
  printContextReproduceResults,
  printDiff,
  printReproduceResults,
  printTestResults,
  printValidationIssues,
  printVerifyIssues,
  resolveHomeDir,
  resolveProjectRoot,
} from "./utils/format.js";

const program = new Command();

function parseAgents(value: string): SkillAgent[] {
  return value
    .split(",")
    .map((agent) => agent.trim())
    .filter(Boolean) as SkillAgent[];
}

program
  .name("skilllock")
  .description("Reproducible lockfiles, verification, diff, audit, and tests for Agent Skills")
  .version("1.1.0");

program
  .command("init")
  .description("Scaffold policy, tests, and sources files")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--force", "Overwrite existing files")
  .action(async (options: { project: string; force?: boolean }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const files = [
      {
        name: DEFAULT_POLICY,
        content: `version: 1
audit:
  failOn: warning
  denyRules:
    - hidden-instruction
    - unicode-obfuscation
  denySkills: []
compatibility:
  enforce: true
context:
  allowedKinds: [mcp, rule, agents-md, instructions]
lockfile:
  requireSources: false
drift:
  failOn: true
untracked:
  failOn: true
`,
      },
      {
        name: DEFAULT_TESTS,
        content: `version: 1
tests: []
`,
      },
      {
        name: ".skilllock-sources.yaml",
        content: `version: 1
mappings: []
`,
      },
    ];

    for (const file of files) {
      const target = path.join(projectRoot, file.name);
      try {
        await readFile(target);
        if (!options.force) {
          console.log(pc.yellow(`• skip ${file.name} (exists)`));
          continue;
        }
      } catch {
        // create
      }
      await writeFile(target, file.content, "utf8");
      console.log(pc.green(`✓ wrote ${file.name}`));
    }

    const gitignorePath = path.join(projectRoot, ".gitignore");
    const gitignoreBlock = "\n# skilllock local cache (commit snapshots/ for offline reproduce)\n.skilllock/cache/\n";
    try {
      const existing = await readFile(gitignorePath, "utf8");
      if (!existing.includes(".skilllock/cache/")) {
        await writeFile(gitignorePath, `${existing.replace(/\n?$/, "")}${gitignoreBlock}`, "utf8");
        console.log(pc.green("✓ appended .skilllock/cache/ to .gitignore"));
      }
    } catch {
      await writeFile(gitignorePath, `# skilllock\n.skilllock/cache/\n`, "utf8");
      console.log(pc.green("✓ wrote .gitignore"));
    }

    const weeklyWorkflow = path.join(projectRoot, ".github", "workflows", "skilllock-weekly.yml");
    const autoUpgradeWorkflow = path.join(projectRoot, ".github", "workflows", "skilllock-auto-upgrade.yml");
    const workflowContent = `name: skilllock-drift

on:
  schedule:
    - cron: "0 9 * * 1"
  workflow_dispatch:

permissions:
  issues: write

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install skilllock
        run: npm install -g .

      - name: Run drift
        id: drift
        continue-on-error: true
        run: skilllock drift 2>&1 | tee skilllock-drift.log

      - name: Open issue on drift
        if: steps.drift.outcome == 'failure'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('skilllock-drift.log', 'utf8');
            const title = \`skilllock drift detected (\${new Date().toISOString().slice(0, 10)})\`;
            const existing = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              labels: 'skilllock-drift',
            });
            if (existing.data.some((issue) => issue.title.startsWith('skilllock drift detected'))) {
              core.info('Open drift issue already exists');
            } else {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title,
                body: \`Automated drift report:\\n\\n\\\`\\\`\\\`\\n\${body}\\n\\\`\\\`\\\`\\n\\nRun \\\`skilllock lock\\\` after review, or \\\`skilllock reproduce\\\` to restore.\`,
                labels: ['skilllock-drift'],
              });
            }

      - name: Fail if drift failed
        if: steps.drift.outcome == 'failure'
        run: exit 1
`;
    const autoUpgradeContent = `name: skilllock-auto-upgrade

on:
  schedule:
    - cron: "0 10 * * 1"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  upgrade:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install skilllock
        run: npm install -g .

      - name: Preview upgrades
        run: skilllock upgrade --json

      - name: Apply upgrades
        run: skilllock upgrade --apply --reproduce --check

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v7
        with:
          title: "chore(skilllock): refresh agent skill sources"
          body: |
            Automated source bumps via \`skilllock upgrade --apply --reproduce --check\`.
            Review changelogs before merging.
          branch: skilllock/auto-upgrade
          commit-message: "chore(skilllock): bump agent skill sources"
`;
    for (const [filePath, content, label] of [
      [weeklyWorkflow, workflowContent, ".github/workflows/skilllock-weekly.yml"],
      [autoUpgradeWorkflow, autoUpgradeContent, ".github/workflows/skilllock-auto-upgrade.yml"],
    ] as const) {
      try {
        await readFile(filePath);
        if (!options.force) {
          console.log(pc.yellow(`• skip ${label} (exists)`));
          continue;
        }
      } catch {
        // create
      }
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
      console.log(pc.green(`✓ wrote ${label}`));
    }
  });

program
  .command("scan")
  .description("List discovered Agent Skills")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--global", "Include global skills")
  .option("--agents <list>", "Agents to scan", "cursor")
  .action(async (options: { project: string; global?: boolean; agents: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const agents = parseAgents(options.agents);
    const targets = defaultDiscoveryTargets(projectRoot, homeDir, agents).filter(
      (target) => options.global || target.scope === "project",
    );
    const skills = await discoverSkills(targets);

    if (skills.length === 0) {
      console.log(pc.yellow("No skills found"));
      return;
    }

    for (const skill of skills) {
      console.log(`${pc.bold(skill.name)} ${pc.dim(`(${skill.agent}/${skill.scope})`)}`);
      console.log(pc.dim(`  id: ${skill.id}`));
      console.log(pc.dim(`  root: ${skill.root}`));
      console.log(pc.dim(`  files: ${skill.files.length}`));
      if (skill.source) {
        console.log(pc.dim(`  source: ${skill.source.type} ${skill.source.ref}`));
      }
      if (skill.dependencies?.length) {
        console.log(pc.dim(`  dependencies: ${skill.dependencies.join(", ")}`));
      }
      if (skill.description) {
        console.log(pc.dim(`  description: ${skill.description}`));
      }
    }
  });

program
  .command("import")
  .description("Import source mappings from apm.yml and package.json")
  .option("--project <dir>", "Project root", process.cwd())
  .action(async (options: { project: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const sources = await importSources(projectRoot);
    console.log(
      pc.green(`✓ Updated .skilllock-sources.yaml with ${sources.mappings.length} mapping(s)`),
    );
  });

program
  .command("lock")
  .description(`Generate ${DEFAULT_LOCKFILE} with content hashes`)
  .option("--project <dir>", "Project root", process.cwd())
  .option("--output <file>", "Lockfile output path")
  .option("--global", "Include global skills")
  .option("--no-context", "Skip MCP/rules/AGENTS.md")
  .option("--agents <list>", "Agents to include", "cursor")
  .option("--no-sources", "Do not merge .skilllock-sources.yaml")
  .option("--snapshot", "Write .skilllock/snapshots after locking")
  .action(async (options: {
    project: string;
    output?: string;
    global?: boolean;
    context?: boolean;
    agents: string;
    sources?: boolean;
    snapshot?: boolean;
  }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lockfilePath = resolveLockfilePath(projectRoot, options.output);
    const { lock, snapshot } = await lockProject(
      projectRoot,
      homeDir,
      {
        includeGlobal: Boolean(options.global),
        includeContext: options.context !== false,
        agents: parseAgents(options.agents),
        mergeSources: options.sources !== false,
        writeSnapshot: Boolean(options.snapshot),
      },
      lockfilePath,
    );
    console.log(
      pc.green(
        `✓ Wrote ${lock.skills.length} skill(s) and ${lock.context?.length ?? 0} context artifact(s) to ${path.relative(projectRoot, lockfilePath)}`,
      ),
    );
    if (snapshot) {
      console.log(
        pc.dim(
          `• snapshotted ${snapshot.skills} skill(s), ${snapshot.context} context artifact(s), ${snapshot.rules} rule file(s)`,
        ),
      );
    }
  });

program
  .command("verify")
  .description("Verify installed skills and context match the lockfile")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--policy <file>", "Policy path")
  .option("--no-compatibility", "Skip compatibility checks")
  .action(async (options: {
    project: string;
    lockfile?: string;
    policy?: string;
    compatibility?: boolean;
  }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lockfilePath = resolveLockfilePath(projectRoot, options.lockfile);
    const lock = await readLockfile(lockfilePath);
    const discovered = await discoverFromLock(lock, projectRoot, homeDir);
    const discoveredContext = await discoverContextFromLock(lock, projectRoot, homeDir);
    const policy = await readPolicy(projectRoot, options.policy);

    const issues = verifyAgainstLock(discovered, lock, discoveredContext);

    if (options.compatibility !== false && (policy?.compatibility.enforce ?? true)) {
      for (const skill of discovered) {
        issues.push(...checkCompatibility(skill));
      }
      issues.push(...checkDependencies(discovered));
    }

    if (policy) {
      issues.push(...checkPolicySkills(discovered, policy));
    }

    printVerifyIssues(issues);
    process.exitCode = issues.length > 0 ? 1 : 0;
  });

program
  .command("explain")
  .description("Explain verify/drift issues with remediation hints")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--policy <file>", "Policy path")
  .option("--json", "Output machine-readable JSON for CI")
  .option("--skip-drift", "Skip drift detection")
  .action(async (options: {
    project: string;
    lockfile?: string;
    policy?: string;
    json?: boolean;
    skipDrift?: boolean;
  }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const policy = await readPolicy(projectRoot, options.policy);

    const { issues, drift } = await collectProjectIssues(lock, projectRoot, homeDir, policy, {
      skipDrift: options.skipDrift,
    });

    if (options.json) {
      const doc = buildExplainDocument(issues, drift);
      process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
      process.exitCode = doc.passed ? 0 : 1;
      return;
    }

    const explained = explainVerifyIssues(issues);
    if (explained.length === 0 && !(drift?.hasDrift ?? false)) {
      console.log(pc.green("✓ No issues to explain"));
      return;
    }

    for (const issue of explained) {
      console.log(pc.bold(`[${issue.kind}] ${issue.skillId}`));
      console.log(`  ${issue.message}`);
      console.log(pc.dim(`  → ${issue.remediation}`));
    }
    if (drift?.hasDrift) {
      console.log(pc.bold("\n[drift] skilllock:drift"));
      console.log(
        `  ${drift.skillChanges} skill change(s), ${drift.contextChanges} context change(s); run skilllock drift`,
      );
      console.log(pc.dim("  → Run `skilllock drift`, then `skilllock lock` if changes are intentional."));
    }
    process.exitCode = 1;
  });

program
  .command("diff")
  .description("Diff two lockfiles, or a lockfile against the current filesystem")
  .argument("[before]", "Previous lockfile path")
  .argument("[after]", "Next lockfile path, or omit to diff against current disk")
  .option("--project <dir>", "Project root", process.cwd())
  .action(async (beforeArg: string | undefined, afterArg: string | undefined, options: { project: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();

    if (!beforeArg) {
      console.error(pc.red("Provide at least one lockfile path"));
      process.exitCode = 1;
      return;
    }

    const before = await readLockfile(path.resolve(beforeArg));
    const after = afterArg
      ? await readLockfile(path.resolve(afterArg))
      : await buildLockfile(projectRoot, homeDir, {
          includeGlobal: before.skills.some((skill) => skill.scope === "global"),
          includeContext: Boolean(before.context?.length),
          agents: [...new Set(before.skills.map((skill) => skill.agent))],
        });

    const entries = diffLocks(before, after);
    const summary = summarizeDiff(entries);
    printDiff(entries);

    const contextDiff = diffContextLocks(before.context ?? [], after.context ?? []);
    if (contextDiff.length > 0) {
      console.log(pc.bold("\nContext"));
      printContextDiff(contextDiff);
    }

    console.log(
      pc.dim(
        `summary: added=${summary.added} removed=${summary.removed} modified=${summary.modified} unchanged=${summary.unchanged}`,
      ),
    );
  });

program
  .command("audit")
  .description("Scan skills for prompt-injection and obfuscation patterns")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Audit only skills tracked in lockfile")
  .option("--global", "Include global skills when not using a lockfile")
  .option("--policy <file>", "Policy path")
  .option("--fail-on <level>", "Exit non-zero on warning or error")
  .action(async (options: {
    project: string;
    lockfile?: string;
    global?: boolean;
    policy?: string;
    failOn?: string;
  }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const policy = await readPolicy(projectRoot, options.policy);
    let skills;

    if (options.lockfile || (await fileExists(resolveLockfilePath(projectRoot, options.lockfile)))) {
      const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
      skills = await discoverFromLock(lock, projectRoot, homeDir);
    } else {
      const targets = defaultDiscoveryTargets(projectRoot, homeDir, ["cursor"]).filter(
        (target) => options.global || target.scope === "project",
      );
      skills = await discoverSkills(targets);
    }

    let findings = await auditSkills(skills);
    if (policy?.audit.denyRules.length) {
      findings = findings.filter((finding) => policy.audit.denyRules.includes(finding.rule));
    } else {
      findings = filterAuditFindings(findings, policy);
    }

    printAuditFindings(findings);
    const failOn =
      options.failOn === "error"
        ? "error"
        : options.failOn === "info"
          ? "info"
          : policyFailLevel(policy);
    process.exitCode = auditExitCode(findings, failOn);
  });

program
  .command("test")
  .description("Run static contract tests from skills.test.yaml")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--tests <file>", "Tests file path")
  .option("--lockfile <file>", "Use skills from lockfile")
  .option("--llm", "Run LLM golden tests when llmPrompt is set")
  .option("--require-llm", "Fail if LLM tests cannot run (no API key)")
  .action(async (options: {
    project: string;
    tests?: string;
    lockfile?: string;
    llm?: boolean;
    requireLlm?: boolean;
  }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const testsFile = await readTestsFile(projectRoot, options.tests);

    if (!testsFile || testsFile.tests.length === 0) {
      console.error(pc.red(`No tests found. Run skilllock init or create ${DEFAULT_TESTS}`));
      process.exitCode = 1;
      return;
    }

    let skills;
    if (options.lockfile || (await fileExists(resolveLockfilePath(projectRoot, options.lockfile)))) {
      const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
      skills = await discoverFromLock(lock, projectRoot, homeDir);
    } else {
      skills = await discoverSkills(
        defaultDiscoveryTargets(projectRoot, homeDir, ["cursor"]).filter((target) => target.scope === "project"),
      );
    }

    const results = await runSkillTests(skills, testsFile, {
      enabled: Boolean(options.llm),
      required: Boolean(options.requireLlm),
    });
    printTestResults(results);
    process.exitCode = results.some((result) => !result.passed) ? 1 : 0;
  });

program
  .command("sbom")
  .description("Export a JSON SBOM for locked agent context")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--output <file>", "Output JSON path")
  .option("--format <format>", "skilllock or cyclonedx", "skilllock")
  .action(async (options: { project: string; lockfile?: string; output?: string; format: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const sbom = options.format === "cyclonedx" ? buildCycloneDxSbom(lock) : buildSbom(lock);
    const json = `${JSON.stringify(sbom, null, 2)}\n`;
    if (options.output) {
      await writeFile(path.resolve(options.output), json, "utf8");
      console.log(pc.green(`✓ Wrote SBOM to ${options.output}`));
    } else {
      process.stdout.write(json);
    }
  });

program
  .command("validate")
  .description("Validate SKILL.md format and lockfile structure")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--fail-on <level>", "error or warning", "error")
  .action(async (options: { project: string; lockfile?: string; failOn: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const skills = await discoverFromLock(lock, projectRoot, homeDir);
    const issues = [...validateLockfileStructure(lock), ...(await validateSkills(skills))];
    printValidationIssues(issues);
    process.exitCode = validationExitCode(issues, options.failOn === "warning" ? "warning" : "error");
  });

program
  .command("check")
  .description("Run verify + validate + audit + tests + policy in one pass")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--policy <file>", "Policy path")
  .option("--tests <file>", "Tests file path")
  .option("--skip-audit", "Skip security audit")
  .option("--skip-tests", "Skip contract tests")
  .option("--skip-validate", "Skip SKILL.md validation")
  .option("--skip-untracked", "Do not fail on skills missing from lockfile")
  .option("--skip-drift", "Skip lockfile drift detection")
  .option("--global", "Include global skills in untracked scan")
  .option("--agents <list>", "Agents for untracked scan", "cursor")
  .option("--llm", "Run LLM golden tests when llmPrompt is set")
  .option("--require-llm", "Fail if LLM tests cannot run")
  .action(async (options: {
    project: string;
    lockfile?: string;
    policy?: string;
    tests?: string;
    skipAudit?: boolean;
    skipTests?: boolean;
    skipValidate?: boolean;
    skipUntracked?: boolean;
    skipDrift?: boolean;
    global?: boolean;
    agents: string;
    llm?: boolean;
    requireLlm?: boolean;
  }) => {
    const report = await runProjectCheck({
      projectRoot: resolveProjectRoot(options.project),
      homeDir: resolveHomeDir(),
      lockfile: options.lockfile,
      policy: options.policy,
      tests: options.tests,
      skipAudit: options.skipAudit,
      skipTests: options.skipTests,
      skipValidate: options.skipValidate,
      skipUntracked: options.skipUntracked,
      skipDrift: options.skipDrift,
      includeGlobal: Boolean(options.global),
      agents: parseAgents(options.agents),
      llm: options.llm,
      requireLlm: options.requireLlm,
    });
    printCheckReport(report);
    process.exitCode = report.passed ? 0 : 1;
  });

program
  .command("drift")
  .description("Show differences between lockfile and current disk (without updating lock)")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--policy <file>", "Policy path")
  .option("--json", "Output drift summary as JSON")
  .action(async (options: { project: string; lockfile?: string; policy?: string; json?: boolean }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lockPath = resolveLockfilePath(projectRoot, options.lockfile);
    const before = await readLockfile(lockPath);
    const policy = await readPolicy(projectRoot, options.policy);
    const failOnDrift = policy?.drift.failOn ?? true;

    const after = await buildLockfile(projectRoot, homeDir, {
      includeGlobal: before.skills.some((skill) => skill.scope === "global"),
      includeContext: Boolean(before.context?.length),
      agents: [...new Set(before.skills.map((skill) => skill.agent))],
    });
    const entries = diffLocks(before, after);
    const summary = summarizeDiff(entries);
    const contextDiff = diffContextLocks(before.context ?? [], after.context ?? []);

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            version: 1,
            hasDrift: summary.added + summary.removed + summary.modified > 0 || contextDiff.length > 0,
            summary,
            context: contextDiff,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      printDiff(entries);
      if (contextDiff.length > 0) {
        console.log(pc.bold("\nContext"));
        printContextDiff(contextDiff);
      }
      console.log(
        pc.dim(
          `summary: added=${summary.added} removed=${summary.removed} modified=${summary.modified} unchanged=${summary.unchanged}`,
        ),
      );
    }

    const hasDrift = summary.added + summary.removed + summary.modified > 0 || contextDiff.length > 0;
    process.exitCode = hasDrift && failOnDrift ? 1 : 0;
  });

program
  .command("tree")
  .description("Show skill dependency tree from lockfile")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .action(async (options: { project: string; lockfile?: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const forest = buildSkillForest(lock);
    if (forest.length === 0) {
      console.log(pc.yellow("No skills in lockfile"));
      return;
    }
    for (const line of formatSkillTree(forest)) {
      console.log(line);
    }
  });

program
  .command("graph")
  .description("Render skill dependency graph as Mermaid flowchart")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--ascii", "Output ASCII tree instead of Mermaid")
  .action(async (options: { project: string; lockfile?: string; ascii?: boolean }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));

    if (lock.skills.length === 0) {
      console.log(pc.yellow("No skills in lockfile"));
      return;
    }

    if (options.ascii) {
      const forest = buildSkillForest(lock);
      for (const line of formatSkillTree(forest)) {
        console.log(line);
      }
      return;
    }

    console.log(formatMermaidGraph(lock));
  });

program
  .command("why")
  .description("Explain why a skill is locked and where it comes from")
  .argument("<skill>", "Skill name")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .action(async (skillName: string, options: { project: string; lockfile?: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const sourcesFile = await readSourcesFile(projectRoot);
    const explanation = explainSkill(lock, skillName, sourcesFile);
    if (!explanation) {
      console.error(pc.red(`Skill "${skillName}" not found in lockfile`));
      process.exitCode = 1;
      return;
    }
    console.log(pc.bold(explanation.skill.name));
    console.log(pc.dim(`  id: ${explanation.skill.id}`));
    console.log(pc.dim(`  root: ${explanation.skill.root}`));
    console.log(pc.dim(`  files: ${explanation.fileCount}`));
    if (explanation.source) {
      console.log(pc.dim(`  source (${explanation.sourceOrigin}): ${explanation.source.type} ${explanation.source.ref}`));
    } else {
      console.log(pc.yellow("  source: none (snapshot/manual only)"));
    }
    if (explanation.skill.dependencies?.length) {
      console.log(pc.dim(`  depends on: ${explanation.skill.dependencies.join(", ")}`));
    }
    if (explanation.missingDependencies.length) {
      console.log(pc.red(`  missing deps in lock: ${explanation.missingDependencies.join(", ")}`));
    }
    if (explanation.dependents.length) {
      console.log(pc.dim(`  required by: ${explanation.dependents.join(", ")}`));
    }
  });

program
  .command("untracked")
  .description("List installed skills not present in the lockfile")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--global", "Include global skills")
  .option("--agents <list>", "Agents to scan", "cursor")
  .action(async (options: { project: string; lockfile?: string; global?: boolean; agents: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const untracked = await findUntrackedSkills(
      projectRoot,
      homeDir,
      lock,
      parseAgents(options.agents),
      Boolean(options.global),
    );
    if (untracked.length === 0) {
      console.log(pc.green("✓ No untracked skills"));
      return;
    }
    for (const entry of untracked) {
      console.log(`${pc.yellow("?")} ${pc.bold(entry.skill.name)} ${pc.dim(`(${entry.skill.agent}/${entry.skill.scope})`)}`);
      console.log(pc.dim(`  root: ${entry.skill.root}`));
    }
    process.exitCode = 1;
  });

program
  .command("outdated")
  .description("Compare locked skill sources against remote latest versions")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--offline", "Skip network checks")
  .action(async (options: { project: string; lockfile?: string; offline?: boolean }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const sourcesFile = await readSourcesFile(projectRoot);
    const results = await checkOutdatedSkills(lock, sourcesFile, { offline: options.offline });
    const summary = summarizeOutdated(results);

    if (results.length === 0) {
      console.log(pc.yellow("No skills in lockfile"));
      return;
    }

    for (const entry of results) {
      const color =
        entry.status === "outdated" ? pc.yellow
        : entry.status === "unpinned" ? pc.cyan
        : entry.status === "current" ? pc.green
        : pc.dim;
      const latest = entry.latest ? ` → ${entry.latest}` : "";
      console.log(color(`${entry.skill}: ${entry.status} (${entry.current}${latest})`));
      console.log(pc.dim(`  ${entry.message}`));
    }

    console.log(
      pc.dim(
        `\nsummary: outdated=${summary.outdated} unpinned=${summary.unpinned} current=${summary.current} local=${summary.local} unknown=${summary.unknown}`,
      ),
    );
    process.exitCode = summary.outdated + summary.unpinned > 0 ? 1 : 0;
  });

program
  .command("upgrade")
  .description("Suggest steps to refresh outdated or unpinned skills")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--offline", "Skip network checks")
  .option("--json", "Print JSON plan")
  .option("--apply", "Bump source refs in lockfile (and sources mapping)")
  .option("--dry-run", "Preview apply changes without writing files")
  .option("--reproduce", "After apply, run reproduce to refresh installed skills")
  .option("--check", "Run check after apply (default with --reproduce)")
  .option("--skip-check", "Skip post-apply check even with --reproduce")
  .option("--skip-tests", "Skip tests during post-apply check")
  .option("--no-cache", "Disable cache during reproduce")
  .option("--skills <list>", "Comma-separated skill names to upgrade")
  .action(async (options: {
    project: string;
    lockfile?: string;
    offline?: boolean;
    json?: boolean;
    apply?: boolean;
    dryRun?: boolean;
    reproduce?: boolean;
    check?: boolean;
    skipCheck?: boolean;
    skipTests?: boolean;
    cache?: boolean;
    skills?: string;
  }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const skillFilter = options.skills
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (options.apply) {
      const report = await runUpgradeApply(projectRoot, homeDir, {
        lockfile: options.lockfile,
        offline: options.offline,
        dryRun: options.dryRun,
        reproduce: options.reproduce,
        relock: options.reproduce,
        check: options.check,
        skipCheck: options.skipCheck,
        skipTests: options.skipTests,
        useCache: options.cache !== false,
        skills: skillFilter,
      });
      printApplyUpgradeReport(report);
      const failed =
        report.changes.length > 0 &&
        (report.verifyIssues > 0 || report.checkPassed === false);
      process.exitCode = report.changes.length === 0 ? 0 : failed ? 1 : 0;
      return;
    }

    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const sourcesFile = await readSourcesFile(projectRoot);
    const outdated = await checkOutdatedSkills(lock, sourcesFile, { offline: options.offline });
    const plan = buildUpgradePlan(outdated);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    } else if (plan.length === 0) {
      console.log(pc.green("✓ No upgrade suggestions"));
    } else {
      for (const line of formatUpgradePlan(plan)) {
        console.log(line);
      }
    }

    process.exitCode = plan.length > 0 ? 1 : 0;
  });

program
  .command("snapshot")
  .description("Save local skill/context files into .skilllock/snapshots for offline reproduce")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .action(async (options: { project: string; lockfile?: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lock = await readLockfile(resolveLockfilePath(projectRoot, options.lockfile));
    const counts = await createSnapshotsFromDisk(projectRoot, homeDir, lock);
    console.log(
      pc.green(
        `✓ Snapshotted ${counts.skills} skill(s), ${counts.context} context artifact(s), ${counts.rules} rule file(s)`,
      ),
    );
  });

const cacheCmd = program.command("cache").description("Inspect local reproduce cache");

cacheCmd
  .command("list")
  .description("List cached skill sources")
  .option("--project <dir>", "Project root", process.cwd())
  .action(async (options: { project: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const entries = await listCacheEntries(projectRoot);
    if (entries.length === 0) {
      console.log(pc.yellow("No cache entries"));
      return;
    }
    for (const entry of entries) {
      console.log(`${pc.bold(entry.key)} ${pc.dim(entry.sourceType)} ${entry.sourceRef}`);
      console.log(pc.dim(`  path: ${entry.path}  fetched: ${entry.fetchedAt}`));
    }
  });

cacheCmd
  .command("clear")
  .description("Clear reproduce cache entries")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--key <key>", "Clear a single cache key")
  .action(async (options: { project: string; key?: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const removed = await clearCache(projectRoot, options.key);
    console.log(pc.green(`✓ Cleared ${removed} cache entr${removed === 1 ? "y" : "ies"}`));
  });

cacheCmd
  .command("stats")
  .description("Show reproduce cache statistics")
  .option("--project <dir>", "Project root", process.cwd())
  .action(async (options: { project: string }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const stats = await cacheStats(projectRoot);
    console.log(`entries: ${stats.entries}`);
    console.log(`skill dirs: ${stats.skillDirs}`);
    console.log(`git dirs: ${stats.gitDirs}`);
  });

program
  .command("reproduce")
  .description("Install missing skills from lockfile sources and restore snapshots")
  .option("--project <dir>", "Project root", process.cwd())
  .option("--lockfile <file>", "Lockfile path")
  .option("--dry-run", "Print planned installs without executing")
  .option("--scope <scope>", "project or all", "project")
  .option("--synthesize-apm", "Write apm.yml from lock before install")
  .option("--skip-verify", "Skip post-install verify")
  .option("--only <parts>", "skills, context, rules, or mcp (comma-separated)")
  .option("--no-cache", "Do not read or write .skilllock/cache")
  .action(async (options: {
    project: string;
    lockfile?: string;
    dryRun?: boolean;
    scope: string;
    synthesizeApm?: boolean;
    skipVerify?: boolean;
    only?: string;
    cache?: boolean;
  }) => {
    const projectRoot = resolveProjectRoot(options.project);
    const homeDir = resolveHomeDir();
    const lockPath = resolveLockfilePath(projectRoot, options.lockfile);
    const lock = await readLockfile(lockPath);

    if (options.synthesizeApm) {
      const apmPath = await synthesizeApmManifest(projectRoot, lock);
      if (apmPath) {
        console.log(pc.dim(`• synthesized ${path.relative(projectRoot, apmPath)}`));
      }
    }

    const sourcesFile = await readSourcesFile(projectRoot);
    const discovered = await discoverFromLock(lock, projectRoot, homeDir);
    const plan = await buildReproducePlan(lock, discovered, sourcesFile, {
      scope: options.scope === "all" ? "all" : "project",
      projectRoot,
    });
    const summary = planSummary(plan);

    if (plan.length > 0) {
      console.log(pc.bold(`Plan: ${summary.total} skill(s) to reproduce`));
      if (summary.missingSource > 0) {
        console.log(
          pc.yellow(`• ${summary.missingSource} skill(s) lack source; snapshot or manual source required`),
        );
      }
    }

    const only = options.only
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean) as Array<"skills" | "context" | "rules" | "mcp"> | undefined;

    const report = await reproduceProject({
      projectRoot,
      homeDir,
      lockfile: options.lockfile,
      dryRun: options.dryRun,
      scope: options.scope === "all" ? "all" : "project",
      skipVerify: options.skipVerify,
      only,
      useCache: options.cache !== false,
    });

    printReproduceResults(report.results);
    if (report.contextResults.length > 0) {
      console.log(pc.bold("\nContext"));
      printContextReproduceResults(report.contextResults);
    }

    if (report.apmBulk) {
      console.log(pc.dim(`• bulk APM: ${report.apmBulk.message}`));
    }

    if (report.results.length === 0 && report.contextRestored === 0) {
      console.log(pc.green("✓ Agent context already matches lockfile"));
    }

    if (!options.dryRun && report.contextRestored > 0) {
      console.log(pc.dim(`• restored ${report.contextRestored} context artifact(s) from snapshots`));
    }

    if (!options.skipVerify && !options.dryRun) {
      if (report.verifyIssues === 0) {
        console.log(pc.green("✓ Reproduce complete — verify passed"));
      } else {
        console.log(pc.red(`✗ Reproduce finished with ${report.verifyIssues} verify issue(s)`));
        process.exitCode = 1;
      }
    }
  });

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
