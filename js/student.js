/* ============ 班级小喇叭 · 收到页（班级共用：一个按钮，点完自动关） ============ */
'use strict';

/* 注意：不要用 ST 作变量名，js/cloud.js 里已有 const ST = cloud.storage */
const STU = { classId: null, latest: null, cls: null, receivedId: null };

document.addEventListener('DOMContentLoaded', () => {
  $('#st-logo').innerHTML = ICON.check;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('cs_student') || '{}'); } catch (e) {}
  STU.classId = saved.classId || null;
  bindEvents();
  boot();
});

function bindEvents() {
  $('#st-join').addEventListener('click', joinByCode);
  $('#st-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinByCode(); });
  const sw = $('#st-switch'); if (sw) sw.addEventListener('click', () => { STU.classId = null; save(); render(); });
  const rb = $('#st-receipt'); if (rb) rb.addEventListener('click', confirmReceipt);
}

function save() {
  try { localStorage.setItem('cs_student', JSON.stringify({ classId: STU.classId })); } catch (e) {}
}

/* 带 ?code=123456 打开时自动绑定 */
async function boot() {
  const uq = ClassBind.urlCode();
  if (uq) {
    try {
      const c = await ClassBind.resolve(uq);
      if (c) { STU.classId = c.id; save(); }
    } catch (e) {}
  } else if (!STU.classId) {
    const saved = ClassBind.get();
    if (saved) STU.classId = saved;
  }
  if (STU.classId) ClassBind.set(STU.classId);
  await render();
  setInterval(refreshQuiet, 5000);          // 倒计时/通知静默刷新
}

async function joinByCode() {
  const code = ($('#st-code').value || '').replace(/\D/g, '');
  if (code.length !== 6) { toast('请输入 6 位绑定码'); return; }
  const c = await C.clsByCode(code).catch(() => null);
  if (!c) { toast('绑定码不存在，请核对'); return; }
  STU.classId = c.id; ClassBind.set(c.id); save();
  toast('已进入 ' + c.name, true);
  await render();
}

async function render() {
  const setup = $('#st-setup'), pick = $('#st-pick'), main = $('#st-main');
  if (pick) pick.hidden = true;              // 不再选人，整班共用一台设备
  if (!STU.classId) { setup.hidden = false; main.hidden = true; return; }

  let cls = null;
  try { cls = await C.cls(STU.classId); } catch (e) {}
  if (!cls) { STU.classId = null; save(); setup.hidden = false; main.hidden = true; return; }
  STU.cls = cls;

  setup.hidden = true; main.hidden = false;
  const sw = $('#st-switch'); if (sw) sw.hidden = true;
  $('#st-avatar').textContent = '班';
  $('#st-name').textContent = cls.name;
  $('#st-class').textContent = '班级共用设备 · 不用选人';

  let list = [];
  try { list = await C.listMessages(STU.classId, 1); } catch (e) {}
  STU.latest = list[0] || null;
  await syncReceiptState();
  renderLatest();
  renderTimer();
}

/* 大屏或本页已经点过「收到了」，进来就显示已收到 */
async function syncReceiptState() {
  const m = STU.latest;
  if (!m) return;
  try {
    const rc = await C.receiptsOf(m.id);
    const got = rc.some(r => r.data && (r.data.collective || String(r.data.student_id) === 'all'));
    if (got) STU.receivedId = String(m.id);
  } catch (e) {}
}

/* 只刷新通知与倒计时，不动按钮状态（避免点之前被重绘） */
async function refreshQuiet() {
  if (!STU.classId) return;
  try {
    const list = await C.listMessages(STU.classId, 1);
    STU.latest = list[0] || null;
    renderLatest();
    renderTimer();
  } catch (e) {}
}

let _lastMsgKey = '';
function renderLatest() {
  const m = STU.latest;
  const box = $('#st-latest');
  if (!m) {
    box.innerHTML = '<div class="empty">还没有通知</div>';
    $('#st-time').textContent = '';
    $('#st-action').innerHTML = '<button class="btn st-big-btn" disabled>暂无通知</button>';
    $('#st-hint').textContent = '';
    return;
  }
  const d = m.data || {};
  let body = '';
  if (d.type === 'text') body = '<div class="msg-text">' + esc(d.text) + '</div>';
  else if (d.type === 'image') body = '<div class="msg-text mb8">📷 老师发了一张图片</div>' + (d.text ? '<div class="msg-text">' + esc(d.text) + '</div>' : '');
  else body = '<div class="msg-text">🎙 ' + (d.live ? '老师刚发了一段对讲' : '老师发了一段语音') + '</div>';
  const key = String(m.id) + '|' + String(d.ts || '');
  if (key !== _lastMsgKey) {
    _lastMsgKey = key;
    box.innerHTML = body;
    $('#st-time').textContent = fmtHM(new Date(m.created_at).getTime());
    const already = STU.receivedId === String(m.id);
    $('#st-action').innerHTML = already
      ? '<div class="st-done">' + ICON.check + '<div class="t">已收到</div><div class="s">老师那边已经记下了</div></div>'
      : '<button class="btn st-big-btn" id="st-receipt">收到了</button>';
    $('#st-hint').textContent = already ? '' : '点一下就好，老师那边会显示「班级已收到」';
    bindReceiptBtn();
  }
}

function bindReceiptBtn() { const b = $('#st-receipt'); if (b) b.onclick = confirmReceipt; }

/* 点「收到了」：写整班回执 → 提示 → 自动关闭页面 */
async function confirmReceipt() {
  const m = STU.latest;
  if (!m) return;
  const btn = $('#st-receipt');
  if (btn) { btn.disabled = true; btn.textContent = '正在提交…'; }
  try {
    await C.addReceipt(m.id, STU.classId, { id: 'all', name: '全班', collective: true });
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '收到了'; }
    toast('网络不太好，请再点一次');
    return;
  }
  STU.receivedId = String(m.id);
  $('#st-action').innerHTML = '<div class="st-done">' + ICON.check + '<div class="t">已收到</div><div class="s" id="st-close-tip">正在关闭页面…</div></div>';
  $('#st-hint').textContent = '';
  if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
  // 先试着自己关掉（微信/浏览器里通常会被拦），关不掉就提示手动关闭
  setTimeout(() => {
    try { window.close(); } catch (e) {}
    setTimeout(() => {
      const tip = $('#st-close-tip');
      if (tip && !document.hidden) tip.textContent = '好了，可以关掉这个页面了';
    }, 700);
  }, 500);
}

async function renderTimer() {
  const card = $('#st-timer-card'); if (!card) return;
  let t = null;
  try { t = await C.getTimer(STU.classId); } catch (e) {}
  if (!t || t.class_id !== STU.classId || t.data.finishedAt != null) { card.hidden = true; return; }
  card.hidden = false;
  $('#st-timer').textContent = fmtMMSS(TimerC.remainMs(t) / 1000);
}
