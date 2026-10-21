# S N K — 全监控领域（B 版 · 蓝色）

按 `网站.doc` 的需求做的入口叙事 Demo。纯静态，无框架、无构建、无后端。
图标使用蓝色版徽章（`logob.png`）。

> 目录结构和「改哪里」都整理在 [STRUCTURE.md](STRUCTURE.md)。

## 怎么打开

- 双击桌面上的 `蛇宿本地预览.exe`（只有这一个站点，打开即预览）
- 或直接双击 `index.html`（`file://` 也能跑）
- 或任意静态服务：`python -m http.server 8422`，访问 `http://127.0.0.1:8422/`

## 更新线上版本（Cloudflare）

先确认一件事：**你线上是 Worker 还是 Pages？**（两者的更新命令不一样）

| 现象 | 结论 |
| --- | --- |
| Workers & Pages 列表里项目行显示「无活动路由」，名字是 `形容词-名词-短码`（如 `weathered-pond-a9f6`），右上角给的是 `xxx.workers.dev` | **Worker（静态资源）** |
| 项目行显示 `xxx.pages.dev` 地址、能看「部署 / Deployments」历史 | **Pages** |

当前线上就是第一种。`deploy.config.json` 里已写好：

```json
{ "target": "workers", "workerName": "weathered-pond-a9f6" }
```

`tools/deploy.ps1` 会自动按 `target` 选命令：

| target | 实际执行 | 配置来源 |
| --- | --- | --- |
| `workers` | `wrangler deploy --name <workerName> --config wrangler.toml` | `wrangler.toml` 的 `[assets] directory = "./.deploy"` |
| `pages` | `wrangler pages deploy <临时目录> --project-name <projectName> --branch <branch>` | `deploy.config.json` |

以后更新推荐走命令行，一条命令搞定：

```powershell
# 第一次：登录（会开浏览器授权，只需一次）
npx wrangler@4 login

# 之后每次更新（项目名见 Cloudflare 后台，或跑 -Status 查）
.\tools\deploy.ps1 -ProjectName <你的项目名>
```

- 只上传线上真正需要的文件：`index.html` / `styles.css` / `app.js` / `assets/` / `_headers`；
  `preview/`、`tools/`、`source/`、`_shots/`、`data/`、各类文档都不会传上去。
- 上传前给临时副本写入 `_version.txt`（时间戳），部署完打开 `<站点>/_version.txt` 即可确认新版本真的生效。
- 想先看会传哪些文件：`.\tools\deploy.ps1 -DryRun`
- 查项目名 / 最近几次部署：`.\tools\deploy.ps1 -Status`
- 给 CI 用：在 Cloudflare 后台建一个权限为 `Cloudflare Pages:Edit` 的 API Token，设到环境变量
  `CLOUDFLARE_API_TOKEN`，脚本会自动走非交互认证。
- 项目名与分支写在 `deploy.config.json` 里，改一次以后不用每次带参数。
- 临时指定目标：`.\tools\deploy.ps1 -Target workers` 或 `-Target pages`（覆盖 config 里的 target）。
- Worker 目标会先把文件整理到站点目录下的 `.deploy/`（wrangler.toml 指向它），
  上传完自动删除；`.deploy/` 不要提交、也不要打进 zip。

> 如果部署出来的是 **Preview** 而不是 Production：说明 `--branch` 和项目设置里的「生产分支」不一致。
> 到 Cloudflare 后台 → 项目 → Settings → Build & deployments 看 Production branch 叫什么，
> 然后用 `.\tools\deploy.ps1 -Branch <那个名字>` 再跑一次。

### 三种更新方式怎么选

| 方式 | 适合 | 代价 |
| --- | --- | --- |
| 后台拖拽 / 上传 zip | 偶尔改一次 | 手动、容易漏文件或多套一层目录 |
| `tools/deploy.ps1`（wrangler） | 现在这个场景 | 本机要有 Node（已有 22） |
| Git 自动部署 | 长期协作 | **已建成的直传项目不能改成 Git 集成**，得新建一个 Pages 项目再绑域名 |

### 几个坑

- **zip 里别多一层目录**：Cloudflare 把 zip 根当作网站根，传成 `snk-demo-b/index.html` 首页会 404。
- 更新后对方说"没变"：仓库里已带 `_headers`，html/css/js 都是 `max-age=0, must-revalidate`，
  正常刷新即最新；万一还是旧的，`Ctrl+F5`。
- 回滚：Cloudflare 后台 → 项目 → Deployments，选旧版本点 Rollback，几秒生效。
- 自定义域名：在 Pages 项目里加 `Custom domains`，不要另建 Worker。

## 玩法（对应需求文档）

| 步骤 | 实现 |
| --- | --- |
| 左上角图标 | 用 `图标.png`，一直缓慢旋转 |
| 鼠标 = 探照灯 | 光标处一圈微光，始终亮着，照到哪就透出哪一块徽章 |
| 按住左键 = 灌注能量 | 光照过的地方**会一直亮着**，不会暗回去；手机按住拖同样有效 |
| 完全点亮 | 亮满 72% 触发一次「充能」，整枚徽章点亮，底部出现「点击进入」 |
| 点击进入 | 一圈机能风涟漪，徽章渐隐，进入对话（对话框与选项居中） |
| 第一次进入？ | 是 → **全监控**（红字）→ 继续/退出；否 → 直接走登录 |
| 退出 | 点不动；点三次变红（`无法退出`），第四次跳蓝屏：2.4 秒后显示「锁定中」，再过 2 秒画面闪一下，文案变成「锁定您的位置中」，下面浮出红色的「已上传总部」 |
| 目的 | 加入 → 神秘人台词 → 是/否（否第一次无反应，第二次直接消失）→ 血液滴入 |
| 血液 | 「请将**血液**滴入」（红字，`innerHTML` 写入，别被 textContent 冲掉），点击落血，涟漪 + 飞溅；随后「DNA 计入中」进度条 → 档案录入 |
| 买家 | 「好的，DNA 样本检测中」→ 直接到验证信息 |
| 登录后 | 「xxx 特工，<一句问询>」——AI 助手每次登录只抛一句，五句轮换（今天过得如何 / SNK已为您检测身体各项特征 / 请记得提交任务 / 今日事项已全部完成 / 今天的天气如何）；左侧分类 购买 / 查询，另有「03 聊天」占位（未开放，不可点） |

蓝屏页底部 5 秒后会出现一行极淡的 `SIMULATION // 点击重新开始`，用于从演示里回到开场。

## 目录

```
snk-demo-b/
├─ index.html            结构：开场 / 对话 / 血液 / 注册 / 登录 / 控制台 / 蓝屏
├─ styles.css            暗蓝机能风：网格、扫描线、HUD 角标、终端面板
├─ app.js                状态机 + 能量画布（灌注/探照灯）+ 血液粒子 + 蓝屏
├─ assets/
│  ├─ logo.png           蓝色徽章 1129×1318（透明底，四周留白）
│  ├─ logo-640.png       手机用小图
│  ├─ icon.png           左上角转动的标识
│  └─ favicon.png        页签图标
├─ _headers              线上缓存策略（Cloudflare Pages 会读取）
├─ deploy.config.json    发布配置：项目名 / 分支
├─ preview/              自检截图（桌面 / 移动）
└─ tools/
   ├─ make-assets.ps1    从工作区根的 logob.png / 图标.png 生成 assets/（只用系统 System.Drawing）
   ├─ deploy.ps1         一条命令发布到 Cloudflare Pages
   ├─ flow.js            无头 Chrome 走完整流程并截图
   ├─ intro-shots.js     开场四态截图（未亮 / 悬停 / 半亮 / 全亮）
   ├─ mobile.js          390×844 触屏流程
   └─ perf.js            开场帧率实测
```

## 关于点亮效果

- 衰减用 canvas 累积光斑（`radialGradient` 多重色标，高斯式衰减），扫过才亮、越扫越亮。
- 「亮起来的部分」用能量层当 alpha 蒙版贴出徽章的亮版，再叠一层 `lighter` 蓝辉光。
- 能量画布比徽章大 20%，光可以溢出徽章边界自然衰减，不会被画布切出硬边。
- 覆盖率用 22×26 网格统计，达到 72% 触发充能；键盘 `Enter` 也能直接点亮。

实测（无头 Chrome 1440×900，软件渲染）开场扫光全程 avg 16.58ms / p95 16.8ms，零丢帧。

## 还没做

- 控制台里的真实数据（目前是 DEMO 占位）
- 登录后的更多分类
- 结算/下单链路
