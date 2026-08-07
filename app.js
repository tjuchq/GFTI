/* ==========================================================
 * 古风TI · 听雨楼雅集 —— 全部逻辑（纯前端，无后端接口）
 * ========================================================== */
(function () {
  'use strict';

  var D = window.GFTI_DATA;
  var $ = function (id) { return document.getElementById(id); };
  var LS_SONGS = 'gfti_songs_override_v1';

  /* ---------- 歌曲参数：支持后台覆盖 ---------- */
  var ORIGIN_SONGS = D.songs.map(function (s) { return { name: s.name, p: s.p.slice() }; });

  function loadSongs() {
    try {
      var raw = localStorage.getItem(LS_SONGS);
      if (!raw) return ORIGIN_SONGS.map(function (s) { return { name: s.name, p: s.p.slice() }; });
      var o = JSON.parse(raw);
      return ORIGIN_SONGS.map(function (s) {
        var p = o[s.name];
        return { name: s.name, p: (p && p.length === 5) ? p.slice() : s.p.slice() };
      });
    } catch (e) {
      return ORIGIN_SONGS.map(function (s) { return { name: s.name, p: s.p.slice() }; });
    }
  }
  var SONGS = loadSongs();

  /* ---------- 核心算法 ---------- */
  // 五轴得分：每道题选项的主/副维度分值，直接累加到对应轴的「正极」得分上
  // 主维度档位 16/11/5/0，副维度档位 9/6/3/0，每轴 4 主 + 4 副 = 满分 100
  function scoreAxes(answers) {
    var v = [0, 0, 0, 0, 0];
    for (var i = 0; i < D.questions.length; i++) {
      var key = answers[i];
      if (key == null) continue;
      var opt = null, opts = D.questions[i].options;
      for (var j = 0; j < opts.length; j++) if (opts[j].key === key) opt = opts[j];
      if (!opt) continue;
      v[opt.mainAxis] += opt.main;
      v[opt.subAxis] += opt.sub;
    }
      // 第一维度：开方 × 10 取整，拉高低分段
      v[0] = Math.floor(Math.sqrt(v[0]) * 10);
    return v;
  }

  // 距离 R = 欧氏距离 √(Σ(Ui − Si)²)
  function distance(u, s) {
    var r = 0;
    for (var i = 0; i < 5; i++) {
      var d = u[i] - s[i];
      r += d * d;
    }
    return Math.sqrt(r);
  }

  // 相似度 k = 2500 / (R² + 1) ，R=50 时为 100%，随距离增大渐近于 0%
  function similarity(R) {
    var raw = 2500 / (R * R + 1);
    return Math.round(raw * 100) / 100;
  }

  function match(u, topN) {
    var list = SONGS.map(function (s) {
      var R = distance(u, s.p);
      return { name: s.name, dist: Math.round(R * 100) / 100, sim: similarity(R) };
    });
    list.sort(function (a, b) { return a.dist - b.dist || a.name.localeCompare(b.name, 'zh'); });
    return list.slice(0, topN || 5);
  }

  /* ---------- 状态 ---------- */
  var state = { idx: 0, answers: [], order: [], result: null };

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function resetTest() {
    state.idx = 0;
    state.answers = new Array(D.questions.length).fill(null);
    // 每题四个选项的展示顺序随机打乱一次，返回修改时顺序保持稳定
    state.order = D.questions.map(function (q) {
      return shuffle(q.options.map(function (_, i) { return i; }));
    });
    state.result = null;
  }

  /* ---------- 场景切换 ---------- */
  function show(id) {
    ['scene-intro', 'scene-quiz', 'scene-result'].forEach(function (s) {
      $(s).classList.toggle('on', s === id);
    });
    $('admin').classList.remove('on');
    window.scrollTo({ top: 0, behavior: 'instant' in document.body.style ? 'instant' : 'auto' });
  }

  /* ---------- 墨迹晕染过渡 ---------- */
  var veil = $('veil'), veilBusy = false;
  var autoTimer = null;   // 选中选项后的自动跳转计时器
  function inkTransition(cb) {
    if (veilBusy) { cb(); return; }
    veilBusy = true;
    veil.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var b = document.createElement('div');
      b.className = 'blot';
      var size = 130 + Math.random() * 190;
      b.style.width = size + 'px';
      b.style.height = size + 'px';
      b.style.left = (Math.random() * 100) + '%';
      b.style.top = (Math.random() * 100) + '%';
      b.style.marginLeft = (-size / 2) + 'px';
      b.style.marginTop = (-size / 2) + 'px';
      b.style.animationDelay = (Math.random() * 0.13) + 's';
      veil.appendChild(b);
    }
    veil.classList.remove('run');
    void veil.offsetWidth;
    veil.classList.add('run');
    setTimeout(function () { cb(); }, 330);
    setTimeout(function () { veil.classList.remove('run'); veilBusy = false; }, 1050);
  }

  /* ---------- 首屏 ---------- */
  var STORY = [
    ['p', '暮春三月，你正在琴坊中抚琴，一封无署名的信函被风送入窗内。展开一看，只有一行小字——'],
    ['verse', '「听雨楼中曲未终，待君来续。」'],
    ['p', '你决定踏上旅途，赴这场百年一遇的古曲雅集。'],
    ['p', '此去途中种种抉择，无关平日性情。且将尘世身份暂寄门外，化身赴约之人。'],
    ['p', '不必思量现实当如何，亦不必揣度怎样选才风雅。但凭此刻心意，随境而择即可。'],
    ['hint', '共贰拾题 · 约需五分钟']
  ];
  (function renderStory() {
    var box = $('story');
    STORY.forEach(function (it, i) {
      var p = document.createElement('p');
      if (it[0] !== 'p') p.className = it[0];
      p.textContent = it[1];
      p.style.animation = 'fadeUp .9s both';
      p.style.animationDelay = (0.15 + i * 0.16) + 's';
      box.appendChild(p);
    });
  })();

  /* ---------- 答题 ---------- */
  function renderQuestion() {
    var i = state.idx, q = D.questions[i];
    $('counter').innerHTML = '第<b>' + q.no + '</b>题 / 共贰拾题';
    $('track').style.width = ((i + 1) / D.questions.length * 100) + '%';
    $('qtitle').innerHTML = '第' + q.no + '题<em> · </em>' + q.title;
    $('qstem').textContent = q.stem;

    var box = $('opts');
    box.innerHTML = '';
    state.order[i].forEach(function (oi, n) {
      var o = q.options[oi];
      var btn = document.createElement('button');
      btn.className = 'opt' + (state.answers[i] === o.key ? ' sel' : '');
      btn.textContent = o.text;           // 不显示 A/B/C/D 字母
      btn.dataset.key = o.key;
      btn.style.animation = 'fadeUp .5s both';
      btn.style.animationDelay = (0.04 + n * 0.06) + 's';
      btn.addEventListener('click', function () {
        state.answers[i] = o.key;
        Array.prototype.forEach.call(box.children, function (c) { c.classList.remove('sel'); });
        btn.classList.add('sel');
        $('btn-next').disabled = false;
        // 自动跳转下一题（末题不自动跳，保留手动点「览结果」）
        if (autoTimer) clearTimeout(autoTimer);
        if (state.idx < D.questions.length - 1) {
          autoTimer = setTimeout(function () { go(1); }, 480);
        }
      });
      box.appendChild(btn);
    });

    $('btn-prev').disabled = (i === 0);
    $('btn-next').disabled = (state.answers[i] == null);
    $('btn-next').textContent = (i === D.questions.length - 1) ? '览 结 果' : '下一题';
  }

  function go(delta) {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    var ni = state.idx + delta;
    if (ni < 0) return;
    if (ni >= D.questions.length) { finish(); return; }
    inkTransition(function () { state.idx = ni; renderQuestion(); window.scrollTo(0, 0); });
  }

  /* ---------- 结果 ---------- */
  function finish() {
    var u = scoreAxes(state.answers);
    state.result = { u: u, top: match(u, 5) };
    inkTransition(function () { show('scene-result'); renderResult(); });
  }

  function renderResult() {
    var u = state.result.u, top = state.result.top;

    $('tagline').textContent = D.axes.map(function (a, i) {
      return u[i] >= 50 ? a.pos : a.neg;
    }).join(' · ');

    var box = $('axes');
    box.innerHTML = '';
    D.axes.forEach(function (a, i) {
      var pos = u[i], neg = 100 - pos;
      var el = document.createElement('div');
      el.className = 'axis';
      el.innerHTML =
        '<div class="lab">' +
          '<span class="l ' + (pos >= neg ? 'hi' : 'dim') + '">' + a.pos + '<i>' + pos + '%</i></span>' +
          '<span class="r ' + (neg > pos ? 'hi' : 'dim') + '"><i style="margin:0 6px 0 0">' + neg + '%</i>' + a.neg + '</span>' +
        '</div>' +
        '<div class="bar"><span class="mid"></span><i></i></div>';
      box.appendChild(el);
      setTimeout(function () { el.querySelector('.bar i').style.width = pos + '%'; }, 120 + i * 110);
    });

    var sb = $('songs');
    sb.innerHTML = '';
    var CN = ['壹', '贰', '叁', '肆', '伍'];
    top.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'song';
      d.style.animationDelay = (0.5 + i * 0.1) + 's';
      // 大于 100% 的按 100% 展示；展示保留整数
      var showSim = Math.min(100, Math.round(s.sim));
      d.innerHTML = '<div class="rk">' + CN[i] + '</div>' +
                    '<div class="nm">' + s.name + '</div>' +
                    '<div class="sim">契合 <b>' + showSim + '</b>%</div>';
      sb.appendChild(d);
    });
  }

  /* ---------- 分享卡片 ---------- */
  function drawCard() {
    var W = 750, H = 1230, R = 2;
    var cv = $('card');
    cv.width = W * R; cv.height = H * R;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var c = cv.getContext('2d');
    c.scale(R, R);

    var serif = '"Songti SC","STSong","Source Han Serif SC",SimSun,serif';
    var kai = '"STKaiti","KaiTi","Kaiti SC",serif';

    // 宣纸底
    c.fillStyle = '#f2e9da'; c.fillRect(0, 0, W, H);
    [[0.18, 0.10, 300, 'rgba(160,140,110,.20)'], [0.86, 0.24, 340, 'rgba(140,120,95,.16)'],
     [0.40, 0.86, 380, 'rgba(150,130,100,.16)'], [0.92, 0.70, 260, 'rgba(150,130,100,.12)']]
      .forEach(function (g) {
        var rg = c.createRadialGradient(W * g[0], H * g[1], 0, W * g[0], H * g[1], g[2]);
        rg.addColorStop(0, g[3]); rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = rg; c.fillRect(0, 0, W, H);
      });
    // 细边框
    c.strokeStyle = 'rgba(42,37,33,.28)'; c.lineWidth = 1;
    c.strokeRect(26.5, 26.5, W - 53, H - 53);
    c.strokeStyle = 'rgba(42,37,33,.13)';
    c.strokeRect(35.5, 35.5, W - 71, H - 71);

    var cx = W / 2;
    c.textAlign = 'center'; c.fillStyle = '#9b9182';
    c.font = '17px ' + serif;
    c.fillText('古 风 T I  ·  听 雨 楼 雅 集', cx, 100);

    c.fillStyle = '#5a5249'; c.font = '46px ' + kai;
    c.fillText('你 的 古 风 气 韵', cx, 168);

    c.strokeStyle = 'rgba(42,37,33,.2)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - 60, 192); c.lineTo(cx + 60, 192); c.stroke();

    var u = state.result.u;
    c.fillStyle = '#9e3d32'; c.font = '20px ' + kai;
    c.fillText(D.axes.map(function (a, i) { return u[i] >= 50 ? a.pos : a.neg; }).join(' · '), cx, 230);

    // 五轴
    var y = 300, L = 70, RW = W - 140;
    c.textAlign = 'left'; c.fillStyle = '#9b9182'; c.font = '15px ' + serif;
    c.fillText('五 维 审 美', L, y - 26);
    c.strokeStyle = 'rgba(42,37,33,.16)';
    c.beginPath(); c.moveTo(L + 100, y - 31); c.lineTo(L + RW, y - 31); c.stroke();

    D.axes.forEach(function (a, i) {
      var yy = y + i * 76, pos = u[i], neg = 100 - pos;
      c.font = '17px ' + serif;
      c.textAlign = 'left';
      c.fillStyle = pos >= neg ? '#5a5249' : '#c3b9a9';
      c.fillText(a.pos, L, yy);
      c.font = '14px ' + serif;
      c.fillText(pos + '%', L + c.measureText(a.pos).width + 42, yy);

      c.textAlign = 'right';
      c.font = '17px ' + serif;
      c.fillStyle = neg > pos ? '#5a5249' : '#c3b9a9';
      c.fillText(a.neg, L + RW, yy);
      c.font = '14px ' + serif;
      c.fillText(neg + '%', L + RW - c.measureText(a.neg).width - 42, yy);

      var by = yy + 16;
      c.fillStyle = 'rgba(42,37,33,.075)'; c.fillRect(L, by, RW, 10);
      var gr = c.createLinearGradient(L, 0, L + RW, 0);
      gr.addColorStop(0, '#8c8270'); gr.addColorStop(1, '#5a5249');
      c.fillStyle = gr; c.fillRect(L, by, RW * pos / 100, 10);
      c.fillStyle = 'rgba(42,37,33,.22)'; c.fillRect(L + RW / 2, by - 3, 1, 16);
    });

    // 歌曲
    var sy = y + 5 * 76 + 44;
    c.textAlign = 'left'; c.fillStyle = '#9b9182'; c.font = '15px ' + serif;
    c.fillText('最 契 合 之 曲', L, sy);
    c.strokeStyle = 'rgba(42,37,33,.16)';
    c.beginPath(); c.moveTo(L + 118, sy - 5); c.lineTo(L + RW, sy - 5); c.stroke();

    var CN = ['壹', '贰', '叁', '肆', '伍'];
    state.result.top.forEach(function (s, i) {
      var yy = sy + 46 + i * 52;
      c.fillStyle = i === 0 ? '#9e3d32' : 'rgba(255,253,247,.7)';
      c.beginPath(); c.arc(L + 15, yy - 6, 15, 0, Math.PI * 2); c.fill();
      if (i !== 0) { c.strokeStyle = 'rgba(42,37,33,.2)'; c.lineWidth = 1; c.stroke(); }
      c.textAlign = 'center'; c.font = '15px ' + kai;
      c.fillStyle = i === 0 ? '#fbf3e6' : '#9b9182';
      c.fillText(CN[i], L + 15, yy);

      c.textAlign = 'left'; c.font = '22px ' + serif; c.fillStyle = '#5a5249';
      c.fillText(s.name, L + 46, yy);

      c.textAlign = 'right';
      var pct = Math.min(100, Math.round(s.sim));
      c.font = '13px ' + serif; c.fillStyle = '#9b9182';
      c.fillText('%', L + RW, yy);
      c.font = '25px ' + kai; c.fillStyle = '#9e3d32';
      c.fillText(String(pct), L + RW - 15, yy);
      c.font = '13px ' + serif; c.fillStyle = '#9b9182';
      c.textAlign = 'right';
      c.fillText('契合', L + RW - 15 - c.measureText(String(pct)).width - 44, yy);

      c.strokeStyle = 'rgba(42,37,33,.08)';
      c.beginPath(); c.moveTo(L, yy + 20); c.lineTo(L + RW, yy + 20); c.stroke();
    });

    // 印章
    var sx = W - 128, sty = H - 158;
    c.fillStyle = '#9e3d32';
    c.beginPath();
    if (c.roundRect) { c.roundRect(sx, sty, 80, 80, 6); } else { c.rect(sx, sty, 80, 80); }
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.5;
    c.strokeRect(sx + 6, sty + 6, 68, 68);
    c.fillStyle = '#fbf3e6'; c.textAlign = 'center'; c.font = '25px ' + kai;
    c.fillText('听雨', sx + 40, sty + 38);
    c.fillText('楼记', sx + 40, sty + 68);

    c.textAlign = 'left'; c.fillStyle = '#c3b9a9'; c.font = '13px ' + serif;
    c.fillText('二十问 · 五维 · 百曲', L, H - 128);
    c.fillStyle = '#9b9182'; c.font = 'bold 16px ' + serif;
    c.fillText('结果仅供娱乐参考', L, H - 100);
  }

  /* ---------- 后台参数面板 ---------- */
  function renderAdmin() {
    var t = $('ad-table');
    var head = '<tr><th style="width:26px">#</th><th style="text-align:left">歌名图鉴</th>' +
      D.axes.map(function (a) { return '<th>' + a.pos + '</th>'; }).join('') + '</tr>';
    var rows = SONGS.map(function (s, i) {
      return '<tr><td>' + (i + 1) + '</td><td class="n">' + s.name + '</td>' +
        s.p.map(function (v, k) {
          return '<td><input type="number" min="0" max="100" step="1" value="' + v +
                 '" data-i="' + i + '" data-k="' + k + '"></td>';
        }).join('') + '</tr>';
    }).join('');
    t.innerHTML = head + rows;

    t.addEventListener('input', function (e) {
      var el = e.target;
      if (el.tagName !== 'INPUT') return;
      var v = parseInt(el.value, 10);
      var ok = !isNaN(v) && v >= 0 && v <= 100;
      el.classList.toggle('bad', !ok);
      if (!ok) { $('ad-msg').textContent = '数值须为 0~100 的整数'; return; }
      SONGS[+el.dataset.i].p[+el.dataset.k] = v;
      saveOverride();
      $('ad-msg').textContent = '已保存到本机 · ' + new Date().toLocaleTimeString('zh-CN');
    });
  }

  function saveOverride() {
    var o = {};
    SONGS.forEach(function (s, i) {
      if (s.p.join() !== ORIGIN_SONGS[i].p.join()) o[s.name] = s.p.slice();
    });
    try { localStorage.setItem(LS_SONGS, JSON.stringify(o)); } catch (e) {}
  }

  function exportDataJs() {
    var payload = {
      axes: D.axes,
      questions: D.questions,
      songs: SONGS.map(function (s) { return { name: s.name, p: s.p.slice() }; }),
      selfTest: D.selfTest
    };
    var js = '/* ==========================================================\n' +
      ' * 古风TI · 听雨楼雅集 —— 数据文件（后台可直接修改）\n' +
      ' * 本文件由参数后台于 ' + new Date().toLocaleString('zh-CN') + ' 导出。\n' +
      ' * ========================================================== */\n' +
      'window.GFTI_DATA = ' + JSON.stringify(payload, null, 1) + ';\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([js], { type: 'text/javascript;charset=utf-8' }));
    a.download = 'data.js';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    $('ad-msg').textContent = '已导出 data.js，替换项目同名文件即正式生效';
  }

  /* ---------- 事件绑定 ---------- */
  $('btn-start').addEventListener('click', function () {
    resetTest();
    inkTransition(function () { show('scene-quiz'); renderQuestion(); });
  });
  $('btn-prev').addEventListener('click', function () { go(-1); });
  $('btn-next').addEventListener('click', function () { go(1); });
  $('btn-quit').addEventListener('click', function () {
    if (!confirm('确定要放弃当前作答，回到首页吗？')) return;
    inkTransition(function () { show('scene-intro'); });
  });
  $('btn-retry').addEventListener('click', function () {
    resetTest();
    inkTransition(function () { show('scene-intro'); });
  });
  $('btn-share').addEventListener('click', function () {
    drawCard();
    // 微信/QQ 内置浏览器不支持 a.download 程序化下载，改用真实 <img> + 长按保存
    var ua = navigator.userAgent.toLowerCase();
    var wx = /micromessenger/.test(ua) || / qq\//.test(ua) || /mqqbrowser/.test(ua);
    if (wx) {
      $('card-img').src = $('card').toDataURL('image/png');
      $('share').classList.add('wx');
    } else {
      $('share').classList.remove('wx');
    }
    $('share').classList.add('on');
  });
  $('sh-close').addEventListener('click', function () { $('share').classList.remove('on'); });
  $('sh-save').addEventListener('click', function () {
    var a = document.createElement('a');
    a.download = '古风TI-听雨楼雅集.png';
    a.href = $('card').toDataURL('image/png');
    a.click();
  });
  $('ad-export').addEventListener('click', exportDataJs);
  $('ad-reset').addEventListener('click', function () {
    if (!confirm('还原为 data.js 中的原始参数？本机所有修改将被清除。')) return;
    localStorage.removeItem(LS_SONGS);
    SONGS = loadSongs();
    renderAdmin();
    $('ad-msg').textContent = '已还原为原始参数';
  });
  $('ad-back').addEventListener('click', function () {
    location.href = location.pathname;
  });
  document.addEventListener('keydown', function (e) {
    if (!$('scene-quiz').classList.contains('on')) return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight' && !$('btn-next').disabled) go(1);
  });

  /* ---------- 启动 ---------- */
  resetTest();
  var qs = new URLSearchParams(location.search);

  if (qs.get('admin') === '1') {
    ['scene-intro', 'scene-quiz', 'scene-result'].forEach(function (s) { $(s).classList.remove('on'); });
    $('admin').classList.add('on');
    renderAdmin();
  }

  /* 内测自检：index.html?selftest=1 —— 用 Excel 示例向量校验匹配结果 */
  if (qs.get('selftest') === '1') {
    var u = D.selfTest.userVector;
    var got = match(u, 5).map(function (s) { return s.name; });
    var pass = got.join('|') === D.selfTest.top5.join('|');
    var detail = match(u, 5).map(function (s) {
      return s.name + ' 距离' + s.dist.toFixed(2) + ' 相似度' + s.sim.toFixed(2) + '%';
    });
    // 单轴极值：逐轴构造「把该轴推到极限」的作答，验证轴满分 100 / 最低 0
    function contrib(opt, ax) {
      return (opt.mainAxis === ax ? opt.main : 0) + (opt.subAxis === ax ? opt.sub : 0);
    }
    function extreme(ax, wantMax) {
      var ans = D.questions.map(function (q) {
        return q.options.slice().sort(function (a, b) {
          return wantMax ? contrib(b, ax) - contrib(a, ax) : contrib(a, ax) - contrib(b, ax);
        })[0].key;
      });
      return scoreAxes(ans)[ax];
    }
    var axisMax = D.axes.map(function (_, i) { return extreme(i, true); });
    var axisMin = D.axes.map(function (_, i) { return extreme(i, false); });

    window.__GFTI_SELFTEST__ = {
      pass: pass, expect: D.selfTest.top5, got: got, detail: detail,
      axisMax: axisMax, axisMin: axisMin,
      songCount: SONGS.length, questionCount: D.questions.length
    };
    console.log('[GFTI selftest]', window.__GFTI_SELFTEST__);
  }

  // 暴露给外部调试 / 后台二次开发
  window.GFTI = {
    scoreAxes: scoreAxes, distance: distance, similarity: similarity,
    match: match, songs: function () { return SONGS; }, state: state
  };
})();
