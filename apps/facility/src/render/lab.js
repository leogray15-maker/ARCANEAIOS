/**
 * THE LAB — Arcane Peptides as operations.
 *
 *   #lab              the catalogue: every product with cost, price, margin, vials on hand and COA
 *   #lab/<product>    one product: its lots (batch, vials, COA), its economics, what to change
 *   #lab/dispatch     the queue: packing → ready → shipped
 *
 * Products, lots, dispatch and the settings are server tables; the store
 * caches them. The numbers come from core/lab.js: landed cost per vial =
 * kit cost ÷ vials × the rate × (1 + overhead); margin on your vial price.
 * Operations only — nothing here says what a compound does, and nothing
 * here is copy for the public.
 */
import { esc, chip, when, num, failed, handleKeyForm, keepFocus, proposalsBlock } from './ui.js';

const COA = ['none', 'pending', 'published'];
const COA_TONE = { none: 'deny', pending: 'flare', published: 'vital' };
const STAGES = ['packing', 'ready', 'shipped', 'delivered', 'cancelled'];
const STAGE_TONE = { packing: 'flare', ready: 'cyan', shipped: 'vital', delivered: 'ash', cancelled: 'deny' };
const gbp = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `£${Number(n).toFixed(d)}`);
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const marginTone = (m) => (m === null ? 'ash' : m < 0.6 ? 'deny' : m < 0.75 ? 'flare' : 'vital');

const st = { q: '', view: 'listed', productId: '', editing: '' };
let el = null, go = null, store = null;

export function bindLab(view, ctx) {
  el = view; go = ctx.go; store = ctx.store;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChange);
  el.addEventListener('input', (e) => { if (e.target.id === 'lab-q') { st.q = e.target.value; paint({ keepScroll: true }); } });
}

export function renderLab(view, ctx, hash = '#lab', { keepScroll = false } = {}) {
  el = view;
  const m = /^#lab\/(.+)$/.exec(hash);
  st.productId = m && m[1] !== 'dispatch' ? decodeURIComponent(m[1]) : '';
  st.view = m && m[1] === 'dispatch' ? 'dispatch' : st.productId ? 'product' : st.view === 'dispatch' || st.view === 'product' ? 'listed' : st.view;
  paint({ keepScroll });
}

/* ---------- paint ---------- */
function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const restore = keepFocus(el, '#lab-q, input[data-act=product-field], input[data-act=setting]');
  const scroll = keepScroll ? el.scrollTop : 0;
  const sv = store.serverStatus();
  const lab = store.lab();
  const head = `<div class="view-head">
      <button class="back ghost" data-act="${st.view === 'listed' || st.view === 'all' ? 'back' : 'lab'}">${st.view === 'listed' || st.view === 'all' ? '← Floor' : '← The Lab'}</button>
      <h1>THE LAB</h1>
      <span class="sub">Arcane Peptides · <b>${num(lab.vials)}</b> vials in <b>${lab.live}</b> lines · COA <b>${lab.coaPct === null ? '—' : `${lab.coaPct}%`}</b> · stock at cost <b>${gbp(lab.valueCost, 0)}</b> / at price <b>${gbp(lab.valueSell, 0)}</b> · avg margin <b>${pct(lab.avgMargin)}</b></span>
      <span class="spacer"></span>
      <span class="${sv.tone}" title="${esc(sv.text)}">● ${esc(sv.tone === 'vital' ? 'state on the server' : sv.text)}</span>
    </div>
    ${sv.tone === 'breach' ? `<p class="flash breach">${esc(sv.text)}</p>` : ''}
    ${store.server.needsKey || (!store.server.ready && store.server.reason === 'no operator key') ? failed({ needsKey: true, status: 401 }) : ''}
    ${proposalsBlock(store, 'apothecary')}`;
  el.innerHTML = `<div class="wrap app lab">${head}${st.view === 'product' ? productView(lab) : st.view === 'dispatch' ? dispatchView(lab) : catalogueView(lab)}</div>`;
  el.scrollTop = scroll; restore();
}

function tabs() {
  const q = store.dispatchQueue().length;
  return `<div class="tabs">
    <button data-act="view" data-view="listed" class="${st.view === 'listed' ? 'on' : ''}">ON THE STORE <span class="faint">${store.products().filter((p) => p.listed && p.active !== false).length}</span></button>
    <button data-act="view" data-view="all" class="${st.view === 'all' ? 'on' : ''}">EVERY LINE <span class="faint">${store.products().filter((p) => p.active !== false).length}</span></button>
    <button data-act="view" data-view="stock" class="${st.view === 'stock' ? 'on' : ''}">IN STOCK <span class="faint">${store.stock().filter((l) => l.vials > 0).length}</span></button>
    <button data-act="view" data-view="dispatch" class="${st.view === 'dispatch' ? 'on' : ''}">DISPATCH <span class="faint">${q}</span></button>
  </div>`;
}

function catalogueView(lab) {
  const s = lab.settings;
  const q = st.q.trim().toLowerCase();
  let lines = store.stock();
  if (st.view === 'listed') lines = lines.filter((l) => l.listed);
  if (st.view === 'stock') lines = lines.filter((l) => l.vials > 0);
  if (q) lines = lines.filter((l) => [l.name, l.size, l.category, l.supplier_code, l.note].some((x) => String(x || '').toLowerCase().includes(q)));
  const byCat = {}; for (const l of lines) (byCat[l.category || '—'] || (byCat[l.category || '—'] = [])).push(l);
  const row = (l) => `<tr class="row ${l.vials === 0 ? 'faint-row' : ''}" data-act="open" data-id="${esc(l.id)}">
      <td><a href="#lab/${encodeURIComponent(l.id)}">${esc(l.name)}</a> <span class="ash">${esc(l.size)}</span>${l.note ? ` <span class="chip flare" title="${esc(l.note)}">?</span>` : ''}${!l.listed ? ' <span class="chip ash">not listed</span>' : ''}</td>
      <td class="ash">${esc(l.supplier_code || '—')}</td>
      <td class="r ash">${l.kit_cost_usd === null || l.kit_cost_usd === undefined ? '—' : `$${l.kit_cost_usd}`}</td>
      <td class="r">${gbp(l.cost)}</td>
      <td class="r">${gbp(l.sell)}</td>
      <td class="r">${l.profit === null ? '—' : gbp(l.profit)}</td>
      <td>${l.margin === null ? '<span class="faint">no cost</span>' : chip(pct(l.margin), marginTone(l.margin))}${l.markup ? ` <span class="faint">${l.markup.toFixed(1)}×</span>` : ''}</td>
      <td class="r"><b class="${l.low ? 'flare' : ''}">${l.vials}</b></td>
      <td>${l.vials > 0 ? chip(l.coa, COA_TONE[l.coa]) : ''}</td>
    </tr>`;
  return `${tabs()}
    <div class="toolbar">
      <input type="search" id="lab-q" placeholder="Search products, codes, categories" value="${esc(st.q)}" autocomplete="off">
      <span class="ash">rate <input class="num" data-act="setting" data-key="fx_gbp_per_usd" value="${esc(s.fx_gbp_per_usd)}" style="width:64px" title="pounds per US dollar"> £/$</span>
      <span class="ash">landed +<input class="num" data-act="setting" data-key="landed_overhead_pct" value="${esc(s.landed_overhead_pct)}" style="width:48px" title="shipping, import, fees — % on the kit cost">%</span>
      <span class="ash">low under <input class="num" data-act="setting" data-key="low_stock_vials" value="${esc(s.low_stock_vials)}" style="width:48px"> vials</span>
      <button class="tiny" data-act="new-product">+ product</button>
    </div>
    ${st.editing === 'new' ? newProductForm() : ''}
    ${lab.noCoa.length ? `<p class="flash breach">${lab.noCoa.length} line${lab.noCoa.length === 1 ? '' : 's'} in stock without a published COA: ${lab.noCoa.map((x) => `${x.name} ${x.size}`).map(esc).join(', ')}.</p>` : ''}
    ${lab.low.length ? `<p class="flash breach" style="border-left-color:var(--flare)">Low: ${lab.low.map((x) => `${x.name} ${x.size} (${x.vials})`).map(esc).join(', ')}.</p>` : ''}
    ${!lines.length ? (store.products().length ? '<p class="empty">Nothing matches.</p>' : '<div class="state empty-state"><p>No products yet. Import the catalogue: <code>npm run products:import</code> (reads data/peptides/catalog.json), or add one above.</p></div>') : Object.entries(byCat).map(([cat, ls]) => `<h2>${esc(cat)} <span class="faint">${ls.length}</span></h2>
      <table class="grid lab-table"><thead><tr><th>Product</th><th>Code</th><th class="r">Kit $</th><th class="r">Cost / vial</th><th class="r">Price</th><th class="r">Profit</th><th>Margin</th><th class="r">Vials</th><th>COA</th></tr></thead><tbody>${ls.map(row).join('')}</tbody></table>`).join('')}
    ${lab.uncosted.length && st.view !== 'stock' ? `<p class="src">No supplier cost yet: ${lab.uncosted.map(esc).join(', ')}. Open the product and type the kit cost.</p>` : ''}
    <p class="src">Cost per vial = kit cost ÷ vials per kit × the rate × (1 + landed %). Margin is on your price per vial. Click a product for its lots and to change any figure.</p>`;
}

function newProductForm() {
  return `<form class="inline add-order" data-act="product-add">
    <input name="name" placeholder="Name" style="width:200px" required><input name="size" placeholder="Size (5mg)" style="width:90px"><input name="category" placeholder="Category" style="width:180px">
    <input name="supplier_code" placeholder="Supplier code" style="width:110px"><input name="kit_cost_usd" type="number" step="0.01" min="0" placeholder="Kit $" style="width:80px"><input name="sell_gbp" type="number" step="0.01" min="0" placeholder="Price £" style="width:80px">
    <label class="chk"><input type="checkbox" name="listed" checked> on the store</label>
    <button type="submit" class="primary">Add</button><button type="button" class="ghost" data-act="cancel">cancel</button>
  </form>`;
}

function productView(lab) {
  const p = store.product(st.productId);
  if (!p) return `${tabs()}<p class="empty">No product "${esc(st.productId)}".</p>`;
  const line = store.stock().find((l) => l.id === p.id) || {};
  const lots = store.lots(p.id).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const field = (name, value, { type = 'text', w = 120, step } = {}) => `<label class="field"><span>${esc(name.replace(/_/g, ' '))}</span><input data-act="product-field" data-id="${esc(p.id)}" data-field="${name}" type="${type}" ${step ? `step="${step}"` : ''} value="${esc(value ?? '')}" style="width:${w}px"></label>`;
  return `${tabs()}
    <h2>${esc(p.name)} <span class="ash">${esc(p.size)}</span> ${p.listed ? chip('on the store', 'vital') : chip('not listed', 'ash')}${p.active === false ? chip('retired', 'deny') : ''}</h2>
    <div class="bridge-grid">
      <div class="bridge-main">
        <div class="stat-row">
          <div class="stat"><b>${gbp(line.cost)}</b><span>cost / vial (landed)</span></div>
          <div class="stat"><b>${gbp(line.sell)}</b><span>your price</span></div>
          <div class="stat ${marginTone(line.margin) === 'deny' ? 'breach' : marginTone(line.margin) === 'vital' ? 'vital' : ''}"><b>${pct(line.margin)}</b><span>margin${line.markup ? ` · ${line.markup.toFixed(1)}×` : ''}</span></div>
          <div class="stat"><b>${line.vials ?? 0}</b><span>vials on hand</span></div>
          <div class="stat"><b>${gbp(line.value_sell, 0)}</b><span>at price · ${gbp(line.value_cost, 0)} at cost</span></div>
        </div>
        ${p.note ? `<p class="flash" style="border-left-color:var(--flare)">${esc(p.note)}</p>` : ''}
        <h2>Figures</h2>
        <div class="fields">
          ${field('sell_gbp', p.sell_gbp, { type: 'number', step: '0.01', w: 100 })}
          ${field('kit_cost_usd', p.kit_cost_usd, { type: 'number', step: '0.01', w: 100 })}
          ${field('kit_vials', p.kit_vials, { type: 'number', w: 70 })}
          ${field('supplier_code', p.supplier_code, { w: 110 })}
          ${field('size', p.size, { w: 90 })}
          ${field('category', p.category, { w: 200 })}
          <label class="field wide"><span>note</span><input data-act="product-field" data-id="${esc(p.id)}" data-field="note" value="${esc(p.note || '')}"></label>
        </div>
        <p class="acts">
          <button class="tiny" data-act="product-toggle" data-id="${esc(p.id)}" data-field="listed" data-value="${p.listed ? 'false' : 'true'}">${p.listed ? 'take off the store' : 'put on the store'}</button>
          <button class="tiny ghost" data-act="product-toggle" data-id="${esc(p.id)}" data-field="active" data-value="${p.active === false ? 'true' : 'false'}">${p.active === false ? 'restore' : 'retire'}</button>
          <span class="faint">changes save when you leave the field</span>
        </p>

        <h2>Lots <span class="faint">${lots.length}</span></h2>
        ${lots.length ? `<table class="grid"><thead><tr><th>Lot</th><th>Batch</th><th class="r">Vials</th><th>COA</th><th>Received</th><th>Kit $</th><th></th></tr></thead><tbody>${lots.map((l) => `<tr>
            <td><code>${esc(l.id)}</code></td>
            <td>${esc(l.batch || '—')}</td>
            <td class="r nowrap"><button class="tiny" data-act="lot-adj" data-id="${esc(l.id)}" data-delta="-1">−</button> <b>${l.vials}</b> <button class="tiny" data-act="lot-adj" data-id="${esc(l.id)}" data-delta="1">+</button></td>
            <td>${COA.map((c) => `<button class="tiny ${l.coa === c ? COA_TONE[c] + ' on' : 'ghost'}" data-act="lot-coa" data-id="${esc(l.id)}" data-coa="${c}">${c}</button>`).join('')}${l.coa_url ? ` <a href="${esc(l.coa_url)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
            <td class="ash">${esc(l.received || '—')}</td>
            <td class="ash">${l.cost_usd ?? '—'}</td>
            <td class="r"><button class="tiny ghost" data-act="lot-remove" data-id="${esc(l.id)}" title="remove (only for a lot entered by mistake)">×</button></td>
          </tr>`).join('')}</tbody></table>` : '<p class="empty">No lots. Stock arrives as a lot: a batch, a count of vials, its COA.</p>'}
        <form class="inline add-order" data-act="lot-add" data-id="${esc(p.id)}">
          <input name="batch" placeholder="Batch / lot number" style="width:160px"><input name="vials" type="number" min="0" placeholder="Vials" style="width:80px" required>
          <select name="coa">${COA.map((c) => `<option value="${c}">COA ${c}</option>`).join('')}</select><input name="coa_url" placeholder="COA link (optional)" style="width:200px">
          <input name="received" type="date"><input name="cost_usd" type="number" step="0.01" min="0" placeholder="Kit $ if different" style="width:120px">
          <button type="submit" class="primary">Stock in</button>
        </form>
      </div>
      <aside class="bridge-side">
        <h2>Provenance</h2>
        <dl class="kv"><dt>id</dt><dd><code>${esc(p.id)}</code></dd><dt>supplier</dt><dd>${esc(p.supplier_id)} · ${esc(p.supplier_code || '—')}${p.supplier_section ? ` <span class="faint">(${esc(p.supplier_section)})</span>` : ''}</dd><dt>kit</dt><dd>${p.kit_vials} vials${p.kit_cost_usd ? ` · $${p.kit_cost_usd}` : ''}</dd><dt>changed</dt><dd>${when(p.updated_at)}</dd></dl>
        <p class="src">The rate and the landed overhead are set on the catalogue. A lot with its own kit cost overrides the catalogue cost for that lot only.</p>
      </aside>
    </div>`;
}

function dispatchView(lab) {
  const rows = store.state.dispatch.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const queue = rows.filter((d) => ['packing', 'ready'].includes(d.stage)), done = rows.filter((d) => !['packing', 'ready'].includes(d.stage)).slice(0, 30);
  const row = (d) => `<div class="order-row"><span>${chip(d.stage, STAGE_TONE[d.stage])}</span><b>${esc(d.ref)}</b><span class="text">${esc(d.items)}</span>${d.tracking ? `<span class="ash">${esc(d.tracking)}</span>` : ''}<span class="faint nowrap">${when(d.created_at)}</span>
    <span class="row-acts">${STAGES.filter((s) => s !== d.stage && !(d.stage === 'shipped' && s === 'packing')).map((s) => `<button class="tiny ghost" data-act="dispatch-stage" data-id="${esc(d.id)}" data-stage="${s}">${s}</button>`).join('')}${d.stage === 'ready' || d.stage === 'shipped' ? `<button class="tiny ghost" data-act="dispatch-tracking" data-id="${esc(d.id)}">tracking</button>` : ''}</span></div>`;
  return `${tabs()}
    <p class="ash">Cutoff 12:00 Mon–Fri. ${lab.dispatch.packing} packing · ${lab.dispatch.ready} ready${lab.dispatch.oldest ? ` · oldest in the queue ${when(lab.dispatch.oldest.created_at)}` : ''}.</p>
    <form class="inline add-order" data-act="dispatch-add"><input name="ref" placeholder="Order ref (from the store)" style="width:180px" required><input name="items" placeholder="Items — e.g. 2× GHK-Cu 50mg, 1× BPC-157 5mg" style="flex:1;min-width:260px"><button type="submit" class="primary">Add to packing</button></form>
    <h2>The queue <span class="faint">${queue.length}</span></h2>
    ${queue.length ? queue.map(row).join('') : '<p class="empty">Nothing packing or ready.</p>'}
    ${done.length ? `<h2>Gone <span class="faint">${done.length}</span></h2>${done.map(row).join('')}` : ''}`;
}

/* ---------- events ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'back') go('#');
  else if (act === 'lab') go('#lab');
  else if (act === 'proposal-approve') store.approveProposal('apothecary', id);
  else if (act === 'proposal-reject') { if (confirm('Reject this proposal? It stays in the record as killed.')) store.rejectProposal('apothecary', id); }
  else if (act === 'view') { st.view = b.dataset.view; st.editing = ''; go(b.dataset.view === 'dispatch' ? '#lab/dispatch' : '#lab'); paint(); }
  else if (act === 'open' && !e.target.closest('a')) go(`#lab/${encodeURIComponent(id)}`);
  else if (act === 'new-product') { st.editing = 'new'; paint({ keepScroll: true }); el.querySelector('form[data-act=product-add] input[name=name]')?.focus(); }
  else if (act === 'cancel') { st.editing = ''; paint({ keepScroll: true }); }
  else if (act === 'product-toggle') store.setProduct(id, { [b.dataset.field]: b.dataset.value === 'true' });
  else if (act === 'lot-adj') store.adjustLot(id, Number(b.dataset.delta));
  else if (act === 'lot-coa') store.setLot(id, { coa: b.dataset.coa });
  else if (act === 'lot-remove') { if (confirm('Remove this lot? Use it only for a lot entered by mistake — sold stock is counted down, not removed.')) store.removeLot(id); }
  else if (act === 'dispatch-stage') store.setDispatch(id, { stage: b.dataset.stage });
  else if (act === 'dispatch-tracking') { const t = prompt('Tracking number'); if (t !== null) store.setDispatch(id, { tracking: t.trim() }); }
}
function onChange(e) {
  const i = e.target; const act = i.dataset.act; if (!act) return;
  // `change` fires as the field loses focus; the save repaints, so it is deferred past the blur.
  if (act === 'setting') { const key = i.dataset.key, n = Number(i.value); if (Number.isFinite(n)) setTimeout(() => store.setSetting(key, n), 0); }
  else if (act === 'product-field') {
    const id = i.dataset.id, f = i.dataset.field; const raw = i.value.trim();
    const numeric = ['sell_gbp', 'kit_cost_usd', 'kit_vials'].includes(f);
    const value = numeric ? (raw === '' ? null : Number(raw)) : raw;
    if (numeric && raw !== '' && !Number.isFinite(value)) return;
    if (f === 'kit_vials' && !(value > 0)) return;
    setTimeout(() => store.setProduct(id, { [f]: value }), 0);
  }
}
function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f)) return;
  const act = f.dataset.act;
  if (act === 'product-add') {
    const name = f.name.value.trim(); if (!name) return;
    const id = `${name} ${f.size.value}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (store.product(id)) { alert(`There is already a product with the id ${id}.`); return; }
    store.setProduct(id, { name, size: f.size.value.trim(), category: f.category.value.trim(), supplier_code: f.supplier_code.value.trim(), kit_cost_usd: f.kit_cost_usd.value === '' ? null : Number(f.kit_cost_usd.value), sell_gbp: f.sell_gbp.value === '' ? null : Number(f.sell_gbp.value), listed: f.listed.checked });
    st.editing = ''; go(`#lab/${encodeURIComponent(id)}`);
  } else if (act === 'lot-add') {
    store.addLot(f.dataset.id, { batch: f.batch.value.trim(), vials: Number(f.vials.value) || 0, coa: f.coa.value, coa_url: f.coa_url.value.trim(), received: f.received.value || null, cost_usd: f.cost_usd.value === '' ? null : Number(f.cost_usd.value) });
    f.reset();
  } else if (act === 'dispatch-add') {
    const ref = f.ref.value.trim(); if (!ref) return;
    store.addDispatch(ref, f.items.value.trim()); f.reset();
  }
}
