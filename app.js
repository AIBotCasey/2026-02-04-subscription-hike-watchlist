function projectSlugFromPath(){
  const parts = (location.pathname || '').split('/').filter(Boolean);
  const i = parts.indexOf('projects');
  return (i >= 0 && parts[i+1]) ? parts[i+1] : '2026-02-04-subscription-hike-watchlist';
}

const PROJECT = projectSlugFromPath();
const API = `/api/projects/${encodeURIComponent(PROJECT)}/data`;

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function parseDate(s){ const d=new Date(s+'T00:00:00'); return isNaN(d)?null:d; }
function fmtMoney(n){
  const x = Number(n||0);
  return x.toLocaleString(undefined,{style:'currency',currency:'USD'});
}
function esc(s){
  return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function apiGet(){
  const res = await fetch(API,{cache:'no-store'});
  const json = await res.json();
  if(!json.ok) throw new Error(json.error||'api_error');
  return json;
}
async function apiPost(items){
  const res = await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});
  const json = await res.json();
  if(!json.ok) throw new Error(json.error||'api_error');
}

const els = {
  form: document.querySelector('#form'),
  name: document.querySelector('#name'),
  amount: document.querySelector('#amount'),
  cycle: document.querySelector('#cycle'),
  nextCharge: document.querySelector('#nextCharge'),
  category: document.querySelector('#category'),
  notes: document.querySelector('#notes'),

  list: document.querySelector('#list'),
  upcoming: document.querySelector('#upcoming'),
  breakdown: document.querySelector('#breakdown'),

  status: document.querySelector('#status'),
  filter: document.querySelector('#filter'),
  sort: document.querySelector('#sort'),
  showCanceled: document.querySelector('#showCanceled'),

  clearAll: document.querySelector('#clearAll'),
  importBtn: document.querySelector('#import'),
  exportJson: document.querySelector('#exportJson'),
  exportCsv: document.querySelector('#exportCsv'),
  jsonFile: document.querySelector('#jsonFile'),

  count: document.querySelector('#count'),
  monthlyTotal: document.querySelector('#monthlyTotal'),
  annualTotal: document.querySelector('#annualTotal'),
  next14: document.querySelector('#next14')
};

els.nextCharge.value = todayStr();

let items = [];

function normalize(x){
  return {
    id: x.id || uid(),
    name: String(x.name||'').trim(),
    amount: Number(x.amount||0),
    cycle: x.cycle === 'yearly' ? 'yearly' : 'monthly',
    nextCharge: x.nextCharge || todayStr(),
    category: String(x.category||'').trim(),
    notes: String(x.notes||'').trim(),
    hikes: Array.isArray(x.hikes) ? x.hikes : [],
    status: (x.status === 'canceled') ? 'canceled' : 'active',
    createdAt: x.createdAt || new Date().toISOString(),
    canceledAt: x.canceledAt || null
  };
}

function computeMonthly(x){
  return x.cycle === 'yearly' ? (x.amount/12) : x.amount;
}

async function persist(){
  await apiPost(items);
  els.status.textContent = `Saved · ${new Date().toLocaleTimeString()}`;
  setTimeout(()=> els.status.textContent='', 1200);
}

function filteredItems(){
  const f = (els.filter.value||'').trim().toLowerCase();
  const showCanceled = !!els.showCanceled.checked;
  let out = items.map(normalize)
    .filter(x => showCanceled ? true : x.status !== 'canceled')
    .filter(x => {
      if(!f) return true;
      const blob = `${x.name} ${x.category} ${x.notes}`.toLowerCase();
      return blob.includes(f);
    });

  const mode = els.sort.value;
  const cmp = {
    'name': (a,b)=> a.name.localeCompare(b.name),
    'next': (a,b)=> (parseDate(a.nextCharge)||0) - (parseDate(b.nextCharge)||0),
    'monthly': (a,b)=> computeMonthly(b) - computeMonthly(a),
    'hikes': (a,b)=> (b.hikes.length - a.hikes.length)
  }[mode] || ((a,b)=> a.name.localeCompare(b.name));

  out.sort(cmp);
  return out;
}

function renderSummary(list){
  const monthly = list.reduce((sum,x)=> sum+computeMonthly(x), 0);
  const annual = monthly*12;
  els.monthlyTotal.textContent = fmtMoney(monthly);
  els.annualTotal.textContent = fmtMoney(annual);

  const now = parseDate(todayStr());
  const within14 = list
    .map(x => ({...x, d: parseDate(x.nextCharge)}))
    .filter(x => x.d)
    .filter(x => {
      const diff = Math.ceil((x.d - now)/86400000);
      return diff >= 0 && diff <= 14;
    });

  els.next14.textContent = within14.length ? `${within14.length} charge(s)` : '0';
  els.count.textContent = `${list.length} item(s)`;
}

function renderBreakdown(list){
  const buckets = new Map();
  for (const x of list) {
    const k = (x.category || 'Uncategorized').trim() || 'Uncategorized';
    buckets.set(k, (buckets.get(k) || 0) + computeMonthly(x));
  }
  const rows = [...buckets.entries()].sort((a,b)=> b[1]-a[1]);
  els.breakdown.innerHTML = rows.length ? rows.map(([k,v])=>{
    return `<div class="card"><div class="top"><div class="title">${esc(k)}</div><div class="badge">~ ${fmtMoney(v)}/mo</div></div></div>`;
  }).join('') : `<div class="muted">No data.</div>`;
}

function renderUpcoming(list){
  const now = parseDate(todayStr());
  const upcoming = list
    .map(x => ({...x, d: parseDate(x.nextCharge)}))
    .filter(x => x.d)
    .sort((a,b)=> a.d-b.d);

  const within14 = upcoming.filter(x => {
    const diff = Math.ceil((x.d - now)/86400000);
    return diff >= 0 && diff <= 14;
  });

  els.upcoming.innerHTML = within14.length ? within14.map(x => {
    const days = Math.ceil((x.d-now)/86400000);
    const badge = days <= 3 ? 'due' : '';
    return `
      <div class="card">
        <div class="top">
          <div>
            <div class="title">${esc(x.name)}</div>
            <div class="muted">${esc(x.nextCharge)} · ${esc(x.cycle)} · ${esc(x.category||'—')}</div>
          </div>
          <div style="text-align:right">
            <div class="badge ${badge}">${fmtMoney(x.amount)}</div>
            <div class="muted" style="margin-top:6px">in ${days} day(s)</div>
          </div>
        </div>
      </div>`;
  }).join('') : `<div class="muted">No charges in the next 14 days.</div>`;
}

function renderList(list){
  els.list.innerHTML = list.length ? list.map(x => {
    const hist = x.hikes.length ? `<span class="badge accent">${x.hikes.length} hike(s)</span>` : '';
    const status = x.status === 'canceled' ? `<span class="badge">canceled</span>` : '';
    return `
      <div class="card" data-id="${esc(x.id)}">
        <div class="top">
          <div>
            <div class="title">${esc(x.name)}</div>
            <div class="muted">${esc(x.category||'—')} · next ${esc(x.nextCharge)} · ${esc(x.cycle)}</div>
            ${x.notes ? `<div class="muted" style="margin-top:8px;white-space:pre-wrap">${esc(x.notes)}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div class="badge">${fmtMoney(x.amount)}</div>
            <div class="muted" style="margin-top:6px">~ ${fmtMoney(computeMonthly(x))}/mo</div>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          ${hist}
          ${status}
          <span class="badge">annual ~ ${fmtMoney(computeMonthly(x)*12)}</span>
        </div>
        <div class="actions">
          <button data-action="edit">Edit</button>
          <button data-action="add-hike">Add hike</button>
          ${x.status === 'canceled' ? `<button data-action="undo">Undo cancel</button>` : `<button data-action="cancel">Cancel</button>`}
          <button data-action="delete" class="danger">Delete</button>
        </div>
      </div>`;
  }).join('') : `<div class="muted">No subscriptions yet.</div>`;
}

function render(){
  const list = filteredItems();
  renderSummary(list);
  renderBreakdown(list);
  renderUpcoming(list);
  renderList(list);
}

els.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const x = normalize({
    id: uid(),
    name: els.name.value,
    amount: els.amount.value,
    cycle: els.cycle.value,
    nextCharge: els.nextCharge.value,
    category: els.category.value,
    notes: els.notes.value,
    hikes: [],
    status: 'active'
  });
  if(!x.name) return;
  items.push(x);
  await persist();
  els.name.value='';
  els.category.value='';
  els.notes.value='';
  render();
});

els.list.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  const card = e.target.closest('.card');
  if(!card) return;
  const id = card.dataset.id;
  const x = items.find(i => i.id === id);
  if(!x) return;

  const action = btn.dataset.action;

  if(action === 'delete'){
    if(!confirm('Delete?')) return;
    items = items.filter(i => i.id !== id);
    await persist();
    render();
    return;
  }

  if(action === 'cancel'){
    x.status = 'canceled';
    x.canceledAt = new Date().toISOString();
    await persist();
    render();
    return;
  }

  if(action === 'undo'){
    x.status = 'active';
    x.canceledAt = null;
    await persist();
    render();
    return;
  }

  if(action === 'edit'){
    const name = prompt('Name:', x.name); if(name===null) return;
    const amount = prompt('Amount:', String(x.amount)); if(amount===null) return;
    const cycle = prompt('Cycle (monthly/yearly):', x.cycle); if(cycle===null) return;
    const nextCharge = prompt('Next charge (YYYY-MM-DD):', x.nextCharge); if(nextCharge===null) return;
    const category = prompt('Category:', x.category||''); if(category===null) return;
    const notes = prompt('Notes:', x.notes||''); if(notes===null) return;

    x.name = name.trim();
    x.amount = Number(amount||0);
    x.cycle = (cycle.trim()==='yearly') ? 'yearly' : 'monthly';
    x.nextCharge = nextCharge.trim() || todayStr();
    x.category = category.trim();
    x.notes = notes;

    await persist();
    render();
    return;
  }

  if(action === 'add-hike'){
    const when = prompt('Hike date (YYYY-MM-DD):', todayStr()); if(when===null) return;
    const oldAmt = prompt('Old amount:', String(x.amount)); if(oldAmt===null) return;
    const newAmt = prompt('New amount:', String(x.amount)); if(newAmt===null) return;
    const note = prompt('Note (optional):', ''); if(note===null) return;
    x.hikes.push({ when: when.trim(), old: Number(oldAmt||0), next: Number(newAmt||0), note });
    x.amount = Number(newAmt||x.amount);
    await persist();
    render();
    return;
  }
});

els.filter.addEventListener('input', render);
els.sort.addEventListener('change', render);
els.showCanceled.addEventListener('change', render);

els.clearAll.addEventListener('click', async ()=>{
  if(!confirm('Clear all subscriptions (including canceled)?')) return;
  items = [];
  await persist();
  render();
});

els.exportJson.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(items,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'subscriptions.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

els.exportCsv.addEventListener('click', ()=>{
  const rows = [['name','amount','cycle','nextCharge','category','notes','status','canceledAt','hikesJson']].concat(
    items.map(x => [x.name, String(x.amount), x.cycle, x.nextCharge, x.category||'', x.notes||'', x.status||'active', x.canceledAt||'', JSON.stringify(x.hikes||[])])
  );
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    if (/[\n\r,\"]/g.test(s)) return '"' + s.replace(/\"/g,'""') + '"';
    return s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'subscriptions.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

els.importBtn.addEventListener('click', ()=>{
  els.jsonFile.value='';
  els.jsonFile.click();
});

els.jsonFile.addEventListener('change', async ()=>{
  const f = els.jsonFile.files && els.jsonFile.files[0];
  if(!f) return;
  try {
    const txt = await f.text();
    const arr = JSON.parse(txt);
    if(!Array.isArray(arr)) return;
    items = items.concat(arr.map(normalize));
    await persist();
    render();
  } catch(_) {}
});

(async function boot(){
  const json = await apiGet();
  items = Array.isArray(json.items) ? json.items.map(normalize) : [];
  await persist();
  render();
})().catch(err => {
  console.error(err);
  els.status.textContent = 'Failed to load data';
});
