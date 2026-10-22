/**
 * S N K · 蛇宿  ——  Cloudflare Worker 后端
 *
 * 一个 Worker 同时扮演两个角色：
 *   1) /api/*   → 这里处理（注册、登录、会话、商品、日志、指标）
 *   2) 其余路径 → 由绑定的静态资源（[assets]）直接返回
 *
 * 依赖绑定：
 *   env.DB  D1 数据库（wrangler.toml 的 [[d1_databases]]）
 *
 * 密码：PBKDF2-HMAC-SHA256 / 120000 次 / 16 字节盐 / 32 字节输出
 *       存储格式 pbkdf2$<iter>$<salt_b64>$<hash_b64>
 */

const PBKDF2_ITER = 120000;
const SESSION_TTL = 60 * 60 * 12;        // 12 小时
const MAX_FAILED = 3;                     // 连续失败 3 次锁号
const FAIL_WINDOW = 60 * 15;              // 失败统计窗口 15 分钟
const COOKIE_NAME = "snk_session";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

const ok = (data = {}, status = 200, extra = {}) =>
  new Response(JSON.stringify({ ok: true, ...data }), { status, headers: { ...JSON_HEADERS, ...extra } });

const fail = (status, error, message) =>
  new Response(JSON.stringify({ ok: false, error, message }), { status, headers: JSON_HEADERS });

// ---------------------------------------------------------------- 工具

const enc = new TextEncoder();

function b64(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randHex(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2B64(password, saltBytes, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: iter },
    key,
    256
  );
  return b64(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2B64(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${hash}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = Number(parts[1]);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  const salt = unb64(parts[2]);
  const expect = parts[3];
  const actual = await pbkdf2B64(password, salt, iter);
  // 定长比较，避免时序差异
  if (actual.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}

/** 生成 8 位、去掉易混字符的初始密钥，形如 K7QM-3XPA */
function makeAccessKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => alphabet[crypto.getRandomValues(new Uint8Array(1))[0] % alphabet.length];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function clientIp(req) {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || null;
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const str = (v, max = 64) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------- 会话

async function createSession(env, agentId, req) {
  const id = randHex(32);
  const tokenHash = await sha256Hex(id + (env.SESSION_PEPPER || "snk-local-pepper"));
  const t = now();
  await env.DB.prepare(
    `INSERT INTO sessions (id, agent_id, token_hash, created_at, expires_at, last_seen_at, ip, ua)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, agentId, tokenHash, t, t + SESSION_TTL, t, clientIp(req), (req.headers.get("user-agent") || "").slice(0, 200))
    .run();
  return id;
}

async function currentAgent(env, req) {
  const id = readCookie(req, COOKIE_NAME);
  if (!id) return null;
  const t = now();
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, s.revoked, v.*
       FROM sessions s
       JOIN v_agents v ON v.id = s.agent_id
      WHERE s.id = ?`
  )
    .bind(id)
    .first();
  if (!row || row.revoked || row.expires_at < t) return null;
  return row;
}

function sessionCookie(id, maxAge = SESSION_TTL) {
  return `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function logEvent(env, { agentId = null, event, level = "info", meta = null, req = null }) {
  try {
    await env.DB.prepare(
      `INSERT INTO logs (agent_id, event, level, meta, ip) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(agentId, event, level, meta ? JSON.stringify(meta) : null, req ? clientIp(req) : null)
      .run();
  } catch {
    /* 日志失败不影响主流程 */
  }
}

// ---------------------------------------------------------------- 业务

async function register(env, req) {
  const body = await readJson(req);
  if (!body) return fail(400, "BAD_BODY", "请求体不是合法 JSON");

  const name = str(body.name, 24);
  if (name.length < 1) return fail(400, "NAME_REQUIRED", "请填写姓名");

  const sex = ["男", "女", "未公开"].includes(body.sex) ? body.sex : "未公开";
  const age = int(body.age);
  const height = int(body.height);
  const weight = int(body.weight);

  if (age !== null && (age < 1 || age > 120)) return fail(400, "AGE_RANGE", "年龄需在 1–120 之间");
  if (height !== null && (height < 50 || height > 260)) return fail(400, "HEIGHT_RANGE", "身高需在 50–260 cm 之间");
  if (weight !== null && (weight < 10 || weight > 400)) return fail(400, "WEIGHT_RANGE", "体重需在 10–400 kg 之间");

  // 部门：前端可能不传，默认特工部
  let dept = "agent";
  const wantDept = str(body.dept_code, 32);
  if (wantDept) {
    const d = await env.DB.prepare(`SELECT code FROM departments WHERE code = ? AND active = 1`).bind(wantDept).first();
    if (!d) return fail(400, "BAD_DEPT", "部门不存在");
    dept = d.code;
  }

  // 代号：SNK-#### 唯一
  let codename = "";
  for (let i = 0; i < 12; i++) {
    const candidate = `SNK-${1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)}`;
    const exists = await env.DB.prepare(`SELECT 1 FROM agents WHERE codename = ?`).bind(candidate).first();
    if (!exists) {
      codename = candidate;
      break;
    }
  }
  if (!codename) return fail(503, "CODENAME_BUSY", "代号分配失败，请重试");

  const account = `snk_${randHex(3)}`;
  const accessKey = body.password ? "" : makeAccessKey();
  const password = str(body.password, 64) || accessKey;
  if (password.length < 4) return fail(400, "PASSWORD_SHORT", "密钥至少 4 位");

  const passwordHash = await hashPassword(password);
  const t = now();

  try {
    const res = await env.DB.prepare(
      `INSERT INTO agents
         (account, codename, name, dept_code, role, clearance, status, sex, age, height_cm, weight_kg,
          password_hash, registered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'agent', 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(account, codename, name, dept, sex, age, height, weight, passwordHash, t, t, t)
      .run();

    const agentId = res.meta.last_row_id;
    await logEvent(env, {
      agentId,
      event: "register",
      meta: { codename, dept_code: dept },
      req,
    });

    return ok({
      agentId,
      account,
      codename,
      dept_code: dept,
      // 没传密码时，把这个初始密钥交给前端显示一次（之后再也拿不到）
      accessKey: accessKey || undefined,
      message: accessKey ? "身份已登记，请记下你的初始密钥" : "身份已登记",
    });
  } catch (e) {
    return fail(500, "REGISTER_FAILED", "登记失败：" + (e?.message || "未知错误"));
  }
}

async function login(env, req) {
  const body = await readJson(req);
  if (!body) return fail(400, "BAD_BODY", "请求体不是合法 JSON");

  const identifier = str(body.account || body.codename, 32);
  const password = str(body.password, 64);
  if (!identifier) return fail(400, "ACCOUNT_REQUIRED", "请填写账号或代号");
  if (!password) return fail(400, "PASSWORD_REQUIRED", "请填写密钥");

  const agent = await env.DB.prepare(`SELECT * FROM agents WHERE account = ? OR codename = ?`)
    .bind(identifier, identifier)
    .first();

  const t = now();
  const ip = clientIp(req);

  if (!agent) {
    await env.DB.prepare(`INSERT INTO login_attempts (account, ok, reason, ip) VALUES (?, 0, 'no_such_agent', ?)`)
      .bind(identifier, ip)
      .run();
    return fail(401, "NO_SUCH_AGENT", "未查询到该特工档案");
  }

  if (agent.status === "locked") {
    await logEvent(env, { agentId: agent.id, event: "login", level: "warn", meta: { reason: "locked" }, req });
    return fail(423, "ACCOUNT_LOCKED", "身份已锁定，请联系总部");
  }
  if (agent.status === "expired" || agent.status === "deleted") {
    return fail(403, "ACCOUNT_EXPIRED", "身份已过期，请重新验证");
  }

  const good = await verifyPassword(password, agent.password_hash);
  if (!good) {
    await env.DB.prepare(`INSERT INTO login_attempts (account, ok, reason, ip) VALUES (?, 0, 'bad_password', ?)`)
      .bind(agent.account, ip)
      .run();

    const { n } = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
        WHERE account = ? AND ok = 0 AND reason = 'bad_password' AND created_at > ?`
    )
      .bind(agent.account, t - FAIL_WINDOW)
      .first();

    if (n >= MAX_FAILED) {
      await env.DB.prepare(`UPDATE agents SET status = 'locked', updated_at = ? WHERE id = ?`).bind(t, agent.id).run();
      await logEvent(env, { agentId: agent.id, event: "login", level: "alert", meta: { reason: "locked_by_failures", n }, req });
      return fail(423, "ACCOUNT_LOCKED", `密钥连续错误 ${n} 次，身份已锁定`);
    }
    return fail(401, "BAD_PASSWORD", `密钥错误，还可尝试 ${MAX_FAILED - n} 次`);
  }

  await env.DB.prepare(`INSERT INTO login_attempts (account, ok, reason, ip) VALUES (?, 1, 'password', ?)`)
    .bind(agent.account, ip)
    .run();

  const sessionId = await createSession(env, agent.id, req);
  const loginCount = (agent.login_count || 0) + 1;
  await env.DB.prepare(`UPDATE agents SET login_count = ?, last_login_at = ?, updated_at = ? WHERE id = ?`)
    .bind(loginCount, t, t, agent.id)
    .run();
  await logEvent(env, { agentId: agent.id, event: "login", meta: { codename: agent.codename }, req });

  return ok(
    { agent: await publicAgent(env, agent.id), greeting: await pickGreeting(env, loginCount) },
    200,
    { "set-cookie": sessionCookie(sessionId) }
  );
}

async function publicAgent(env, id) {
  return env.DB.prepare(`SELECT * FROM v_agents WHERE id = ?`).bind(id).first();
}

async function pickGreeting(env, loginCount) {
  const rows = await env.DB.prepare(`SELECT text FROM greetings WHERE active = 1 ORDER BY sort, id`).all();
  const list = rows.results || [];
  if (!list.length) return "今天过得如何？";
  return list[Math.max(0, loginCount - 1) % list.length].text;
}

async function logout(env, req) {
  const me = await currentAgent(env, req);
  const id = readCookie(req, COOKIE_NAME);
  if (id) {
    await env.DB.prepare(`UPDATE sessions SET revoked = 1 WHERE id = ?`).bind(id).run();
  }
  if (me) await logEvent(env, { agentId: me.id, event: "logout", req });
  return ok({ message: "已安全退出" }, 200, { "set-cookie": sessionCookie("", 0) });
}

async function me(env, req) {
  const row = await currentAgent(env, req);
  if (!row) return fail(401, "NO_SESSION", "未登录或会话已过期");
  const loginCount = row.login_count || 0;
  return ok({ agent: row, greeting: await pickGreeting(env, Math.max(1, loginCount)) });
}

async function departments(env) {
  const rows = await env.DB.prepare(
    `SELECT code, name FROM departments WHERE active = 1 ORDER BY sort, id`
  ).all();
  return ok({ items: rows.results || [] });
}

async function products(env) {
  const rows = await env.DB.prepare(
    `SELECT code, name, category, rarity, status, quota, price FROM products ORDER BY sort, id`
  ).all();
  return ok({ items: rows.results || [] });
}

async function stats(env) {
  const rows = await env.DB.prepare(`SELECT key, value, label FROM metrics`).all();
  const map = {};
  for (const r of rows.results || []) map[r.key] = { value: r.value, label: r.label };
  return ok({ stats: map });
}

async function logs(env, req) {
  const me = await currentAgent(env, req);
  const rows = await env.DB.prepare(
    `SELECT l.id, l.event, l.level, l.meta, l.created_at, v.codename
       FROM logs l LEFT JOIN v_agents v ON v.id = l.agent_id
      ${me && me.role === "admin" ? "" : "WHERE l.agent_id IS NULL OR l.agent_id = ?"}
      ORDER BY l.created_at DESC LIMIT 20`
  )
    .bind(...(me && me.role === "admin" ? [] : [me ? me.id : -1]))
    .all();
  return ok({ items: rows.results || [] });
}

async function visit(env, req) {
  const body = await readJson(req);
  const deviceId = str(body?.device_id, 64);
  if (!deviceId) return fail(400, "DEVICE_REQUIRED", "缺少设备标识");

  const t = now();
  const existing = await env.DB.prepare(`SELECT * FROM visits WHERE device_id = ?`).bind(deviceId).first();
  if (!existing) {
    await env.DB.prepare(`INSERT INTO visits (device_id, first_seen, last_seen, visits, first_flow) VALUES (?, ?, ?, 1, ?)`)
      .bind(deviceId, t, t, str(body?.flow, 24) || null)
      .run();
    return ok({ first_time: true, visits: 1 });
  }
  await env.DB.prepare(`UPDATE visits SET last_seen = ?, visits = visits + 1 WHERE device_id = ?`)
    .bind(t, deviceId)
    .run();
  return ok({ first_time: false, visits: (existing.visits || 1) + 1 });
}

/** 前端埋点：退出三击、蓝屏这类事件 */
async function event(env, req) {
  const body = await readJson(req);
  const name = str(body?.event, 32);
  if (!name) return fail(400, "EVENT_REQUIRED", "缺少事件名");
  const allowed = new Set(["exit_triple", "bsod", "blood", "dna", "chat_open", "join", "buyer"]);
  if (!allowed.has(name)) return fail(400, "EVENT_UNKNOWN", "未知事件");
  const me = await currentAgent(env, req);
  await logEvent(env, {
    agentId: me ? me.id : null,
    event: name,
    level: name === "bsod" || name === "exit_triple" ? "alert" : "info",
    meta: body.meta ?? null,
    req,
  });
  return ok({});
}

/** 健康检查：确认 D1 绑定是否真的接上了 */
async function health(env) {
  if (!env?.DB) return fail(500, "NO_DB", "没有绑定 D1 数据库（绑定变量名应为 DB）");
  try {
    const [a, p, l] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM agents").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM products").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM logs").first(),
    ]);
    return ok({
      runtime: "pages-functions",
      db: "ok",
      agents: a?.n ?? 0,
      products: p?.n ?? 0,
      logs: l?.n ?? 0,
    });
  } catch (e) {
    return fail(500, "DB_ERROR", "数据库能连上但查询失败：" + (e?.message || "unknown"));
  }
}

// ---------------------------------------------------------------- 路由

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (!path.startsWith("/api/")) {
      // 不该走到这（静态资源优先），留个兜底
      return fail(404, "NOT_FOUND", "接口不存在");
    }

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": url.origin,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-allow-credentials": "true",
        },
      });
    }

    try {
      switch (`${method} ${path}`) {
        case "POST /api/register":
          return await register(env, request);
        case "POST /api/login":
          return await login(env, request);
        case "POST /api/logout":
          return await logout(env, request);
        case "GET /api/me":
          return await me(env, request);
        case "GET /api/departments":
          return await departments(env);
        case "GET /api/products":
          return await products(env);
        case "GET /api/stats":
          return await stats(env);
        case "GET /api/logs":
          return await logs(env, request);
        case "POST /api/visit":
          return await visit(env, request);
        case "POST /api/event":
          return await event(env, request);
        case "GET /api/health":
          return await health(env);
        default:
          return fail(404, "NOT_FOUND", `没有这个接口：${method} ${path}`);
      }
    } catch (e) {
      return fail(500, "INTERNAL", "服务端异常：" + (e?.message || "unknown"));
    }
  },
};
