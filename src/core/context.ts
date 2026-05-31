import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { hashBuffer, toPosixPath } from "./discover.js";
import type {
  ContextDiscoveryTarget,
  ContextKind,
  DiscoveredContext,
  LockedFile,
  SkillAgent,
} from "../types.js";

async function hashFilesAtRoot(root: string, patterns: string[]): Promise<LockedFile[]> {
  const relativePaths = await fg(patterns, {
    cwd: root,
    onlyFiles: true,
    dot: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  const files: LockedFile[] = [];
  for (const relativePath of relativePaths.sort()) {
    const absolutePath = path.join(root, relativePath);
    const buffer = await readFile(absolutePath);
    files.push({
      path: relativePath.split(path.sep).join("/"),
      hash: hashBuffer(buffer),
      size: buffer.byteLength,
    });
  }
  return files;
}

async function discoverSingleFileContext(
  target: Omit<ContextDiscoveryTarget, "pattern"> & { filePath: string; name: string },
): Promise<DiscoveredContext | null> {
  try {
    const buffer = await readFile(target.filePath);
    return {
      id: `${target.agent}:${target.scope}:${target.kind}:${target.name}`,
      kind: target.kind,
      name: target.name,
      scope: target.scope,
      agent: target.agent,
      root: target.filePath,
      files: [
        {
          path: path.basename(target.filePath),
          hash: hashBuffer(buffer),
          size: buffer.byteLength,
        },
      ],
    };
  } catch {
    return null;
  }
}

async function discoverDirectoryContext(target: ContextDiscoveryTarget): Promise<DiscoveredContext[]> {
  const patterns = target.pattern ?? ["**/*"];
  const files = await hashFilesAtRoot(target.root, patterns);
  if (files.length === 0) {
    return [];
  }

  const name = path.basename(target.root);
  return [
    {
      id: `${target.agent}:${target.scope}:${target.kind}:${name}`,
      kind: target.kind,
      name,
      scope: target.scope,
      agent: target.agent,
      root: target.root,
      files,
    },
  ];
}

export function defaultContextTargets(
  projectRoot: string,
  homeDir: string,
  agents: SkillAgent[] = ["cursor"],
): ContextDiscoveryTarget[] {
  const targets: ContextDiscoveryTarget[] = [];

  if (agents.includes("cursor")) {
    targets.push({
      agent: "cursor",
      scope: "project",
      kind: "rule",
      root: path.join(projectRoot, ".cursor", "rules"),
      pattern: ["**/*"],
    });
  }

  return targets;
}

export async function discoverContextArtifacts(
  projectRoot: string,
  homeDir: string,
  agents: SkillAgent[] = ["cursor"],
): Promise<DiscoveredContext[]> {
  const artifacts: DiscoveredContext[] = [];

  const singleFiles: Array<Omit<ContextDiscoveryTarget, "pattern"> & { filePath: string; name: string }> = [
    {
      agent: "cursor",
      scope: "project",
      kind: "mcp",
      root: projectRoot,
      filePath: path.join(projectRoot, ".cursor", "mcp.json"),
      name: "mcp.json",
    },
    {
      agent: "cursor",
      scope: "global",
      kind: "mcp",
      root: homeDir,
      filePath: path.join(homeDir, ".cursor", "mcp.json"),
      name: "mcp.json",
    },
    {
      agent: "cursor",
      scope: "project",
      kind: "agents-md",
      root: projectRoot,
      filePath: path.join(projectRoot, "AGENTS.md"),
      name: "AGENTS.md",
    },
    {
      agent: "claude",
      scope: "project",
      kind: "instructions",
      root: projectRoot,
      filePath: path.join(projectRoot, "CLAUDE.md"),
      name: "CLAUDE.md",
    },
  ];

  for (const fileTarget of singleFiles) {
    if (!agents.includes(fileTarget.agent)) {
      continue;
    }
    const artifact = await discoverSingleFileContext(fileTarget);
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  for (const target of defaultContextTargets(projectRoot, homeDir, agents)) {
    artifacts.push(...(await discoverDirectoryContext(target)));
  }

  return artifacts.sort((a, b) => a.id.localeCompare(b.id));
}

export function encodeContextRoot(
  artifactRoot: string,
  projectRoot: string,
  homeDir: string,
  kind: ContextKind,
): string {
  const normalizedHome = toPosixPath(homeDir);
  const normalizedRoot = toPosixPath(artifactRoot);
  const normalizedProject = toPosixPath(projectRoot);

  if (normalizedRoot.startsWith(`${normalizedHome}/`)) {
    return `$HOME/${normalizedRoot.slice(normalizedHome.length + 1)}`;
  }

  if (kind === "mcp" || kind === "agents-md" || kind === "instructions") {
    return toPosixPath(path.relative(normalizedProject, artifactRoot) || path.basename(artifactRoot));
  }

  return toPosixPath(path.relative(normalizedProject, artifactRoot) || ".");
}

export function decodeContextRoot(encodedRoot: string, projectRoot: string, homeDir: string): string {
  if (encodedRoot.startsWith("$HOME/")) {
    return path.join(homeDir, encodedRoot.slice("$HOME/".length).split("/").join(path.sep));
  }
  if (!encodedRoot.includes("/")) {
    return path.join(projectRoot, encodedRoot);
  }
  return path.resolve(projectRoot, encodedRoot.split("/").join(path.sep));
}
