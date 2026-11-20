/**
 * Minimal self-healing for Playwright locator actions (standalone demo).
 *
 * Flow when click/fill/etc. fails:
 *   1. Skip non-healable errors (network/auth).
 *   2. If the original locator still exists, it is a timing problem: do not call the AI.
 *   3. Collect up to 30 candidate elements from the live page.
 *   4. Ask the model for a replacement selector (JSON: selector, confidence, reasoning).
 *   5. Gate the proposal against the live page. Only a proposal that passes is used.
 *   6. Retry the same action on the healed locator. Log every attempt to logs/self-heal/.
 *
 * Assertions are never healed: a changed expectation must stay a failure.
 */
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENABLED = process.env.SELF_HEALING_ENABLED !== 'false';
const MIN_CONFIDENCE = Number(process.env.HEAL_MIN_CONFIDENCE ?? 70);
const MODEL = process.env.HEAL_MODEL ?? 'claude-sonnet-5-5';
const API_URL = process.env.HEAL_API_URL ?? 'https://api.anthropic.com/v1/messages';
const LOG_DIR = 'logs/self-heal';
const ACTIONS = new Set(['click', 'fill', 'check', 'uncheck', 'hover', 'press', 'selectOption']);
const STOPWORDS = new Set(['data', 'testid', 'test', 'btn', 'button', 'link', 'input', 'field', 'the', 'and']);

type Proposal = { selector: string; confidence: number; reasoning: string };

const log = (m: string) => console.log(`[self-heal] ${m}`);

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const raw = page.locator.bind(page) as (s: string, o?: object) => Locator;
    (page as any).locator = (selector: string, options?: object) =>
      wrap(raw(selector, options), page, raw, selector, testInfo.file);
    await use(page);
  },
});
export { expect };

function wrap(
  target: Locator,
  page: Page,
  raw: (s: string) => Locator,
  selector: string,
  testFile: string,
): Locator {
  return new Proxy(target, {
    get(t, prop) {
      const value = (t as any)[prop];
      if (typeof value !== 'function') return value;
      if (ACTIONS.has(prop as string)) {
        return (...args: unknown[]) => withHealing(t, page, raw, selector, prop as string, args, testFile);
      }
      return value.bind(t);
    },
  });
}

async function withHealing(
  target: Locator,
  page: Page,
  raw: (s: string) => Locator,
  selector: string,
  action: string,
  args: unknown[],
  testFile: string,
) {
  try {
    await target.waitFor({ state: 'attached', timeout: 3000 });
    return await (target as any)[action](...args);
  } catch (original) {
    if (!ENABLED) throw original;
    const message = (original as Error).message ?? '';
    log(`${action} failed for: ${selector}`);

    if (/net::ERR_|authentication|authorization|forbidden|certificate/i.test(message)) {
      log('not a selector problem (network/auth): not healing');
      throw original;
    }
    if ((await raw(selector).count()) > 0) {
      log('original locator still exists: timing or visibility issue, not healing');
      throw original;
    }

    const candidates = await collectCandidates(page);
    const proposal = await askModel(selector, action, message, page, candidates);
    if (!proposal) {
      record({ testFile, action, originalSelector: selector, success: false, reason: 'no proposal' });
      throw original;
    }
    log(`proposal: ${proposal.selector} (${proposal.confidence}%) - ${proposal.reasoning}`);

    const verdict = await gate(raw, proposal, selector, action);
    if (!verdict.ok) {
      log(`gate REJECTED: ${verdict.reason}`);
      record({ testFile, action, originalSelector: selector, healedSelector: proposal.selector,
        confidence: proposal.confidence, success: false, reason: verdict.reason });
      throw original;
    }
    log(`gate passed: ${verdict.reason}`);
    log(`retrying ${action} with: ${proposal.selector}`);

    try {
      const result = await (raw(proposal.selector) as any)[action](...args);
      record({ testFile, action, originalSelector: selector, healedSelector: proposal.selector,
        confidence: proposal.confidence, reasoning: proposal.reasoning, success: true, reason: verdict.reason });
      return result;
    } catch {
      record({ testFile, action, originalSelector: selector, healedSelector: proposal.selector,
        confidence: proposal.confidence, success: false, reason: 'retry failed' });
      throw original;
    }
  }
}

async function collectCandidates(page: Page) {
  return page.evaluate((limit: number) => {
    const q = 'button, a, input, select, textarea, [role], [data-testid]';
    return Array.from(document.querySelectorAll(q)).slice(0, limit).map((el) => {
      const attrs: Record<string, string> = {};
      for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim().slice(0, 80),
        attrs,
        visible: r.width > 0 && r.height > 0,
      };
    });
  }, 30);
}

async function askModel(
  broken: string, action: string, error: string, page: Page,
  candidates: Awaited<ReturnType<typeof collectCandidates>>,
): Promise<Proposal | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { log('ANTHROPIC_API_KEY not set: cannot ask the model'); return null; }

  const system =
    'You repair broken Playwright selectors. Pick the element the test author meant. ' +
    'Prefer data-testid, then role/aria-label, then id, then visible text. ' +
    'Never use nth-child, indexes or XPath. If no candidate plausibly matches the intent, ' +
    'return confidence below 40. Reply with JSON only: {"selector": string, "confidence": 0-100, "reasoning": string}.';
  const list = candidates
    .map((c, i) => `${i + 1}. <${c.tag}> attrs=${JSON.stringify(c.attrs)} text="${c.text}"${c.visible ? '' : ' [hidden]'}`)
    .join('\n');
  const user =
    `BROKEN SELECTOR: ${broken}\nFAILED ACTION: ${action}\nERROR: ${error.slice(0, 300)}\n` +
    `PAGE: ${page.url()}\n\nCANDIDATES:\n${list}`;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 512, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) { log(`model API returned ${res.status}`); return null; }
    const data: any = await res.json();
    const match = String(data?.content?.[0]?.text ?? '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    const p = JSON.parse(match[0]);
    if (typeof p.selector !== 'string') return null;
    return { selector: p.selector, confidence: Number(p.confidence ?? 0), reasoning: String(p.reasoning ?? '') };
  } catch (e) {
    log(`model call failed: ${String(e).slice(0, 80)}`);
    return null;
  }
}

/** A proposal is accepted only if it clearly targets the same thing on the live page. */
async function gate(raw: (s: string) => Locator, p: Proposal, broken: string, action: string) {
  if (p.confidence < MIN_CONFIDENCE) return { ok: false, reason: `confidence ${p.confidence}% below ${MIN_CONFIDENCE}%` };
  if (/nth-child|nth-of-type|\[\d+\]|\/\//i.test(p.selector) && !/nth-child|nth-of-type|\[\d+\]|\/\//i.test(broken)) {
    return { ok: false, reason: 'positional/XPath selector not in the original' };
  }
  const loc = raw(p.selector);
  let count: number;
  try { count = await loc.count(); } catch { return { ok: false, reason: 'selector is not valid' }; }
  if (count !== 1) return { ok: false, reason: `matches ${count} elements, need exactly 1` };

  const info = await loc.evaluate((el: Element) => ({
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') ?? '',
    haystack: [el.textContent, ...Array.from(el.attributes).map((a) => a.value)].join(' ').toLowerCase(),
  }));
  const visible = await loc.isVisible();
  const enabled = await loc.isEnabled();
  if (!visible) return { ok: false, reason: 'element is not visible' };
  if (!enabled) return { ok: false, reason: 'element is disabled' };
  if (action === 'fill' && !(info.tag === 'input' || info.tag === 'textarea')) {
    return { ok: false, reason: `<${info.tag}> cannot be filled` };
  }
  if (action === 'click' && !(['button', 'a', 'input', 'select', 'summary'].includes(info.tag) || info.role)) {
    return { ok: false, reason: `<${info.tag}> is not a clickable control` };
  }

  // The new element must still be about the same thing: share a keyword with the old selector.
  const keywords = broken.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (keywords.length && !keywords.some((k) => info.haystack.includes(k))) {
    return { ok: false, reason: `name mismatch: shares none of [${keywords.join(', ')}]` };
  }
  return { ok: true, reason: `unique <${info.tag}>, visible, enabled, matches intent [${keywords.join(', ')}]` };
}

function record(e: Record<string, unknown>) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, 'events.json');
    const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    all.push({ timestamp: new Date().toISOString(), model: MODEL, ...e });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
  } catch { /* logging must never fail a test */ }
}
