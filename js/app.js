// =====================================================================
// TELA (front-end). Só conversa com o backend através de window.API.
// =====================================================================
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_C = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIAS = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const CATS = {
  feriado: { label: 'Feriados', one: 'Feriado', ord: 0 },
  evento:  { label: 'Eventos especiais', one: 'Evento especial', ord: 1 },
  aniv:    { label: 'Aniversários e homenagens', one: 'Aniversário ou homenagem', ord: 2 },
  data:    { label: 'Datas comemorativas', one: 'Data comemorativa', ord: 3 },
  culto:   { label: 'Cultos', one: 'Culto', ord: 4 },
};
const CAMP_COLORS = { azul: 'Azul', rosa: 'Rosa', amarelo: 'Amarelo', verde: 'Verde' };
const START = { y: 2026, m: 10 }, END = { y: 2027, m: 11 };

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = k => { const d = parseKey(k); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
const fmtShort = k => { const d = parseKey(k); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const fmtWhen = iso => { const d = new Date(iso); return `${d.getDate()} ${MESES_C[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const cap = s => s[0].toUpperCase() + s.slice(1);
const color = c => `var(--${c})`;
const mins = t => { if (!t) return -1; const [h, mm] = t.split('h'); return (+h) * 60 + (+mm || 0); };
const cmp = (a, b) => (a.pend - b.pend) || CATS[a.c].ord - CATS[b.c].ord || mins(a.t) - mins(b.t);
const timeToInput = t => { if (!t) return ''; const [h, m] = t.split('h'); return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`; };
const inputToTime = v => { if (!v) return ''; const [h, m] = v.split(':'); return `${+h}h${m === '00' ? '' : m}`; };
const dot = e => `<i class="dot${e.pend ? ' pend' : ''}" style="--c:${color(e.c)}"></i>`;
const sub = e => [e.l, e.total ? (e.l ? `dia ${e.dia} de ${e.total}` : `Dia ${e.dia} de ${e.total}`) : null].filter(Boolean).join(' · ');
const label = e => e.n + (sub(e) ? ` – ${sub(e)}` : '');
const idx = c => (c.y - START.y) * 12 + (c.m - START.m);
const TOTAL = idx(END) + 1;
const fromIdx = i => ({ y: START.y + Math.floor((START.m + i) / 12), m: (START.m + i) % 12 });
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

let toastTimer;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 2600);
}
const fail = e => toast(e.message || String(e), true);
const isAdmin = () => ME && ME.perfil === 'admin';

// ---------- estado ----------
let ME = null, EVENTS = [], REQS = [], CAMPS = {}, IDX = {};
let cur = { ...START }, view = 'cal';
const active = new Set(Object.keys(CATS));

function buildIndex() {
  IDX = {};
  const put = (k, o) => (IDX[k] || (IDX[k] = [])).push(o);
  const spread = (e, extra) => {
    if (!e.fim) return put(e.data, { ...e, ...extra });
    const s = parseKey(e.data), f = parseKey(e.fim), total = Math.round((f - s) / 864e5) + 1;
    for (let i = 0, d = new Date(s); i < total; i++, d.setDate(d.getDate() + 1))
      put(key(d.getFullYear(), d.getMonth(), d.getDate()), { ...e, ...extra, dia: i + 1, total });
  };
  EVENTS.forEach(e => spread(e, { pend: 0 }));
  // Pendentes aparecem (tracejados) para o autor e para os admins
  REQS.filter(r => r.status === 'pendente').forEach(r => spread(r.evento, { pend: 1, reqId: r.id, autor: r.autorNome }));
}
const eventsOf = k => (IDX[k] || []).filter(e => active.has(e.c)).sort(cmp);

async function loadData() {
  [EVENTS, REQS, CAMPS] = await Promise.all([API.listEvents(), API.listRequests(), API.listCampaigns()]);
  buildIndex();
  const pend = REQS.filter(r => r.status === 'pendente').length;
  const rc = $('#reqCount'); rc.hidden = !(isAdmin() && pend); rc.textContent = pend;
}
async function refresh() { try { await loadData(); render(); } catch (e) { handleAuthError(e); } }
function handleAuthError(e) { fail(e); if (/Sessão/.test(e.message)) showLogin(); }

// =====================================================================
// LOGIN
// =====================================================================
function showLogin() {
  ME = null; closeAll();
  $('#appScreen').hidden = true; $('#loginScreen').hidden = false;
  $('#lgErr').hidden = true; $('#lgPass').value = '';
  setTimeout(() => $('#lgEmail').focus(), 0);
}
$('#loginForm').onsubmit = async ev => {
  ev.preventDefault();
  const b = $('#lgSubmit'); b.disabled = true; $('#lgErr').hidden = true;
  try {
    ME = await API.login($('#lgEmail').value, $('#lgPass').value, $('#lgRemember').checked);
    await enterApp();
  } catch (e) { $('#lgErr').textContent = e.message; $('#lgErr').hidden = false; }
  b.disabled = false;
};
document.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => {
  const admin = b.dataset.demo === 'admin';
  $('#lgEmail').value = admin ? 'admin@mahanaim.demo' : 'membro@mahanaim.demo';
  $('#lgPass').value = admin ? 'admin123' : 'membro123';
  $('#loginForm').requestSubmit();
});
$('#lgForgot').onclick = () => toast('Recuperação de senha por e-mail será definida na fase do backend.');

async function enterApp() {
  $('#loginScreen').hidden = true; $('#appScreen').hidden = false;
  const adm = isAdmin();
  $('#avatar').textContent = initials(ME.nome);
  $('#whoName').textContent = ME.nome.split(' ')[0];
  $('#meName').textContent = ME.nome; $('#meEmail').textContent = ME.email;
  $('#meRole').textContent = adm ? 'Admin' : 'User · visualização';
  $('#meRole').className = 'badge' + (adm ? ' admin' : '');
  $('#btnRequests').hidden = !adm; $('#btnUsers').hidden = !adm;
  $('#mMine').hidden = adm; $('#mReset').hidden = !adm;
  $('#btnNew').innerHTML = adm
    ? '<span aria-hidden="true">+</span> <span class="lbl-long">Novo evento</span><span class="lbl-short">Novo</span>'
    : '<span aria-hidden="true">+</span> <span class="lbl-long">Solicitar evento</span><span class="lbl-short">Solicitar</span>';
  buildMonths(); buildLegend();
  try { await loadData(); } catch (e) { return handleAuthError(e); }
  render();
}

// ---------- menu do usuário ----------
const menu = $('#userMenu');
document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
$('#mLogout').onclick = async () => { menu.open = false; await API.logout(); showLogin(); toast('Você saiu.'); };
$('#mMine').onclick = () => { menu.open = false; openRequests(); };
$('#mReset').onclick = async () => {
  menu.open = false;
  const r = await ask({ title: 'Restaurar dados de exemplo?', msg: 'Todas as alterações feitas neste navegador serão descartadas. Isso existe só no protótipo.', ok: 'Restaurar', danger: true });
  if (!r) return;
  await API.resetDemo();
  ME = await API.me();
  if (!ME) return showLogin();
  await refresh(); toast('Dados de exemplo restaurados.');
};
$('#btnNew').onclick = () => openForm({ mode: isAdmin() ? 'create' : 'request', ev: { data: defaultDate() } });
$('#btnRequests').onclick = () => openRequests();
$('#btnUsers').onclick = () => openUsers();
function defaultDate() {
  const t = new Date();
  return (t.getFullYear() === cur.y && t.getMonth() === cur.m) ? key(cur.y, cur.m, t.getDate()) : key(cur.y, cur.m, 1);
}

// =====================================================================
// CALENDÁRIO
// =====================================================================
function buildMonths() {
  const nav = $('#months'); nav.innerHTML = '';
  for (let i = 0; i < TOTAL; i++) {
    const { y, m } = fromIdx(i);
    const b = document.createElement('button');
    b.textContent = `${MESES_C[m]}/${String(y).slice(2)}`;
    b.dataset.i = i; b.onclick = () => { cur = { y, m }; render(); };
    nav.appendChild(b);
  }
}
function buildLegend() {
  const lg = $('#legend'); lg.innerHTML = '';
  Object.entries(CATS).forEach(([c, v]) => {
    const b = document.createElement('button');
    b.innerHTML = `<i class="dot" style="--c:${color(c)}"></i>${v.label}`;
    b.setAttribute('aria-pressed', active.has(c));
    b.onclick = () => { active.has(c) ? active.delete(c) : active.add(c); b.setAttribute('aria-pressed', active.has(c)); render(); };
    lg.appendChild(b);
  });
  const hint = document.createElement('span'); hint.className = 'hint';
  hint.textContent = isAdmin() ? 'Toque num dia para ver, adicionar ou editar.' : 'Toque num dia para ver tudo ou solicitar um evento.';
  lg.appendChild(hint);
}

function render() {
  const { y, m } = cur;
  $('#title').textContent = `${cap(MESES[m])} de ${y}`;
  $('#prev').disabled = idx(cur) <= 0;
  $('#next').disabled = idx(cur) >= TOTAL - 1;
  document.querySelectorAll('#months button').forEach(b => {
    const on = +b.dataset.i === idx(cur);
    b.setAttribute('aria-current', on);
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  renderCampaign();
  $('#calView').hidden = view !== 'cal';
  $('#listView').hidden = view !== 'list';
  view === 'cal' ? renderGrid() : renderList();
}

function renderCampaign() {
  const ym = key(cur.y, cur.m, 1).slice(0, 7), camp = CAMPS[ym], box = $('#campaign');
  box.className = ''; box.innerHTML = ''; box.onclick = null; box.removeAttribute('role'); box.removeAttribute('tabindex');
  if (camp) {
    box.className = 'campaign';
    box.innerHTML = `<i class="ribbon" style="background:${color(camp.c)}"></i><strong>${esc(camp.n)}</strong><span>${esc(camp.s)}</span>` +
      (isAdmin() ? '<button class="btn sm ghost edit">Editar</button>' : '');
    if (isAdmin()) box.querySelector('.edit').onclick = () => openCampaign(ym);
  } else if (isAdmin()) {
    box.className = 'campaign add'; box.textContent = '+ Adicionar campanha do mês';
    box.setAttribute('role', 'button'); box.tabIndex = 0;
    box.onclick = () => openCampaign(ym);
    box.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCampaign(ym); } };
  }
}

function renderGrid() {
  const { y, m } = cur, grid = $('#grid'); grid.innerHTML = '';
  const lead = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
  const todayK = (() => { const t = new Date(); return key(t.getFullYear(), t.getMonth(), t.getDate()); })();
  const blank = () => { const b = document.createElement('div'); b.className = 'day blank'; return b; };
  for (let i = 0; i < lead; i++) grid.appendChild(blank());
  for (let d = 1; d <= dim; d++) {
    const k = key(y, m, d), list = eventsOf(k), w = new Date(y, m, d).getDay();
    const cell = document.createElement('div');
    cell.className = 'day' + (w === 0 ? ' sun' : '') + (k === todayK ? ' today' : '');
    const hl = list.find(e => e.c !== 'culto' && !e.pend);
    let html = hl ? `<span class="bar" style="background:${color(hl.c)}"></span>` : '';
    if (list.some(e => e.c === 'feriado' && !e.pend)) cell.classList.add('hol');
    html += `<span class="num">${d}</span><span class="add-hint" aria-hidden="true">+</span>`;
    if (list.length) {
      html += '<ul class="ev">' + list.slice(0, 3).map(e =>
        `<li class="${e.pend ? 'pend' : ''}" title="${esc((e.t ? e.t + ' ' : '') + label(e) + (e.pend ? ' (pendente)' : ''))}">${dot(e)}${e.t ? `<span class="t">${esc(e.t)}</span>` : ''}<span class="n">${esc(label(e))}</span></li>`
      ).join('') + '</ul>';
      if (list.length > 3) html += `<span class="more">+${list.length - 3}</span>`;
      html += '<div class="dots">' + list.map(dot).join('') + '</div>';
    }
    cell.innerHTML = html;
    cell.tabIndex = 0; cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${d} de ${MESES[m]}, ${list.length} ${list.length === 1 ? 'item' : 'itens'}`);
    cell.onclick = () => openDay(k);
    cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(k); } };
    grid.appendChild(cell);
  }
  const trail = (7 - (lead + dim) % 7) % 7;
  for (let i = 0; i < trail; i++) grid.appendChild(blank());
}

function renderList() {
  const { y, m } = cur, box = $('#listView'); box.innerHTML = '';
  const dim = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const k = key(y, m, d), list = eventsOf(k); if (!list.length) continue;
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<div class="date">${d} de ${MESES[m]}<small>${DIAS[new Date(y, m, d).getDay()]}</small></div><ul>` +
      list.map(e => `<li class="${e.pend ? 'pend' : ''}">${dot(e)}<span class="t">${esc(e.t || '')}</span><span>${esc(e.n)}${sub(e) ? ` <span class="l">– ${esc(sub(e))}</span>` : ''}${e.pend ? ' <span class="badge pendente">Pendente</span>' : ''}</span></li>`).join('') + '</ul>';
    row.onclick = () => openDay(k);
    box.appendChild(row);
  }
  if (!box.children.length) box.innerHTML = '<p class="empty">Nenhum item neste mês com os filtros escolhidos. Ative mais tipos na legenda abaixo.</p>';
}

// =====================================================================
// DIÁLOGO DO DIA
// =====================================================================
let openDayKey = null;
function openDay(k) {
  openDayKey = k;
  const d = parseKey(k), list = eventsOf(k), adm = isAdmin();
  $('#dayTitle').textContent = fmtDate(k);
  $('#daySub').textContent = cap(DIAS[d.getDay()]);
  const ul = $('#dayList');
  ul.innerHTML = list.length ? list.map((e, i) => {
    let acts = '';
    if (e.pend) acts = adm ? `<button class="btn sm" data-review="${e.reqId}">Revisar</button>` : '<span class="badge pendente">Pendente</span>';
    else if (adm) acts = `<button class="iconbtn sm" data-edit="${i}" aria-label="Editar ${esc(e.n)}" title="Editar">✎</button><button class="iconbtn sm" data-del="${i}" aria-label="Excluir ${esc(e.n)}" title="Excluir">🗑</button>`;
    const kind = e.pend ? `Aguardando aprovação · enviado por ${esc(e.autor)}` : CATS[e.c].label + (e.serie ? ' · recorrente' : '');
    return `<li class="${e.pend ? 'pend' : ''}">${dot(e)}<span class="t">${esc(e.t || '')}</span><span class="n">${esc(e.n)}${sub(e) ? `<span class="l">${esc(sub(e))}</span>` : ''}<span class="k">${kind}</span></span><span class="acts">${acts}</span></li>`;
  }).join('') : '<li style="display:block;color:var(--muted)">Nenhum item neste dia.</li>';
  ul.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const e = EVENTS.find(x => x.id === list[+b.dataset.edit].id); openForm({ mode: 'edit', ev: e });
  });
  ul.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteEvent(EVENTS.find(x => x.id === list[+b.dataset.del].id)));
  ul.querySelectorAll('[data-review]').forEach(b => b.onclick = () => { $('#dayDlg').close(); openRequests('pendente'); });
  $('#dayAdd').textContent = adm ? '+ Adicionar neste dia' : '+ Solicitar evento neste dia';
  $('#dayAdd').onclick = () => openForm({ mode: adm ? 'create' : 'request', ev: { data: k } });
  if (!$('#dayDlg').open) $('#dayDlg').showModal();
}
const reopenDay = () => { if (openDayKey && $('#dayDlg').open) openDay(openDayKey); };

async function deleteEvent(e) {
  const r = await ask({
    title: 'Excluir item?', msg: `${e.n} · ${fmtShort(e.data)}`, ok: 'Excluir', danger: true, scope: !!e.serie,
  });
  if (!r) return;
  try { await API.deleteEvent(e.id, r.scope); await refresh(); reopenDay(); toast(r.scope === 'proximos' ? 'Série excluída a partir desta data.' : 'Item excluído.'); }
  catch (err) { fail(err); }
}

// =====================================================================
// FORMULÁRIO DE EVENTO / SOLICITAÇÃO
// modes: create | edit (admin) · request (user) · review (admin ajusta pedido)
// =====================================================================
$('#fCat').innerHTML = Object.entries(CATS).sort((a, b) => a[1].ord - b[1].ord).map(([c, v]) => `<option value="${c}">${v.one}</option>`).join('');
$('#fMulti').onchange = () => { $('#fEndWrap').hidden = !$('#fMulti').checked; };
document.querySelectorAll('input[name=scope]').forEach(r => r.onchange = () => { $('#fDate').disabled = r.value === 'proximos' && r.checked; });
let formCtx = null;

function openForm(ctx) {
  formCtx = ctx;
  const e = ctx.ev || {}, mode = ctx.mode;
  const T = {
    create: ['Novo evento', 'Será publicado direto no calendário.', 'Salvar'],
    edit: ['Editar item', CATS[e.c] ? CATS[e.c].one : '', 'Salvar alterações'],
    request: ['Solicitar evento', 'Sua solicitação vai para a liderança aprovar.', 'Enviar solicitação'],
    review: ['Ajustar e aprovar', `Pedido de ${ctx.autor || ''}`, 'Aprovar com ajustes'],
  }[mode];
  $('#formTitle').textContent = T[0]; $('#formSub').textContent = T[1]; $('#fSubmit').textContent = T[2];
  $('#fSubmit').className = 'btn ' + (mode === 'review' ? 'okb' : 'primary');
  $('#fTitle').value = e.n || '';
  $('#fCat').value = e.c || 'evento';
  $('#fDate').value = e.data || ''; $('#fDate').disabled = false;
  $('#fTime').value = timeToInput(e.t);
  $('#fMulti').checked = !!e.fim; $('#fEndWrap').hidden = !e.fim; $('#fEnd').value = e.fim || '';
  $('#fLoc').value = e.l || '';
  $('#fScope').hidden = !(mode === 'edit' && e.serie);
  document.querySelector('input[name=scope][value=um]').checked = true;
  $('#fMsgWrap').hidden = mode !== 'request'; $('#fMsg').value = '';
  const note = $('#fNote');
  note.hidden = !(mode === 'request' || mode === 'review');
  note.textContent = mode === 'request'
    ? 'Enquanto não for aprovado, o evento aparece tracejado só para você e para a liderança.'
    : 'As alterações substituem o que foi pedido. O solicitante verá o evento já ajustado.';
  $('#fErr').hidden = true;
  $('#formDlg').showModal();
  setTimeout(() => $('#fTitle').focus(), 0);
}

$('#evForm').onsubmit = async ev => {
  ev.preventDefault();
  const { mode } = formCtx, base = formCtx.ev || {};
  const data = {
    n: $('#fTitle').value.trim(), c: $('#fCat').value, data: $('#fDate').value,
    t: inputToTime($('#fTime').value), l: $('#fLoc').value.trim(),
    fim: $('#fMulti').checked ? $('#fEnd').value : '',
  };
  const errBox = $('#fErr'); errBox.hidden = true;
  const bad = m => { errBox.textContent = m; errBox.hidden = false; };
  if (!data.n) return bad('Informe o título.');
  if (!data.data) return bad('Informe a data.');
  if ($('#fMulti').checked && (!data.fim || data.fim <= data.data)) return bad('A data final precisa ser depois da data inicial.');
  const scope = document.querySelector('input[name=scope]:checked').value;
  const b = $('#fSubmit'); b.disabled = true;
  try {
    if (mode === 'create') { await API.saveEvent(data); toast('Evento publicado.'); }
    if (mode === 'edit') { await API.saveEvent({ ...data, id: base.id }, $('#fScope').hidden ? 'um' : scope); toast(scope === 'proximos' && !$('#fScope').hidden ? 'Série atualizada a partir desta data.' : 'Alterações salvas.'); }
    if (mode === 'request') { await API.createRequest(data, $('#fMsg').value); toast('Solicitação enviada para a liderança.'); }
    if (mode === 'review') { await API.approveRequest(formCtx.reqId, data); toast('Solicitação aprovada com ajustes.'); }
    $('#formDlg').close();
    await refresh();
    // Criado pelo botão do topo: leva o calendário até o mês do evento
    if (!$('#dayDlg').open && mode !== 'review') {
      const d = parseKey(data.data), c = { y: d.getFullYear(), m: d.getMonth() };
      if (idx(c) >= 0 && idx(c) < TOTAL) { cur = c; render(); }
    }
    reopenDay();
    if ($('#reqDlg').open) renderRequests();
  } catch (err) { bad(err.message); }
  b.disabled = false;
};

// =====================================================================
// CONFIRMAÇÃO GENÉRICA (promessa)
// =====================================================================
function ask({ title, msg, ok, danger, scope, text }) {
  return new Promise(resolve => {
    const dlg = $('#askDlg');
    $('#askTitle').textContent = title; $('#askMsg').textContent = msg || '';
    $('#askOk').textContent = ok; $('#askOk').className = 'btn ' + (danger ? 'danger' : 'primary');
    $('#askScope').hidden = !scope;
    document.querySelector('input[name=askScope][value=um]').checked = true;
    $('#askTextWrap').hidden = !text; $('#askText').value = '';
    if (text) $('#askTextLabel').textContent = text;
    $('#askBody').hidden = !scope && !text;
    let done = false;
    const finish = v => { if (done) return; done = true; dlg.close(); resolve(v); };
    $('#askForm').onsubmit = e => { e.preventDefault(); finish({ scope: document.querySelector('input[name=askScope]:checked').value, text: $('#askText').value }); };
    $('#askCancel').onclick = () => finish(null);
    dlg.onclose = () => finish(null);
    dlg.showModal();
    setTimeout(() => (text ? $('#askText') : $('#askOk')).focus(), 0);
  });
}

// =====================================================================
// SOLICITAÇÕES
// =====================================================================
let reqTab = 'pendente';
function openRequests(tab) {
  reqTab = tab || 'pendente';
  $('#reqTitle').textContent = isAdmin() ? 'Solicitações' : 'Minhas solicitações';
  $('#reqSub').textContent = isAdmin() ? 'Tudo o que entra no calendário a pedido dos membros passa por aqui.' : 'Acompanhe o que você pediu para a liderança.';
  renderRequests();
  if (!$('#reqDlg').open) $('#reqDlg').showModal();
}
function renderRequests() {
  const tabs = [['pendente', 'Pendentes'], ['aprovada', 'Aprovadas'], ['recusada', 'Recusadas']];
  $('#reqTabs').innerHTML = tabs.map(([k, l]) => {
    const n = REQS.filter(r => r.status === k).length;
    return `<button role="tab" aria-selected="${k === reqTab}" data-tab="${k}">${l} (${n})</button>`;
  }).join('');
  $('#reqTabs').querySelectorAll('button').forEach(b => b.onclick = () => { reqTab = b.dataset.tab; renderRequests(); });
  const list = REQS.filter(r => r.status === reqTab), adm = isAdmin();
  const box = $('#reqList');
  if (!list.length) { box.innerHTML = `<p class="empty">${reqTab === 'pendente' ? 'Nada aguardando aprovação.' : 'Nenhuma solicitação aqui.'}</p>`; return; }
  box.innerHTML = list.map(r => {
    const e = r.evento;
    const when = fmtShort(e.data) + (e.fim ? ` a ${fmtShort(e.fim)}` : '') + (e.t ? ` · ${e.t}` : '');
    let acts = '';
    if (r.status === 'pendente') acts = adm
      ? `<div class="acts"><button class="btn okb sm" data-ok="${r.id}">Aprovar</button><button class="btn sm" data-adjust="${r.id}">Ajustar e aprovar</button><button class="btn sm danger" data-no="${r.id}">Recusar</button><button class="btn sm ghost" data-goto="${r.id}">Ver no calendário</button></div>`
      : `<div class="acts"><button class="btn sm danger" data-cancel="${r.id}">Cancelar solicitação</button></div>`;
    const reply = r.status !== 'pendente'
      ? `<div class="reply"><b>${r.status === 'aprovada' ? 'Aprovada' : 'Recusada'} por ${esc(r.revisorNome || '—')}</b> · ${fmtWhen(r.revisadoEm)}${r.motivo ? `<blockquote>${esc(r.motivo)}</blockquote>` : ''}</div>` : '';
    return `<article class="card">
      <div class="head"><div><h3>${dot({ c: e.c })}${esc(e.n)}</h3><div class="meta">${esc(when)}${e.l ? ` · ${esc(e.l)}` : ''} · ${CATS[e.c].one}</div></div><span class="badge ${r.status}">${cap(r.status)}</span></div>
      ${r.mensagem ? `<blockquote>${esc(r.mensagem)}</blockquote>` : ''}
      <div class="by">Enviada por ${esc(r.autorNome)} · ${fmtWhen(r.criadoEm)}</div>
      ${reply}${acts}
    </article>`;
  }).join('');
  const byId = id => REQS.find(r => r.id === id);
  box.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await API.approveRequest(b.dataset.ok); await refresh(); renderRequests(); toast('Aprovada e publicada no calendário.'); } catch (e) { fail(e); b.disabled = false; }
  });
  box.querySelectorAll('[data-adjust]').forEach(b => b.onclick = () => {
    const r = byId(b.dataset.adjust); openForm({ mode: 'review', ev: r.evento, reqId: r.id, autor: r.autorNome });
  });
  box.querySelectorAll('[data-no]').forEach(b => b.onclick = async () => {
    const r = byId(b.dataset.no);
    const res = await ask({ title: 'Recusar solicitação?', msg: `${r.evento.n} · ${fmtShort(r.evento.data)}`, ok: 'Recusar', danger: true, text: `Motivo para ${r.autorNome} (opcional)` });
    if (!res) return;
    try { await API.rejectRequest(r.id, res.text); await refresh(); renderRequests(); toast('Solicitação recusada.'); } catch (e) { fail(e); }
  });
  box.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
    const res = await ask({ title: 'Cancelar solicitação?', msg: 'Ela será retirada da fila da liderança.', ok: 'Cancelar solicitação', danger: true });
    if (!res) return;
    try { await API.cancelRequest(b.dataset.cancel); await refresh(); renderRequests(); toast('Solicitação cancelada.'); } catch (e) { fail(e); }
  });
  box.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => {
    const d = parseKey(byId(b.dataset.goto).evento.data); cur = { y: d.getFullYear(), m: d.getMonth() };
    $('#reqDlg').close(); render(); openDay(byId(b.dataset.goto).evento.data);
  });
}

// =====================================================================
// USUÁRIOS (admin)
// =====================================================================
async function openUsers() {
  try { await renderUsers(); } catch (e) { return fail(e); }
  $('#uErr').hidden = true; $('#userForm').reset();
  $('#usersDlg').showModal();
}
async function renderUsers() {
  const users = await API.listUsers(), box = $('#usersList');
  box.innerHTML = users.map(u => {
    const me = u.id === ME.id;
    return `<div class="user-row${u.ativo ? '' : ' off'}">
      <div><b>${esc(u.nome)}${me ? ' <span class="badge">você</span>' : ''}${u.ativo ? '' : ' <span class="badge">desativado</span>'}</b><small>${esc(u.email)}</small></div>
      <select data-role="${u.id}" aria-label="Perfil de ${esc(u.nome)}" ${me ? 'disabled' : ''}>
        <option value="user" ${u.perfil === 'user' ? 'selected' : ''}>User</option>
        <option value="admin" ${u.perfil === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
      <button class="btn sm ${u.ativo ? 'danger' : ''}" data-toggle="${u.id}" ${me ? 'disabled' : ''}>${u.ativo ? 'Desativar' : 'Reativar'}</button>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => {
    try { await API.saveUser({ id: s.dataset.role, perfil: s.value }); toast('Perfil atualizado.'); } catch (e) { fail(e); }
    renderUsers();
  });
  box.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    const u = users.find(x => x.id === b.dataset.toggle);
    try { await API.saveUser({ id: u.id, ativo: !u.ativo }); toast(u.ativo ? 'Acesso desativado.' : 'Acesso reativado.'); } catch (e) { fail(e); }
    renderUsers();
  });
}
$('#userForm').onsubmit = async ev => {
  ev.preventDefault();
  $('#uErr').hidden = true;
  try {
    await API.saveUser({ nome: $('#uName').value, email: $('#uEmail').value, senha: $('#uPass').value, perfil: $('#uRole').value });
    $('#userForm').reset(); await renderUsers(); toast('Acesso criado.');
  } catch (e) { $('#uErr').textContent = e.message; $('#uErr').hidden = false; }
};

// =====================================================================
// CAMPANHA DO MÊS (admin)
// =====================================================================
let campYm = null;
$('#cColors').innerHTML = Object.entries(CAMP_COLORS).map(([c, l]) =>
  `<label title="${l}"><input type="radio" name="campColor" value="${c}" aria-label="${l}"><i style="--c:${color(c)}"></i></label>`).join('');
function openCampaign(ym) {
  campYm = ym; const c = CAMPS[ym] || {};
  const [y, m] = ym.split('-').map(Number);
  $('#campSub').textContent = `${cap(MESES[m - 1])} de ${y}`;
  $('#cName').value = c.n || ''; $('#cDesc').value = c.s || '';
  document.querySelector(`input[name=campColor][value=${c.c || 'azul'}]`).checked = true;
  $('#cRemove').hidden = !CAMPS[ym];
  $('#campDlg').showModal();
}
$('#campForm').onsubmit = async ev => {
  ev.preventDefault();
  if (!$('#cName').value.trim()) return toast('Informe o nome da campanha.', true);
  try {
    CAMPS = await API.saveCampaign(campYm, { n: $('#cName').value, s: $('#cDesc').value, c: document.querySelector('input[name=campColor]:checked').value });
    $('#campDlg').close(); render(); toast('Campanha salva.');
  } catch (e) { fail(e); }
};
$('#cRemove').onclick = async () => {
  try { CAMPS = await API.saveCampaign(campYm, null); $('#campDlg').close(); render(); toast('Campanha removida.'); } catch (e) { fail(e); }
};

// =====================================================================
// NAVEGAÇÃO E INÍCIO
// =====================================================================
const step = n => { cur = fromIdx(Math.min(TOTAL - 1, Math.max(0, idx(cur) + n))); render(); };
$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);
const setView = v => { view = v; $('#vCal').setAttribute('aria-pressed', v === 'cal'); $('#vList').setAttribute('aria-pressed', v === 'list'); render(); };
$('#vCal').onclick = () => setView('cal');
$('#vList').onclick = () => setView('list');
document.querySelectorAll('dialog').forEach(d => {
  d.querySelectorAll('[data-close]').forEach(b => b.onclick = () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
});
const closeAll = () => document.querySelectorAll('dialog[open]').forEach(d => d.close());
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || $('#appScreen').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

(async function init() {
  const t = new Date(); let c = { y: t.getFullYear(), m: t.getMonth() };
  const mh = (location.hash || '').match(/^#(\d{4})-(\d{2})$/);
  if (mh) c = { y: +mh[1], m: +mh[2] - 1 };
  if (idx(c) >= 0 && idx(c) < TOTAL) cur = c;
  ME = await API.me();
  ME ? enterApp() : showLogin();
})();
