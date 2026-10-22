-- =====================================================================
--  S N K · 蛇宿 —— 补密码哈希（只在 seed 行的 password_hash 为空时用）
--
--  背景：schema.sql 里 agents 表本来就带 password_hash 列，5 个种子账号
--        也自带 pbkdf2 哈希，正常情况下「不需要」跑这个文件。
--        只有下面这句查出 NULL 时，才需要执行本文件：
--
--    SELECT codename, password_hash FROM agents ORDER BY id;
--    -- 5 行都应以 pbkdf2$100000$ 开头；有 NULL 才继续往下看
--
--  执行方式（二选一）：
--    D1 控制台 → 选 snk-db → Console → 粘贴执行
--    npx wrangler d1 execute snk-db --remote --file=./backend/fix-passwords.sql
-- =====================================================================

-- 【仅当报错 "no such column: password_hash" 时，先单独执行下面这一句】
-- ALTER TABLE agents ADD COLUMN password_hash TEXT;

-- 明文密码对应关系（仅供演示）：
--   snk_018   = nightfall
--   snk_root  = snake@root
--   buyer_01  = flame2026
--   locked_01 = locked
--   guest     = guest

UPDATE agents SET password_hash = 'pbkdf2$100000$lj3W9FQXH098C5D97i+TPg==$SPGkYB+dhbVr/G/zg5kGR7p6wlLhZVyjf9t298BZ9J8='
  WHERE account = 'snk_018';

UPDATE agents SET password_hash = 'pbkdf2$100000$OKUWKpqiXH7jvMiQDesMsg==$WXEM6KTNtu8jbL/LP9+bGbjOvTX0uy6VVRkxoguucks='
  WHERE account = 'snk_root';

UPDATE agents SET password_hash = 'pbkdf2$100000$KOKXik6I8sArvTm4OBcWmw==$5TVcZf5cizrdn7SIVf/MDmpRSq106KrzKdNtu9aQFs4='
  WHERE account = 'buyer_01';

UPDATE agents SET password_hash = 'pbkdf2$100000$45YoMmKaHPJ+ikyKMy6M2g==$fATPPJj+2fwW7QyH2Drd0Ej+eOfInGlIjk0mCiTcQDk='
  WHERE account = 'locked_01';

UPDATE agents SET password_hash = 'pbkdf2$100000$dJw494qgINkHBSoaZVMp1A==$aV0kGkJbwEG2Shwzc+rYQIwxj6+lfJKLJ52O/foSTKQ='
  WHERE account = 'guest';

-- 复核：5 行都应为 pbkdf2 开头、长度一致
SELECT codename, status, length(password_hash) AS hash_len, substr(password_hash, 1, 18) AS head
FROM agents ORDER BY id;
