import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { getSelfHealer } from "./healer";

/**
 * Drop-in replacement for Playwright's `test`.
 *
 *   - import { test, expect } from "@playwright/test";
 *   + import { test, expect } from "../src/self-healing";
 *
 * Every locator created via `page.locator(...)` is wrapped: if an action
 * fails because the selector matches nothing, the healer looks for the
 * intended element, and the action is retried with the healed selector.
 */

const ACTIONS = new Set([
  "click", "dblclick", "fill", "type", "clear", "check", "uncheck",
  "selectOption", "press", "hover", "focus", "waitFor", "setInputFiles",
]);

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use, testInfo) => {
    const healer = getSelfHealer();
    const original = page.locator.bind(page);

    (page as { locator: Page["locator"] }).locator = ((
      selector: string,
      options?: Parameters<Page["locator"]>[1],
    ) => {
      if (!healer.config.enabled) return original(selector, options);
      return wrap(original(selector, options), selector, page, testInfo.title);
    }) as Page["locator"];

    await use(page);
  },
});

function wrap(
  locator: Locator,
  selector: string,
  page: Page,
  testName: string,
): Locator {
  const healer = getSelfHealer();

  return new Proxy(locator, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (!ACTIONS.has(prop as string)) return value.bind(target);

      return async (...args: unknown[]) => {
        try {
          // Fail fast so healing starts quickly instead of after the default 30s.
          await target.waitFor({
            state: "attached",
            timeout: healer.config.initialTimeout,
          });
          return await value.apply(target, args);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.log(`[self-healing] ${String(prop)} failed for: ${selector}`);

          const result = await healer.heal(page, selector, String(prop), {
            testName,
            error: err,
          });
          if (!result.success || !result.selector) throw error;

          console.log(
            `[self-healing] healed: ${selector}  ->  ${result.selector} ` +
              `(${result.confidence}%, ${result.provider})`,
          );
          const healed = page.locator(result.selector) as unknown as Record<
            string,
            (...a: unknown[]) => Promise<unknown>
          >;
          return healed[String(prop)](...args);
        }
      };
    },
  });
}

export { expect };
