import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function userMessage(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

/**
 * MCP prompts: canned instructions for the calling LLM on which tools to
 * call and how to read the numbers — the prompt never computes anything
 * itself, per the project's guiding principle (MCP computes, LLM judges).
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "weekly-review",
    { title: "Weekly review", description: "Review the last 7 days of training: volume, consistency, and any exercises with a new e1RM." },
    () =>
      userMessage(
        "Review my last 7 days of training. Call get-workouts (from = 7 days ago) to see what I did, " +
          "get-volume-report to check weekly tonnage/effective sets per muscle group, and get-consistency " +
          "for frequency and streak. For any exercise trained more than once this week, call get-progress " +
          "to see if this week's e1RM improved. Summarize: what went well, what muscle groups got little or " +
          "no volume, and one concrete suggestion for next week.",
      ),
  );

  server.registerPrompt(
    "program-audit",
    { title: "Program audit", description: "Audit routines and recent volume distribution for muscle-group imbalances." },
    () =>
      userMessage(
        "Audit my current training program. Call list-routines and get-routine for each to see planned volume " +
          "per muscle group, then get-volume-report for actual volume over the last 4-6 weeks. Compare planned " +
          "vs actual: flag muscle groups that are consistently under-trained relative to the rest, or routines " +
          "that haven't been used recently (cross-check against get-workouts). Be specific about which routine " +
          "or exercise to adjust, not just 'train legs more'.",
      ),
  );

  server.registerPrompt(
    "deload-check",
    { title: "Deload check", description: "Check whether training trends (volume, consistency, e1RM) suggest a deload week is due." },
    () =>
      userMessage(
        "Assess whether I should take a deload week. Call get-consistency for frequency/streak, get-volume-report " +
          "for the last several weeks of tonnage per muscle group, and get-progress for my main lifts to check for " +
          "stalling or regressing e1RM despite consistent training. Deload signals: rising volume with flat or " +
          "dropping e1RM, or volume in the last 1-2 weeks well above the recent average. State a clear yes/no and why.",
      ),
  );

  server.registerPrompt(
    "prepare-session",
    {
      title: "Prepare session",
      description: "Prepare suggested weights/reps for today's planned routine, based on exercise history.",
      argsSchema: { routine: z.string().describe("Routine name or ID, from list-routines") },
    },
    ({ routine }) =>
      userMessage(
        `I'm about to train "${routine}". Call list-routines to resolve it if you only have a name, then get-routine ` +
          "for its exercises. For each exercise, call get-exercise-history and get-records to see recent working " +
          "weights and current PRs. Suggest a target weight/reps for each exercise for today's session, grounded in " +
          "that history — don't invent numbers I haven't actually lifted.",
      ),
  );
}
