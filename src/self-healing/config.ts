import type { SelfHealingConfig } from "./types";

export function loadConfig(
  overrides: Partial<SelfHealingConfig> = {},
): SelfHealingConfig {
  const env = process.env;
  const minConfidence = parseInt(env.SELF_HEALING_MIN_CONFIDENCE ?? "", 10);

  return {
    enabled: env.SELF_HEALING_ENABLED !== "false",
    minConfidence: Number.isNaN(minConfidence) ? 70 : minConfidence,
    initialTimeout: 2000,
    maxCandidates: 60,
    candidateScope: "main, [role=main]",
    logDir: env.SELF_HEALING_LOG_DIR ?? "logs/self-healing",
    verbose: env.SELF_HEALING_VERBOSE === "true",
    ...overrides,
  };
}
