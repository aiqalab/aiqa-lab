# Playwright Self-Healing Demo

A small, educational project that shows how **self-healing locators** work in
[Playwright](https://playwright.dev) tests.

When a selector stops matching (because a developer renamed an `id`, changed a
class, etc.), a normal test fails. A *self-healing* test notices, looks at the
live page, works out which element you most likely meant, retries with a new
selector, and tells you what to fix permanently.

The demo runs against the public practice site
[testpages.eviltester.com](https://testpages.eviltester.com/) and works
**offline from any AI service** - no API key required.

> This project is for learning. It is a teaching example, not a production
> framework.

---

## How it works

```
test calls  page.locator("#username-input").fill("demo")
        │
        ▼
 element found? ── yes ──► action runs normally
        │ no
        ▼
 1. Collect candidate elements from the live DOM (inputs, buttons, links...)
 2. Ask a provider which one the old selector meant
      • Anthropic / OpenAI  (only if you set an API key)
      • Heuristic           (built in, offline, always available)
 3. Validate the answer
      • confidence >= threshold (default 70%)
      • selector matches exactly ONE element
 4. Retry the action with the healed selector
 5. Write what happened to logs/self-healing/summary.json
```

Safety rule: if the original selector **still exists**, nothing is healed. That
indicates a timing/state problem, and "healing" would hide a real bug.

### Project layout

```
src/self-healing/
  fixture.ts            Drop-in replacement for Playwright's `test` (wraps page.locator)
  healer.ts             Core engine: gather candidates -> ask providers -> validate -> log
  config.ts             Settings (env-var driven)
  types.ts              Shared types
  providers/
    heuristic.ts        Offline keyword-matching "brain" (default)
    anthropic.ts        Optional LLM provider
    openai.ts           Optional LLM provider
tests/
  html-form.spec.ts     The sample test
  pages/html-form.page.ts   Page object with deliberately outdated selectors
scripts/report.mjs      Pretty-prints the healing log
```

---

## Quick start

**Requirements:** Node.js 18+ and internet access (the test visits the public
practice site).

```bash
# 1. Install dependencies
npm install

# 2. Install the Playwright browser (one time)
npm run install:browsers

# 3. Run the sample test
npm test

# 4. See what was healed
npm run report
```

### What you should see

```
[self-healing] fill failed for: #username-input
[self-healing] healed: #username-input  ->  input[name="username"][type="text"] (95%, heuristic)
[self-healing] fill failed for: [data-testid="password-field"]
[self-healing] healed: [data-testid="password-field"]  ->  input[name="password"][type="password"] (95%, heuristic)
...
  ✓ HTML form (self-healing demo) › submits the form even though the selectors are outdated
  1 passed
```

(Exact confidence numbers may vary slightly.) and `npm run report` lists each broken selector, its replacement, and the
suggested permanent fix.

Useful variations:

```bash
npm run test:headed                         # watch the browser
SELF_HEALING_VERBOSE=true npm test          # show the healer's reasoning
SELF_HEALING_ENABLED=false npm test         # turn healing off -> the test FAILS
```

That last command is the best way to see the value: the same test fails with
healing off (after waiting out the timeout, about a minute) and passes with it on.

---

## Using it in your own tests

Change one import:

```diff
- import { test, expect } from "@playwright/test";
+ import { test, expect } from "../src/self-healing";
```

Nothing else changes. Any locator created with `page.locator(...)` is now
self-healing for these actions: `click`, `fill`, `type`, `check`, `uncheck`,
`selectOption`, `press`, `hover`, `focus`, `clear`, `waitFor`, ...

To reuse this in another project, copy the `src/self-healing/` folder and
adjust the import path.

### Known limitations (by design, to keep the code readable)

- Only `page.locator("<css selector>")` is wrapped. `page.getByRole(...)`,
  `page.getByText(...)` etc. are not.
- Assertions (`expect(...)`) are not healed - only actions.
- Candidates are collected from `<main>` (configurable via `candidateScope`).
- The heuristic provider is keyword based. It works best when the old selector
  contains meaningful words (`#username-input`, `button.save`). Selectors like
  `.css-1x2y3z` carry no hints; use an LLM provider for those.

---

## Optional: AI-powered healing

By default the offline heuristic provider is used. To let an LLM make the
decision, set a key (the heuristic remains as a fallback):

```bash
cp .env.example .env     # .env is git-ignored
export ANTHROPIC_API_KEY=your-key     # or OPENAI_API_KEY
npm test
```

Playwright does not load `.env` automatically, so `export` the variables in
your shell (or use a tool such as `dotenv-cli`).

**Privacy note:** with an AI provider enabled, element attributes/text from the
page under test (and the selector) are sent to that provider. Only use it
against pages you are allowed to share. Never commit API keys.

Provider order: Anthropic -> OpenAI -> Heuristic. Add your own by implementing
the `HealingProvider` interface in `src/self-healing/types.ts` and passing it
via `getSelfHealer({ providers: [...] })`.

### Settings

| Environment variable          | Default                | Meaning                                     |
| ----------------------------- | ---------------------- | ------------------------------------------- |
| `SELF_HEALING_ENABLED`        | `true`                 | `false` disables healing                    |
| `SELF_HEALING_MIN_CONFIDENCE` | `70`                   | Reject heals below this confidence (0-100)  |
| `SELF_HEALING_VERBOSE`        | `false`                | Print the healer's decisions                |
| `SELF_HEALING_LOG_DIR`        | `logs/self-healing`    | Where `summary.json` is written             |
| `SELF_HEALING_MODEL`          | provider default       | Override the LLM model name                 |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | unset         | Enables that provider                       |

---

## Good practice: healing is a safety net, not a fix

A healed run still means your test code is out of date. After a run, use
`npm run report` and update the selectors in your page objects. Review healed
selectors - an automated guess can be wrong, which is why there is a
confidence threshold and a "matches exactly one element" check.

## Responsible use

The sample test targets a site that exists for test-automation practice. Only
run automated tests against sites you own or have permission to test. Be kind
to shared practice sites: keep runs small and don't loop them.

## License

MIT - see [LICENSE](LICENSE).
