const json = (value, status = 200, origin = "*") => new Response(JSON.stringify(value), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,if-match,x-delete-confirm",
    "cache-control": "no-store",
  },
});

const allowedOrigin = (request, env) => {
  const requested = request.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGIN || "https://kyriakos243.github.io";
  return requested === allowed ? requested : allowed;
};

const profileKey = (id) => `profile:${id}`;

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") return json({}, 204, origin);
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/profiles(?:\/([^/]+))?$/u);
    if (!match) return json({ error: "Not found" }, 404, origin);
    const id = match[1] ? decodeURIComponent(match[1]) : null;

    if (request.method === "GET" && !id) {
      const index = await env.PROFILES.get("profile:index", "json") ?? [];
      return json({ profiles: index }, 200, origin);
    }
    if (request.method === "GET" && id) {
      const profile = await env.PROFILES.get(profileKey(id), "json");
      return profile ? json(profile, 200, origin) : json({ error: "Profile not found" }, 404, origin);
    }
    if (request.method === "PUT" && id) {
      const incoming = await request.json();
      if (!incoming || incoming.profileId !== id || typeof incoming.username !== "string") return json({ error: "Invalid profile" }, 400, origin);
      const current = await env.PROFILES.get(profileKey(id), "json");
      const expected = Number(request.headers.get("if-match") ?? 0);
      if (current && Number(current.revision) !== expected) return json({ error: "Revision conflict", profile: current }, 409, origin);
      const index = await env.PROFILES.get("profile:index", "json") ?? [];
      const duplicate = index.find((item) => item.profileId !== id && item.username.toLocaleLowerCase() === incoming.username.trim().toLocaleLowerCase());
      if (duplicate) return json({ error: "Username already exists" }, 409, origin);
      const stored = {
        ...incoming,
        revision: Number(current?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        pendingSync: false,
        syncError: undefined,
      };
      await env.PROFILES.put(profileKey(id), JSON.stringify(stored));
      const nextIndex = [...index.filter((item) => item.profileId !== id), { profileId: id, username: incoming.username }]
        .sort((a, b) => a.username.localeCompare(b.username));
      await env.PROFILES.put("profile:index", JSON.stringify(nextIndex));
      return json(stored, current ? 200 : 201, origin);
    }
    if (request.method === "DELETE" && id) {
      if (request.headers.get("x-delete-confirm") !== id) return json({ error: "Delete confirmation required" }, 400, origin);
      await env.PROFILES.delete(profileKey(id));
      const index = await env.PROFILES.get("profile:index", "json") ?? [];
      await env.PROFILES.put("profile:index", JSON.stringify(index.filter((item) => item.profileId !== id)));
      return json({ deleted: true }, 200, origin);
    }
    return json({ error: "Method not allowed" }, 405, origin);
  },
};
