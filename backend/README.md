# 后端数据层（Cloudflare D1）

一份 SQL 建完整个库：`backend/schema.sql`。

- 纯 SQLite 语法，D1 直接吃，**可重复执行**（全部 `IF NOT EXISTS` / `INSERT OR IGNORE`）
- 已用 SQLite 3.x 实跑验证：建表无报错、重复执行不重复插、`PRAGMA foreign_key_check` 无问题、`integrity_check` = ok
- 自带种子：10 个部门、4 句问候、3 件商品、3 个指标、5 个演示账号、3 条日志

## 一、怎么建

### 方式 A：控制台（你说的在线 D1）

1. Cloudflare 控制台 → **存储和数据库 → D1 SQL Database** → **Create database**
2. 名字填 `snk-db`（或你喜欢的），点创建
3. 进这个库 → 上方切到 **Console**（有的版本叫「Execute SQL / 查询」）
4. 把 `backend/schema.sql` **整个文件**粘进去 → **Execute**
5. 逐个跑下面三句确认：

```sql
SELECT COUNT(*) AS depts    FROM departments;   -- 应为 10
SELECT COUNT(*) AS agents_n FROM agents;        -- 应为 5
SELECT codename, name, dept_code, status FROM v_agents;
```

### 方式 B：命令行

```powershell
npx wrangler@4 d1 create snk-db
# 建完会打印 database_id，先记下来
npx wrangler@4 d1 execute snk-db --remote --file=./backend/schema.sql
```

> 线上是 Pages 项目，数据库在 Cloudflare 上已建好并绑成变量 `DB`（设置 → 绑定）。
> 这条命令只在你想重建一个库时用；`wrangler.toml` 已挪到 `tools/wrangler.local.toml`，
> 本地跑 CLI 时加 `--config tools/wrangler.local.toml`。

## 二、表一览

| 表 | 干什么 | 关键字段 |
| --- | --- | --- |
| `agents` | 特工/账号主表 | `account`、`codename`(SNK-018)、`dept_code`、`role`、`clearance`、`status`、`password_hash` |
| `departments` | 认证页下拉那 10 项 | `code`、`name`、`sort` |
| `sessions` | 登录态 | `id`(Cookie 里那串)、`token_hash`、`expires_at`、`revoked` |
| `login_attempts` | 连错 3 次锁定的依据 | `account`、`ok`、`created_at` |
| `greetings` | 控制台轮换的 4 句 | `text`、`sort` |
| `products` | 购买列表 | `code`(SNK-001)、`category`、`rarity`、`status`、`quota` |
| `purchases` | 购买申请 | `agent_id`、`product_code`、`status` |
| `logs` | 审计日志（含蓝屏/退出三击） | `event`、`level`、`meta`(JSON)、`agent_id` |
| `metrics` | 控制台三个数字 | `key`、`value` |
| `visits` | 判断「是否第一次进入」 | `device_id`、`visits`、`first_flow` |
| `chat_messages` | 侧栏 CHAT 预留 | `agent_id`、`role`、`content` |
| `schema_meta` | schema 版本 | `key`、`value` |

关系：`departments.code` ← `agents.dept_code`；`agents.id` ← `sessions / purchases / logs / chat_messages`；`products.code` ← `purchases.product_code`。

视图 `v_agents`：给前端的安全投影，**不含 `password_hash`**。查询特工信息一律走它。

## 三、演示账号

| 账号 | 密码 | 代号 | 姓名 | 部门 | 角色 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `snk_018` | `nightfall` | SNK-018 | 方渊 | 情报部 | agent | active（主测试账号） |
| `snk_root` | `snake@root` | VIPER-000 | 沈枭 | 股东 | admin | active |
| `buyer_01` | `flame2026` | BUYER-001 | 周砚 | 海外分部 | buyer | active |
| `locked_01` | `locked` | GHOST-404 | 无名 | 侦察局 | agent | **locked**（测锁定提示） |
| `guest` | `guest` | GUEST | 访客 | 人事部 | guest | **expired**（测过期提示） |

密码在库里存成 `pbkdf2$100000$<salt_b64>$<hash_b64>`（PBKDF2-HMAC-SHA256，32 字节，盐 16 字节）。
Worker 里用 Web Crypto 的 `PBKDF2` 校验即可，不依赖任何库；注册时同样格式写入。

## 四、几个设计取舍（说明白，免得以后觉得奇怪）

1. **时间统一用 `unixepoch()` 整数**，不存字符串。好处是排序/比较不用转，跨时区不会错；展示时前端再格式化。
2. **会话只在库里存 token 的哈希**，原文只在浏览器 Cookie 里。这样库被看到也无法直接冒用身份。
3. **账号用软删除**（`status='deleted'`），不物理删。因为日志、购买记录要留档。
4. **`visits` 不建账号**：判断「是否第一次进入」用的设备 id，和特工账号是两回事，不混在一起。
5. **`logs.meta` 用 JSON 文本 + `json_valid()` 约束**：事件参数各不一样，用 JSON 比开十几个字段干净。
6. **指标放 `metrics` 表而不是写死**：以后想让控制台显示真实在线人数，改一行数据就行，不用改代码。

## 五、下一步（Worker API 草案）

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/register` | POST | 写 `agents`（status=pending/active），返回 codename |
| `/api/login` | POST | 校验 `account`+密码 → 写 `sessions`，Set-Cookie |
| `/api/logout` | POST | `sessions.revoked=1` |
| `/api/me` | GET | 走 `v_agents`，给控制台用 |
| `/api/departments` | GET | 下拉 10 项 |
| `/api/products` | GET | 购买列表 |
| `/api/greeting` | GET | 按 `login_count` 轮换问候语 |
| `/api/logs` | GET | 最近 N 条审计日志 |
| `/api/stats` | GET | `metrics` 三个数 |
| `/api/visit` | POST | 首次进入判断（`visits` 表） |
| `/api/chat` | POST/GET | 预留，先不做 |
