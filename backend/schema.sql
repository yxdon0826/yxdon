-- =====================================================================
--  S N K · 蛇宿  后端数据库（Cloudflare D1 / SQLite）
--  文件：backend/schema.sql
--  用法：整套粘贴到 Cloudflare 控制台 → D1 → 你的库 → Console(SQL) → 执行
--        或命令行：npx wrangler d1 execute <库名> --remote --file=./backend/schema.sql
--  特性：全部 IF NOT EXISTS / INSERT OR IGNORE，可重复执行，不会报错、不会重复插种子
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
-- 0. 元信息（记录 schema 版本，方便以后加迁移）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------
-- 1. 部门（认证页下拉的 10 项，顺序即 sort）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id     INTEGER PRIMARY KEY,
  code   TEXT    NOT NULL UNIQUE,          -- 程序内部用：intel / rnd ...
  name   TEXT    NOT NULL UNIQUE,          -- 界面显示：情报部
  sort   INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- ---------------------------------------------------------------
-- 2. 特工（= 用户 / 账号）
--    account  → 登录账号（snk_018）
--    codename → 显示代号（SNK-018），控制台里"xxx 特工"用的就是它
--    status   → pending 待验证 / active 在线 / locked 已锁定 / expired 已过期
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account       TEXT    NOT NULL UNIQUE,
  codename      TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  dept_code     TEXT    NOT NULL REFERENCES departments(code),
  role          TEXT    NOT NULL DEFAULT 'agent'
                        CHECK (role IN ('agent', 'admin', 'buyer', 'guest')),
  clearance     INTEGER NOT NULL DEFAULT 1 CHECK (clearance BETWEEN 0 AND 5),
  status        TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'locked', 'expired', 'deleted')),
  sex           TEXT             CHECK (sex IS NULL OR sex IN ('男', '女', '未公开')),
  age           INTEGER          CHECK (age IS NULL OR age BETWEEN 1 AND 120),
  height_cm     INTEGER          CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 260),
  weight_kg     INTEGER          CHECK (weight_kg IS NULL OR weight_kg BETWEEN 10 AND 400),
  password_hash TEXT,                      -- pbkdf2$100000$salt_b64$hash_b64（见 README）
  login_count   INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  registered_at INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------
-- 3. 会话（登录成功后发一个随机 token 给浏览器，库里只存它的哈希）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT    PRIMARY KEY,                    -- 32 位 hex，放在 HttpOnly Cookie 里
  agent_id     INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,                -- sha256(token + 服务端 pepper)
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER,
  ip           TEXT,
  ua           TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);

-- ---------------------------------------------------------------
-- 4. 登录尝试（连错 3 次锁定账号，对应前端"最多 3 次"的规则）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account    TEXT,
  ok         INTEGER NOT NULL CHECK (ok IN (0, 1)),
  reason     TEXT,
  ip         TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------
-- 5. 问候语（控制台右上那 4 句，按 sort 轮换）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greetings (
  id     INTEGER PRIMARY KEY,
  text   TEXT    NOT NULL,
  sort   INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- ---------------------------------------------------------------
-- 6. 商品（控制台"购买"列表）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT    NOT NULL UNIQUE,      -- SNK-001
  name       TEXT    NOT NULL,
  category   TEXT,                         -- 单兵 / 耗材
  rarity     TEXT,                         -- 常规 / 受限 / 机密
  status     TEXT    NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available', 'locked', 'soldout')),
  quota      INTEGER NOT NULL DEFAULT 0,   -- 可用配额
  price      INTEGER NOT NULL DEFAULT 0,   -- 信用点
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------
-- 7. 购买申请
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id     INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  product_code TEXT    NOT NULL REFERENCES products(code),
  qty          INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  status       TEXT    NOT NULL DEFAULT 'requested'
                       CHECK (status IN ('requested', 'approved', 'rejected')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------
-- 8. 审计日志（控制台下方那三条，以及退出三击 / 蓝屏等事件）
--    event: register / login / logout / exit_triple / bsod / purchase / chat
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id   INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  event      TEXT    NOT NULL,
  level      TEXT    NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'alert')),
  meta       TEXT             CHECK (meta IS NULL OR json_valid(meta)),
  ip         TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------
-- 9. 站点指标（控制台三个数字：监控节点 / 在线特工 / 待处理）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metrics (
  key        TEXT PRIMARY KEY,
  value      INTEGER NOT NULL,
  label      TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------
-- 10. 访客（判断"您是否是第一次进入该网站"，不落地成账号）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visits (
  device_id   TEXT PRIMARY KEY,            -- 前端 localStorage 里生成的随机 id
  first_seen  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen   INTEGER NOT NULL DEFAULT (unixepoch()),
  visits      INTEGER NOT NULL DEFAULT 1,
  first_flow  TEXT                         -- first_time / join / buyer
);

-- ---------------------------------------------------------------
-- 11. 聊天（控制台侧栏 CHAT 占位，先建表，暂不放内容）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id   INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK (role IN ('agent', 'ai', 'system')),
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------
-- 索引
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_agents_dept        ON agents(dept_code);
CREATE INDEX IF NOT EXISTS idx_agents_status      ON agents(status);
CREATE INDEX IF NOT EXISTS idx_sessions_agent     ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires   ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_attempts_acct_time ON login_attempts(account, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_agent    ON purchases(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_time          ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_agent_time    ON logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_agent_time    ON chat_messages(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_sort      ON products(sort);

-- ---------------------------------------------------------------
-- 给前端用的安全视图（永远不要 SELECT * 把 password_hash 带到浏览器）
-- ---------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_agents AS
SELECT a.id, a.account, a.codename, a.name, a.dept_code, d.name AS dept_name,
       a.role, a.clearance, a.status, a.sex, a.age, a.height_cm, a.weight_kg,
       a.login_count, a.last_login_at, a.created_at
FROM agents a
LEFT JOIN departments d ON d.code = a.dept_code;

-- =====================================================================
--  种子数据
-- =====================================================================

INSERT OR IGNORE INTO schema_meta (key, value) VALUES
  ('schema_version', '1'),
  ('created_at',     datetime('now'));

-- 10 个部门（顺序与需求图一致）
INSERT OR IGNORE INTO departments (id, code, name, sort, active) VALUES
  (1,  'shareholder', '股东',     10, 1),
  (2,  'agent',       '特工部',   20, 1),
  (3,  'hr',          '人事部',   30, 1),
  (4,  'intel',       '情报部',   40, 1),
  (5,  'rnd',         '科研部',   50, 1),
  (6,  'lingwai',     '灵外局',   60, 1),
  (7,  'recon',       '侦察局',   70, 1),
  (8,  'overseas',    '海外分部', 80, 1),
  (9,  'outworld',    '界外界',   90, 1),
  (10, 'doctor',      '医生',    100, 1);

-- 4 句问候（控制台轮换）
INSERT OR IGNORE INTO greetings (id, text, sort, active) VALUES
  (1, '今天过得如何？',                 10, 1),
  (2, 'SNK已为您检测身体各项特征',       20, 1),
  (3, '请记得提交任务',                 30, 1),
  (4, '今日事项已全部完成',             40, 1);

-- 商品
INSERT OR IGNORE INTO products (code, name, category, rarity, status, quota, price, sort) VALUES
  ('SNK-001', '焰纹信标', '单兵', '受限',   'available', 3, 420, 10),
  ('SNK-002', '炫螭封缄', '耗材', '已加密', 'available', 2, 180, 20),
  ('SNK-003', '蛇骨密钥', '耗材', '机密',   'locked',    0,   0, 30);

-- 指标（控制台三个数字）
INSERT OR IGNORE INTO metrics (key, value, label) VALUES
  ('monitored_nodes', 12, '监控节点'),
  ('online_agents',    7, '在线特工'),
  ('pending_tasks',    2, '待处理');

-- 演示账号
-- 密码均为 pbkdf2$100000$salt$hash（PBKDF2-HMAC-SHA256 / 32 字节）
-- 明文见 backend/README.md 的账号表，仅作演示
INSERT OR IGNORE INTO agents
  (account, codename, name, dept_code, role, clearance, status, sex, age, height_cm, weight_kg, password_hash, registered_at)
VALUES
  ('snk_018',   'SNK-018',   '方渊', 'intel',    'agent', 3, 'active',
   '男', 120, 172, 68, 'pbkdf2$100000$lj3W9FQXH098C5D97i+TPg==$SPGkYB+dhbVr/G/zg5kGR7p6wlLhZVyjf9t298BZ9J8=', unixepoch()),

  ('snk_root',  'VIPER-000', '沈枭', 'shareholder', 'admin', 5, 'active',
   '男', 41, 183, 76, 'pbkdf2$100000$OKUWKpqiXH7jvMiQDesMsg==$WXEM6KTNtu8jbL/LP9+bGbjOvTX0uy6VVRkxoguucks=', unixepoch()),

  ('buyer_01',  'BUYER-001', '周砚', 'overseas', 'buyer', 1, 'active',
   '女', 29, 168, 50, 'pbkdf2$100000$KOKXik6I8sArvTm4OBcWmw==$5TVcZf5cizrdn7SIVf/MDmpRSq106KrzKdNtu9aQFs4=', unixepoch()),

  ('locked_01', 'GHOST-404', '无名', 'recon',    'agent', 0, 'locked',
   '未公开', 33, 175, 62, 'pbkdf2$100000$45YoMmKaHPJ+ikyKMy6M2g==$fATPPJj+2fwW7QyH2Drd0Ej+eOfInGlIjk0mCiTcQDk=', unixepoch()),

  ('guest',     'GUEST',     '访客', 'hr',       'guest', 0, 'expired',
   '未公开', 20, 170, 55, 'pbkdf2$100000$dJw494qgINkHBSoaZVMp1A==$aV0kGkJbwEG2Shwzc+rYQIwxj6+lfJKLJ52O/foSTKQ=', unixepoch());

-- 三条控制台日志
INSERT OR IGNORE INTO logs (agent_id, event, level, meta, created_at) VALUES
  (1, 'purchase', 'info', '{"product":"SNK-001","status":"requested"}', unixepoch() - 1800),
  (NULL, 'heartbeat', 'info', '{"node":"CN-07","result":"normal"}',      unixepoch() - 3600),
  (NULL, 'verify', 'info', '{"scope":"archive","result":"no_anomaly"}',  unixepoch() - 7200);

-- =====================================================================
--  自检：执行完可以在 Console 里跑下面三句确认
-- =====================================================================
-- SELECT COUNT(*) AS depts    FROM departments;   -- 应为 10
-- SELECT COUNT(*) AS agents_n FROM agents;        -- 应为 5
-- SELECT * FROM v_agents;                         -- 不应包含 password_hash
