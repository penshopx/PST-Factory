import assert from "node:assert/strict";
import test from "node:test";
import { validatePublishCandidate } from "./manufacturing";

const current = "sha256:current-candidate";

test("matching QA and approval authorize the exact candidate", () => {
  assert.equal(validatePublishCandidate({
    candidateHash: current,
    qaStatus: "PASS",
    qaCandidateHash: current,
    approvedCandidateHash: current,
  }).accepted, true);
});

test("WARNING QA remains eligible when it matches the approved candidate", () => {
  assert.equal(validatePublishCandidate({
    candidateHash: current,
    qaStatus: "WARNING",
    qaCandidateHash: current,
    approvedCandidateHash: current,
  }).accepted, true);
});

test("a stale QA candidate hash is rejected", () => {
  const decision = validatePublishCandidate({
    candidateHash: current,
    qaStatus: "PASS",
    qaCandidateHash: "sha256:previous-candidate",
    approvedCandidateHash: current,
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.qaMatches, false);
});

test("a stale approval candidate hash is rejected", () => {
  const decision = validatePublishCandidate({
    candidateHash: current,
    qaStatus: "PASS",
    qaCandidateHash: current,
    approvedCandidateHash: "sha256:previous-candidate",
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.approvalMatches, false);
});

test("QA that is not eligible for approval is rejected", () => {
  assert.equal(validatePublishCandidate({
    candidateHash: current,
    qaStatus: "ERROR",
    qaCandidateHash: current,
    approvedCandidateHash: current,
  }).accepted, false);
});

test("rerun QA and approval hashes authorize the changed candidate", () => {
  const changed = "sha256:changed-candidate";
  assert.equal(validatePublishCandidate({
    candidateHash: changed,
    qaStatus: "PASS",
    qaCandidateHash: changed,
    approvedCandidateHash: changed,
  }).accepted, true);
});

test("a concurrent stale approval cannot authorize another candidate", () => {
  const decision = validatePublishCandidate({
    candidateHash: "sha256:candidate-after-concurrent-edit",
    qaStatus: "PASS",
    qaCandidateHash: "sha256:candidate-after-concurrent-edit",
    approvedCandidateHash: current,
  });
  assert.equal(decision.accepted, false);
});

test("rejected validation occurs before publication writes", () => {
  const writes: string[] = [];
  const decision = validatePublishCandidate({
    candidateHash: current,
    qaStatus: "PASS",
    qaCandidateHash: current,
    approvedCandidateHash: "sha256:stale-approval",
  });
  if (decision.accepted) writes.push("insert release", "update blueprint", "update project");
  assert.deepEqual(writes, []);
});