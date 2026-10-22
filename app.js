/* ============================================================
   S N K — 全监控领域 · 入口叙事
   开场：按住左键（触屏按住）像刮刮乐一样刮开涂层，露出徽章
   之后：点击涟漪 → 分支对话 → 血液/DNA → 注册 → 登录 → 控制台
   ============================================================ */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 屏幕 ---------------- */

  const screens = {
    intro: $('#screenIntro'),
    dialog: $('#screenDialog'),
    blood: $('#screenBlood'),
    register: $('#screenRegister'),
    login: $('#screenLogin'),
    console: $('#screenConsole'),
  };

  let currentScreen = 'intro';
  let lastReadyAt = 0;

  function go(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle('is-active', key === name));
    currentScreen = name;
  }

  /* ---------------- 后端接口（Cloudflare Pages Functions） ---------------- */

  // 线上走 /api/*；file:// 或纯静态本地预览没有后端，自动降级成演示模式。
  const API = { live: false, agent: null };

  async function callApi(path, body, ms = 8000) {
    const init = { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(ms);

    const res = await fetch('/api' + path, init);
    let data = null;
    try { data = await res.json(); } catch (_) { /* 非 JSON，按失败处理 */ }

    if (!res.ok || !data || data.ok !== true) {
      const err = new Error((data && (data.message || data.error)) || '连接失败');
      err.code = data && data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function probeApi() {
    if (location.protocol === 'file:') return (API.live = false);
    try {
      const d = await callApi('/health', undefined, 3500);
      API.live = d.db === 'ok';
    } catch (_) {
      API.live = false;
    }
    return API.live;
  }

  /* ---------------- 画布工具 ---------------- */

  function fitCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const s = { dpr: 1, w: 0, h: 0 };

    function resize() {
      s.dpr = Math.min(2, window.devicePixelRatio || 1);
      s.w = canvas.clientWidth;
      s.h = canvas.clientHeight;
      canvas.width = Math.round(s.w * s.dpr);
      canvas.height = Math.round(s.h * s.dpr);
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    }

    resize();
    return { ctx, s, resize };
  }

  /* 机能风涟漪 */
  function rippleBurst(canvas, x, y, color = '127,169,255') {
    const { ctx, s } = fitCanvas(canvas);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      rings.push({ start: performance.now() + i * 110, dur: 1000 + i * 260, max: 190 + i * 120 });
    }

    let raf = 0;
    function frame(now) {
      ctx.clearRect(0, 0, s.w, s.h);
      let alive = false;

      for (const ring of rings) {
        const t = (now - ring.start) / ring.dur;
        if (t < 0) { alive = true; continue; }
        if (t > 1) continue;
        alive = true;

        const r = ring.max * (1 - Math.pow(1 - t, 3));
        const alpha = (1 - t) * 0.9;

        ctx.save();
        ctx.strokeStyle = `rgba(${color},${alpha})`;
        ctx.lineWidth = 1.2 * (1 - t) + 0.3;
        ctx.setLineDash([Math.max(2, r * 0.08), Math.max(6, r * 0.16)]);
        ctx.lineDashOffset = -t * 120;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = `rgba(${color},${alpha * 0.55})`;
        ctx.lineWidth = 1;
        const ticks = 24;
        for (let i = 0; i < ticks; i++) {
          const a = (i / ticks) * Math.PI * 2 + t * 0.8;
          const r1 = r * 1.06;
          const r2 = r * (i % 2 ? 1.1 : 1.16);
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
          ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (alive) raf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, s.w, s.h); raf = 0; }
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  /* ============================================================
     1. 开场：灌注能量点亮徽章
     ============================================================ */

  const intro = {
    stage: $('#logoStage'),
    base: $('#logoBase'),
    canvas: $('#logoEnergy'),
    hint: $('#introHint'),
    enter: $('#enterHint'),
    fx: $('#fxIntro'),
    ctx: null,
    mask: null,
    mctx: null,
    tmp: null,
    tctx: null,
    view: null,
    vctx: null,
    s: { w: 0, h: 0, dpr: 1 },
    cols: 22,
    rows: 26,
    grid: null,
    marked: 0,
    progress: 0,
    ready: false,
    charging: false,
    leaving: false,
    pressed: false,
    hovering: false,
    hx: 0,
    hy: 0,
    lastX: 0,
    lastY: 0,
    raf: 0,
    maskDirty: true,
  };

  intro.grid = new Uint8Array(intro.cols * intro.rows);

  function brushRadius() {
    return Math.max(52, Math.min(intro.s.w, intro.s.h) * 0.17);
  }

  function setupEnergy() {
    const c = intro.canvas;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    intro.s = { w, h, dpr };

    // 徽章在画布里的实际位置（画布比徽章大一圈）
    const artW = intro.stage.clientWidth;
    const artH = intro.stage.clientHeight;
    intro.art = { x: (w - artW) / 2, y: (h - artH) / 2, w: artW, h: artH };

    intro.mask = intro.mask || document.createElement('canvas');
    intro.tmp = intro.tmp || document.createElement('canvas');
    intro.view = intro.view || document.createElement('canvas');

    for (const cv of [c, intro.mask, intro.tmp, intro.view]) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }

    intro.ctx = c.getContext('2d');
    intro.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    intro.mctx = intro.mask.getContext('2d');
    intro.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    intro.tctx = intro.tmp.getContext('2d');
    intro.tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    intro.vctx = intro.view.getContext('2d');
    intro.vctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    render();
  }

  /* 在能量层盖一个光斑（会累积，越照越亮） */
  function stamp(x, y, gain) {
    const R = brushRadius();
    const g = intro.mctx.createRadialGradient(x, y, 0, x, y, R);
    // 高斯式柔和衰减，累积后才不会出现硬边色块
    g.addColorStop(0.00, `rgba(178,212,255,${0.34 * gain})`);
    g.addColorStop(0.22, `rgba(140,186,255,${0.26 * gain})`);
    g.addColorStop(0.48, `rgba(92,146,255,${0.15 * gain})`);
    g.addColorStop(0.74, `rgba(58,108,230,${0.06 * gain})`);
    g.addColorStop(1.00, 'rgba(40,80,200,0)');
    intro.maskDirty = true;
    intro.mctx.fillStyle = g;
    intro.mctx.beginPath();
    intro.mctx.arc(x, y, R, 0, Math.PI * 2);
    intro.mctx.fill();
  }

  /* 把"亮徽章"按能量层的 alpha 贴出来 */
  function blitLit(maskPaint) {
    const { tctx, ctx, s } = intro;
    tctx.clearRect(0, 0, s.w, s.h);
    tctx.globalCompositeOperation = 'source-over';
    tctx.drawImage(intro.base, intro.art.x, intro.art.y, intro.art.w, intro.art.h);
    tctx.globalCompositeOperation = 'destination-in';
    maskPaint();
    tctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(intro.tmp, 0, 0, s.w, s.h);
  }

  /* 把能量层按"以徽章为圆心"的径向衰减柔化一遍，
     这样无论怎么照亮，边缘都不会出现矩形 */
  function softenMask() {
    const { vctx, s } = intro;
    const A = intro.art;
    vctx.clearRect(0, 0, s.w, s.h);
    vctx.drawImage(intro.mask, 0, 0, s.w, s.h);

    const cx = A.x + A.w / 2;
    const cy = A.y + A.h / 2;
    const rArt = Math.hypot(A.w, A.h) / 2;   // 徽章对角半径
    const inner = rArt * 1.02;               // 徽章范围内保持全亮
    const outer = rArt * 1.3;                // 往外只留一小圈衰减

    vctx.globalCompositeOperation = 'destination-in';
    const g = vctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    vctx.fillStyle = g;
    vctx.fillRect(0, 0, s.w, s.h);
    vctx.globalCompositeOperation = 'source-over';
  }

  function render() {
    const { ctx, s } = intro;
    if (!ctx || !intro.base.complete) return;
    ctx.clearRect(0, 0, s.w, s.h);

    /* 能量层没变就复用上次的柔化结果（铺满屏幕后这一步比较贵） */
    if (intro.maskDirty) { softenMask(); intro.maskDirty = false; }

    /* 已点亮的部分 */
    blitLit(() => intro.tctx.drawImage(intro.view, 0, 0, s.w, s.h));

    /* 冷蓝辉光 */
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(intro.view, 0, 0, s.w, s.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    /* 悬停探照灯：光标周围一小圈亮着，只预览不累积 */
    if (intro.hovering && !intro.ready && !intro.charging) {
      const R = brushRadius() * (intro.pressed ? 1.0 : 0.92);

      blitLit(() => {
        const g = intro.tctx.createRadialGradient(intro.hx, intro.hy, 0, intro.hx, intro.hy, R);
        g.addColorStop(0, 'rgba(0,0,0,0.9)');
        g.addColorStop(0.5, 'rgba(0,0,0,0.62)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        intro.tctx.fillStyle = g;
        intro.tctx.fillRect(0, 0, s.w, s.h);
      });

      /* 只留柔光，不画任何描边；光斑本身向外自然衰减 */
      ctx.save();
      const halo = ctx.createRadialGradient(intro.hx, intro.hy, 0, intro.hx, intro.hy, R * 1.5);
      halo.addColorStop(0, intro.pressed ? 'rgba(120,170,255,0.18)' : 'rgba(110,160,255,0.12)');
      halo.addColorStop(1, 'rgba(90,140,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(intro.hx, intro.hy, R * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function scheduleRender() {
    if (intro.raf) return;
    intro.raf = requestAnimationFrame(() => { intro.raf = 0; render(); });
  }

  /* 灌注：画光斑 + 记录覆盖率 */
  function energyPaint(x, y, gain) {
    stamp(x, y, gain);

    const R = brushRadius();
    const A = intro.art;
    const cellW = A.w / intro.cols;
    const cellH = A.h / intro.rows;
    const ax = x - A.x;
    const ay = y - A.y;
    const c0 = Math.max(0, Math.floor((ax - R) / cellW));
    const c1 = Math.min(intro.cols - 1, Math.ceil((ax + R) / cellW));
    const r0 = Math.max(0, Math.floor((ay - R) / cellH));
    const r1 = Math.min(intro.rows - 1, Math.ceil((ay + R) / cellH));

    for (let ry = r0; ry <= r1; ry++) {
      for (let cx = c0; cx <= c1; cx++) {
        const idx = ry * intro.cols + cx;
        if (intro.grid[idx]) continue;
        const dx = (cx + 0.5) * cellW - ax;
        const dy = (ry + 0.5) * cellH - ay;
        if (dx * dx + dy * dy <= R * R) {
          intro.grid[idx] = 1;
          intro.marked++;
        }
      }
    }

    intro.progress = intro.marked / intro.grid.length;
    if (!intro.ready && !intro.charging && intro.progress >= 0.72) surge();
  }

  function energyLine(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(6, brushRadius() * 0.22);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      energyPaint(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 1);
    }
  }

  /* 全身点亮：能量层快速填满，随后交给 CSS 全亮 */
  function surge() {
    if (intro.charging || intro.ready) return;
    intro.charging = true;
    const t0 = performance.now();
    const dur = 520;

    function step(now) {
      const t = clamp((now - t0) / dur, 0, 1);
      intro.mctx.globalAlpha = 0.14 + 0.55 * t;
      intro.maskDirty = true;
      intro.mctx.fillStyle = 'rgb(205,228,255)';
      intro.mctx.fillRect(0, 0, intro.s.w, intro.s.h);
      intro.mctx.globalAlpha = 1;
      render();
      if (t < 1) requestAnimationFrame(step);
      else finishReveal();
    }
    requestAnimationFrame(step);
  }

  function finishReveal() {
    if (intro.ready) return;
    intro.ready = true;
    lastReadyAt = performance.now();
    intro.stage.classList.add('is-revealed');
    intro.enter.classList.add('is-on');
    intro.hint.classList.remove('is-on');
    intro.canvas.style.opacity = '0';
  }

  function pointerPos(e) {
    const rect = intro.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  intro.canvas.addEventListener('pointerdown', (e) => {
    if (intro.ready || intro.leaving) return;
    if (e.button !== undefined && e.button !== 0) return;
    intro.pressed = true;
    intro.canvas.setPointerCapture?.(e.pointerId);
    const p = pointerPos(e);
    intro.lastX = p.x;
    intro.lastY = p.y;
    intro.hx = p.x;
    intro.hy = p.y;
    intro.hovering = true;
    energyPaint(p.x, p.y, 1.2);
    intro.hint.classList.add('is-off');
    scheduleRender();
    e.preventDefault();
  });

  intro.canvas.addEventListener('pointermove', (e) => {
    const p = pointerPos(e);
    intro.hx = p.x;
    intro.hy = p.y;
    intro.hovering = true;

    if (intro.pressed && !intro.ready) {
      energyLine(intro.lastX, intro.lastY, p.x, p.y);
      intro.lastX = p.x;
      intro.lastY = p.y;
      e.preventDefault();
    }
    scheduleRender();
  });

  function endPress(e) {
    if (!intro.pressed) return;
    intro.pressed = false;
    intro.canvas.releasePointerCapture?.(e.pointerId);
    // 松开这一下会顺带触发 click，别让它把"灌注"当成"点击进入"
    intro.suppressClick = true;
    setTimeout(() => { intro.suppressClick = false; }, 380);
  }

  intro.canvas.addEventListener('pointerup', endPress);
  intro.canvas.addEventListener('pointercancel', endPress);
  intro.canvas.addEventListener('pointerleave', () => {
    intro.pressed = false;
    intro.hovering = false;
    scheduleRender();
  });

  /* 点亮之后的一次点击 → 进入 */
  function introEnter() {
    if (!intro.ready || intro.leaving) return;
    if (intro.suppressClick) return;
    if (performance.now() - lastReadyAt < 420) return;
    intro.leaving = true;

    const rect = intro.stage.getBoundingClientRect();
    rippleBurst(intro.fx, rect.left + rect.width / 2, rect.top + rect.height / 2);

    intro.stage.style.transition = 'opacity .8s var(--ease), transform .8s var(--ease), filter .8s var(--ease)';
    intro.stage.style.opacity = '0';
    intro.stage.style.transform = 'scale(1.07)';
    intro.stage.style.filter = 'blur(6px)';
    intro.enter.classList.remove('is-on');

    setTimeout(() => {
      go('dialog');
      dialog.enter();
    }, 900);
  }

  intro.enter.addEventListener('click', (e) => { e.stopPropagation(); introEnter(); });
  screens.intro.addEventListener('click', introEnter);

  /* 键盘：Enter 直接把徽章点亮 */
  window.addEventListener('keydown', (e) => {
    if (currentScreen !== 'intro' || (e.key !== 'Enter' && e.key !== ' ')) return;
    if (!intro.ready) {
      intro.marked = intro.grid.length;
      intro.progress = 1;
      surge();
      lastReadyAt = performance.now() - 1000;
    } else introEnter();
  });

  window.addEventListener('resize', () => {
    if (currentScreen === 'intro' && !intro.ready) setupEnergy();
  }, { passive: true });

  if (intro.base.complete) setupEnergy();
  else intro.base.addEventListener('load', setupEnergy, { once: true });

  setTimeout(() => {
    if (currentScreen === 'intro' && intro.progress < 0.02) intro.hint.classList.add('is-on');
  }, 3000);
  /* ============================================================
     2. 对话分支
     ============================================================ */

  const dialog = {
    box: $('#dialogBox'),
    kicker: $('#dlKicker'),
    text: $('#dlText'),
    choices: $('#dlChoices'),
    typing: 0,
    quitClicks: 0,
    nopeClicks: 0,
  };

  const STEPS = {
    first: {
      kicker: 'SYS // INTRUSION-CHECK',
      text: '您是第一次进入该网站吗？',
      choices: [
        { label: '是', to: 'monitor' },
        { label: '否', to: 'scan-then-login' },
      ],
    },
    monitor: {
      kicker: 'SYS // TOTAL-SURVEILLANCE',
      text: '您已进入<<全监控>>领域，是否选择继续进入？',
      choices: [
        { label: '继续', to: 'purpose' },
        { label: '退出', special: 'quit' },
      ],
    },
    purpose: {
      kicker: 'SYS // INTENT',
      text: '您的目的是？',
      choices: [
        { label: '加入', to: 'oath' },
        { label: '买家', to: 'scan-then-login' },
      ],
    },
    oath: {
      kicker: 'SYS // LOYALTY',
      lines: [
        '神秘人会赞许你的勇气',
        '此地只需绝对的忠诚',
        '你，是否已准备好将忠诚献予Ta？',
      ],
      choices: [
        { label: '是', to: 'blood' },
        { label: '否', special: 'nope' },
      ],
    },
  };

  /* <<词>> 包起来的部分用红色高亮 */
  function parseRich(text) {
    const runs = [];
    const re = /<<(.+?)>>/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) runs.push({ t: text.slice(last, m.index), hl: false });
      runs.push({ t: m[1], hl: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) runs.push({ t: text.slice(last), hl: false });
    return runs;
  }

  function typeText(el, raw) {
    cancelAnimationFrame(dialog.typing);
    el.textContent = '';
    el.classList.add('is-typing');

    const runs = parseRich(raw);
    const spans = runs.map((run) => {
      const span = document.createElement('span');
      if (run.hl) span.className = 'hl';
      el.appendChild(span);
      return span;
    });
    const full = runs.map((run) => run.t);
    const total = full.reduce((sum, t) => sum + t.length, 0);

    const paint = (n) => {
      let left = n;
      spans.forEach((span, i) => {
        const take = Math.min(left, full[i].length);
        span.textContent = full[i].slice(0, take);
        left -= take;
      });
    };

    return new Promise((resolve) => {
      if (reduced) {
        paint(total);
        el.classList.remove('is-typing');
        resolve();
        return;
      }
      let shown = 0;
      const speed = 26;
      let last = performance.now();

      function step(now) {
        if (now - last >= speed) {
          const add = Math.max(1, Math.floor((now - last) / speed));
          shown = Math.min(total, shown + add);
          paint(shown);
          last = now;
        }
        if (shown < total) dialog.typing = requestAnimationFrame(step);
        else {
          el.classList.remove('is-typing');
          resolve();
        }
      }
      dialog.typing = requestAnimationFrame(step);
    });
  }

  /* 多行：一行一行淡入，间隔 0.5s */
  function showLines(el, lines) {
    cancelAnimationFrame(dialog.typing);
    el.textContent = '';
    el.classList.remove('is-typing');

    lines.forEach((text, i) => {
      const line = document.createElement('span');
      line.className = 'dl-line';
      line.textContent = text;
      line.style.animationDelay = `${i * 1500}ms`;
      el.appendChild(line);
    });

    const total = reduced ? 0 : (lines.length - 1) * 1500 + 700;
    return new Promise((resolve) => setTimeout(resolve, total));
  }

  async function showStep(key) {
    const step = STEPS[key];
    if (!step) return;

    dialog.box.classList.add('is-out');
    await wait(240);
    dialog.choices.innerHTML = '';
    dialog.kicker.textContent = step.kicker;
    dialog.box.classList.remove('is-out');

    if (step.lines) await showLines(dialog.text, step.lines);
    else await typeText(dialog.text, step.text);

    step.choices.forEach((choice, i) => {
      dialog.choices.appendChild(makeChoice(choice, i));
    });
  }

  function makeChoice(choice, index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.dataset.i = String(index + 1).padStart(2, '0');
    btn.textContent = choice.label;
    btn.style.animationDelay = `${index * 70}ms`;
    btn.addEventListener('click', () => onChoice(btn, choice));
    return btn;
  }

  function onChoice(btn, choice) {
    if (choice.special === 'quit') return onQuit(btn);
    if (choice.special === 'nope') return onNope(btn);
    if (choice.to === 'scan-then-login') return scanThenLogin();
    if (choice.to === 'blood') return enterBlood();
    if (STEPS[choice.to]) return showStep(choice.to);
  }

  function bump(btn) {
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
  }

  function onQuit(btn) {
    dialog.quitClicks++;
    bump(btn);

    if (dialog.quitClicks >= 3) {
      logEvent('exit_triple');
      btn.classList.add('is-danger');
      dialog.kicker.textContent = 'SYS // WARNING · 无法退出';
    }
    if (dialog.quitClicks >= 4) triggerBsod();
  }

  function onNope(btn) {
    dialog.nopeClicks++;
    if (dialog.nopeClicks === 1) {
      bump(btn);
      return;
    }
    btn.classList.add('is-leaving');
    setTimeout(() => btn.remove(), 520);
  }

  dialog.enter = () => showStep('first');

  /* ============================================================
     3. 血液 / DNA
     ============================================================ */

  const bloodCanvas = $('#bloodCanvas');
  const bloodHint = $('#bloodHint');
  const bloodPrompt = $('.blood-prompt');
  const blood = {
    ctx: null,
    state: null,
    drops: [],
    rings: [],
    splats: [],
    droplets: [],
    raf: 0,
    started: false,
  };

  {
    const { ctx, s } = fitCanvas(bloodCanvas);
    blood.ctx = ctx;
    blood.state = s;
    const ro = new ResizeObserver(() => {
      const fit = fitCanvas(bloodCanvas);
      blood.ctx = fit.ctx;
      blood.state = fit.s;
    });
    ro.observe(bloodCanvas);
  }

  function enterBlood() {
    go('blood');
    bloodPrompt.innerHTML = '请将<span class="hl">血液</span>滴入';
    bloodHint.textContent = '在黑暗中落下';
    bloodHint.style.opacity = '0.9';
    $('.blood-head').classList.remove('is-dim');
    $('#scan').classList.remove('is-on');
    blood.drops = [];
    blood.droplets = [];
    blood.rings = [];
    blood.splats = [];
    blood.ctx.clearRect(0, 0, blood.state.w, blood.state.h);
  }

  function bloodDrop(x, y) {
    const { state } = blood;
    const floor = state.h * 0.72;
    blood.drops.push({ x, y, vy: 0, floor, landed: false });
    bloodHint.style.opacity = '0';

    if (!blood.raf) blood.raf = requestAnimationFrame(bloodFrame);

    if (!blood.started) {
      blood.started = true;
      setTimeout(() => { if (currentScreen === 'blood') enterScan(); }, 1500);
    }
  }

  function bloodFrame(now) {
    const { ctx, state } = blood;
    const floor = state.h * 0.72;
    ctx.clearRect(0, 0, state.w, state.h);

    /* 滴落 */
    for (const d of blood.drops) {
      if (d.landed) continue;
      d.vy += 0.55;
      d.y += d.vy;
      if (d.y >= d.floor) {
        d.y = d.floor;
        d.landed = true;

        for (let i = 0; i < 4; i++) {
          blood.rings.push({ x: d.x, y: d.floor, start: now + i * 110, dur: 1500 + i * 340, max: 150 + i * 70 });
        }
        blood.splats.push({ x: d.x, y: d.floor, r: 0, max: 42 + Math.random() * 26, a: 0.72 });

        for (let i = 0; i < 9; i++) {
          const ang = (Math.random() - 0.5) * 2.2;
          const sp = 1.4 + Math.random() * 2.6;
          blood.droplets.push({
            x: d.x, y: d.floor,
            vx: Math.sin(ang) * sp * 2.4,
            vy: -Math.cos(ang) * sp * 3.2,
            life: 1,
          });
        }
      }
      ctx.beginPath();
      ctx.fillStyle = '#c1121f';
      ctx.arc(d.x, d.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,60,60,0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - 18);
      ctx.lineTo(d.x, d.y - 2);
      ctx.stroke();
    }

    /* 血迹 */
    for (const sp of blood.splats) {
      sp.r += (sp.max - sp.r) * 0.12;
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, sp.r);
      g.addColorStop(0, `rgba(150,10,20,${sp.a})`);
      g.addColorStop(0.55, `rgba(110,6,14,${sp.a * 0.62})`);
      g.addColorStop(1, 'rgba(60,0,8,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 溅起的液滴 */
    for (const p of blood.droplets) {
      if (p.life <= 0) continue;
      p.vy += 0.42;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.016;
      if (p.y > floor) p.life = 0;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#e01b24';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    blood.droplets = blood.droplets.filter((p) => p.life > 0);

    /* 涟漪 */
    let alive = false;
    blood.rings = blood.rings.filter((r) => {
      const t = (now - r.start) / r.dur;
      if (t > 1) return false;
      if (t < 0) { alive = true; return true; }
      alive = true;
      const rr = r.max * (1 - Math.pow(1 - t, 2.4));
      const a = (1 - t) * 0.7;
      ctx.strokeStyle = `rgba(255,70,70,${a})`;
      ctx.lineWidth = 1.6 * (1 - t) + 0.4;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rr, rr * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });

    const stillFalling = blood.drops.some((d) => !d.landed);
    if (alive || stillFalling || blood.rings.length || blood.droplets.length) {
      blood.raf = requestAnimationFrame(bloodFrame);
    } else {
      blood.raf = 0;
    }
  }

  bloodCanvas.addEventListener('pointerdown', (e) => {
    if (!screens.blood.classList.contains('is-active')) return;
    if ($('#scan').classList.contains('is-on')) return;
    bloodDrop(e.clientX, e.clientY);
  });

  async function enterScan(hintText) {
    if (hintText) bloodPrompt.textContent = hintText;
    setTimeout(() => $('.blood-head').classList.add('is-dim'), 700);
    $('#scan').classList.add('is-on');

    await runScan();
    go('register');
    const form = $('#registerForm');
    form.reset();
    $('#registerNote').textContent = '';
    form.querySelector('[name=name]')?.focus({ preventScroll: true });
  }

  function runScan() {
    return new Promise((resolve) => {
      const fill = $('#scanFill');
      const pct = $('#scanPct');
      const code = $('#scanCode');
      const hex = () => Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
      const dur = reduced ? 300 : 2200;
      const t0 = performance.now();

      function step(now) {
        const t = clamp((now - t0) / dur, 0, 1);
        const eased = t * t * (3 - 2 * t);
        fill.style.width = `${(eased * 100).toFixed(1)}%`;
        pct.textContent = `${Math.round(eased * 100)}%`;
        code.textContent = `SAMPLE ${hex()}·${hex()} 待检`;
        if (t < 1) requestAnimationFrame(step);
        else {
          code.textContent = 'SAMPLE 已归档 · MATCH 100%';
          setTimeout(resolve, 420);
        }
      }
      requestAnimationFrame(step);
    });
  }

  async function scanThenLogin() {
    go('blood');
    $('.blood-head').classList.remove('is-dim');
    bloodPrompt.textContent = '好的，DNA 样本检测中';
    bloodHint.textContent = '请稍候';
    bloodHint.style.opacity = '0.6';
    $('#scan').classList.add('is-on');

    await runScan();
    go('login');
    const form = $('#loginForm');
    form.reset();
    $('#loginNote').textContent = '';
    $('#loginSub').textContent = '样本已归档，请验证身份';
    form.querySelector('[name=name]')?.focus({ preventScroll: true });
  }

  /* ============================================================
     4/5. 身份登记 & 特工认证
     ============================================================ */

  const agent = { name: '', sex: '男', age: '', height: '', weight: '', dept: '', codename: '' };

  /* 数字输入：过滤非数字 */
  document
    .querySelectorAll('#registerForm [inputmode=numeric], #loginForm [inputmode=numeric]')
    .forEach((el) => {
      el.addEventListener('input', () => {
        const clean = el.value.replace(/\D+/g, '');
        if (clean !== el.value) el.value = clean;
      });
    });

  /* 性别切换 */
  const segBtns = document.querySelectorAll('#registerForm .seg__btn');
  segBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      segBtns.forEach((b) => b.classList.toggle('is-on', b === btn));
      agent.sex = btn.dataset.sex;
    });
  });

  /* 部门下拉 */
  const deptBtn = $('#deptBtn');
  const deptList = $('#deptList');
  const deptValue = $('#deptValue');

  function openDept(open) {
    deptList.hidden = !open;
    deptBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const current = deptList.querySelector('.is-sel');
      (current || deptList.firstElementChild)?.scrollIntoView({ block: 'nearest' });
    }
  }

  deptBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDept(deptList.hidden);
  });

  deptList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    deptList.querySelectorAll('li').forEach((x) => x.classList.toggle('is-sel', x === li));
    deptValue.textContent = li.dataset.v;
    deptValue.classList.remove('is-empty');
    $('#loginForm').dept.value = li.dataset.v;
    agent.dept = li.dataset.v;
    openDept(false);
    deptBtn.focus({ preventScroll: true });
  });

  document.addEventListener('click', (e) => {
    if (!deptList.hidden && !e.target.closest('.fld--select')) openDept(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !deptList.hidden) {
      openDept(false);
      deptBtn.focus({ preventScroll: true });
    }
  });

  /* 顶栏时钟 */
  const clocks = document.querySelectorAll('.js-clock');
  const pad2 = (n) => String(n).padStart(2, '0');
  function tickClock() {
    const d = new Date();
    const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    clocks.forEach((el) => {
      el.textContent = t;
    });
  }
  tickClock();
  setInterval(tickClock, 1000);

  function resetDept() {
    deptList.querySelectorAll('li').forEach((x) => x.classList.remove('is-sel'));
    deptValue.textContent = '选择所属部门';
    deptValue.classList.add('is-empty');
    $('#loginForm').dept.value = '';
    agent.dept = '';
    openDept(false);
  }

  function fillLogin(data) {
    const form = $('#loginForm');
    form.reset();
    resetDept();
    form.name.value = data.name || '';
    form.age.value = data.age || '';
    form.height.value = data.height || '';
    form.weight.value = data.weight || '';
    if (data.codename) form.codename.value = String(data.codename).replace(/^SNK-/, '');
    $('#loginNote').textContent = '';
    $('#loginNote').classList.remove('is-on', 'is-ok');
    $('#loginSub').textContent = '登记代号与所属部门，接入蛇宿安全信道。';
    (form.name.value ? form.codename : form.name).focus({ preventScroll: true });
  }

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.name.value.trim();
    const password = form.password.value.trim();
    const note = $('#registerNote');
    const say = (text, okMode = false) => {
      note.textContent = text;
      note.classList.add('is-on');
      note.classList.toggle('is-ok', okMode);
    };

    if (!name) {
      say('// 档案不完整：姓名不可为空');
      form.name.focus({ preventScroll: true });
      return;
    }
    if (password.length < 4) {
      say('// 密钥至少 4 位');
      form.password.focus({ preventScroll: true });
      return;
    }

    agent.name = name;
    agent.sex = document.querySelector('#registerForm .seg__btn.is-on')?.dataset.sex || '男';
    agent.age = form.age.value.trim();
    agent.height = form.height.value.trim();
    agent.weight = form.weight.value.trim();

    if (!API.live) {
      say('// 档案已归档 · 本地演示模式（未连接后端）', true);
      setTimeout(() => { go('login'); fillLogin(agent); }, 900);
      return;
    }

    say('// 正在写入档案库…');
    const btn = form.querySelector('.btn-auth');
    btn.disabled = true;
    try {
      const d = await callApi('/register', {
        name,
        password,
        sex: agent.sex,
        age: agent.age,
        height: agent.height,
        weight: agent.weight,
      });
      const a = d.agent || {};
      agent.codename = a.codename || '';
      agent.dept = a.dept_name || a.dept_code || '';
      say(`// 档案已归档 · 代号 ${a.codename || '已分配'} · 正在跳转认证`, true);
      setTimeout(() => { go('login'); fillLogin(agent); }, 1200);
    } catch (err) {
      say('// 登记失败：' + (err.message || '未知错误'));
    } finally {
      btn.disabled = false;
    }
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.name.value.trim();
    const num = form.codename.value.trim();
    const password = form.password.value.trim();
    const note = $('#loginNote');
    const say = (text, okMode = false) => {
      note.textContent = text;
      note.classList.add('is-on');
      note.classList.toggle('is-ok', okMode);
    };

    if (!name || !num || !form.dept.value) {
      say('// 认证失败：姓名、代号、部门均不可为空');
      if (!name) form.name.focus({ preventScroll: true });
      else if (!num) form.codename.focus({ preventScroll: true });
      else deptBtn.focus({ preventScroll: true });
      return;
    }
    if (password.length < 4) {
      say('// 认证失败：密钥至少 4 位');
      form.password.focus({ preventScroll: true });
      return;
    }

    const codename = `SNK-${num.padStart(4, '0')}`;
    agent.name = name;
    agent.codename = codename;
    agent.dept = form.dept.value;
    agent.age = form.age.value.trim();
    agent.height = form.height.value.trim();
    agent.weight = form.weight.value.trim();

    if (!API.live) {
      say('// 认证通过 · 本地演示模式（未连接后端）', true);
      setTimeout(() => enterConsole(agent), 650);
      return;
    }

    say('// 正在校验密钥…');
    const btn = form.querySelector('.btn-auth');
    btn.disabled = true;
    try {
      const d = await callApi('/login', { codename, password });
      const a = d.agent || {};
      API.agent = a;
      say('// 认证通过 · 正在接入', true);
      setTimeout(() => {
        enterConsole({
          name: a.name || name,
          codename: a.codename || codename,
          dept: a.dept_name || a.dept_code || form.dept.value,
          age: a.age ?? agent.age,
          height: a.height_cm ?? agent.height,
          weight: a.weight_kg ?? agent.weight,
          greeting: d.greeting || '',
        });
      }, 700);
    } catch (err) {
      say('// ' + (err.message || '认证失败'));
    } finally {
      btn.disabled = false;
    }
  });

  /* ============================================================
     6. 控制台
     ============================================================ */

  /* 助手每次登录只抛一句，四句轮换（首次随机起点） */
  const QUESTIONS = [
    '今天过得如何？',
    'SNK已为您检测身体各项特征',
    '请记得提交任务',
    '今日事项已全部完成',
  ];

  function nextQuestion() {
    let idx;
    try {
      const raw = localStorage.getItem('snk.qidx');
      idx = raw === null || raw === ''
        ? Math.floor(Math.random() * QUESTIONS.length)
        : (parseInt(raw, 10) + 1) % QUESTIONS.length;
      localStorage.setItem('snk.qidx', String(idx));
    } catch (_) {
      idx = Math.floor(Math.random() * QUESTIONS.length);
    }
    return QUESTIONS[idx];
  }

  function enterConsole(who) {
    const name = typeof who === 'string' ? who : who.codename || who.name || 'AGENT';
    const dept = typeof who === 'string' ? '' : who.dept || '';

    const greeting = $('#greeting');
    greeting.textContent = '';

    const strong = document.createElement('b');
    strong.textContent = name;
    strong.style.color = 'var(--blue-hi)';
    strong.style.fontWeight = '400';

    const ask = document.createElement('span');
    ask.className = 'ask';
    ask.textContent = who && who.greeting ? who.greeting : nextQuestion();

    greeting.append(strong, document.createTextNode(' 特工，'), ask);
    $('#roomName').textContent = name;

    const foot = $('.side-foot');
    if (foot) foot.textContent = dept ? `全监控领域 · ${dept}` : '全监控领域 · DEMO';

    go('console');
    hydrateConsole();
  }

  /* ---------------- 控制台数据：后端有就换成真数据，没有就保持示例 ---------------- */

  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const EVENT_LABEL = {
    login: '认证通过',
    register: '档案归档',
    logout: '断开会话',
    blood: '血液采样完成',
    dna: 'DNA 比对完成',
    join: '加入申请',
    buyer: '买家通道',
    exit_triple: '退出尝试 ×3',
    bsod: '全监控锁定',
    visit: '新设备接入',
    buy: '购买申请',
  };

  const STATE_LABEL = { open: '可申请', locked: '未解锁', closed: '已售罄', pending: '审核中' };

  function clockOf(ts) {
    const t = Number(ts);
    if (!t) return '--:--';
    const d = new Date(t * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function hydrateConsole() {
    if (!API.live) return;

    const buyView = document.querySelector('.view[data-view="buy"]');
    const logList = buyView ? buyView.querySelector('.log') : null;
    const statBox = buyView ? buyView.querySelector('.stats') : null;

    const [prod, st, lg] = await Promise.allSettled([
      callApi('/products'),
      callApi('/stats'),
      callApi('/logs'),
    ]);

    if (prod.status === 'fulfilled' && buyView) {
      const items = prod.value.items || [];
      if (items.length) {
        buyView.querySelector('.list').innerHTML = items
          .map(
            (p) => `<li class="row">
          <span class="row-id">${esc(p.code)}</span>
          <span class="row-name">${esc(p.name)}<em>${esc(p.category || '')}${
              p.rarity ? ' · ' + esc(p.rarity) : ''
            }</em></span>
          <span class="row-state">${esc(STATE_LABEL[p.status] || p.status || '—')}</span>
        </li>`
          )
          .join('');
        const head = buyView.querySelector('.view-head p');
        if (head) head.innerHTML = `可用配额 <b>03</b> · 本期开放 ${items.length} 项`;
      }
    }

    if (st.status === 'fulfilled' && statBox) {
      const entries = Object.values(st.value.stats || {}).filter((x) => x && x.label);
      if (entries.length) {
        statBox.innerHTML = entries
          .map(
            (x) =>
              `<div class="stat"><b>${esc(String(x.value).padStart(2, '0'))}</b><span>${esc(x.label)}</span></div>`
          )
          .join('');
      }
    }

    if (lg.status === 'fulfilled' && logList) {
      const items = (lg.value.items || []).slice(0, 5);
      if (items.length) {
        logList.innerHTML = items
          .map(
            (l) =>
              `<li><i>${clockOf(l.created_at)}</i>${esc(EVENT_LABEL[l.event] || l.event)}${
                l.codename ? ' · ' + esc(l.codename) : ''
              }</li>`
          )
          .join('');
      }
    }

    const note = buyView ? buyView.querySelector('.view-note') : null;
    if (note) note.textContent = 'LIVE // 数据来自档案库';
  }

  /* 埋点：只在后端可用时上报，失败静默，不影响演示 */
  function logEvent(name, meta) {
    if (!API.live) return;
    callApi('/event', { event: name, meta: meta || null }, 4000).catch(() => {});
  }

  $('#sideNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    const view = btn.dataset.view;

    $('#sideNav').querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('is-active', el === btn);
    });
    document.querySelectorAll('.view').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.view === view);
    });
  });

    logEvent('bsod');
  /* ============================================================
     蓝屏
     ============================================================ */

  const bsod = $('#bsod');

  function triggerBsod() {
    bsod.classList.add('is-on');

    /* 2.4s 后进入「锁定中」；再过 2s 画面闪一下，然后浮出红色「您的位置」 */
    setTimeout(() => bsod.classList.add('is-locked'), 2400);
    setTimeout(() => {
      bsod.classList.add('is-flash');
      setTimeout(() => bsod.classList.remove('is-flash'), 620);
    }, 4400);
    setTimeout(() => {
      const lock = document.getElementById('bsodLock');
      if (lock) lock.innerHTML = '锁定<span class="lock-red">您的位置</span>中';
      bsod.classList.add('is-tracked');
      startCoord();
    }, 4750);
  }

  /* 定位上传：先滚一串随机坐标，再锁定读数 */
  let coordTimer = 0;

  function startCoord() {
    const el = document.getElementById('bsodCoord');
    if (!el) return;
    clearInterval(coordTimer);

    const lat = (18 + Math.random() * 35).toFixed(4);
    const lon = (95 + Math.random() * 30).toFixed(4);
    let tick = 0;

    coordTimer = setInterval(() => {
      tick += 1;
      if (tick > 16) {
        clearInterval(coordTimer);
        el.textContent = `坐标 ${lat}°N · ${lon}°E`;
        el.classList.add('is-locked');
        return;
      }
      const a = (Math.random() * 90).toFixed(4);
      const b = (Math.random() * 180).toFixed(4);
      el.textContent = `坐标 ${a}°N · ${b}°E`;
    }, 85);
  }

  $('#bsodReset').addEventListener('click', () => window.location.reload());

  /* 终端时钟 */
  setInterval(() => {
    if (currentScreen !== 'dialog') return;
    const clock = document.getElementById('termClock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }, 1000);

  /* 认证屏背景装饰：科幻机能风（网格 / 光斑 / 扫描 / 荧光点 / 刻度 / 四角括号） */
  function mountAuthDeco() {
    document.querySelectorAll(".screen--auth .auth").forEach((box) => {
      if (box.querySelector(".auth-deco")) return;
      const deco = document.createElement("div");
      deco.className = "auth-deco";
      deco.setAttribute("aria-hidden", "true");
      deco.innerHTML =
        '<span class="auth-deco__grid"></span>' +
        '<span class="auth-deco__blob auth-deco__blob--a"></span>' +
        '<span class="auth-deco__blob auth-deco__blob--b"></span>' +
        '<span class="auth-deco__scan"></span>' +
        '<span class="auth-deco__dots">' + "<i></i>".repeat(12) + "</span>" +
        '<span class="auth-deco__ticks"></span>' +
        ["tl", "tr", "bl", "br"].map((k) => '<span class="auth-deco__corner auth-deco__corner--' + k + '"></span>').join("");
      box.insertBefore(deco, box.firstChild);
    });
  }
  mountAuthDeco();

  /* 启动即探测后端：连上就走真实登录，连不上自动演示模式 */
  probeApi();

  /* 自检用：只读状态 */
  window.__demo = {
    get screen() { return currentScreen; },
    get reveal() { return intro.progress; },
    get ready() { return intro.ready; },
    get quitClicks() { return dialog.quitClicks; },
    get live() { return API.live; },
    get nopeGone() { return !document.querySelector('.choice[data-i="02"]'); },
  };
})();