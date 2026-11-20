import type { HealingContext, HealingProvider, HealingResult } from "../types";
import { buildUserPrompt, parseProviderJson, SYSTEM_PROMPT } from "./prompt";

export class OpenAIProvider implements HealingProvider {
  name = "openai";
  constructor(
    private apiKey = process.env.OPENAI_API_KEY ?? "",
    private model = process.env.SELF_HEALING_MODEL || "gpt-4o",
  ) {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set");
  }

  async suggest(ctx: HealingContext): Promise<HealingResult> {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(ctx) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return parseProviderJson(
        data.choices?.[0]?.message?.content ?? "",
        this.name,
      );
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
