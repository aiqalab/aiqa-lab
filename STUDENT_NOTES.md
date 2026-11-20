# Self-Healing Tests: Introduction for Students

**Hands-on demo code:** https://github.com/aiqalab/aiqa-lab/tree/playwright-self-healing-demo

---

## 1. The problem

UI tests find elements with *locators* (selectors) such as `#username-input` or
`button.save`. When a developer renames an id, changes a class or restructures
the page, the app still works, but the test fails with "element not found".

These failures are **test maintenance noise**, not real bugs. Large suites can
spend more time being repaired than finding defects.

## 2. The idea: self-healing

When a locator stops matching, a self-healing test does not give up right away. It:

1. **Detects** that the locator matched nothing.
2. **Looks** at the live page and collects the elements that could be the target.
3. **Decides** which element the old locator most likely meant.
4. **Checks** the answer (it must match exactly one element and be confident enough).
5. **Retries** the action with the new locator.
6. **Reports** the change, so a human can update the test properly.

Healing keeps the run going; it does not replace fixing the test.

## 3. How does it "decide"?

| Approach | How it works | Pros / cons |
| --- | --- | --- |
| Rule-based (heuristic) | Splits the old selector into keywords (`username`, `submit`) and scores page elements by how well their attributes and text match | Free, offline, explainable; weak on meaningless selectors like `.css-1x2y3z` |
| AI / LLM | Sends the candidate elements to a language model and asks which one fits | Handles vague cases; needs an API key and sends page data to a provider |

The demo ships with the rule-based approach and can optionally use an LLM.

## 4. Safety rules (what makes healing trustworthy)

- **Never heal if the old locator still exists.** That means a timing or state
  problem, and healing would hide a real bug.
- **Confidence threshold.** Low-confidence guesses are rejected.
- **Uniqueness.** The new locator must match exactly one element.
- **Audit trail.** Every heal is logged for human review.

## 5. What you will see in the demo

The sample test fills a web form using four deliberately **outdated** selectors:

| Old (broken) selector | Healed to |
| --- | --- |
| `#username-input` | `input[name="username"]` |
| `[data-testid="password-field"]` | `input[name="password"]` |
| `textarea.comment-box` | `textarea[name="comments"]` |
| `button#submit-btn` | `input[name="submitbutton"][type="submit"]` |

It runs against the public practice site https://testpages.eviltester.com/.
With healing **on** the test passes; with healing **off** the same test fails.

## 6. Try it yourself

You need Node.js 18+ and internet access.

```bash
git clone --branch playwright-self-healing-demo https://github.com/aiqalab/aiqa-lab.git
cd aiqa-lab
npm install
npm run install:browsers
npm test            # run the sample test
npm run report      # see what was healed
```

Experiments:

```bash
SELF_HEALING_VERBOSE=true npm test     # watch the decisions
SELF_HEALING_ENABLED=false npm test    # healing off: the test fails
npm run test:headed                    # watch the browser
```

To use it in your own tests, change one import:

```diff
- import { test, expect } from "@playwright/test";
+ import { test, expect } from "../src/self-healing";
```

## 7. Where to read the code

| File | What it teaches |
| --- | --- |
| `tests/html-form.spec.ts` | The test, and the one-line import change |
| `tests/pages/html-form.page.ts` | A page object with outdated selectors |
| `src/self-healing/fixture.ts` | How `page.locator` is wrapped to catch failures |
| `src/self-healing/healer.ts` | The engine: candidates, providers, validation, logging |
| `src/self-healing/providers/heuristic.ts` | The keyword-scoring "brain" |

## 8. Limitations and discussion questions

- This demo only heals `page.locator("<css>")` actions, not `getByRole` or assertions.
- A wrong heal can make a test pass for the wrong reason. How would you detect that?
- When should a team **fix** the locator instead of relying on healing?
- What is the privacy impact of sending page content to an AI service?
- Could healing mask a genuine regression, such as a removed button? Which safety rule helps?

## 9. Responsible use

Only run automated tests against sites you own or have permission to test. The
practice site above exists for that purpose; keep runs small and polite.
