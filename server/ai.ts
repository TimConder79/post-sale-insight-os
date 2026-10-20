import type {
  AnalysisRequest,
  ApprovedInsight,
  Suggestion,
} from "../src/shared/workspace.ts";
import { WorkspaceError } from "./store.ts";

// Future providers implement this boundary; no real provider or network integration ships in Phase 1.
export interface Assistant {
  mode: "unavailable" | "stub";
  run(
    request: AnalysisRequest,
    approvedKnowledge: ApprovedInsight[],
  ): Promise<Suggestion>;
}
export function createAssistant(mode = "unavailable"): Assistant {
  if (mode === "stub")
    return {
      mode: "stub",
      run: async ({ source, mode }) => {
        const excerpt = source.originalText.slice(0, 200);
        const comments: Record<AnalysisRequest["mode"], string> = {
          regenerate: `You wrote: “${excerpt}”\nWhat evidence would help us understand what changed?`,
          concise: `What changed, and what evidence supports it? Your point: “${excerpt}”`,
          direct: `On “${excerpt}”: I would distinguish the activity from the change it produced. What evidence connects them?`,
          question: `When you say “${excerpt}”, what changed for the customer?`,
          "different angle": `Considering “${excerpt}”, what would we need to learn before deciding on a response?`,
        };
        return {
          seeds: [],
          themes: [],
          distinctions: [
            "Preview only: review the exact source before drawing a conclusion. No seed is assigned by this stub.",
          ],
          questions: [
            "What does this conversation establish, and what remains uncertain?",
          ],
          comment: comments[mode],
          insight: {
            title: "Draft a learning from this conversation",
            summary: `Source excerpt for your review: “${excerpt}”\nReplace this preview with your own conclusion.`,
            takeaways: [],
            seeds: [],
            themes: [],
          },
        };
      },
    };
  if (mode !== "unavailable")
    throw new Error("Unknown AI_MODE. Use unavailable or stub.");
  return {
    mode: "unavailable",
    run: async () => {
      throw new WorkspaceError(
        503,
        "AI is not configured. You can still save source and approve a manual Insight.",
      );
    },
  };
}
