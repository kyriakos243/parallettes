const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PASSWORD_ITERATIONS = 210_000;
const SESSION_DAYS = 30;
const MAX_PROFILE_BYTES = 750_000;
const MAX_FAILED_ATTEMPTS = 8;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const ensureSchema = async (env) => env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS accounts (
    profile_id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_iterations INTEGER NOT NULL,
    recovery_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, FOREIGN KEY (profile_id) REFERENCES accounts(profile_id) ON DELETE CASCADE)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_limits (
    id TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, window_started TEXT NOT NULL)`),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS sessions_profile_id_idx ON sessions(profile_id)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)"),
]);

const base64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const randomToken = (bytes = 32) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
};

const digest = async (value) => base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

const passwordHash = async (password, salt, iterations = PASSWORD_ITERATIONS) => {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: encoder.encode(salt),
    iterations,
  }, material, 256);
  return base64Url(new Uint8Array(bits));
};

const constantTimeEqual = (left, right) => {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
};

const sanitizeUsername = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, 32);
const usernameKey = (value) => sanitizeUsername(value).toLocaleLowerCase("en-US");
const validUsername = (value) => value.length >= 2 && value.length <= 32 && /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(value);
const validPassword = (value) => typeof value === "string" && value.length >= 10 && value.length <= 128;
const now = () => new Date().toISOString();

const allowedOrigins = (env) => String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "https://kyriakos243.github.io")
  .split(",").map((value) => value.trim()).filter(Boolean);

const requestOrigin = (request, env) => {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return allowedOrigins(env).includes(origin) ? origin : false;
};

const responseHeaders = (origin) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    vary: "Origin",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET,POST,PUT,DELETE,OPTIONS";
    headers["access-control-allow-headers"] = "authorization,content-type,if-match";
    headers["access-control-max-age"] = "86400";
  }
  return headers;
};

const json = (value, status = 200, origin = null) => new Response(JSON.stringify(value), {
  status,
  headers: responseHeaders(origin),
});

const readJson = async (request) => {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PROFILE_BYTES) throw new Error("REQUEST_TOO_LARGE");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_PROFILE_BYTES) throw new Error("REQUEST_TOO_LARGE");
  return bytes.byteLength ? JSON.parse(decoder.decode(bytes)) : {};
};

const defaultProfile = (profileId, username) => {
  const timestamp = now();
  return {
    profileId,
    username,
    schemaVersion: 1,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    nextProgramDay: 1,
    history: [],
    readiness: {},
    progression: {},
    equipment: ["parallettes", "floor", "wall"],
    preferences: { soundOn: true },
  };
};

const normalizeIncomingProfile = (incoming, profileId, username, revision, createdAt, touch = true) => {
  const timestamp = now();
  const base = defaultProfile(profileId, username);
  const profile = incoming && typeof incoming === "object" ? incoming : {};
  return {
    ...base,
    ...profile,
    profileId,
    username,
    schemaVersion: 1,
    revision,
    createdAt: typeof profile.createdAt === "string" ? profile.createdAt : createdAt || timestamp,
    updatedAt: touch ? timestamp : typeof profile.updatedAt === "string" ? profile.updatedAt : timestamp,
    history: Array.isArray(profile.history) ? profile.history.slice(-500) : [],
    readiness: profile.readiness && typeof profile.readiness === "object" ? profile.readiness : {},
    progression: profile.progression && typeof profile.progression === "object" ? profile.progression : {},
    equipment: Array.isArray(profile.equipment) && profile.equipment.length ? profile.equipment : base.equipment,
    preferences: profile.preferences && typeof profile.preferences === "object" ? profile.preferences : {},
    pendingSync: false,
    syncError: undefined,
  };
};

const accountSelect = `SELECT accounts.profile_id, accounts.username, accounts.username_key, accounts.password_hash, accounts.password_salt,
  accounts.password_iterations, accounts.recovery_hash, accounts.revision, accounts.profile_json, accounts.created_at, accounts.updated_at
  FROM accounts`;

const parseProfile = (account) => {
  const parsed = JSON.parse(account.profile_json);
  return normalizeIncomingProfile(parsed, account.profile_id, account.username, Number(account.revision), account.created_at, false);
};

const createSession = async (env, profileId) => {
  const token = randomToken(32);
  const tokenHash = await digest(token);
  const createdAt = now();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(createdAt),
    env.DB.prepare("INSERT INTO sessions (token_hash, profile_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, profileId, createdAt, expiresAt),
  ]);
  return { token, expiresAt };
};

const authorize = async (request, env) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token || token.length > 128) return null;
  const tokenHash = await digest(token);
  return env.DB.prepare(`${accountSelect}
    JOIN sessions ON sessions.profile_id = accounts.profile_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, now()).first();
};

const passwordMatches = async (account, password) => {
  if (!validPassword(password)) return false;
  const calculated = await passwordHash(password, account.password_salt, Number(account.password_iterations));
  return constantTimeEqual(calculated, account.password_hash);
};

const rateKey = async (request, normalizedUsername) => {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return digest(`${ip}\n${normalizedUsername}`);
};

const rateLimited = async (env, id) => {
  const record = await env.DB.prepare("SELECT attempts, window_started FROM auth_limits WHERE id = ?").bind(id).first();
  if (!record) return false;
  if (Date.now() - Date.parse(record.window_started) >= RATE_WINDOW_MS) return false;
  return Number(record.attempts) >= MAX_FAILED_ATTEMPTS;
};

const recordFailure = async (env, id) => {
  const timestamp = now();
  const cutoff = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  await env.DB.prepare(`INSERT INTO auth_limits (id, attempts, window_started) VALUES (?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      attempts = CASE WHEN auth_limits.window_started < ? THEN 1 ELSE auth_limits.attempts + 1 END,
      window_started = CASE WHEN auth_limits.window_started < ? THEN excluded.window_started ELSE auth_limits.window_started END`)
    .bind(id, timestamp, cutoff, cutoff).run();
};

const clearFailures = async (env, id) => env.DB.prepare("DELETE FROM auth_limits WHERE id = ?").bind(id).run();

const accountPayload = async (env, account) => {
  const session = await createSession(env, account.profile_id);
  return { profile: parseProfile(account), ...session };
};

const newCredentials = async (password) => {
  const salt = randomToken(16);
  const recoveryCode = `${randomToken(4)}-${randomToken(4)}-${randomToken(4)}-${randomToken(4)}`;
  return {
    salt,
    hash: await passwordHash(password, salt),
    recoveryCode,
    recoveryHash: await digest(recoveryCode.toLocaleUpperCase("en-US")),
  };
};

const register = async (request, env, origin) => {
  const body = await readJson(request);
  const username = sanitizeUsername(body.username);
  if (!validUsername(username)) return json({ error: "Use 2–32 letters or numbers; spaces, dots, apostrophes, underscores and hyphens are allowed." }, 400, origin);
  if (!validPassword(body.password)) return json({ error: "Password must contain 10–128 characters." }, 400, origin);
  const key = usernameKey(username);
  if (await env.DB.prepare("SELECT profile_id FROM accounts WHERE username_key = ?").bind(key).first()) {
    return json({ error: "That username is already registered. Sign in instead." }, 409, origin);
  }
  const profileId = `p25_${crypto.randomUUID()}`;
  const credentials = await newCredentials(body.password);
  const timestamp = now();
  const profile = normalizeIncomingProfile(body.profile, profileId, username, 1, timestamp);
  try {
    await env.DB.prepare(`INSERT INTO accounts
      (profile_id, username, username_key, password_hash, password_salt, password_iterations, recovery_hash, revision, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(profileId, username, key, credentials.hash, credentials.salt, PASSWORD_ITERATIONS, credentials.recoveryHash,
        1, JSON.stringify(profile), timestamp, timestamp).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ error: "That username is already registered. Sign in instead." }, 409, origin);
    throw error;
  }
  const account = await env.DB.prepare(`${accountSelect} WHERE profile_id = ?`).bind(profileId).first();
  const payload = await accountPayload(env, account);
  return json({ ...payload, recoveryCode: credentials.recoveryCode }, 201, origin);
};

const login = async (request, env, origin) => {
  const body = await readJson(request);
  const key = usernameKey(body.username);
  const limiter = await rateKey(request, key);
  if (await rateLimited(env, limiter)) return json({ error: "Too many attempts. Wait 15 minutes, then try again." }, 429, origin);
  const account = key ? await env.DB.prepare(`${accountSelect} WHERE username_key = ?`).bind(key).first() : null;
  if (!account || !await passwordMatches(account, body.password)) {
    await recordFailure(env, limiter);
    return json({ error: "Username or password is incorrect." }, 401, origin);
  }
  await clearFailures(env, limiter);
  return json(await accountPayload(env, account), 200, origin);
};

const claimLegacy = async (request, env, origin) => {
  const body = await readJson(request);
  const username = sanitizeUsername(body.username);
  const profileId = String(body.profileId ?? "");
  if (!validUsername(username) || !/^[-\w]{8,80}$/u.test(profileId) || !validPassword(body.password)) {
    return json({ error: "Enter the current profile and a password of at least 10 characters." }, 400, origin);
  }
  const key = usernameKey(username);
  if (await env.DB.prepare("SELECT profile_id FROM accounts WHERE username_key = ? OR profile_id = ?").bind(key, profileId).first()) {
    return json({ error: "This profile is already secured. Sign in instead." }, 409, origin);
  }
  const legacy = env.PROFILES ? await env.PROFILES.get(`profile:${profileId}`, "json") : null;
  const supplied = body.profile && body.profile.profileId === profileId && usernameKey(body.profile.username) === key ? body.profile : null;
  if (!legacy && !supplied) return json({ error: "This legacy profile could not be verified on this device." }, 404, origin);
  if (legacy && (legacy.profileId !== profileId || usernameKey(legacy.username) !== key)) {
    return json({ error: "The local profile does not match the saved account." }, 403, origin);
  }
  const source = !legacy ? supplied : !supplied ? legacy :
    Date.parse(supplied.updatedAt ?? "") >= Date.parse(legacy.updatedAt ?? "") ? supplied : legacy;
  const credentials = await newCredentials(body.password);
  const timestamp = now();
  const revision = Math.max(1, Number(source.revision) || 0);
  const profile = normalizeIncomingProfile(source, profileId, username, revision, source.createdAt || timestamp);
  try {
    await env.DB.prepare(`INSERT INTO accounts
      (profile_id, username, username_key, password_hash, password_salt, password_iterations, recovery_hash, revision, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(profileId, username, key, credentials.hash, credentials.salt, PASSWORD_ITERATIONS, credentials.recoveryHash,
        revision, JSON.stringify(profile), profile.createdAt, timestamp).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ error: "This profile is already secured. Sign in instead." }, 409, origin);
    throw error;
  }
  const account = await env.DB.prepare(`${accountSelect} WHERE profile_id = ?`).bind(profileId).first();
  const payload = await accountPayload(env, account);
  return json({ ...payload, recoveryCode: credentials.recoveryCode }, 201, origin);
};

const recover = async (request, env, origin) => {
  const body = await readJson(request);
  const key = usernameKey(body.username);
  if (!key || !validPassword(body.newPassword) || typeof body.recoveryCode !== "string") {
    return json({ error: "Enter the username, recovery code and a new password of at least 10 characters." }, 400, origin);
  }
  const limiter = await rateKey(request, `recover:${key}`);
  if (await rateLimited(env, limiter)) return json({ error: "Too many attempts. Wait 15 minutes, then try again." }, 429, origin);
  const account = await env.DB.prepare(`${accountSelect} WHERE username_key = ?`).bind(key).first();
  const suppliedHash = await digest(body.recoveryCode.trim().toLocaleUpperCase("en-US"));
  if (!account || !constantTimeEqual(suppliedHash, account.recovery_hash)) {
    await recordFailure(env, limiter);
    return json({ error: "Username or recovery code is incorrect." }, 401, origin);
  }
  const credentials = await newCredentials(body.newPassword);
  await env.DB.batch([
    env.DB.prepare(`UPDATE accounts SET password_hash = ?, password_salt = ?, password_iterations = ?,
      recovery_hash = ?, updated_at = ? WHERE profile_id = ?`)
      .bind(credentials.hash, credentials.salt, PASSWORD_ITERATIONS, credentials.recoveryHash, now(), account.profile_id),
    env.DB.prepare("DELETE FROM sessions WHERE profile_id = ?").bind(account.profile_id),
    env.DB.prepare("DELETE FROM auth_limits WHERE id = ?").bind(limiter),
  ]);
  const refreshed = await env.DB.prepare(`${accountSelect} WHERE profile_id = ?`).bind(account.profile_id).first();
  const payload = await accountPayload(env, refreshed);
  return json({ ...payload, recoveryCode: credentials.recoveryCode }, 200, origin);
};

const profileMe = async (request, env, origin, account) => {
  if (request.method === "GET") return json(parseProfile(account), 200, origin);
  if (request.method === "PUT") {
    const incoming = await readJson(request);
    const expected = Number(request.headers.get("if-match"));
    if (!Number.isInteger(expected) || expected !== Number(account.revision)) {
      return json({ error: "Revision conflict", profile: parseProfile(account) }, 409, origin);
    }
    const username = sanitizeUsername(incoming.username);
    if (incoming.profileId !== account.profile_id || !validUsername(username)) return json({ error: "Invalid profile." }, 400, origin);
    const revision = Number(account.revision) + 1;
    const stored = normalizeIncomingProfile(incoming, account.profile_id, username, revision, account.created_at);
    try {
      const result = await env.DB.prepare(`UPDATE accounts SET username = ?, username_key = ?, revision = ?, profile_json = ?, updated_at = ?
        WHERE profile_id = ? AND revision = ?`)
        .bind(username, usernameKey(username), revision, JSON.stringify(stored), stored.updatedAt, account.profile_id, expected).run();
      if (Number(result.meta?.changes ?? 0) !== 1) {
        const current = await env.DB.prepare(`${accountSelect} WHERE profile_id = ?`).bind(account.profile_id).first();
        return json({ error: "Revision conflict", profile: parseProfile(current) }, 409, origin);
      }
    } catch (error) {
      if (String(error).includes("UNIQUE")) return json({ error: "That username is already registered." }, 409, origin);
      throw error;
    }
    return json(stored, 200, origin);
  }
  if (request.method === "DELETE") {
    const body = await readJson(request);
    if (body.confirmation !== account.username || !await passwordMatches(account, body.password)) {
      return json({ error: "Username confirmation or password is incorrect." }, 403, origin);
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE profile_id = ?").bind(account.profile_id),
      env.DB.prepare("DELETE FROM accounts WHERE profile_id = ?").bind(account.profile_id),
    ]);
    return json({ deleted: true }, 200, origin);
  }
  return json({ error: "Method not allowed." }, 405, origin);
};

export default {
  async fetch(request, env) {
    const origin = requestOrigin(request, env);
    if (origin === false) return json({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, auth: "password", storage: "d1" }, 200, origin);
      await ensureSchema(env);
      if (url.pathname === "/auth/register" && request.method === "POST") return register(request, env, origin);
      if (url.pathname === "/auth/login" && request.method === "POST") return login(request, env, origin);
      if (url.pathname === "/auth/claim" && request.method === "POST") return claimLegacy(request, env, origin);
      if (url.pathname === "/auth/recover" && request.method === "POST") return recover(request, env, origin);

      const account = await authorize(request, env);
      if (!account) return json({ error: "Sign in required." }, 401, origin);
      if (url.pathname === "/auth/session" && request.method === "GET") return json(parseProfile(account), 200, origin);
      if (url.pathname === "/auth/logout" && request.method === "POST") {
        const token = request.headers.get("authorization").slice(7).trim();
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digest(token)).run();
        return json({ signedOut: true }, 200, origin);
      }
      if (url.pathname === "/profiles/me") return profileMe(request, env, origin, account);
      return json({ error: "Not found." }, 404, origin);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON." }, 400, origin);
      if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") return json({ error: "Profile data is too large." }, 413, origin);
      console.error(JSON.stringify({ event: "request_error", message: error instanceof Error ? error.message : String(error) }));
      return json({ error: "Service temporarily unavailable." }, 500, origin);
    }
  },
};
