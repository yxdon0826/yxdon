/**
 * S N K · 蛇宿 —— Cloudflare Pages Functions 入口
 *
 * 文件名 `[[route]].js` 是 Pages 的通配语法：它会接住 /api/ 下面的所有路径
 * （/api/login、/api/products、/api/health …），原样转给 backend/worker.js。
 *
 * 为什么只有这几行：
 *   同一套接口逻辑要同时能被本地 `wrangler dev`（Worker 形态）和线上 Pages
 *   （Functions 形态）使用，所以真正的实现放在 backend/worker.js，
 *   这里只做「平台外壳」的转接，避免两份代码逐渐跑偏。
 *
 * 依赖的绑定（Cloudflare 后台 → 设置 → 绑定）：
 *   DB  →  D1 数据库 snk-db
 */

import worker from "../../backend/worker.js";

export const onRequest = (context) => worker.fetch(context.request, context.env);
