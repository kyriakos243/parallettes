import worker from "../profile-api/worker.js";

class MemoryKv {
  data = new Map();
  async get(key, type) {
    const value = this.data.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.data.set(key, String(value)); }
  async delete(key) { this.data.delete(key); }
}

const env = { PROFILES: new MemoryKv(), ALLOWED_ORIGIN: "https://kyriakos243.github.io" };
const url = "https://profiles.example/profiles/profile-qa";
const base = {
  profileId: "profile-qa", username: "QA Athlete", schemaVersion: 1, revision: 0,
  createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
  nextProgramDay: 1, history: [], readiness: {}, progression: {},
  equipment: ["floor"], preferences: {},
};
const request = (target, init = {}) => new Request(target, {
  ...init,
  headers: { origin: env.ALLOWED_ORIGIN, ...(init.headers ?? {}) },
});

const created = await worker.fetch(request(url, {
  method: "PUT", headers: { "content-type": "application/json", "if-match": "0" }, body: JSON.stringify(base),
}), env);
if (created.status !== 201 || (await created.json()).revision !== 1) throw new Error("Profile Worker failed initial revision write");

const conflict = await worker.fetch(request(url, {
  method: "PUT", headers: { "content-type": "application/json", "if-match": "0" }, body: JSON.stringify(base),
}), env);
const conflictBody = await conflict.json();
if (conflict.status !== 409 || conflictBody.profile?.revision !== 1) throw new Error("Profile Worker failed optimistic conflict response");

const detail = await worker.fetch(request(url), env);
if (detail.status !== 200 || (await detail.json()).username !== "QA Athlete") throw new Error("Profile Worker failed profile read");
const list = await worker.fetch(request("https://profiles.example/profiles"), env);
if (list.status !== 200 || (await list.json()).profiles.length !== 1) throw new Error("Profile Worker failed username index read");

const deniedDelete = await worker.fetch(request(url, { method: "DELETE" }), env);
if (deniedDelete.status !== 400) throw new Error("Profile Worker allowed an unconfirmed delete");
const deleted = await worker.fetch(request(url, { method: "DELETE", headers: { "x-delete-confirm": "profile-qa" } }), env);
if (deleted.status !== 200) throw new Error("Profile Worker failed confirmed delete");

console.log("Profile Worker: create, revision conflict, list/read and confirmed delete passed.");
