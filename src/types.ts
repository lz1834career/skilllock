import { z } from "zod";

export const LOCKFILE_VERSION = 2;
export const DEFAULT_LOCKFILE = "skills.lock.yaml";
export const DEFAULT_SOURCES = ".skilllock-sources.yaml";
export const DEFAULT_POLICY = "skilllock.policy.yaml";
export const DEFAULT_TESTS = "skills.test.yaml";

export const skillScopeSchema = z.enum(["project", "global"]);
export type SkillScope = z.infer<typeof skillScopeSchema>;

export const skillAgentSchema = z.enum(["cursor", "claude"]);
export type SkillAgent = z.infer<typeof skillAgentSchema>;

export const contextKindSchema = z.enum(["mcp", "rule", "agents-md", "instructions"]);
export type ContextKind = z.infer<typeof contextKindSchema>;

export const sourceTypeSchema = z.enum(["git", "npm", "apm", "vercel-skills", "manual"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const skillSourceSchema = z.object({
  type: sourceTypeSchema,
  ref: z.string(),
  resolved: z.string().optional(),
});

export type SkillSource = z.infer<typeof skillSourceSchema>;

export const lockedFileSchema = z.object({
  path: z.string(),
  hash: z.string(),
  size: z.number().int().nonnegative(),
});

export type LockedFile = z.infer<typeof lockedFileSchema>;

export const lockedSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: skillScopeSchema,
  agent: skillAgentSchema,
  root: z.string(),
  description: z.string().optional(),
  compatibility: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  source: skillSourceSchema.optional(),
  files: z.array(lockedFileSchema),
});

export type LockedSkill = z.infer<typeof lockedSkillSchema>;

export const lockedContextSchema = z.object({
  id: z.string(),
  kind: contextKindSchema,
  name: z.string(),
  scope: skillScopeSchema,
  agent: skillAgentSchema,
  root: z.string(),
  files: z.array(lockedFileSchema),
});

export type LockedContext = z.infer<typeof lockedContextSchema>;

export const manifestRecordSchema = z.object({
  type: z.enum(["apm", "npm", "vercel-skills"]),
  path: z.string(),
  entries: z.array(z.string()).optional(),
});

export type ManifestRecord = z.infer<typeof manifestRecordSchema>;

export const skillsLockSchema = z.object({
  lockfileVersion: z.union([z.literal(1), z.literal(2)]),
  generatedAt: z.string(),
  projectRoot: z.string(),
  skills: z.array(lockedSkillSchema),
  context: z.array(lockedContextSchema).optional(),
  manifests: z.array(manifestRecordSchema).optional(),
});

export type SkillsLock = z.infer<typeof skillsLockSchema>;

export interface SkillDiscoveryTarget {
  agent: SkillAgent;
  scope: SkillScope;
  root: string;
}

export interface DiscoveredSkill {
  id: string;
  name: string;
  scope: SkillScope;
  agent: SkillAgent;
  root: string;
  description?: string;
  compatibility?: string;
  dependencies?: string[];
  source?: SkillSource;
  files: LockedFile[];
}

export interface ContextDiscoveryTarget {
  agent: SkillAgent;
  scope: SkillScope;
  kind: ContextKind;
  root: string;
  pattern?: string[];
}

export interface DiscoveredContext {
  id: string;
  kind: ContextKind;
  name: string;
  scope: SkillScope;
  agent: SkillAgent;
  root: string;
  files: LockedFile[];
}

export interface VerifyIssue {
  kind:
    | "missing-skill"
    | "extra-skill"
    | "file-mismatch"
    | "missing-file"
    | "extra-file"
    | "missing-context"
    | "extra-context"
    | "compatibility"
    | "policy"
    | "dependency";
  skillId: string;
  message: string;
}

export interface AuditFinding {
  severity: "error" | "warning" | "info";
  rule: string;
  skillId: string;
  file: string;
  line?: number;
  column?: number;
  message: string;
  snippet?: string;
}

export interface SkillDiffEntry {
  skillId: string;
  status: "added" | "removed" | "modified" | "unchanged";
  fileChanges: Array<{
    path: string;
    status: "added" | "removed" | "modified";
    beforeHash?: string;
    afterHash?: string;
  }>;
}

export interface SourceMapping {
  skill: string;
  source: SkillSource;
}

export interface SourcesFile {
  version: 1;
  mappings: SourceMapping[];
  manifests?: ManifestRecord[];
}

export const sourcesFileSchema = z.object({
  version: z.literal(1),
  mappings: z.array(
    z.object({
      skill: z.string(),
      source: skillSourceSchema,
    }),
  ),
  manifests: z.array(manifestRecordSchema).optional(),
});

export const policySchema = z.object({
  version: z.literal(1),
  audit: z
    .object({
      failOn: z.enum(["error", "warning", "info"]).default("warning"),
      denyRules: z.array(z.string()).default([]),
      allowSkills: z.array(z.string()).optional(),
      denySkills: z.array(z.string()).default([]),
    })
    .default({}),
  compatibility: z
    .object({
      enforce: z.boolean().default(false),
    })
    .default({}),
  context: z
    .object({
      requireLocked: z.boolean().default(false),
      allowedKinds: z.array(contextKindSchema).optional(),
    })
    .default({}),
  lockfile: z
    .object({
      requireSources: z.boolean().default(false),
      requireDependenciesResolved: z.boolean().default(false),
    })
    .default({}),
  drift: z
    .object({
      failOn: z.boolean().default(true),
    })
    .default({}),
  untracked: z
    .object({
      failOn: z.boolean().default(true),
    })
    .default({}),
});

export type SkilllockPolicy = z.infer<typeof policySchema>;

export const skillTestCaseSchema = z.object({
  skill: z.string(),
  prompt: z.string().optional(),
  expectDescriptionContains: z.array(z.string()).optional(),
  expectSkillMdContains: z.array(z.string()).optional(),
  expectSkillMdMatches: z.array(z.string()).optional(),
  expectCompatibility: z.string().optional(),
  expectDependencies: z.array(z.string()).optional(),
  expectInstalledDependencies: z.array(z.string()).optional(),
  llmPrompt: z.string().optional(),
  expectLlmContains: z.array(z.string()).optional(),
  expectLlmMatches: z.string().optional(),
});

export const skillTestsFileSchema = z.object({
  version: z.literal(1),
  tests: z.array(skillTestCaseSchema),
});

export type SkillTestCase = z.infer<typeof skillTestCaseSchema>;
export type SkillTestsFile = z.infer<typeof skillTestsFileSchema>;

export interface SkillTestResult {
  skill: string;
  passed: boolean;
  failures: string[];
}

export interface BuildLockOptions {
  includeGlobal?: boolean;
  includeContext?: boolean;
  agents?: SkillAgent[];
  mergeSources?: boolean;
  writeSnapshot?: boolean;
}

export interface LlmTestOptions {
  enabled?: boolean;
  required?: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface LlmTestOutcome {
  ok: boolean;
  skipped?: boolean;
  response?: string;
  error?: string;
}

export type ReproduceReason = "missing" | "hash-mismatch" | "missing-source";

export type ReproduceInstaller = "skills" | "skillpm" | "apm" | "git" | "snapshot" | "copy";

export interface ReproducePlanItem {
  skill: LockedSkill;
  source?: SkillSource;
  reason: ReproduceReason;
  installer: ReproduceInstaller;
}

export interface ReproduceResult {
  skill: string;
  success: boolean;
  installer: ReproduceInstaller;
  message: string;
}

export interface ReproduceOptions {
  projectRoot: string;
  homeDir: string;
  dryRun?: boolean;
  scope?: "project" | "all";
  preferSnapshot?: boolean;
  skipVerify?: boolean;
  agents?: SkillAgent[];
  only?: Array<"skills" | "context" | "rules" | "mcp">;
  useCache?: boolean;
}

export const SNAPSHOT_DIR = ".skilllock/snapshots";
export const CONTEXT_SNAPSHOT_DIR = ".skilllock/snapshots/context";
export const RULES_SNAPSHOT_DIR = ".skilllock/snapshots/rules";
export const CACHE_DIR = ".skilllock/cache";

export interface ApplyUpgradeChange {
  skill: string;
  location: "lockfile" | "sources-file" | "both";
  before: string;
  after: string;
}

export interface ApplyUpgradeOptions {
  lockfile?: string;
  policy?: string;
  tests?: string;
  offline?: boolean;
  dryRun?: boolean;
  reproduce?: boolean;
  relock?: boolean;
  verify?: boolean;
  check?: boolean;
  skipCheck?: boolean;
  skipTests?: boolean;
  useCache?: boolean;
  skills?: string[];
}

export interface ApplyUpgradeReport {
  changes: ApplyUpgradeChange[];
  reproduced: boolean;
  relocked: boolean;
  verifyIssues: number;
  checkPassed?: boolean;
  dryRun?: boolean;
  summary?: { changed: number; skills: string[] };
}

export interface SbomDocument {
  bomFormat: "skilllock";
  specVersion: "1.0";
  serialNumber: string;
  metadata: {
    timestamp: string;
    tool: { name: string; version: string };
    projectRoot: string;
  };
  components: Array<{
    type: "skill" | "context" | "manifest";
    name: string;
    version?: string;
    purl?: string;
    hashes: Array<{ alg: "SHA-256"; content: string }>;
    dependencies?: string[];
  }>;
}
