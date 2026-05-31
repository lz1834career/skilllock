import type { LockedSkill, SkillsLock } from "../types.js";
import { sortSkillsByDependencies } from "./reproduce/plan.js";

export interface SkillTreeNode {
  skill: LockedSkill;
  children: SkillTreeNode[];
  depth: number;
}

export function buildSkillForest(lock: SkillsLock): SkillTreeNode[] {
  const skills = sortSkillsByDependencies(lock.skills);
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const childNames = new Set<string>();

  for (const skill of skills) {
    for (const dep of skill.dependencies ?? []) {
      if (byName.has(dep)) {
        childNames.add(dep);
      }
    }
  }

  const roots = skills.filter((skill) => !childNames.has(skill.name));

  function buildNode(skill: LockedSkill, depth: number, visiting: Set<string>): SkillTreeNode {
    if (visiting.has(skill.name)) {
      return { skill, children: [], depth };
    }
    visiting.add(skill.name);
    const children = (skill.dependencies ?? [])
      .map((dep) => byName.get(dep))
      .filter((dep): dep is LockedSkill => Boolean(dep))
      .map((dep) => buildNode(dep, depth + 1, visiting));
    visiting.delete(skill.name);
    return { skill, children, depth };
  }

  const seen = new Set<string>();
  const forest: SkillTreeNode[] = [];
  for (const root of roots) {
    if (seen.has(root.name)) {
      continue;
    }
    seen.add(root.name);
    forest.push(buildNode(root, 0, new Set()));
  }

  for (const skill of skills) {
    if (!seen.has(skill.name)) {
      seen.add(skill.name);
      forest.push(buildNode(skill, 0, new Set()));
    }
  }

  return forest;
}

export function formatSkillTree(forest: SkillTreeNode[]): string[] {
  const lines: string[] = [];

  function walk(node: SkillTreeNode, prefix: string, isLast: boolean): void {
    const branch = isLast ? "└─ " : "├─ ";
    const source = node.skill.source ? ` ${node.skill.source.type}:${node.skill.source.ref}` : "";
    lines.push(`${prefix}${branch}${node.skill.name} (${node.skill.agent}/${node.skill.scope})${source}`);
    const nextPrefix = prefix + (isLast ? "   " : "│  ");
    node.children.forEach((child, index) => {
      walk(child, nextPrefix, index === node.children.length - 1);
    });
  }

  forest.forEach((node, index) => {
    const source = node.skill.source ? ` ${node.skill.source.type}:${node.skill.source.ref}` : "";
    lines.push(`${node.skill.name} (${node.skill.agent}/${node.skill.scope})${source}`);
    node.children.forEach((child, childIndex) => {
      walk(child, "", childIndex === node.children.length - 1);
    });
    if (index < forest.length - 1) {
      lines.push("");
    }
  });

  return lines;
}
