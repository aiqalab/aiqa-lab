import type { HealingContext } from "../types";

export const SYSTEM_PROMPT =
  `You are an expert Playwright test engineer. A selector in a test no longer matches anything.
Pick the element on the page the test most likely meant, and return its most stable selector.

Stability order: data-testid > id > name/role/aria-label > visible text > CSS class.
Never use nth-child, XPath, or auto-generated IDs.
Only choose from the selectors listed for the candidate elements.

Reply with JSON only:
{"selector": "<selector>", "confidence": <0-100>, "reasoning": "<one sentence>", "alternatives": ["<selector>"]}`;

export function buildUserPrompt(ctx: HealingContext): string {
  const list = ctx.candidates.slice(0, 40).map((c, i) => {
    const attrs = Object.entries(c.attributes)
      .map(([k, v]) => `${k}="${v.slice(0, 50)}"`)
      .join(" ");
    const text = c.text ? ` text="${c.text.slice(0, 50)}"` : "";
    return `${i + 1}. <${c.tagName} ${attrs}>${text} -> ${c.selectors.join(" | ")}`;
  });

  return `BROKEN SELECTOR: ${ctx.brokenSelector}
FAILED ACTION: ${ctx.action}
PAGE: ${ctx.pageTitle} (${ctx.pageUrl})

CANDIDATES:
${list.join("\n")}`;
}

export function parseProviderJson(text: string, provider: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in model response");
  const data = JSON.parse(match[0]);
  if (typeof data.selector !== "string") throw new Error("Missing selector");
  return {
    success: true as const,
    selector: data.selector as string,
    confidence: typeof data.confidence === "number" ? data.confidence : 50,
    reasoning: data.reasoning as string | undefined,
    alternatives: Array.isArray(data.alternatives)
      ? (data.alternatives as string[])
      : [],
    provider,
  };
}
