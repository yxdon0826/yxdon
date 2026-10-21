# S N K（B 版）功能树

每个节点后面标了**代码位置**，改/删的时候直接照着找。

```
S N K 入口叙事（B · 全监控）
│
├─ ① 开场 · 能量灌注（intro）
│  ├─ 左上角标识          assets/icon.png，18s 匀速 360° 转         .rotator / @keyframes rotSpin
│  ├─ 徽章常暗            底图透明度 .14，只留轮廓                    .logo-base
│  ├─ 鼠标 = 探照灯        悬停处一小圈柔光，只预览、不留痕            app.js render() 的 hover 分支
│  ├─ 按住左键 = 灌注      扫过的区域常亮、不会暗回去                  energyPaint() / energyLine()
│  ├─ 覆盖率统计          22×26 网格，达到 72% 触发充能               intro.grid / energyPaint 里的 0.72
│  ├─ 充能                 整枚点亮 + 底部浮出「点击进入」             surge() / finishReveal()
│  ├─ 点击进入             机能风涟漪 + 徽章淡出放大                  introEnter() / rippleBurst()
│  └─ 键盘捷径             Enter 充满，隔 1 秒再 Enter 进入            window keydown 监听
│
├─ ② 入口分支（dialog）
│  ├─ Q1 您是第一次进入该网站吗？                                     STEPS.first
│  │  ├─ 是 → Q2
│  │  └─ 否 → ⑤ DNA 检测 → ⑦ 登录（回头客通道）
│  ├─ Q2 您已进入【全监控】领域，是否继续？                            STEPS.monitor（红字用 <<全监控>>）
│  │  ├─ 继续 → Q3
│  │  └─ 退出 → ⑨-A 彩蛋
│  └─ Q3 您的目的是？                                                 STEPS.purpose
│     ├─ 加入 → Q4 誓词
│     └─ 买家 → ⑤ DNA 检测 → ⑦ 登录
│
├─ ③ 誓词（dialog，复用对话屏）
│  ├─ 三行文字，上线间隔 1.5 秒                                        STEPS.oath.lines / showLines()
│  │    · 神秘人会赞许你的勇气
│  │    · 此地只需绝对的忠诚
│  │    · 你，是否已准备好将忠诚献予Ta？
│  ├─ 是 → ④ 血液
│  └─ 否 → 第一次只抖动，第二次直接消失、只剩「是」                    onNope()
│
├─ ④ 血液（#screenBlood）
│  ├─ 标题「请将【血液】滴入」，血液二字红色                            .blood-prompt / .hl
│  ├─ 点击任意处落血：下落 → 触底                                      bloodDrop() / bloodFrame()
│  ├─ 命中效果：4 圈涟漪 + 9 滴飞溅 + 持久血迹                          rings / droplets / splats
│  └─ 1.5 秒后自动转入 DNA                                             bloodDrop 里的 setTimeout
│
├─ ⑤ DNA 计入（#scan，与血液同屏）
│  ├─ 进度条 0→100%，2.2 秒                                           runScan()
│  ├─ 读数滚动：SAMPLE xxxx·xxxx 待检 → MATCH 100%                      #scanPct / #scanCode
│  └─ 完成 → ⑥ 注册
│
├─ ⑥ 注册（#screenRegister）
│  ├─ 字段：代号 / 账号 / 密码，三者必填                                #registerForm
│  ├─ 校验：缺项 → 红字提示，不跳转
│  ├─ 提交 → ⑦ 登录（账号自动带入）                                    registerForm submit
│  └─ 数据源：data/accounts.json（目前仅展示，未做比对）
│
├─ ⑦ 登录（#screenLogin）
│  ├─ 字段：账号 / 密码，必填                                          #loginForm
│  ├─ 校验：缺项 → 红字提示
│  └─ 提交 → ⑧ 控制台                                                  loginForm submit
│
├─ ⑧ 控制台（#screenConsole）
│  ├─ 问候：「{代号} 特工，」+ 一句播报                                 enterConsole() / #greeting
│  │  └─ 四句轮换，每次登录换下一句                                     QUESTIONS / nextQuestion()
│  │       · 今天过得如何？
│  │       · SNK已为您检测身体各项特征
│  │       · 请记得提交任务
│  │       · 今日事项已全部完成
│  ├─ AI 标签                                                          .room-kicker
│  ├─ 左侧分类：购买 / 查询，点击切右侧内容                              #sideNav / .view[data-view]
│  ├─ 购买：配额 03 + 2 条清单（编号/名称/状态）                         .view[data-view=buy]
│  ├─ 查询：检索框 + 按钮（无实际检索）                                  .view[data-view=query]
│  ├─ 指标：监控节点 12 / 在线特工 07 / 待处理 02                        .stats
│  └─ 日志：3 条时间戳记录                                              .log
│
└─ ⑨ 彩蛋
   ├─ A 退出点不动                                                      onQuit()
   │  ├─ 第 1、2 次点击：按钮抖动
   │  ├─ 第 3 次：变红 + 标签改成「无法退出」
   │  └─ 第 4 次：跳蓝屏
   ├─ B 蓝屏（#bsod）
   │  ├─ 0.0s   「SNK已锁定该设备」                                     .bsod-text
   │  ├─ 2.4s   浮现「锁定中」                                          triggerBsod()
   │  ├─ 4.4s   白 / 红频闪一下                                         .is-flash / @keyframes bsodFlash
   │  ├─ 4.75s  文案变「锁定【您的位置】中」，其中您的位置红色            lock-red
   │  ├─ 4.75s  下面浮出红色「已上传总部」                               .bsod-track
   │  ├─ 4.75s  坐标从随机滚动到锁定 + 闪烁光标                          startCoord() / #bsodCoord
   │  └─ 锁定后 5s  屏幕最下方出现 SIMULATION 重开                       .bsod-reset
   └─ C 问询轮换                                                       nextQuestion()
      └─ 计数存在 localStorage 的 snk.qidx，每次登录 +1
```

---

## 想删功能时动哪里

| 想删掉 | 改动 |
| --- | --- |
| 整个开场（直接进对话） | `index.html` 把 `#screenIntro` 删掉；`app.js` 里 `go('dialog'); dialog.enter();` 放到初始化末尾 |
| 灌注机制（改成点一下直接进） | `app.js` 删掉 pointerdown/move 里的 `energyPaint`，初始化时直接调 `finishReveal()` |
| 某一层分支 | `app.js` 的 `STEPS` 里删掉对应 key，并改上游 `choices[].to` |
| 誓词三行 | 删 `STEPS.oath.lines`，改回单个 `text` 就会走打字机 |
| 血液 / DNA | `app.js` 把 `enterBlood` 改成直接 `go('register')` |
| 注册（只留登录） | `STEPS.oath` 的「是」改成 `to: 'login'` 外的新分支，或 `enterScan()` 里 `go('login')` |
| 控制台某一类 | `index.html` 删 `.view[data-view=query]` 与对应 `.nav-item` |
| 蓝屏彩蛋 | `app.js` 的 `onQuit` 里删掉 `triggerBsod()` 调用 |
| 坐标滚动 | `app.js` 的 `triggerBsod` 里删掉 `startCoord()` |
| 问询轮换（固定一句） | `app.js` 的 `nextQuestion()` 直接 `return QUESTIONS[0]` |

## 想调节奏时动哪里

| 项目 | 位置 | 现值 |
| --- | --- | --- |
| 点亮阈值 | `energyPaint()` | 0.72 |
| 誓词行间隔 / 总时长 | `showLines()` | 1500ms / +700ms |
| 血液到 DNA | `bloodDrop()` | 1500ms |
| DNA 进度 | `runScan()` | 2200ms |
| 蓝屏时序 | `triggerBsod()` | 2400 / 4400 / 4750ms |
| 坐标滚动频率 / 次数 | `startCoord()` | 85ms × 16 次 |
| 左上角转速 | `.rotator` | 18s |
| 光斑半径 / 光晕范围 | `brushRadius()` / `softenMask()` | 0.17 / 1.02–1.3 |

## 想改视觉时动哪里

| 项目 | 位置 |
| --- | --- |
| 主配色 | `styles.css` `:root`：`--blue / --blue-hi / --ice / --red / --void` |
| 文字发光 | `body { text-shadow: 0 0 14px rgba(127,169,255,.22) }` |
| 红字高亮 | `.hl`（对话/血液）、`.lock-red`（蓝屏） |
| 徽章 / 图标素材 | 工作区根的 `logob.png`、`图标.png` → 跑 `tools/make-assets.ps1` |

---

## 附：文件树（简版）

```
snk-demo-b/
├─ index.html   结构（7 个屏幕）      ├─ data/accounts.json  测试账号
├─ styles.css   全部样式              ├─ preview/            截图（可删）
├─ app.js       全部交互              └─ tools/
├─ README.md                              ├─ make-assets.ps1  素材管线
├─ STRUCTURE.md（本文件）                  ├─ flow.js 等        自检脚本
└─ assets/                                └─ preview-app/     桌面开关源码
   ├─ logo.png / logo-640.png
   ├─ icon.png
   └─ favicon.png
```
