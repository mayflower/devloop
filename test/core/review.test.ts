import { test, expect } from "vitest";
import { evaluateApproval, type Review, type ApprovalContext } from "../../src/core/review.js";

const ctx = (over: Partial<ApprovalContext> = {}): ApprovalContext => ({
  prAuthor: "agent-bot",
  headSha: "abc123",
  botLogins: ["agent-bot"],
  ...over,
});

const review = (over: Partial<Review> = {}): Review => ({
  user: "alice",
  state: "APPROVED",
  commit_id: "abc123",
  ...over,
});

test("a human CODEOWNER approval on HEAD -> ok", () => {
  expect(evaluateApproval([review({ user: "alice" })], ctx())).toBe("ok");
});

test("no approvals -> missing", () => {
  expect(evaluateApproval([], ctx())).toBe("missing");
  expect(evaluateApproval([review({ state: "COMMENTED" })], ctx())).toBe("missing");
});

test("the agent (bot) CANNOT self-approve -> missing (the core property of anchor b)", () => {
  expect(evaluateApproval([review({ user: "agent-bot" })], ctx())).toBe("missing");
});

test("the PR author cannot self-approve, even if human -> missing", () => {
  expect(evaluateApproval([review({ user: "carol" })], ctx({ prAuthor: "carol" }))).toBe("missing");
});

test("approval only on an older commit -> stale (content-binding)", () => {
  expect(evaluateApproval([review({ user: "alice", commit_id: "old999" })], ctx())).toBe("stale");
});

test("when a CODEOWNER allowlist is given, a non-owner approval does not count", () => {
  const c = ctx({ humanReviewers: ["alice", "bob"] });
  expect(evaluateApproval([review({ user: "mallory" })], c)).toBe("missing");
  expect(evaluateApproval([review({ user: "bob" })], c)).toBe("ok");
});

test("a fresh human approval on HEAD wins even if a stale one also exists", () => {
  const reviews = [
    review({ user: "alice", commit_id: "old999" }),
    review({ user: "bob", commit_id: "abc123" }),
  ];
  expect(evaluateApproval(reviews, ctx())).toBe("ok");
});
