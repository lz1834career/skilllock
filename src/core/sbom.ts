import { randomUUID } from "node:crypto";
import type { SkillsLock, SbomDocument } from "../types.js";
import { sha256Hex } from "./discover.js";

const TOOL_VERSION = "0.4.0";

function hashContent(hash: string): string {
  return hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
}

export function buildSbom(lock: SkillsLock): SbomDocument {
  const components: SbomDocument["components"] = [];

  for (const skill of lock.skills) {
    components.push({
      type: "skill",
      name: skill.name,
      version: skill.source?.resolved ?? undefined,
      purl: skill.source ? `pkg:${skill.source.type}/${skill.source.ref}` : undefined,
      hashes: skill.files.map((file) => ({
        alg: "SHA-256",
        content: hashContent(file.hash),
      })),
      dependencies: skill.dependencies,
    });
  }

  for (const artifact of lock.context ?? []) {
    components.push({
      type: "context",
      name: `${artifact.kind}:${artifact.name}`,
      hashes: artifact.files.map((file) => ({
        alg: "SHA-256",
        content: hashContent(file.hash),
      })),
    });
  }

  for (const manifest of lock.manifests ?? []) {
    components.push({
      type: "manifest",
      name: `${manifest.type}:${manifest.path}`,
      hashes: [
        {
          alg: "SHA-256",
          content: sha256Hex(Buffer.from(JSON.stringify(manifest.entries ?? []))),
        },
      ],
    });
  }

  return {
    bomFormat: "skilllock",
    specVersion: "1.0",
    serialNumber: `urn:uuid:${randomUUID()}`,
    metadata: {
      timestamp: new Date().toISOString(),
      tool: { name: "skilllock", version: TOOL_VERSION },
      projectRoot: lock.projectRoot,
    },
    components,
  };
}

export interface CycloneDxBom {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  serialNumber: string;
  metadata: {
    timestamp: string;
    tools: Array<{ vendor: string; name: string; version: string }>;
  };
  components: Array<{
    type: "application" | "file";
    name: string;
    version?: string;
    purl?: string;
    hashes?: Array<{ alg: "SHA-256"; content: string }>;
    dependencies?: string[];
  }>;
}

export function buildCycloneDxSbom(lock: SkillsLock): CycloneDxBom {
  const sbom = buildSbom(lock);
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: sbom.serialNumber,
    metadata: {
      timestamp: sbom.metadata.timestamp,
      tools: [{ vendor: "skilllock", name: "skilllock", version: TOOL_VERSION }],
    },
    components: sbom.components.map((component) => ({
      type: component.type === "context" ? "file" : "application",
      name: component.name,
      version: component.version,
      purl: component.purl,
      hashes: component.hashes,
      dependencies: component.dependencies,
    })),
  };
}
