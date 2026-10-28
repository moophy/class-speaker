/* ============ 班级小喇叭 · 学生收到页（云版） ============ */
'use strict';

const ST = { classId: null, studentId: null };

document.addEventListener('DOMContentLoaded', () => {
  $('#st-logo').innerHTML = ICON.users;
  Sound.init(); TTS.init();
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('cs_student') || '{}'); } catch (e) {}
  ST.classId = saved.classId || null; ST.studentId = saved.studentId || null;
  bootStudent();
});

/* 学生端不需要登录：带 ?code= 自动绑定，否则页面里输入绑定码 */
async function bootStudent() {
  const uq = ClassBind.urlCode();
  if (uq) {
    try { const c = await ClassBind.resolve(uq); if (c) { ST.classId = c.id; ST.studentId = null; save(); } } catch (e) {}
  } else if (!ST.classId) {
    const savedCls = ClassBind.get();
    if (savedCls) { ST.classId = savedCls; save(); }
  }
  if (ST.classId) ClassBind.set(ST.classId);
  start();
}

function start() {
  bindEvents();
  renderAll();
  setInterval(renderAll, 2000);
}

function save() { localStorage.setItem('cs_student', JSON.stringify({ classId: ST.classId, studentId: ST.studentId })); }
function meStudent() { return ST.studentId ? (ST._students || []).find(s => String(s.id) === String(ST.studentId)) : null; }

function bindEvents() {
  $('#st-switch').addEventListener('click', pickStudent);
  $('#st-join').addEventListener('click', async () => {
    const code = $('#st-code').value.trim();
    if (!/^\d{6}$/.test(code)) { toast('请输入 6 位绑定码'); return; }
    const c = await C.clsByCode(code);
    if (!c) { toast('绑定码不存在'); return; }
    ST.classId = c.id; ST.studentId = null; ClassBind.set(c.id); save(); pickStudent();
  });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.close).classList.remove('show')));
  document.addEventListener('click', async e => {
    const pk = e.target.closest('[data-pickstudent]'); if (pk) { ST.studentId = pk.dataset.pickstudent; save(); $('#sheet-modal').classList.remove('show'); renderAll(); return; }
    const rc = e.target.closest('[data-streceipt]'); if (rc) {
      const me = meStudent(); if (!me) { pickStudent(); return; }
      const ok = await C.addReceipt(rc.dataset.streceipt, ST.classId, { id: me.id, name: me.name });
      toast(ok ? '已确认收到' : '你已经确认过啦', ok); renderAll(); return;
    }
    const pb = e.target.closest('[data-play]'); if (pb) {
      Sound.unlock(); Store.signedUrl(pb.dataset.play).then(url => { if (!url) return; const a = new Audio(url); a.play().catch(() => toast('播放失败，请点击页面后重试')); });
      return;
    }
  });
}

async function pickStudent() {
  if (!ST.classId) return;
  ST._students = await C.listStudents(ST.classId);
  $('#modal-title').textContent = '我是谁？（选择你的名字）';
  $('#modal-body').innerHTML = ST._students.length
    ? '<div class="pills">' + ST._students.map(s => '<button class="pill' + (String(s.id) === String(ST.studentId) ? ' active' : '') + '" data-pickstudent="' + s.id + '">' + esc(s.name) + '</button>').join('') + '</div>'
    : '<div class="empty">老师还没录入花名册，暂时无法确认收到</div>';
  $('#sheet-modal').classList.add('show');
}

async function renderAll() {
  const ok = ST.classId && await C.cls(ST.classId);
  $('#st-setup').hidden = !!ok; $('#st-main').hidden = !ok;
  if (!ok) return;
  const c = await C.cls(ST.classId);
  ST._students = await C.listStudents(ST.classId);
  const me = meStudent();
  $('#st-name').textContent = me ? me.name : '未选择姓名';
  $('#st-class').textContent = (c ? c.name : '') + '（点击右上角换人）';
  $('#st-avatar').textContent = me ? me.name.slice(0, 1) : '生';
  const list = await C.listMessages(ST.classId, 20);
  const receipts = await C.receiptsOfClass(ST.classId);
  const latest = list[0];
  $('#st-latest').innerHTML = latest ? noticeHtml(latest, receipts, true) : '<div class="empty">还没有通知</div>';
  hydrate($('#st-latest'));
  $('#st-feed').innerHTML = list.slice(1, 11).map(m => noticeHtml(m, receipts, false)).join('');
  hydrate($('#st-feed'));
  renderTimerCard();
}

function noticeHtml(m, receipts, isLatest) {
  const d = m.data; const me = meStudent();
  const rc = receipts.filter(r => String(r.data.msg_id) === String(m.id));
  const mine = me && rc.some(r => String(r.data.student_id) === String(me.id));
  let body = '';
  if (d.type === 'text') body = '<div class="msg-text">' + esc(d.text) + '</div>';
  else if (d.type === 'image') body = (d.text ? '<div class="msg-text mb8">' + esc(d.text) + '</div>' : '') + '<img class="msg-img" data-mpath="' + esc(d.mediaPath) + '">';
  else body = '<button class="play-btn" data-play="' + esc(d.mediaPath) + '">' + ICON.play + '播放 ' + fmtDur(d.duration || 0) + '</button>';
  return '<div class="msg-card"><div class="msg-head"><span class="tag-chip">' + esc(d.tag || (d.type === 'image' ? '图片通知' : d.type === 'voice' ? (d.live ? '对讲' : '语音留言') : '通知')) + '</span><span class="muted small" style="margin-left:auto">' + fmtMDHM(new Date(m.created_at).getTime()) + '</span></div>' +
    body + '<div class="msg-foot"><span class="who">' + esc(m.name || '') + ' · 全班 ' + rc.length + ' 人已收到</span>' +
    (mine ? '<span class="receipt-btn done">' + ICON.check + '我已收到</span>' : '<button class="receipt-btn" data-streceipt="' + m.id + '" style="border:none">' + ICON.check + '点击收到</button>') + '</div></div>';
}
function hydrate(root) { $$('[data-mpath]', root).forEach(img => { Store.signedUrl(img.dataset.mpath).then(u => { if (u) img.src = u; }); }); }

async function renderTimerCard() {
  const t = await C.getTimer(ST.classId);
  const card = $('#st-timer-card');
  if (!t || t.class_id !== ST.classId) { card.hidden = true; return; }
  card.hidden = false; $('#st-timer').textContent = t.data.finishedAt != null ? '时间到' : fmtMMSS(TimerC.remainMs(t) / 1000);
}
