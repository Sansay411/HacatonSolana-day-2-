import test from "node:test";
import assert from "node:assert/strict";
import { canSubmitRequestForm, sanitizeRequestText } from "./requestForm";

test("request description is sanitized before submit", () => {
  assert.equal(
    sanitizeRequestText("  server   expansion \n\n for   infra  "),
    "server expansion for infra"
  );
});

test("duplicate submit prevention helper blocks pending and empty form states", () => {
  assert.equal(
    canSubmitRequestForm({
      amount: "0.02",
      description: "  infra budget extension  ",
      pending: false,
      isFrozen: false,
      isClosed: false,
    }),
    true
  );

  assert.equal(
    canSubmitRequestForm({
      amount: "0.02",
      description: "infra budget extension",
      pending: true,
      isFrozen: false,
      isClosed: false,
    }),
    false
  );

  assert.equal(
    canSubmitRequestForm({
      amount: "0",
      description: "infra budget extension",
      pending: false,
      isFrozen: false,
      isClosed: false,
    }),
    false
  );

  assert.equal(
    canSubmitRequestForm({
      amount: "0.02",
      description: "   ",
      pending: false,
      isFrozen: false,
      isClosed: false,
    }),
    false
  );
});
