import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../profile-api/worker.js";

class TestStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new TestStatement(this.database, this.sql, values); }
  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values) ?? null;
    return column && row ? row[column] : row;
  }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class TestD1 {
  database = new DatabaseSync(":memory:");
  constructor() { this.database.exec(readFileSync("profile-api/migrations/0001_password_accounts.sql", "utf8")); }
  prepare(sql) { return new TestStatement(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryKv {
  data = new Map();
  async get(key, type) {
    const value = this.data.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.data.set(key, String(value)); }
  async delete(key) { this.data.delete(key); }
  async list({ prefix = "" } = {}) {
    return {
      keys: [...this.data.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
      cursor: "",
    };
  }
}

const origin = "https://kyriakos243.github.io";
const env = { DB: new TestD1(), PROFILES: new MemoryKv(), ALLOWED_ORIGINS: `${origin},http://127.0.0.1:4173` };
const endpoint = "https://profiles.example";
const request = (path, init = {}) => new Request(`${endpoint}${path}`, {
  ...init,
  headers: { origin, ...(init.headers ?? {}) },
});
const post = (path, body, token) => request(path, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

await env.PROFILES.put("profile:stale-device", JSON.stringify({ profileId: "stale-device" }));
await env.PROFILES.put("profile:index", JSON.stringify([{ profileId: "stale-device", username: "Stale" }]));
env.DB.database.prepare(`INSERT INTO accounts (
  profile_id, username, username_key, password_hash, password_salt, password_iterations,
  recovery_hash, revision, profile_json, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  "stale-account", "Stale", "stale", "hash", "salt", 1, "recovery", 1,
  JSON.stringify({ profileId: "stale-account", username: "Stale" }),
  "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z",
);
const resetHealth = await worker.fetch(request("/health"), env);
if (resetHealth.status !== 200 || env.DB.database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count !== 0 ||
  [...env.PROFILES.data.keys()].some((key) => key.startsWith("profile:"))) {
  throw new Error("Profile Worker factory reset did not purge D1 and legacy KV records");
}

const registered = await worker.fetch(post("/auth/register", { username: "QA Athlete", password: "correct horse battery staple" }), env);
const registration = await registered.json();
if (registered.status !== 201 || registration.profile?.revision !== 1 || !registration.token || !registration.recoveryCode) {
  throw new Error("Profile Worker failed secure registration");
}

const duplicate = await worker.fetch(post("/auth/register", { username: "qa athlete", password: "another strong password" }), env);
if (duplicate.status !== 409) throw new Error("Profile Worker did not enforce case-insensitive username uniqueness");

const publicList = await worker.fetch(request("/profiles"), env);
if (publicList.status !== 401) throw new Error("Profile Worker exposed a public profile directory");
const foreignOrigin = await worker.fetch(new Request(`${endpoint}/health`, { headers: { origin: "https://attacker.example" } }), env);
if (foreignOrigin.status !== 403) throw new Error("Profile Worker accepted an untrusted browser origin");

const incorrect = await worker.fetch(post("/auth/login", { username: "QA Athlete", password: "definitely incorrect" }), env);
if (incorrect.status !== 401) throw new Error("Profile Worker accepted an incorrect password");
const loggedIn = await worker.fetch(post("/auth/login", { username: "QA Athlete", password: "correct horse battery staple" }), env);
const login = await loggedIn.json();
if (loggedIn.status !== 200 || !login.token || login.profile.profileId !== registration.profile.profileId) {
  throw new Error("Profile Worker failed password sign-in");
}

const session = await worker.fetch(request("/auth/session", { headers: { authorization: `Bearer ${login.token}` } }), env);
if (session.status !== 200 || (await session.json()).username !== "QA Athlete") throw new Error("Profile Worker failed private session read");

const updatedProfile = { ...login.profile, nextProgramDay: 3 };
const updated = await worker.fetch(request("/profiles/me", {
  method: "PUT",
  headers: { authorization: `Bearer ${login.token}`, "content-type": "application/json", "if-match": "1" },
  body: JSON.stringify(updatedProfile),
}), env);
const updatedBody = await updated.json();
if (updated.status !== 200 || updatedBody.revision !== 2 || updatedBody.nextProgramDay !== 3) throw new Error("Profile Worker failed revision update");

const conflict = await worker.fetch(request("/profiles/me", {
  method: "PUT",
  headers: { authorization: `Bearer ${login.token}`, "content-type": "application/json", "if-match": "1" },
  body: JSON.stringify(updatedProfile),
}), env);
const conflictBody = await conflict.json();
if (conflict.status !== 409 || conflictBody.profile?.revision !== 2) throw new Error("Profile Worker failed optimistic conflict response");

const recovered = await worker.fetch(post("/auth/recover", {
  username: "QA Athlete",
  recoveryCode: registration.recoveryCode,
  newPassword: "a new long recovery password",
}), env);
const recoveredBody = await recovered.json();
if (recovered.status !== 200 || !recoveredBody.token || recoveredBody.recoveryCode === registration.recoveryCode) {
  throw new Error("Profile Worker failed password recovery and recovery-code rotation");
}
const invalidatedSession = await worker.fetch(request("/auth/session", { headers: { authorization: `Bearer ${login.token}` } }), env);
if (invalidatedSession.status !== 401) throw new Error("Password recovery did not invalidate prior sessions");

const legacy = {
  profileId: "legacy-profile-qa", username: "Legacy Athlete", schemaVersion: 1, revision: 4,
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
  nextProgramDay: 4, history: [], readiness: {}, progression: {}, equipment: ["floor"], preferences: {},
};
await env.PROFILES.put(`profile:${legacy.profileId}`, JSON.stringify(legacy));
const claimed = await worker.fetch(post("/auth/claim", {
  username: legacy.username, profileId: legacy.profileId, password: "legacy profile strong password", profile: legacy,
}), env);
const claimedBody = await claimed.json();
if (claimed.status !== 201 || claimedBody.profile?.nextProgramDay !== 4 || !claimedBody.recoveryCode) {
  throw new Error("Profile Worker failed one-time legacy profile claim");
}

const deleted = await worker.fetch(request("/profiles/me", {
  method: "DELETE",
  headers: { authorization: `Bearer ${recoveredBody.token}`, "content-type": "application/json" },
  body: JSON.stringify({ confirmation: "QA Athlete", password: "a new long recovery password" }),
}), env);
if (deleted.status !== 200) throw new Error("Profile Worker failed password-confirmed account deletion");

console.log("Profile Worker: factory reset, private registration/login, unique usernames, recovery, legacy claim, revision safety and protected deletion passed.");
