import * as fs from "fs";
import * as path from "path";
import type { Page } from "@playwright/test";
import { loadConfig } from "./config";
import { AnthropicProvider } from "./providers/anthropic";
import { HeuristicProvider } from "./providers/heuristic";
import { OpenAIProvider } from "./providers/openai";
import type {
  CandidateElement,
  HealingContext,
  HealingEvent,
  HealingProvider,
  HealingResult,
  SelfHealingConfig,
} from "./types";

const INTERACTIVE =
  "input, button, a, select, textarea, [role=button], [data-testid], [data-test], [data-cy]";

/**
 * The healing engine. Given a page and a broken selector it:
 *   1. collects candidate elements from the live DOM,
 *   2. asks providers (AI first if configured, offline heuristic as fallback),
 *   3. validates the answer against the DOM and a confidence gate,
 *   4. records what happened so a human can review it.
 */
export class SelfHealer {
  readonly config: SelfHealingConfig;
  private providers: HealingProvider[];
  private events: HealingEvent[] = [];

  constructor(overrides: Partial<SelfHealingConfig> = {}) {
    this.config = loadConfig(overrides);
    this.providers = this.config.providers ?? this.buildDefaultProviders();
  }

  private buildDefaultProviders(): HealingProvider[] {
    const list: HealingProvider[] = [];
    if (process.env.ANTHROPIC_API_KEY) list.push(new AnthropicProvider());
    if (process.env.OPENAI_API_KEY) list.push(new OpenAIProvider());
    list.push(new HeuristicProvider()); // always available, works offline
    return list;
  }

  async heal(
    page: Page,
    brokenSelector: string,
    action: string,
    meta: { testName?: string; error?: Error } = {},
  ): Promise<HealingResult> {
    // Safety check: if the selector still matches, this is a timing/state
    // problem - healing the selector would hide a real bug.
    try {
      if ((await page.locator(brokenSelector).count()) > 0) {
        return this.record(brokenSelector, action, meta, {
          success: false,
          confidence: 0,
          error: "Original selector still exists - not a selector problem",
        });
      }
    } catch {
      // Invalid selector syntax: carry on and try to heal.
    }

    const candidates = await this.collectCandidates(page);
    const context: HealingContext = {
      brokenSelector,
      action,
      pageUrl: page.url(),
      pageTitle: await page.title(),
      candidates,
      errorMessage: meta.error?.message.slice(0, 300),
    };

    let lastError = "No provider produced a valid selector";
    for (const provider of this.providers) {
      const result = await provider.suggest(context);
      if (!result.success || !result.selector) {
        lastError = result.error ?? lastError;
        this.log(`${provider.name} could not heal: ${lastError}`);
        continue;
      }

      for (const [i, selector] of [
        result.selector,
        ...(result.alternatives ?? []),
      ].entries()) {
        const confidence = i === 0 ? result.confidence : result.confidence - 10;
        const verdict = await this.validate(page, selector, confidence);
        if (verdict) {
          return this.record(brokenSelector, action, meta, {
            ...result,
            selector,
            confidence,
            success: true,
          });
        }
      }
    }

    return this.record(brokenSelector, action, meta, {
      success: false,
      confidence: 0,
      error: lastError,
    });
  }

  /** A healed selector must meet the confidence gate and match exactly one element. */
  private async validate(
    page: Page,
    selector: string,
    confidence: number,
  ): Promise<boolean> {
    if (confidence < this.config.minConfidence) {
      this.log(`skip ${selector}: ${confidence}% < ${this.config.minConfidence}%`);
      return false;
    }
    try {
      const count = await page.locator(selector).count();
      if (count !== 1) {
        this.log(`skip ${selector}: matched ${count} elements (need 1)`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private async collectCandidates(page: Page): Promise<CandidateElement[]> {
    const raw = await page.evaluate(
      ({ query, scope, max }) => {
        const root = document.querySelector(scope) ?? document.body;
        const out: CandidateElement[] = [];
        for (const el of Array.from(root.querySelectorAll(query))) {
          if (out.length >= max) break;
          const rect = (el as HTMLElement).getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const a: Record<string, string> = {};
          for (const attr of Array.from(el.attributes)) a[attr.name] = attr.value;
          const tag = el.tagName.toLowerCase();
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
          const q = (v: string) => v.replace(/"/g, '\\"');

          // Most stable first.
          const s: string[] = [];
          for (const k of ["data-testid", "data-test", "data-cy"]) {
            if (a[k]) s.push(`[${k}="${q(a[k])}"]`);
          }
          if (a.id) s.push(`[id="${q(a.id)}"]`);
          if (a.name && a.type) s.push(`${tag}[name="${q(a.name)}"][type="${q(a.type)}"]`);
          if (a.name && a.value) s.push(`${tag}[name="${q(a.name)}"][value="${q(a.value)}"]`);
          if (a.name) s.push(`${tag}[name="${q(a.name)}"]`);
          if (a["aria-label"]) s.push(`${tag}[aria-label="${q(a["aria-label"])}"]`);
          if (a.placeholder) s.push(`${tag}[placeholder="${q(a.placeholder)}"]`);
          if (a.type && a.value) s.push(`${tag}[type="${q(a.type)}"][value="${q(a.value)}"]`);
          if ((tag === "button" || tag === "a") && text) {
            s.push(`${tag}:has-text("${q(text)}")`);
          }
          out.push({ tagName: tag, text: text || undefined, attributes: a, isVisible, selectors: s });
        }
        return out;
      },
      { query: INTERACTIVE, scope: this.config.candidateScope, max: this.config.maxCandidates },
    );

    // Keep only selectors that resolve to exactly one element, so every
    // suggestion a provider can make is guaranteed to be unambiguous.
    const result: CandidateElement[] = [];
    for (const c of raw) {
      const unique: string[] = [];
      for (const sel of c.selectors) {
        try {
          if ((await page.locator(sel).count()) === 1) unique.push(sel);
        } catch {
          /* ignore invalid */
        }
      }
      if (unique.length > 0) result.push({ ...c, selectors: unique });
    }
    return result;
  }

  private record(
    originalSelector: string,
    action: string,
    meta: { testName?: string },
    result: HealingResult,
  ): HealingResult {
    this.events.push({
      timestamp: new Date().toISOString(),
      testName: meta.testName,
      action,
      originalSelector,
      healedSelector: result.success ? result.selector : undefined,
      confidence: result.confidence,
      provider: result.provider,
      success: result.success,
      reasoning: result.reasoning,
      error: result.error,
    });
    this.saveSummary();
    return result;
  }

  /** Writes logs/self-healing/summary.json (read it with `npm run report`). */
  saveSummary(): void {
    try {
      fs.mkdirSync(this.config.logDir, { recursive: true });
      const healed = this.events.filter((e) => e.success).length;
      fs.writeFileSync(
        path.join(this.config.logDir, "summary.json"),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            attempts: this.events.length,
            healed,
            failed: this.events.length - healed,
            events: this.events,
          },
          null,
          2,
        ),
      );
    } catch {
      /* logging must never fail a test */
    }
  }

  private log(msg: string): void {
    if (this.config.verbose) console.log(`[self-healing] ${msg}`);
  }
}

// One healer per Playwright worker process.
let instance: SelfHealer | undefined;
export function getSelfHealer(overrides?: Partial<SelfHealingConfig>): SelfHealer {
  if (!instance || overrides) instance = new SelfHealer(overrides);
  return instance;
}
