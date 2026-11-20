#!/usr/bin/env bash
# Step runner for the standalone self-healing demo.
# Usage: ./demo.sh <step>      (needs ANTHROPIC_API_KEY for the heal steps; never printed)
set -u
cd "$(dirname "$0")"
run() { echo; echo "\$ $*"; "$@"; }

case "${1:-help}" in
  setup)
    [ -d .git ] || git init -q
    run npm i -D @playwright/test
    run npx playwright install chromium
    git add -A && git commit -qm "demo baseline" && echo "baseline committed"
    ;;
  baseline) run npm test ;;                                   # expect: 1 passed
  break)    run sed -i '' 's/create-project-btn/new-project-action/' index.html
            run git diff index.html ;;
  red)      echo; echo '$ SELF_HEALING_ENABLED=false npm test'
            SELF_HEALING_ENABLED=false npm test ;;            # expect: fails, element not found
  heal)     run npm test ;;                                   # expect: [self-heal] lines, then 1 passed
  report)   run npm run -s heal:report
            run npm run -s heal:apply ;;                      # second command is a dry run
  apply)    run npm run -s heal:apply -- --write
            run git diff tests/ ;;
  verify)   echo; echo '$ SELF_HEALING_ENABLED=false npm test'
            SELF_HEALING_ENABLED=false npm test ;;            # repaired test passes on its own
  defect)   run sed -i '' 's/Project created/Project saved/' index.html
            run npm test ;;                                   # real defect: must stay red
  reset)    git checkout -- . && rm -rf logs test-results && echo "reset done (git status to confirm)" ;;
  *)        echo "steps: setup baseline break red heal report apply verify | optional: defect | reset" ;;
esac
