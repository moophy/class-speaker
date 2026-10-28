/* ============ 班级小喇叭 公共库（工具/图标/朗读/录音） ============ */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtHM(ts) { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtMDHM(ts) { const d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + fmtHM(ts); }
function fmtDur(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + pad2(sec % 60); }
function fmtMMSS(sec) { sec = Math.max(0, Math.ceil(sec)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function todayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function toast(msg, ok) {
  let wrap = $('#toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' ok' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 1900);
  setTimeout(() => el.remove(), 2300);
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => false);
  try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); }
}

const ICON = {
  megaphone: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 10v4h3l6 5V5l-6 5H3z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/></svg>',
  mic: '<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  clock: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  users: '<svg class="ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 13.5a6.5 6.5 0 0 1 4 6.5"/></svg>',
  user: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  screen: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6"/><path d="M12 17v4"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>',
  play: '<svg class="ic" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
  stop: '<svg class="ic" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  image: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M4 17l5-5 4 4 3-3 4 4"/></svg>',
  send: '<svg class="ic" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/></svg>',
  edit: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/></svg>',
  copy: '<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  volume: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 9v6h4l6 4V5L8 9H4z"/><path d="M17 8a6 6 0 0 1 0 8"/></svg>',
  back: '<svg class="ic" viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8"/></svg>',
  bell: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  refresh: '<svg class="ic" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v5h-5"/></svg>',
  type: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16"/><path d="M12 6v14"/><path d="M8.5 20h7"/></svg>',
  wave: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 12h1.6"/><path d="M7 8v8"/><path d="M10.6 5v14"/><path d="M14.2 8.5v7"/><path d="M17.8 10.5v3"/><path d="M21 12h.4"/></svg>',
  smartphone: '<svg class="ic" viewBox="0 0 24 24"><rect x="6.5" y="2" width="11" height="20" rx="2.6"/><path d="M10.6 18.4h2.8"/></svg>',
  template: '<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>',
};

const TTS = {
  voice: null, inited: false,
  init() {
    if (this.inited || !('speechSynthesis' in window)) return;
    this.inited = true;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
    };
    pick(); speechSynthesis.onvoiceschanged = pick;
  },
  speak(text, times, onend) {
    times = times || 1;
    if (!('speechSynthesis' in window) || !text) { if (onend) onend(); return; }
    let i = 0;
    const next = () => {
      if (i >= times) { if (onend) onend(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; if (this.voice) u.voice = this.voice; u.rate = 0.95;
      u.onend = () => { i++; setTimeout(next, 350); };
      u.onerror = () => { i++; setTimeout(next, 350); };
      try { speechSynthesis.speak(u); } catch (e) { i++; setTimeout(next, 350); }
    };
    next();
  },
  stop() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {} }
};

const Beep = {
  ctx: null,
  play(n) {
    n = n || 3;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = this.ctx || new C(); if (this.ctx.state === 'suspended') this.ctx.resume();
      const c = this.ctx; let t = c.currentTime + 0.05;
      for (let k = 0; k < n; k++) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = k === n - 1 ? 1174 : 880;
        o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.start(t); o.stop(t + 0.55); t += 0.6;
      }
    } catch (e) {}
  }
};

const Sound = {
  unlocked: false,
  init() { this.unlocked = sessionStorage.getItem('cs_unlocked') === '1'; },
  unlock() {
    const self = this;
    return new Promise(resolve => {
      try {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) { self._done(); return resolve(); }
        Beep.ctx = Beep.ctx || new C();
        if (Beep.ctx.state === 'suspended') Beep.ctx.resume().then(() => { self._done(); resolve(); }, () => { self._done(); resolve(); });
        else { self._done(); resolve(); }
      } catch (e) { self._done(); resolve(); }
    });
  },
  _done() { this.unlocked = true; sessionStorage.setItem('cs_unlocked', '1'); TTS.init(); }
};

const Recorder = {
  rec: null, chunks: [], t0: 0, stream: null,
  supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); },
  start() {
    const self = this;
    return new Promise((resolve, reject) => {
      if (!self.supported()) return reject(new Error('当前浏览器不支持录音，请用手机或电脑版 Chrome/Edge'));
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        self.stream = stream; self.chunks = []; self.t0 = Date.now();
        try { self.rec = new MediaRecorder(stream); } catch (e) { stream.getTracks().forEach(t => t.stop()); return reject(new Error('录音组件初始化失败')); }
        self.rec.ondataavailable = e => { if (e.data && e.data.size) self.chunks.push(e.data); };
        self.rec.start(200); resolve();
      }).catch(e => reject(new Error('无法访问麦克风：' + (e.message || e.name || '请允许麦克风权限'))));
    });
  },
  stop() {
    const self = this;
    return new Promise(resolve => {
      if (!self.rec || self.rec.state === 'inactive') { self._kill(); return resolve(null); }
      const mime = self.rec.mimeType || 'audio/webm';
      self.rec.onstop = () => { self._kill(); const blob = self.chunks.length ? new Blob(self.chunks, { type: mime }) : null; resolve({ blob: blob, duration: (Date.now() - self.t0) / 1000 }); };
      try { self.rec.stop(); } catch (e) { self._kill(); resolve(null); }
    });
  },
  cancel() { if (this.rec && this.rec.state !== 'inactive') { try { this.rec.onstop = null; this.rec.stop(); } catch (e) {} } this._kill(); },
  _kill() { if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; } this.rec = null; }
};

function bigFontSize(text) {
  const len = String(text || '').length;
  if (len <= 8) return '15vmin';
  if (len <= 18) return '11vmin';
  if (len <= 40) return '8vmin';
  if (len <= 80) return '6vmin';
  return '4.6vmin';
}
function startClock(fn) { const run = () => fn(new Date()); run(); setInterval(run, 1000); }

/* ---------- 班级绑定（大屏 / 学生端 / 点名端：不需要登录，输入绑定码即可） ---------- */
const ClassBind = {
  KEY: 'cs_class_id',
  get() {
    try { const v = JSON.parse(localStorage.getItem(this.KEY) || 'null'); return v || null; } catch (e) { return null; }
  },
  set(id) { try { localStorage.setItem(this.KEY, JSON.stringify(id)); } catch (e) {} },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} },
  urlCode() {
    const m = /[?&](?:bind|code)=(\d{6})/.exec(location.search || '');
    return m ? m[1] : null;
  },
  async resolve(code) {
    const c = await C.clsByCode(String(code || '').trim());
    return c || null;
  },
  /* 全屏绑定面板；onBound(classRow) 在绑定成功后调用 */
  ask(opts) {
    opts = opts || {};
    const old = document.getElementById('cs-bind-overlay');
    if (old) old.remove();
    const big = (window.innerWidth || 0) >= 900;   // 投到大屏时整体放大
    const t1 = big ? 30 : 20, t2 = big ? 17 : 13, t3 = big ? 42 : 26, t4 = big ? 20 : 16, t5 = big ? 14 : 11.5;
    const ov = document.createElement('div');
    ov.id = 'cs-bind-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:1200;padding:20px;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(900px 620px at 50% 28%,#123A2C 0%,#08110D 76%)';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:' + (big ? 30 : 24) + 'px;padding:' + (big ? '44px 40px 34px' : '30px 24px 24px') + ';width:min(' + (big ? 620 : 430) + 'px,92vw);box-shadow:0 26px 70px rgba(0,0,0,.45);text-align:center">' +
        '<div style="font-size:' + t1 + 'px;font-weight:800;color:#111;letter-spacing:-.3px">' + esc(opts.title || '绑定班级') + '</div>' +
        '<p style="color:#8A9490;font-size:' + t2 + 'px;line-height:1.7;margin:' + (big ? '14px 0 28px' : '8px 0 20px') + '">' + (opts.hint || '输入老师给的 6 位绑定码，绑定后即可接收通知。<br>不需要登录账号。') + '</p>' +
        '<input id="cs-bind-code" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="000000" ' +
          'style="width:100%;text-align:center;letter-spacing:' + (big ? 18 : 10) + 'px;font-size:' + t3 + 'px;font-weight:800;color:#0B5A3C;' +
          'border:2px solid #E6EAE9;border-radius:16px;padding:' + (big ? '18px 12px' : '14px 10px') + ';outline:none;font-variant-numeric:tabular-nums">' +
        '<div id="cs-bind-err" style="color:#E0483B;font-size:' + t2 + 'px;min-height:' + (big ? 24 : 18) + 'px;margin-top:' + (big ? 12 : 10) + 'px"></div>' +
        '<button id="cs-bind-go" style="background:linear-gradient(135deg,#00C97F,#00A86B);color:#fff;border:none;border-radius:14px;' +
          'padding:' + (big ? '18px' : '14px') + ';font-size:' + t4 + 'px;font-weight:700;width:100%;margin-top:4px">绑定这个班级</button>' +
        (opts.cancel ? '<button id="cs-bind-cancel" style="background:none;border:none;color:#8A9490;font-size:' + t2 + 'px;margin-top:14px">取消</button>' : '') +
        '<div style="border-top:1px solid #F0F3F2;margin:' + (big ? '22px 0 16px' : '16px 0 12px') + '"></div>' +
        '<p style="color:#A9B2AE;font-size:' + t5 + 'px;line-height:1.6;margin:0">绑定码在老师端「班级」页顶部，可以让老师发给你</p>' +
      '</div>';
    document.body.appendChild(ov);
    const input = document.getElementById('cs-bind-code');
    const err = m => { document.getElementById('cs-bind-err').textContent = m || ''; };
    const submit = async () => {
      const code = (input.value || '').replace(/\D/g, '');
      if (code.length !== 6) { err('请输入 6 位绑定码'); return; }
      const btn = document.getElementById('cs-bind-go');
      btn.disabled = true; btn.textContent = '正在绑定…'; err('');
      try {
        const c = await ClassBind.resolve(code);
        if (!c) { err('绑定码不存在，请核对后重试'); btn.disabled = false; btn.textContent = '绑定这个班级'; return; }
        ClassBind.set(c.id);
        ov.remove();
        if (opts.onBound) opts.onBound(c);
      } catch (e) {
        err('网络不太好，请重试'); btn.disabled = false; btn.textContent = '绑定这个班级';
      }
    };
    document.getElementById('cs-bind-go').onclick = submit;
    if (opts.cancel) document.getElementById('cs-bind-cancel').onclick = () => { ov.remove(); if (opts.onCancel) opts.onCancel(); };
    input.addEventListener('input', () => { input.value = (input.value || '').replace(/\D/g, '').slice(0, 6); err(''); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 120);
  }
};
