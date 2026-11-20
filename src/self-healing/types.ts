/** Shared types for the self-healing demo. */

export interface CandidateElement {
  tagName: string;
  text?: string;
  attributes: Record<string, string>;
  /** Possible selectors for this element, most stable first. */
  selectors: string[];
  isVisible: boolean;
}

export interface HealingContext {
  brokenSelector: string;
  action: string;
  pageUrl: string;
  pageTitle: string;
  candidates: CandidateElement[];
  errorMessage?: string;
}

export interface HealingResult {
  success: boolean;
  selector?: string;
  confidence: number; // 0-100
  reasoning?: string;
  alternatives?: string[];
  provider?: string;
  error?: string;
}

/** Implement this to plug in any "brain" (rules, LLM, ...). */
export interface HealingProvider {
  name: string;
  suggest(context: HealingContext): Promise<HealingResult>;
}

export interface HealingEvent {
  timestamp: string;
  testName?: string;
  action: string;
  originalSelector: string;
  healedSelector?: string;
  confidence: number;
  provider?: string;
  success: boolean;
  reasoning?: string;
  error?: string;
}

export interface SelfHealingConfig {
  enabled: boolean;
  /** Minimum confidence (0-100) needed to accept a healed selector. */
  minConfidence: number;
  /** How long to wait for the original selector before healing (ms). */
  initialTimeout: number;
  maxCandidates: number;
  /** Only look for replacement elements inside this container (falls back to <body>). */
  candidateScope: string;
  logDir: string;
  verbose: boolean;
  /** Extra providers tried in order. Defaults are built from env vars. */
  providers?: HealingProvider[];
}
