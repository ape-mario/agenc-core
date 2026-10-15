import { expect, it } from "vitest";
import { PendingEffectReviews } from "../../src/session/pending-effect-reviews.js";

it("keeps a refusal visible until an RPC receipt proves every review has cleared", () => {
  const state = new PendingEffectReviews();
  state.apply({ type: "tool_call_started", payload: { callId: "call-1", toolName: "Browser", args: "navigate local preview" } });
  state.recordRefusal("run root requires effect review before model execution. Run /resolve call-1 <disposition>.");
  expect(state.reviews).toMatchObject([{ callId: "call-1", toolName: "Browser", description: "navigate local preview" }]);
  state.apply({ type: "effect_review_acknowledged", payload: { remaining: 1 } });
  expect(state.reviews).toHaveLength(1);
  state.apply({ type: "effect_review_acknowledged", payload: { remaining: 0 } });
  expect(state.reviews).toEqual([]);
});

it("never lets an old RPC receipt clear a newer canonical review", () => {
  const state = new PendingEffectReviews();
  state.recordRefusal("run root requires effect review before model execution. Run /resolve call-1 <disposition>.");
  state.apply({ type: "effect_unknown_outcome", payload: { callId: "call-1", toolName: "Browser", recoveryCategory: "interactive", requiresReview: true, reason: "Chrome crashed" } });
  state.apply({ type: "effect_review_acknowledged", payload: { remaining: 0 } });
  expect(state.reviews).toMatchObject([{ callId: "call-1", toolName: "Browser", error: "Chrome crashed" }]);
  state.apply({ type: "effect_review_resolved", payload: { callId: "call-1", resolution: { workflowStatus: "pending" } } });
  expect(state.reviews).toHaveLength(1);
  state.apply({ type: "effect_review_resolved", payload: { callId: "call-1", resolution: { workflowStatus: "resolved" } } });
  expect(state.reviews).toEqual([]);
});

it("advances through multiple refusal placeholders without clearing a keep-blocked choice", () => {
  const state = new PendingEffectReviews();
  state.recordRefusal("Run /resolve call-1 <disposition>; /resolve call-2 <disposition>.");
  state.apply({ type: "effect_review_acknowledged", payload: { callId: "call-1", disposition: "remains_unknown", remaining: 2 } });
  expect(state.reviews.map(review => review.callId)).toEqual(["call-1", "call-2"]);
  state.apply({ type: "effect_review_acknowledged", payload: { callId: "call-1", disposition: "confirmed_no_effect", remaining: 1 } });
  expect(state.reviews.map(review => review.callId)).toEqual(["call-2"]);
});
