import type {
  CandidateElement,
  HealingContext,
  HealingProvider,
  HealingResult,
} from "../types";

/**
 * Offline, rule-based "brain" - no API key or network needed.
 *
 * Idea: a broken selector still carries hints about intent
 * (`#username-input`, `[data-testid="submit-btn"]`, `button.save`).
 * We split it into words, expand common abbreviations, and score every
 * element on the page by how well its attributes/text match those words.
 */

const SYNONYMS: Record<string, string[]> = {
  btn: ["button", "submit"],
  pwd: ["password"],
  pass: ["password"],
  user: ["username"],
  login: ["submit"],
  save: ["submit"],
  send: ["submit"],
  ok: ["submit"],
  textarea: ["comments"],
  comment: ["comments"],
  desc: ["comments", "description"],
  email: ["mail"],
};

const NOISE = new Set([
  "input", "field", "box", "the", "id", "form", "main", "data", "testid",
  "test", "cy", "qa", "div", "span", "css", "xpath", "text", "has", "nth",
  "child",
]);

function words(selector: string): string[] {
  const raw = selector
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !NOISE.has(w));
  // Abbreviations are replaced by their expansions ("btn" -> button, submit);
  // keeping the abbreviation would only add a keyword nothing can match.
  const expanded = new Set<string>();
  for (const w of raw) {
    const syn = SYNONYMS[w];
    if (syn) syn.forEach((x) => expanded.add(x));
    else expanded.add(w);
  }
  return [...expanded];
}

/** Rough tag hint from the selector, e.g. "button.save" -> button */
function tagHint(selector: string): string | undefined {
  const m = selector.match(/^(input|button|textarea|select|a)\b/i);
  return m?.[1].toLowerCase();
}

function score(c: CandidateElement, ws: string[], hint?: string): number {
  if (!c.isVisible) return 0;
  const fields: [string, number][] = [
    [c.attributes["data-testid"] ?? "", 3],
    [c.attributes["id"] ?? "", 3],
    [c.attributes["name"] ?? "", 3],
    [c.attributes["aria-label"] ?? "", 3],
    [c.attributes["placeholder"] ?? "", 2],
    [c.attributes["value"] ?? "", 2],
    [c.attributes["type"] ?? "", 1],
    [c.text ?? "", 2],
  ];
  let total = 0;
  for (const w of ws) {
    let best = 0;
    let hits = 0;
    for (const [value, weight] of fields) {
      if (value.toLowerCase().includes(w)) {
        best = Math.max(best, weight);
        hits++;
      }
    }
    // Small bonus when several attributes agree (breaks ties).
    total += best + (hits > 1 ? 0.25 * (hits - 1) : 0);
  }
  if (hint && c.tagName === hint) total += 1;
  return total;
}

export class HeuristicProvider implements HealingProvider {
  name = "heuristic";

  async suggest(ctx: HealingContext): Promise<HealingResult> {
    const ws = words(ctx.brokenSelector);
    if (ws.length === 0) {
      return {
        success: false,
        confidence: 0,
        provider: this.name,
        error: "Selector has no usable keywords",
      };
    }
    const hint = tagHint(ctx.brokenSelector);
    const ranked = ctx.candidates
      .map((c) => ({ c, s: score(c, ws, hint) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);

    if (ranked.length === 0) {
      return {
        success: false,
        confidence: 0,
        provider: this.name,
        error: "No element resembles the broken selector",
      };
    }

    const [top, second] = ranked;
    // Max reachable score = 3 per keyword (+1 tag hint).
    const ratio = Math.min(1, top.s / (ws.length * 3 + (hint ? 1 : 0)));
    const margin = second ? (top.s - second.s) / top.s : 1;
    // Confidence rewards a strong match AND a clear winner.
    const confidence = Math.round(
      Math.min(95, 40 + ratio * 40 + margin * 20),
    );

    return {
      success: true,
      selector: top.c.selectors[0],
      confidence,
      reasoning: `Matched keywords [${ws.join(", ")}] against <${top.c.tagName}> ` +
        `(score ${top.s}${second ? `, runner-up ${second.s}` : ""}).`,
      alternatives: ranked.slice(1, 3).map((r) => r.c.selectors[0]),
      provider: this.name,
    };
  }
}
