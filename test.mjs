import puppeteer from '/Users/pengjingwan/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8777/index.html';
const SHOT = '/tmp/gfti_shots';
fs.mkdirSync(SHOT, { recursive: true });

const log = (...a) => console.log(...a);
let failures = 0;
function check(name, ok, extra = '') {
  log(`${ok ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: '/tmp/gfti_chrome_profile',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none',
         '--hide-scrollbars', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

/* ---------- 1. 算法自检 ---------- */
log('\n【1】算法自检（Excel 示例向量）');
await page.goto(BASE + '?selftest=1', { waitUntil: 'networkidle0' });
const st = await page.evaluate(() => window.__GFTI_SELFTEST__);
check('题目数 = 20', st.questionCount === 20, String(st.questionCount));
check('歌曲数 = 100', st.songCount === 100, String(st.songCount));
check('示例向量 Top5 与 Excel 一致', st.pass, st.got.join(' / '));
st.detail.forEach(d => log('      ' + d));
check('逐轴推至极限 → 轴满分 100', st.axisMax.join() === '100,100,100,100,100', JSON.stringify(st.axisMax));
check('逐轴压至极限 → 轴最低 0', st.axisMin.join() === '0,0,0,0,0', JSON.stringify(st.axisMin));

// 蒙特卡洛：随机作答 5000 次，检查得分区间、Top5 稳定性与歌曲覆盖度
const mc = await page.evaluate(() => {
  const D = window.GFTI_DATA, G = window.GFTI;
  let lo = [100, 100, 100, 100, 100], hi = [0, 0, 0, 0, 0];
  const hit = new Set(); let simMax = 0, over100 = 0;
  for (let n = 0; n < 5000; n++) {
    const ans = D.questions.map(q => q.options[Math.floor(Math.random() * 4)].key);
    const u = G.scoreAxes(ans);
    u.forEach((v, i) => { if (v < lo[i]) lo[i] = v; if (v > hi[i]) hi[i] = v; });
    const top = G.match(u, 5);
    top.forEach(t => hit.add(t.name));
    if (top[0].sim > simMax) simMax = top[0].sim;
    if (top[0].sim > 100) over100++;
  }
  return { lo, hi, cover: hit.size, simMax, over100 };
});
check('随机作答五轴恒在 0~100', mc.lo.every(v => v >= 0) && mc.hi.every(v => v <= 100),
  `实测区间 ${mc.lo.join('/')} ~ ${mc.hi.join('/')}`);
log(`      5000 次随机作答：Top5 共覆盖 ${mc.cover} 首歌，最高相似度 ${mc.simMax.toFixed(2)}%，超 100% 出现 ${mc.over100} 次（展示时截断为 100%）`);
check('Top5 覆盖面合理（>25 首）', mc.cover > 25, `${mc.cover} 首`);

/* ---------- 2. 首屏 ---------- */
log('\n【2】首屏');
await page.goto(BASE, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1400));
await page.screenshot({ path: `${SHOT}/01-intro.png` });
check('标题渲染', (await page.$eval('.brand', e => e.textContent)).includes('古风TI'));
check('启程按钮存在', !!(await page.$('#btn-start')));

/* ---------- 3. 答题流程 ---------- */
log('\n【3】答题流程');
await page.click('#btn-start');
await new Promise(r => setTimeout(r, 1200));
check('进入答题页', await page.$eval('#scene-quiz', e => e.classList.contains('on')));
const c1 = await page.$eval('#counter', e => e.textContent.replace(/\s/g, ''));
check('进度显示格式', c1 === '第壹题/共贰拾题', c1);
check('下一题按钮初始禁用', await page.$eval('#btn-next', e => e.disabled));
check('上一题按钮首题禁用', await page.$eval('#btn-prev', e => e.disabled));
check('选项不显示 ABCD 字母',
  (await page.$$eval('.opt', els => els.map(e => e.textContent))).every(t => !/^[ABCD][.．]/.test(t.trim())));
await page.screenshot({ path: `${SHOT}/02-q1.png` });

// 记录第壹题选项顺序，用于验证「返回修改顺序稳定」
const q1order = await page.$$eval('.opt', els => els.map(e => e.dataset.key));
log('      第壹题展示顺序: ' + q1order.join(''));

await page.click('.opt');
check('选中后下一题按钮解禁', !(await page.$eval('#btn-next', e => e.disabled)));
const firstPick = await page.$eval('.opt.sel', e => e.dataset.key);

// 自动跳转下一题
await new Promise(r => setTimeout(r, 1000));
const c2 = await page.$eval('#counter', e => e.textContent.replace(/\s/g, ''));
check('自动跳转下一题', c2 === '第贰题/共贰拾题', c2);
await page.screenshot({ path: `${SHOT}/03-q2.png` });

// 上一题按钮仍可用
await page.click('#btn-prev');
await new Promise(r => setTimeout(r, 900));
const q1order2 = await page.$$eval('.opt', els => els.map(e => e.dataset.key));
check('返回上一题', (await page.$eval('#counter', e => e.textContent.replace(/\s/g, ''))) === '第壹题/共贰拾题');
check('返回后选项顺序不变', q1order.join('') === q1order2.join(''), q1order2.join(''));
check('返回后原选项仍高亮', (await page.$eval('.opt.sel', e => e.dataset.key)) === firstPick);

// 手动「下一题」按钮仍生效
await page.click('#btn-next');
await new Promise(r => setTimeout(r, 900));
check('手动「下一题」按钮仍生效', (await page.$eval('#counter', e => e.textContent.replace(/\s/g, ''))) === '第贰题/共贰拾题');

// 验证多次进入测试时选项顺序确实会打乱
const orders = new Set();
for (let i = 0; i < 8; i++) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.click('#btn-start');
  await new Promise(r => setTimeout(r, 500));
  orders.add((await page.$$eval('.opt', els => els.map(e => e.dataset.key))).join(''));
}
check('多次进入选项顺序随机打乱', orders.size > 1, `8 次出现 ${orders.size} 种顺序`);

/* ---------- 4. 走完 20 题（含自动跳转） ---------- */
log('\n【4】完整跑完 20 题');
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.click('#btn-start');
await new Promise(r => setTimeout(r, 700));
const counterNow = () => page.$eval('#counter', e => e.textContent.replace(/\s/g, ''));
const picked = [];
for (let i = 0; i < 20; i++) {
  const n = await page.$$eval('.opt', els => els.length);
  if (n !== 4) { check(`第${i + 1}题选项数=4`, false, String(n)); break; }
  const pick = Math.floor(Math.random() * 4);
  const el = (await page.$$('.opt'))[pick];
  picked.push(await el.evaluate(e => e.dataset.key));
  const before = await counterNow();
  await el.click();
  if (i === 6) {
    const c = await counterNow();
    check('第柒题进度文案', c === '第柒题/共贰拾题', c);
    await page.screenshot({ path: `${SHOT}/04-q7.png` });
  }
  if (i < 19) {
    // 末题之前：靠自动跳转进入下一题
    await page.waitForFunction(b => {
      return document.getElementById('counter').textContent.replace(/\s/g, '') !== b;
    }, { timeout: 3000 }, before);
  } else {
    // 末题：选中后不自动跳转，需手动点「览结果」
    await new Promise(r => setTimeout(r, 700));
    check('末题选中后不自动跳转', (await counterNow()) === '第贰拾题/共贰拾题');
    check('末题按钮文案改为「览 结 果」',
      (await page.$eval('#btn-next', e => e.textContent)).includes('结'));
    await page.click('#btn-next');
    await new Promise(r => setTimeout(r, 1300));
  }
}
check('到达结果页', await page.$eval('#scene-result', e => e.classList.contains('on')));
await new Promise(r => setTimeout(r, 1600));
await page.screenshot({ path: `${SHOT}/05-result.png`, fullPage: true });

/* ---------- 5. 结果页正确性 ---------- */
log('\n【5】结果页正确性');
const res = await page.evaluate(() => {
  const u = window.GFTI.state.result.u;
  const top = window.GFTI.state.result.top;
  const bars = [...document.querySelectorAll('.axis')].map(a => a.querySelector('.lab .l i').textContent);
  const songs = [...document.querySelectorAll('.song')].map(s => ({
    nm: s.querySelector('.nm').textContent,
    sim: s.querySelector('.sim b').textContent,
  }));
  return { u, top, bars, songs, tagline: document.getElementById('tagline').textContent };
});
check('五轴得分均在 0~100', res.u.every(v => v >= 0 && v <= 100), JSON.stringify(res.u));
check('条形图数值 = 计算得分', res.bars.join() === res.u.map(v => v + '%').join(), res.bars.join(' '));
check('展示 5 首歌', res.songs.length === 5);
check('相似度降序', res.top.every((s, i) => i === 0 || res.top[i - 1].sim >= s.sim));
check('展示值为整数且不超过 100',
  res.songs.every(s => /^\d+$/.test(s.sim) && +s.sim <= 100), res.songs.map(s => s.nm + ' ' + s.sim + '%').join(' | '));
check('气质标签 5 段', res.tagline.split(' · ').length === 5, res.tagline);
log('      用户向量 ' + JSON.stringify(res.u));

// 用 node 侧独立复算一遍，交叉验证前端算法
const songsData = JSON.parse(fs.readFileSync('/tmp/songs_for_test.json', 'utf8'));
const R = (u, s) => u.reduce((a, v, i) => a + Math.sqrt(Math.abs(v - s[i])), 0);
const recalc = songsData.map(s => ({ name: s.name, d: R(res.u, s.p) }))
  .sort((a, b) => a.d - b.d).slice(0, 5).map(x => x.name);
check('前端 Top5 = Node 独立复算 Top5',
  recalc.join('|') === res.songs.map(s => s.nm).join('|'), recalc.join(' / '));

/* ---------- 6. 分享卡片 ---------- */
log('\n【6】分享卡片');
await page.click('#btn-share');
await new Promise(r => setTimeout(r, 900));
check('卡片弹层打开', await page.$eval('#share', e => e.classList.contains('on')));
const cardBox = await page.$eval('#card', e => ({ w: e.width, h: e.height }));
check('卡片画布尺寸正常', cardBox.w === 1500 && cardBox.h === 2460, JSON.stringify(cardBox));
const dataUrl = await page.$eval('#card', c => c.toDataURL('image/png'));
fs.writeFileSync(`${SHOT}/06-card.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
check('卡片有实际内容', dataUrl.length > 60000, `${Math.round(dataUrl.length / 1024)}KB`);
await page.screenshot({ path: `${SHOT}/07-share-dialog.png` });
await page.click('#sh-close');

// 微信/QQ 内置浏览器：长按保存降级路径
const wxState = await page.evaluate(() => {
  const share = document.getElementById('share');
  share.classList.add('wx');
  const img = document.getElementById('card-img');
  img.src = document.getElementById('card').toDataURL('image/png');
  const csImg = getComputedStyle(img);
  const csBtn = getComputedStyle(document.getElementById('sh-save'));
  const csCanvas = getComputedStyle(document.getElementById('card'));
  return {
    imgDisplay: csImg.display,
    btnDisplay: csBtn.display,
    canvasDisplay: csCanvas.display,
    imgOk: img.src.startsWith('data:image/png') && img.src.length > 60000,
  };
});
check('微信环境：卡片改为真实图片(可长按)', wxState.imgDisplay === 'block' && wxState.imgOk, JSON.stringify(wxState));
check('微信环境：隐藏程序化下载按钮', wxState.btnDisplay === 'none');
check('微信环境：隐藏 canvas 改用 img', wxState.canvasDisplay === 'none');
await page.evaluate(() => document.getElementById('share').classList.remove('wx'));

/* ---------- 7. 参数后台 ---------- */
log('\n【7】参数后台');
await page.goto(BASE + '?admin=1', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 500));
const rows = await page.$$eval('#ad-table tr', e => e.length);
check('后台表格 100 首歌 + 表头', rows === 101, String(rows));
await page.evaluate(() => {
  const i = document.querySelector('#ad-table input');
  i.value = '42';
  i.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 300));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gfti_songs_override_v1') || '{}'));
check('修改即时写入本机存储', Object.values(saved)[0]?.[0] === 42, JSON.stringify(saved).slice(0, 60));
await page.reload({ waitUntil: 'networkidle0' });
const persisted = await page.$eval('#ad-table input', e => e.value);
check('刷新后修改仍生效', persisted === '42', persisted);
await page.screenshot({ path: `${SHOT}/08-admin.png` });
await page.evaluate(() => localStorage.removeItem('gfti_songs_override_v1'));

/* ---------- 8. 移动端 ---------- */
log('\n【8】移动端适配');
const m = await browser.newPage();
await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await m.goto(BASE, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1400));
await m.screenshot({ path: `${SHOT}/09-mobile-intro.png` });
await m.click('#btn-start');
await new Promise(r => setTimeout(r, 1100));
await m.screenshot({ path: `${SHOT}/10-mobile-q1.png` });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('移动端无横向溢出', !overflow);

/* ---------- 汇总 ---------- */
log('\n【9】运行期错误');
check('无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
log(`\n${failures === 0 ? '🎉 全部通过' : '⚠️  ' + failures + ' 项未通过'}　截图目录：${SHOT}`);
process.exit(failures === 0 ? 0 : 1);
