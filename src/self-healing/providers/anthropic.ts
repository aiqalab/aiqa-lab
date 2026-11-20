import type { HealingContext, HealingProvider, HealingResult } from "../types";
import { buildUserPrompt, parseProviderJson, SYSTEM_PROMPT } from "./prompt";

export class AnthropicProvider implements HealingProvider {
  name = "anthropic";
  constructor(
    private apiKey = process.env.ANTHROPIC_API_KEY ?? "",
    private model = process.env.SELF_HEALING_MODEL || "claude-sonnet-5-5",
  ) {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  }

  async suggest(ctx: HealingContext): Promise<HealingResult> {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(ctx) }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { content?: { text?: string }[] };
      return parseProviderJson(data.content?.[0]?.text ?? "", this.name);
    } catch (e) {
      return {
        success: false,
        confidence: 0,
        provider: this.name,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
