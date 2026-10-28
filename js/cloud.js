/* ============ 班级小喇叭 · 云数据层（数据库 + 存储 + 认证） ============ */
'use strict';

const cloud = WorkBuddyCloud.createWorkBuddyCloud({
  endpoint: PUBLIC_CONFIG.endpoint,
  oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
  publishableKey: PUBLIC_CONFIG.publishableKey,
});
const DB = cloud.database;
const ST = cloud.storage;
const AUTH = cloud.auth;

function unwrap(r) { if (r && r.error) throw r.error; return r ? r.data : null; }
function jval(v) { return v == null ? '' : String(v); }

/* ---------- 认证（仅老师端需要：微信登录；其他端不登录） ---------- */
const TKEY = 'cs_teacher';          // 本地身份 { id, name }
const NKEY = 'cs_teacher_name';     // 显示名（可覆盖微信昵称）

function inWechat() { return /MicroMessenger/i.test(navigator.userAgent || ''); }

/* 本站静态资源带分享门禁（缺 ?sharecode= 会落到「链接不完整」页），
   所以 OAuth 的 callback_url 必须把分享参数一起带上，否则扫完码回来会被拦住。 */
function siteUrl(keepQuery) {
  try {
    const u = new URL(location.href);
    ['code', 'state', 'error', 'error_description'].forEach(k => u.searchParams.delete(k));
    if (!keepQuery) { u.search = ''; }
    return u.origin + u.pathname + (keepQuery && u.search ? u.search : '');
  } catch (e) { return location.origin; }
}

const Auth = {
  session: null, ready: false, _cbs: [], local: null,
  async init() {
    if (this.ready) return;
    // 0) 兜底：若回调把 code 用「?」接在已有参数后面，先修成合法查询串
    try {
      const raw = location.search || '';
      if (raw.indexOf('?code=') > 0 || raw.indexOf('?state=') > 0) {
        const fixed = '?' + raw.slice(1).replace(/\?(?=code=|state=|error=)/g, '&');
        history.replaceState(null, '', location.pathname + fixed);
      }
    } catch (e) {}
    // 1) 微信网页授权回调：必须最先处理，code 只能用一次
    if (typeof AUTH.handleWechatWebCallback === 'function') {
      try {
        const r = await AUTH.handleWechatWebCallback();
        if (!r.error && r.data) {
          this.session = r.data;
          try { history.replaceState(null, '', siteUrl(true)); } catch (e) {}
        }
      } catch (e) { console.warn('wx-callback', e); }
    }
    // 2) 已有会话
    if (!this.session) {
      try { const r = await AUTH.getSession(); this.session = (!r.error && r.data) ? r.data : null; } catch (e) { this.session = null; }
    }
    // 3) 本地身份
    try { this.local = JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) { this.local = null; }
    this.ready = true;
    try { AUTH.onAuthStateChange(ev => { this.session = (ev && ev.session) ? ev.session : null; this._cbs.forEach(cb => cb(this.session)); }); } catch (e) {}
  },
  onSession(cb) { this._cbs.push(cb); if (this.ready) cb(this.session); },
  isWechat() { return !!this.session; },
  isLogged() { return !!this.session || !!(this.local && this.local.id); },
  uid() {
    try { const u = this.session && this.session.user; if (u && u.id) return String(u.id); } catch (e) {}
    return (this.local && this.local.id) || null;
  },
  name() {
    let n = ''; try { n = localStorage.getItem(NKEY) || ''; } catch (e) {}
    if (n) return n;
    try {
      const u = this.session && this.session.user;
      if (u) { const s = u.name || u.nickname || u.nickName || ''; if (s) return s; }
    } catch (e) {}
    return (this.local && this.local.name) || '老师';
  },
  setName(n) { n = String(n || '').trim(); if (!n) return; try { localStorage.setItem(NKEY, n); } catch (e) {} },
  /* 微信登录：返回 { ok, message }，成功后浏览器跳转到微信授权页 */
  async signInWechat() {
    try {
      const r = await AUTH.signInWithOAuth({ provider: 'wechat', redirectTo: siteUrl(true) });
      if (r && r.error) return { ok: false, message: String(r.error.message || r.error || '微信登录未开启') };
      const url = r && r.data && (r.data.url || r.data.redirectUrl);
      if (!url) return { ok: false, message: '没有拿到微信授权地址' };
      location.assign(url);
      return { ok: true };
    } catch (e) { return { ok: false, message: (e && e.message) || String(e) }; }
  },
  /* 免微信：仅在本机记住一个身份（其他端本来也不需要登录） */
  signInLocal(name) {
    const n = String(name || '').trim() || '老师';
    const id = (this.local && this.local.id) || ('t_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    this.local = { id: id, name: n };
    try { localStorage.setItem(TKEY, JSON.stringify(this.local)); localStorage.setItem(NKEY, n); } catch (e) {}
    this._cbs.forEach(cb => cb(this.session));
    return this.local;
  },
  async signOut() {
    try { await AUTH.signOut(); } catch (e) {}
    this.session = null; this.local = null;
    try { localStorage.removeItem(TKEY); localStorage.removeItem(NKEY); } catch (e) {}
    this._cbs.forEach(cb => cb(null));
  },
  showLoginOverlay() {
    if ($('#cs-login-overlay')) return;
    const ov = document.createElement('div'); ov.id = 'cs-login-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:1000;background:radial-gradient(900px 600px at 50% 30%,#123A2C 0%,#08110D 78%);display:flex;align-items:center;justify-content:center;padding:22px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:24px;padding:30px 24px 22px;width:min(400px,94vw);text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.42)">' +
        '<div style="width:56px;height:56px;border-radius:18px;margin:0 auto 14px;background:linear-gradient(135deg,#00C97F,#00A86B);display:flex;align-items:center;justify-content:center">' +
          '<span style="color:#fff;font-size:26px;font-weight:800">喇</span></div>' +
        '<div style="font-size:22px;font-weight:800;color:#111;letter-spacing:-.3px">班级小喇叭</div>' +
        '<p style="color:#8A9490;font-size:13px;margin:6px 0 24px">老师端 · 微信扫码登录</p>' +
        '<button id="cs-login-btn" style="background:#07C160;color:#fff;border:none;border-radius:14px;padding:15px;font-size:16px;font-weight:700;width:100%;display:flex;align-items:center;justify-content:center;gap:8px">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8.7 3C4.9 3 1.8 5.6 1.8 8.8c0 1.8 1 3.4 2.7 4.5l-.7 2.1 2.4-1.2c.8.2 1.6.4 2.5.4h.6a5 5 0 0 1-.2-1.4c0-3 2.9-5.4 6.5-5.4h.7C15.6 5 12.5 3 8.7 3zm-2.4 3.5a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.8 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z"/><path d="M22.2 13.2c0-2.7-2.7-4.9-6-4.9s-6 2.2-6 4.9 2.7 4.9 6 4.9c.7 0 1.4-.1 2-.3l2 1-.6-1.8c1.6-.9 2.6-2.3 2.6-3.8zm-8-1.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6zm4 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z"/></svg>' +
          '微信扫码登录</button>' +
        '<p id="cs-login-tip" style="color:#9AA3A0;font-size:12px;line-height:1.65;margin:14px 0 0">' +
          '点击后进入微信授权页，用微信扫码确认即可。<br>在微信里打开本页时可直接一键登录。</p>' +
        '<div id="cs-login-err" style="display:none;margin-top:12px;background:#FFF3F3;border:1px solid #FFD9D9;border-radius:10px;padding:10px;color:#C0392B;font-size:12px;line-height:1.6;text-align:left"></div>' +
        '<div style="border-top:1px solid #F0F3F2;margin:20px 0 12px"></div>' +
        '<div id="cs-guest-box">' +
          '<button id="cs-guest-toggle" style="background:none;border:none;color:#7A8683;font-size:12.5px;text-decoration:underline">微信打不开？用姓名直接进入</button>' +
          '<div id="cs-guest-form" style="display:none;margin-top:12px">' +
            '<input id="cs-guest-name" maxlength="12" placeholder="请输入你的姓名，如：王老师" style="width:100%;border:1.5px solid #E6EAE9;border-radius:12px;padding:12px;font-size:15px;margin-bottom:10px">' +
            '<button id="cs-guest-go" class="btn block">用这个姓名进入</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const err = m => { const el = $('#cs-login-err'); if (!el) return; el.style.display = m ? 'block' : 'none'; el.textContent = m || ''; };
    $('#cs-login-btn').onclick = async () => {
      err('');
      const btn = $('#cs-login-btn'); const old = btn.innerHTML;
      btn.disabled = true; btn.style.opacity = '.75'; btn.textContent = '正在打开微信授权页…';
      const r = await Auth.signInWechat();
      if (!r.ok) {
        btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = old;
        err('微信登录暂时打不开：' + r.message + '\n可在「设置—数据管理—应用—登录方式」里确认已开启微信登录。');
      }
    };
    $('#cs-guest-toggle').onclick = () => { const f = $('#cs-guest-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; const i = $('#cs-guest-name'); if (i) i.focus(); };
    $('#cs-guest-go').onclick = () => {
      const n = ($('#cs-guest-name').value || '').trim();
      if (!n) { toast('请输入姓名'); return; }
      Auth.signInLocal(n); Auth.hideLoginOverlay(); Auth._cbs.forEach(cb => cb(Auth.session));
    };
    if (inWechat()) { const t = $('#cs-login-tip'); if (t) t.innerHTML = '已检测到在微信中打开，点上方按钮即可一键登录。'; }
  },
  hideLoginOverlay() { const ov = $('#cs-login-overlay'); if (ov) ov.remove(); },
  gate(start) {
    Auth.init().then(() => {
      if (Auth.isLogged()) { Auth.hideLoginOverlay(); start(); return; }
      let started = false;
      const go = () => { if (started) return; started = true; Auth.hideLoginOverlay(); start(); };
      Auth.showLoginOverlay();
      Auth.onSession(s => { if (s || Auth.isLogged()) go(); });
      // 用姓名进入不会产生云端会话变更，这里轮询兜底
      const t = setInterval(() => { if (Auth.isLogged()) { clearInterval(t); go(); } }, 400);
    }).catch(e => { console.error(e); Auth.showLoginOverlay(); });
  }
};

/* ---------- 媒体（图片 / 语音）：存数据库，无需登录即可读取 ---------- */
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', webm: 'audio/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', json: 'application/octet-stream' };

const Store = {
  _cache: new Map(),
  _b64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || '').split(',')[1] || '');
      fr.onerror = () => rej(new Error('读取文件失败'));
      fr.readAsDataURL(blob);
    });
  },
  /* 图片压到 1600px 内的 JPEG，图片/语音都走这条路 */
  async _shrink(blob) {
    if (!/^image\//.test(blob.type || '') || /gif/.test(blob.type || '')) return blob;
    try {
      const bmp = await createImageBitmap(blob);
      const max = 1600, sc = Math.min(1, max / Math.max(bmp.width || 1, bmp.height || 1));
      if (sc >= 1 && blob.size < 500 * 1024) return blob;
      const cv = document.createElement('canvas');
      cv.width = Math.round((bmp.width || 1) * sc); cv.height = Math.round((bmp.height || 1) * sc);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const out = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
      return (out && out.size < blob.size) ? out : blob;
    } catch (e) { return blob; }
  },
  async upload(blob, extOrKind) {
    const b = await this._shrink(blob);
    const ext = String(extOrKind || '').toLowerCase();
    const mime = b.type || MIME_BY_EXT[ext] || 'application/octet-stream';
    const kind = /^image\//.test(mime) ? 'image' : /^audio\//.test(mime) ? 'voice' : 'file';
    const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    const payload = await this._b64(b);
    const r = await DB.from('cs_media').insert({ k: k, kind: kind, mime: mime, payload: payload }).select('id').single();
    unwrap(r);
    return 'media:' + k;
  },
  async signedUrl(path) {
    if (!path) return null;
    if (this._cache.has(path)) return this._cache.get(path);
    let url = null;
    if (String(path).indexOf('media:') === 0) {
      const r = await DB.from('cs_media').select('mime,payload').eq('k', String(path).slice(6)).maybeSingle();
      const row = unwrap(r);
      if (row && row.payload) {
        const bin = atob(row.payload);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([arr], { type: row.mime || 'application/octet-stream' }));
      }
    } else {
      // 兼容早期存在云存储里的媒体
      try {
        const r = await ST.createSignedUrl(path, 3000);
        url = (r && !r.error && r.data && (r.data.signedUrl || r.data.url || r.data)) || null;
      } catch (e) { url = null; }
    }
    if (url) this._cache.set(path, url);
    return url || null;
  }
};

/* ---------- 数据模型（全部异步） ---------- */
const C = {
  async listClasses() { const r = await DB.from('cs_events').select('*').eq('kind', 'class').order('created_at', { ascending: true }); return unwrap(r) || []; },
  async cls(id) { const r = await DB.from('cs_events').select('*').eq('id', id).maybeSingle(); return unwrap(r) || null; },
  async clsByCode(code) { const r = await DB.from('cs_events').select('*').eq('kind', 'class').eq('code', code).maybeSingle(); return unwrap(r) || null; },
  async createClass(name) {
    name = String(name || '').trim(); if (!name) throw new Error('请填写班级名称');
    const all = await this.listClasses();
    let code; do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (all.some(c => c.code === code));
    const r = await DB.from('cs_events').insert({ kind: 'class', code: code, name: name }).select().single();
    const c = unwrap(r);
    const presets = [
      { name: '放学提醒', text: '放学了：请关窗、关灯、关电脑，值日生留下打扫。', time: '16:50', repeat: 'weekdays', enabled: true },
      { name: '眼保健操(上午)', text: '眼保健操时间到，请闭上眼睛，保持安静，开始做眼保健操。', time: '09:55', repeat: 'weekdays', enabled: true },
      { name: '眼保健操(下午)', text: '眼保健操时间到，请闭上眼睛，保持安静，开始做眼保健操。', time: '14:35', repeat: 'weekdays', enabled: true },
    ];
    for (const s of presets) { await DB.from('cs_events').insert({ kind: 'schedule', class_id: c.id, name: s.name, data: s }); }
    await this.bind(c.id);
    return c;
  },
  async bind(classId) {
    const uid = Auth.uid(); if (!uid) return;
    const ex = await DB.from('cs_events').select('id').eq('kind', 'binding').eq('class_id', classId).filter('data->>teacher_uid', 'eq', uid).maybeSingle();
    if (unwrap(ex)) return;
    await DB.from('cs_events').insert({ kind: 'binding', class_id: classId, data: { teacher_uid: uid, name: Auth.name() } });
  },
  async unbind(classId) { const uid = Auth.uid(); await DB.from('cs_events').delete().eq('kind', 'binding').eq('class_id', classId).filter('data->>teacher_uid', 'eq', uid); },
  async boundClasses() {
    const uid = Auth.uid(); if (!uid) return [];
    const r = await DB.from('cs_events').select('*').eq('kind', 'binding');
    const ids = (unwrap(r) || []).filter(b => b.data && b.data.teacher_uid === uid).map(b => b.class_id);
    if (!ids.length) return [];
    const rc = await DB.from('cs_events').select('*').eq('kind', 'class').in('id', ids).order('created_at', { ascending: true });
    return unwrap(rc) || [];
  },
  async listStudents(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'student').eq('class_id', classId).order('created_at', { ascending: true }); return unwrap(r) || []; },
  async setStudents(classId, names) {
    await DB.from('cs_events').delete().eq('kind', 'student').eq('class_id', classId);
    const rows = names.map((n, i) => String(n || '').trim()).filter(Boolean).map((n, i) => ({ kind: 'student', class_id: classId, name: n, data: { seat: i + 1 } }));
    if (rows.length) await DB.from('cs_events').insert(rows);
  },
  async listMessages(classId, limit) { const r = await DB.from('cs_events').select('*').eq('kind', 'message').eq('class_id', classId).order('created_at', { ascending: false }).limit(limit || 50); return unwrap(r) || []; },
  async addMessage(p) {
    const r = await DB.from('cs_events').insert({
      kind: 'message', class_id: p.classId, name: p.sender || Auth.name(),
      data: {
        type: p.type, tag: p.tag || '', text: p.text || '', mediaPath: p.mediaPath || null,
        duration: p.duration || 0, live: !!p.live,
        readTimes: p.readTimes || 1,
        displaySec: p.displaySec == null ? 15 : p.displaySec,
        displayMode: p.displayMode || 'full',
        fontSize: p.fontSize || 'md',
        tts: p.tts === false ? false : true,
        ts: Date.now()
      }
    }).select().single();
    return unwrap(r);
  },
  async listSchedules(classId) {
    const r = await DB.from('cs_events').select('*').eq('kind', 'schedule').eq('class_id', classId).order('created_at', { ascending: true });
    const rows = unwrap(r) || [];
    rows.sort((a, b) => String((a.data || {}).time || '').localeCompare(String((b.data || {}).time || '')));
    return rows;
  },
  async listAllSchedules() { const r = await DB.from('cs_events').select('*').eq('kind', 'schedule'); return unwrap(r) || []; },
  async saveSchedule(s) {
    if (s.id) { const r = await DB.from('cs_events').update({ name: s.name, data: s.data }).eq('id', s.id).select().single(); return unwrap(r); }
    const r = await DB.from('cs_events').insert({ kind: 'schedule', class_id: s.classId, name: s.name, data: s.data }).select().single(); return unwrap(r);
  },
  async deleteSchedule(id) { await DB.from('cs_events').delete().eq('id', id); },
  async setScheduleEnabled(id, enabled) {
    const row = await this._get(id); if (!row) return;
    const data = Object.assign({}, row.data || {}, { enabled: enabled });
    await DB.from('cs_events').update({ data: data }).eq('id', id);
  },
  async claimSchedule(id, key) {
    key = String(key);
    try {
      const r = await DB.from('cs_events').update({ last_run_key: key }).eq('id', id)
        .or('last_run_key.is.null,last_run_key.neq.' + key).select('id');
      const d = unwrap(r); return !!(d && d.length);
    } catch (e) {
      // 退路：分两步抢占
      let d = unwrap(await DB.from('cs_events').update({ last_run_key: key }).eq('id', id).is('last_run_key', null).select('id'));
      if (d && d.length) return true;
      d = unwrap(await DB.from('cs_events').update({ last_run_key: key }).eq('id', id).neq('last_run_key', key).select('id'));
      return !!(d && d.length);
    }
  },
  async _get(id) { const r = await DB.from('cs_events').select('*').eq('id', id).maybeSingle(); return unwrap(r) || null; },

  async receiptsOfClass(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'receipt').eq('class_id', classId); return unwrap(r) || []; },
  async receiptsOf(msgId) { const r = await DB.from('cs_events').select('*').eq('kind', 'receipt').filter('data->>msg_id', 'eq', jval(msgId)); return unwrap(r) || []; },
  async addReceipt(msgId, classId, student) {
    const ex = await DB.from('cs_events').select('id').eq('kind', 'receipt').filter('data->>msg_id', 'eq', jval(msgId)).filter('data->>student_id', 'eq', jval(student.id)).maybeSingle();
    if (unwrap(ex)) return false;
    await DB.from('cs_events').insert({ kind: 'receipt', class_id: classId, data: { msg_id: jval(msgId), student_id: jval(student.id), name: student.name, ts: Date.now() } });
    return true;
  },

  async createRollcall(classId, mode, perSec, order) {
    const r = await DB.from('cs_events').insert({ kind: 'rollcall', class_id: classId, data: { mode: mode, perSec: perSec, order: order, idx: 0, results: {}, status: 'live', startedAt: Date.now(), curStart: Date.now(), endedAt: null } }).select().single();
    const rc = unwrap(r); await this.setRcLive(classId, rc.id); return rc;
  },
  async updateRollcall(rc) { await DB.from('cs_events').update({ data: rc.data }).eq('id', rc.id); },
  async getRollcall(id) { const r = await DB.from('cs_events').select('*').eq('id', id).maybeSingle(); return unwrap(r) || null; },
  async listRollcalls(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'rollcall').eq('class_id', classId).order('created_at', { ascending: false }).limit(15); return unwrap(r) || []; },
  async setRcLive(classId, rcId) {
    const ex = await this.rcLive(classId);
    if (!rcId) { await DB.from('cs_events').delete().eq('kind', 'rclive').eq('class_id', classId); return; }
    if (ex) { unwrap(await DB.from('cs_events').update({ data: { rcId: rcId } }).eq('id', ex.id)); return; }
    unwrap(await DB.from('cs_events').insert({ kind: 'rclive', class_id: classId, data: { rcId: rcId } }).select('id'));
  },
  async rcLive(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'rclive').eq('class_id', classId).maybeSingle(); return unwrap(r) || null; },

  async getTimer(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'timer').eq('class_id', classId).maybeSingle(); return unwrap(r) || null; },
  async setTimer(classId, data) {
    const ex = await this.getTimer(classId);
    if (ex) { unwrap(await DB.from('cs_events').update({ data: data }).eq('id', ex.id)); return; }
    unwrap(await DB.from('cs_events').insert({ kind: 'timer', class_id: classId, data: data }).select('id'));
  },
  async clearTimer(classId) { await DB.from('cs_events').delete().eq('kind', 'timer').eq('class_id', classId); },
};

/* ---------- 倒计时操作 ---------- */
const TimerC = {
  async start(classId, label, totalSec) { await C.setTimer(classId, { label: label || '倒计时', totalSec: totalSec, running: true, endsAt: Date.now() + totalSec * 1000, remainMs: null, finishedAt: null }); },
  async pause(classId) { const t = await C.getTimer(classId); if (!t || !t.data.running || t.data.finishedAt != null) return; t.data.remainMs = Math.max(0, t.data.endsAt - Date.now()); t.data.running = false; await C.setTimer(classId, t.data); },
  async resume(classId) { const t = await C.getTimer(classId); if (!t || t.data.running || t.data.finishedAt != null) return; t.data.endsAt = Date.now() + (t.data.remainMs || 0); t.data.running = true; await C.setTimer(classId, t.data); },
  async add(classId, sec) { const t = await C.getTimer(classId); if (!t || t.data.finishedAt != null) return; if (t.data.running) { t.data.endsAt += sec * 1000; } else { t.data.remainMs = (t.data.remainMs || 0) + sec * 1000; } t.data.totalSec += sec; await C.setTimer(classId, t.data); },
  async finish(classId) { const t = await C.getTimer(classId); if (!t) return; t.data.running = false; t.data.remainMs = 0; t.data.finishedAt = Date.now(); await C.setTimer(classId, t.data); },
  async reset(classId) { await C.clearTimer(classId); },
  remainMs(t) { if (!t || !t.data) return 0; if (t.data.finishedAt != null) return 0; if (t.data.running) return Math.max(0, t.data.endsAt - Date.now()); return t.data.remainMs || 0; }
};

/* ---------- 定时通知检查器（在大屏页常驻运行） ---------- */
const Checker = {
  start(onFire) {
    const tick = () => this.tick(onFire);
    setInterval(tick, 8000); setTimeout(tick, 1500);
  },
  async tick(onFire) {
    try {
      const now = new Date();
      const hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      const day = now.getDay();
      const tk = todayKey(now);
      const all = await C.listAllSchedules();
      for (const row of all) {
        const s = row.data || {}; if (!s.enabled || s.time !== hm) continue;
        const key = tk.replace(/-/g, '') + 'T' + hm.replace(':', '') + 'S' + row.id;
        if (row.last_run_key === key) continue;
        if (s.repeat === 'weekdays' && (day === 0 || day === 6)) continue;
        if (s.repeat === 'custom' && !(s.days || []).includes(day)) continue;
        if (s.repeat === 'once' && s.fireDate && s.fireDate !== tk) continue;
        const claimed = await C.claimSchedule(row.id, key);
        if (!claimed) continue;
        const m = await C.addMessage({
          classId: row.class_id, type: 'text', tag: row.name, text: s.text, sender: '定时广播', live: false,
          readTimes: s.readTimes || 2,
          displaySec: s.displaySec == null ? 30 : s.displaySec,
          displayMode: s.displayMode || 'full',
          fontSize: s.fontSize || 'md',
          tts: s.tts === false ? false : true,
        });
        if (onFire) { try { onFire(m, row); } catch (e) {} }
      }
    } catch (e) { console.warn('checker', e); }
  }
};
