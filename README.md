# Self-healing Playwright demo (standalone)

A small Playwright project plus a ~200-line helper (`src/selfheal.ts`) that calls the Anthropic
Messages API directly. No other tooling.

## Run it

```bash
export ANTHROPIC_API_KEY=...      # throwaway key; never show it on screen
./demo.sh setup                   # once
./demo.sh baseline                # 1 passed
./demo.sh break                   # developer renames the test id
./demo.sh red                     # healing OFF -> fails
./demo.sh heal                    # healing ON  -> repaired in memory, passes
./demo.sh report                  # what healed + dry-run of the source change
./demo.sh apply                   # writes the selector change; review git diff
./demo.sh verify                  # passes with healing off
./demo.sh defect                  # optional: a real defect must stay red
./demo.sh reset
```

Environment: `HEAL_MODEL` (default `claude-sonnet-5-5`), `HEAL_MIN_CONFIDENCE` (default 70),
`SELF_HEALING_ENABLED=false` to turn healing off, `HEAL_API_URL` to point at another endpoint.

## What it does and does not do

- Heals locator actions only (`click`, `fill`, `check`, `uncheck`, `hover`, `press`, `selectOption`) on locators created with `page.locator(...)`.
- `getByRole`/`getByText` and similar locators are not wrapped.
- Assertions are never healed, so a changed expectation stays a failure.
- If the original locator still exists, it does not call the model.
- A proposal must pass a gate: confidence, a single match, visible, enabled, a suitable element, and a name that shares a word with the old selector.
- Sends up to 30 element summaries from the page to the API on each heal.
