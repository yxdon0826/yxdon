# AGENTS.md — 给接手者 / AI agent 的说明

> 这是一个**纯静态**的入口叙事站点（代号 B · 全监控）。零框架、零构建、零依赖、无需后端。
> 人类看 [README.md](README.md)，改代码查 [STRUCTURE.md](STRUCTURE.md)（功能树 + 改哪里）。

---

## 1. 跑起来

| 方式 | 命令 |
| --- | --- |
| 最快 | 双击 `index.html`（`file://` 可用，无外部请求） |
| 推荐 | 双击 `serve.cmd`，或 `python -m http.server 8421`，访问 `http://127.0.0.1:8421/` |
| 桌面开关（可选，仅 Windows） | `tools/preview-app/` 里的 `app.py` / `build.ps1`，需要 Python 3 + tkinter |

## 2. 改完怎么验证

页面只有一条主流程，手动走一遍约 2 分钟：
**灌注点亮 → 点击进入 → 是 → 继续 → 加入 → 是 → 血液 → DNA → 注册 → 登录 → 控制台**，
再顺手点两下「退出」看彩蛋。

自动化自检（需要 Chrome 以 `--remote-debugging-port=9222` 启动，并把页面跑在 8422）：

```bash
python -m http.server 8422          # 起页面
# Chrome 加 --headless=new --remote-debugging-port=9222
node tools/flow.js                  # 全流程 + 截图到 _shots/，末尾会打印 ERRORS（必须为 none）
node tools/intro-shots.js           # 开场四态：暗 / 悬停 / 半亮 / 全亮
node tools/mobile.js                # 390×844 触屏流程
node tools/perf.js                  # 开场帧率，目标 avg≈16.6ms、p95≤16.8、0 帧 >20ms
```

脚本都读 `BASE` 环境变量（默认 `http://127.0.0.1:8422/`），换端口不用改代码：

```powershell
$env:BASE="http://127.0.0.1:8421/"; node tools/flow.js
```

## 3. 代码地图（细节见 STRUCTURE.md）

| 功能 | 位置 |
| --- | --- |
| 切屏 | `app.js` `go(name)`；`screens` 里登记 6 个屏 + 蓝屏 |
| 开场灌注 | `intro` 对象 → `setupEnergy()` / `render()` / `softenMask()` / `energyPaint()` / `surge()` |
| 分支对话 | `STEPS` + `showStep()` / `typeText()` / `showLines()` |
| 血液 / DNA | `blood` 对象 + `bloodFrame()` / `runScan()` |
| 注册 / 登录 | `#registerForm` / `#loginForm` 的 submit 监听 |
| 控制台 | `enterConsole()` + `QUESTIONS` / `nextQuestion()` |
| 彩蛋 | `onQuit()` + `triggerBsod()` + `startCoord()` |

约定：所有状态都在 `app.js` 的 IIFE 里，不挂全局；只有一个只读调试出口 `window.__demo`（screen / reveal / ready / quitClicks / nopeGone），自检脚本靠它。

## 4. 修改约定（请遵守）

1. **不要引入框架、构建步骤或 npm 依赖**。必须保持「双击 index.html 就能跑」。
2. **文案里的 `<<词>>` 是红色高亮语法**（`app.js` 的 `parseRich()`），别删或改成别的符号。
3. **`assets/` 的图不要换成长宽比不同的**：CSS 里用 `aspect-ratio: 1129/1318` 和绝对定位对齐，比例变了会错位。
4. **不要给 `.logo-stage` 加 `transform`/`will-change` 之外的合成属性**：`will-change: transform` 会让 `position: fixed` 子元素以它为包含块（曾经把全屏画布坑成徽章大小）。
5. **改完必须跑 `node tools/flow.js`**，末尾 `ERRORS` 必须是 `none`。
6. 保留 `prefers-reduced-motion` 分支：减弱动效时也要能完整走完流程。

## 5. 已知边界（别当成 bug）

- **登录不校验**：`#loginForm` 只判空，任何账号密码都能进；`data/accounts.json` 只是数据源，尚未比对。
- **控制台是占位数据**：监控节点 12 / 在线特工 07 / 待处理 02 / 清单 / 日志都是写死的。
- **蓝屏与坐标是演出效果**：坐标 `startCoord()` 随机生成，不是真实定位。
- **手机真机**：桌面开关只绑 `127.0.0.1`；要真机访问需要改成 `0.0.0.0` 并放行防火墙。

## 6. 目录速览

```
index.html · styles.css · app.js      三个源文件，改功能只看这三个
assets/                               成品图（徽章 / 图标 / favicon）
source/                               原始素材（logob.png、icon-logo.png），配合 tools/make-assets.ps1 重出 assets
data/accounts.json                    测试账号
preview/                              自检截图（可删）
tools/                                自检脚本 + 素材管线 + 桌面开关源码（可选）
```
