import type { DiscoveredSkill, LlmTestOptions, LlmTestOutcome } from "../types.js";

function resolveLlmConfig(options: LlmTestOptions = {}): {
  apiKey?: string;
  baseUrl: string;
  model: string;
} {
  return {
    apiKey: options.apiKey ?? process.env.SKILLLOCK_LLM_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: options.baseUrl ?? process.env.SKILLLOCK_LLM_BASE_URL ?? "https://api.openai.com/v1",
    model: options.model ?? process.env.SKILLLOCK_LLM_MODEL ?? "gpt-4o-mini",
  };
}

export async function runLlmGoldenTest(
  skill: DiscoveredSkill,
  skillMdContent: string,
  prompt: string,
  options: LlmTestOptions = {},
): Promise<LlmTestOutcome> {
  const config = resolveLlmConfig(options);
  if (!config.apiKey) {
    return {
      ok: !options.required,
      skipped: true,
      error: options.required
        ? "LLM test required but no SKILLLOCK_LLM_API_KEY or OPENAI_API_KEY set"
        : "LLM test skipped (no API key)",
    };
  }

  if (options.enabled === false) {
    return { ok: true, skipped: true, error: "LLM tests disabled" };
  }

  const system = [
    "You are evaluating whether an Agent Skill is appropriate for a user prompt.",
    "Answer concisely with YES if the skill should be used, NO if not.",
    "Then provide one short sentence of reasoning.",
  ].join(" ");

  const user = [
    `Skill name: ${skill.name}`,
    `Skill description: ${skill.description ?? ""}`,
    "",
    "Skill instructions excerpt:",
    skillMdContent.slice(0, 4000),
    "",
    `User prompt: ${prompt}`,
  ].join("\n");

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `LLM API error: ${response.status} ${await response.text()}` };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
    return { ok: text.length > 0, response: text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function evaluateLlmResponse(
  response: string,
  expectContains?: string[],
  expectMatches?: string,
): string[] {
  const failures: string[] = [];
  const upper = response.toUpperCase();

  if (!upper.includes("YES") && !upper.includes("NO")) {
    failures.push("LLM response did not include YES or NO");
  }

  for (const fragment of expectContains ?? []) {
    if (!response.includes(fragment)) {
      failures.push(`LLM response does not contain "${fragment}"`);
    }
  }

  if (expectMatches && !new RegExp(expectMatches, "m").test(response)) {
    failures.push(`LLM response does not match /${expectMatches}/`);
  }

  return failures;
}
