import type { OutdatedSkill } from "./outdated.js";

export interface UpgradeSuggestion {
  skill: string;
  status: OutdatedSkill["status"];
  current: string;
  latest?: string;
  steps: string[];
}

export function buildUpgradePlan(outdated: OutdatedSkill[]): UpgradeSuggestion[] {
  return outdated
    .filter((entry) => entry.status === "outdated" || entry.status === "unpinned")
    .map((entry) => {
      const steps = [
        `Review changelog for ${entry.skill}`,
        entry.latest
          ? `Update source ref to pin ${entry.latest} in skills.lock.yaml or .skilllock-sources.yaml`
          : `Pin source ref for ${entry.skill} in skills.lock.yaml`,
        `Run: skilllock reproduce`,
        `Run: skilllock lock`,
        `Run: skilllock verify && skilllock test`,
      ];

      return {
        skill: entry.skill,
        status: entry.status,
        current: entry.current,
        latest: entry.latest,
        steps,
      };
    });
}

export function formatUpgradePlan(plan: UpgradeSuggestion[]): string[] {
  const lines: string[] = [];
  for (const item of plan) {
    lines.push(`${item.skill}: ${item.status} (${item.current}${item.latest ? ` → ${item.latest}` : ""})`);
    for (const step of item.steps) {
      lines.push(`  • ${step}`);
    }
    lines.push("");
  }
  return lines;
}
