import type { SkillsLock } from "../types.js";

export interface DependencyEdge {
  from: string;
  to: string;
}

export function collectDependencyEdges(lock: SkillsLock): DependencyEdge[] {
  const byName = new Map(lock.skills.map((skill) => [skill.name, skill]));
  const edges: DependencyEdge[] = [];

  for (const skill of lock.skills) {
    for (const dep of skill.dependencies ?? []) {
      if (byName.has(dep)) {
        edges.push({ from: skill.name, to: dep });
      }
    }
  }

  return edges.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
}

/** Mermaid-safe node id (skill names are usually kebab-case). */
export function mermaidNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, "&quot;");
}

export function formatMermaidGraph(lock: SkillsLock): string {
  const edges = collectDependencyEdges(lock);
  const lines = ["flowchart TD"];

  for (const skill of [...lock.skills].sort((left, right) => left.name.localeCompare(right.name))) {
    const label = escapeMermaidLabel(`${skill.name} (${skill.agent}/${skill.scope})`);
    lines.push(`  ${mermaidNodeId(skill.name)}["${label}"]`);
  }

  for (const edge of edges) {
    lines.push(`  ${mermaidNodeId(edge.from)} --> ${mermaidNodeId(edge.to)}`);
  }

  return lines.join("\n");
}
