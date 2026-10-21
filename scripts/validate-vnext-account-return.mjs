import assert from "node:assert/strict";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

const { createAccountAccessController } = load("app/vnext/releaseCandidate/accountAccess.ts");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const fixture = () => {
  let present = true, reply = "active", validations = 0;
  const states = [];
  const controller = createAccountAccessController({
    hasSession: async () => present,
    validateSession: async () => { validations++; return reply; },
    onAccessChange: state => states.push(state),
  });
  return { controller, states, setPresent: value => { present = value; },
    setReply: value => { reply = value; }, validations: () => validations };
};

const f = fixture();
const initial = deferred(); f.setReply(initial.promise);
const opening = f.controller.validate();
assert.deepEqual(f.states, ["checking"], "An account cannot mount before first validation");
initial.resolve("active"); await opening;
assert.equal(f.states.at(-1), "allowed");

const pending = deferred(); f.setReply(pending.promise);
const before = f.states.length;
const foreground = f.controller.validate({ preserveMounted: true });
await Promise.resolve();
assert.equal(f.states.length, before, "A valid foreground return must retain the existing screen and its local form state");
pending.resolve("active"); await foreground;
assert.deepEqual(f.states.slice(before), ["allowed"]);

f.setReply("offline");
await f.controller.validate({ preserveMounted: true });
assert.equal(f.states.at(-1), "allowed", "An accepted unexpired bearer retains offline access");

const revoked = deferred(); f.setReply(revoked.promise);
const revocation = f.controller.validate({ preserveMounted: true });
revoked.resolve("invalid"); await revocation;
assert.equal(f.states.at(-1), "locked", "A rejected or mismatched account must lock on return");

const changed = deferred(); f.setReply(changed.promise);
const newCredential = f.controller.validate();
assert.equal(f.states.at(-1), "checking", "Changed credentials must be checked before remounting");
changed.resolve("active"); await newCredential;
assert.equal(f.states.at(-1), "allowed");

for (const invalidate of ["sign-out", "expiry", "removal"]) {
  const check = deferred(); f.setReply(check.promise);
  const inFlight = f.controller.validate({ preserveMounted: true });
  await Promise.resolve();
  if (invalidate === "sign-out") f.controller.lock();
  else { f.setPresent(false); await f.controller.ensureLocalSession(); }
  assert.equal(f.states.at(-1), "locked", `${invalidate} must lock while a remote check is pending`);
  check.resolve("active"); await inFlight;
  assert.equal(f.states.at(-1), "locked", `${invalidate}: a stale success cannot reopen access`);
  f.setPresent(true); f.setReply("active"); await f.controller.validate();
}

f.setPresent(false);
const calls = f.validations();
const missingStart = f.states.length;
await f.controller.validate({ preserveMounted: true });
assert.equal(f.states.at(-1), "locked");
assert(!f.states.slice(missingStart).includes("checking"), "A locked sign-in form also survives a foreground return");
assert.equal(f.validations(), calls, "A missing/expired local session never relies on a remote success");

f.setPresent(true); f.setReply("active"); await f.controller.validate();
const old = deferred(); f.setReply(old.promise);
const oldCheck = f.controller.validate({ preserveMounted: true });
await Promise.resolve();
f.setReply("invalid"); await f.controller.validate();
old.resolve("active"); await oldCheck;
assert.equal(f.states.at(-1), "locked", "Only the newest validation may decide access");

const disposed = deferred(); f.setReply(disposed.promise);
const last = f.controller.validate();
await Promise.resolve(); f.controller.dispose();
const finalLength = f.states.length;
disposed.resolve("active"); await last;
await f.controller.validate(); await f.controller.ensureLocalSession();
assert.equal(f.states.length, finalLength, "Unmounted/changed identities cannot receive stale access results");

console.log("PASS account return: preserved mounted screens, first-access gating, offline access, revoked/mismatched/expired/removed sessions, sign-out, races and disposal");
