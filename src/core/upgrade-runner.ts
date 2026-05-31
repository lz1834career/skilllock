import type { ApplyUpgradeOptions, ApplyUpgradeReport } from "../types.js";
import type { OutdatedSkill } from "./outdated.js";
import { runProjectCheck } from "./check.js";
import { checkOutdatedSkills } from "./outdated.js";
import {
  applyUpgrades,
  summarizeApplyResult,
} from "./apply-upgrade.js";
import {
  lockProject,
  readLockfile,
  readSourcesFile,
  resolveLockfilePath,
  writeLockfile,
  writeSourcesFile,
} from "./lockfile.js";
import { reproduceProject } from "./reproduce/reproduce.js";

export async function runUpgradeApply(
  projectRoot: string,
  homeDir: string,
  options: ApplyUpgradeOptions = {},
): Promise<ApplyUpgradeReport> {
  const lockfilePath = resolveLockfilePath(projectRoot, options.lockfile);
  const lock = await readLockfile(lockfilePath);
  const sourcesFile = await readSourcesFile(projectRoot);
  const outdated = await checkOutdatedSkills(lock, sourcesFile, { offline: options.offline });
  const result = applyUpgrades(lock, sourcesFile, outdated, { skills: options.skills });

  if (result.changes.length === 0) {
    return { changes: [], reproduced: false, relocked: false, verifyIssues: 0 };
  }

  if (options.dryRun) {
    return { changes: result.changes, reproduced: false, relocked: false, verifyIssues: 0, dryRun: true };
  }

  await writeLockfile(lockfilePath, result.lock);
  if (result.sourcesFile) {
    await writeSourcesFile(projectRoot, result.sourcesFile);
  }

  let reproduced = false;
  let relocked = false;
  let verifyIssues = 0;
  let checkPassed: boolean | undefined;

  if (options.reproduce) {
    const report = await reproduceProject({
      projectRoot,
      homeDir,
      lockfile: options.lockfile,
      useCache: options.useCache !== false,
    });
    verifyIssues = report.verifyIssues;
    reproduced = true;
  }

  if (options.relock ?? reproduced) {
    await lockProject(projectRoot, homeDir, {}, lockfilePath);
    relocked = true;
  }

  if (!options.reproduce && (options.verify ?? false)) {
    const { discoverFromLock, discoverContextFromLock } = await import("./lockfile.js");
    const { verifyAgainstLock } = await import("./verify.js");
    const skills = await discoverFromLock(result.lock, projectRoot, homeDir);
    const context = await discoverContextFromLock(result.lock, projectRoot, homeDir);
    verifyIssues = verifyAgainstLock(skills, result.lock, context).length;
  }

  const shouldCheck = !options.skipCheck && (options.check ?? options.reproduce ?? false);
  if (shouldCheck) {
    const checkReport = await runProjectCheck({
      projectRoot,
      homeDir,
      lockfile: options.lockfile,
      policy: options.policy,
      tests: options.tests,
      skipTests: options.skipTests,
      skipUntracked: true,
    });
    checkPassed = checkReport.passed;
  }

  return {
    changes: result.changes,
    reproduced,
    relocked,
    verifyIssues,
    checkPassed,
    summary: summarizeApplyResult(result),
  };
}

export function filterApplicableOutdated(outdated: OutdatedSkill[]): OutdatedSkill[] {
  return outdated.filter((entry) => entry.latest && (entry.status === "outdated" || entry.status === "unpinned"));
}
