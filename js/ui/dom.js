/* UI toolkit: element builder, icons, formatting, dialogs, toasts, bound fields, downloads. */
(function (root) {
  'use strict';
  const CL = root.CL;

  // Views build children with conditional expressions (cond ? node : null). The native
  // methods would render null/false as the text "null"/"false", so they are skipped.
  for (const m of ['replaceChildren', 'append']) {
    const native = Element.prototype[m];
    Element.prototype[m] = function (...kids) { return native.apply(this, kids.filter((k) => k != null && k !== false)); };
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }

  const P = {
    plus: 'M12 5v14M5 12h14', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    save: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8V3M7 21v-7h10v7', saveas: 'M8 8h11v11a2 2 0 0 1-2 2H8zM16 3H5a2 2 0 0 0-2 2v11',
    undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3', redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
    backup: 'M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M12 3v12M7 10l5 5 5-5', restore: 'M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M12 15V3M7 8l5-5 5 5',
    export: 'M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5', print: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4', moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', docs: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h8',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
    x: 'M18 6 6 18M6 6l12 12', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
    copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01', alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
    error: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6', check: 'M20 6 9 17l-5-5', sync: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4', lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', eyeoff: 'M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M1 1l22 22M14.1 14.1a3 3 0 1 1-4.2-4.2',
    chart: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-8', file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6', fan: 'M12 12a3 3 0 1 0 0-.01zM12 9c0-5 5-6 6-3s-3 5-6 3zM15 12c5 0 6 5 3 6s-5-3-3-6zM12 15c0 5-5 6-6 3s3-5 6-3zM9 12c-5 0-6-5-3-6s5 3 3 6z',
    chevron: 'm9 18 6-6-6-6', down: 'm6 9 6 6 6-6', clip: 'M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
    snow: 'M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9M9 3l3 3 3-3M9 21l3-3 3 3M3 9l3 3-3 3M21 9l-3 3 3 3', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4zM8 2v16M16 6v16', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', layers: 'm12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
  };
  function icon(name, size = 16) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.classList.add('ic');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[name] || P.info); s.append(p);
    return s;
  }

  const fmt = (v, d = 1) => (Number.isFinite(+v) && v !== '' && v !== null ? (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let dateFormat = 'YYYY-MM-DD';
  function fdate(iso, withTime) {
    if (!iso) return '–';
    const d = new Date(iso); if (isNaN(d)) return '–';
    const p = (n) => String(n).padStart(2, '0');
    const Y = d.getFullYear(), M = p(d.getMonth() + 1), D = p(d.getDate());
    const s = dateFormat === 'DD/MM/YYYY' ? `${D}/${M}/${Y}` : dateFormat === 'MM/DD/YYYY' ? `${M}/${D}/${Y}` : `${Y}-${M}-${D}`;
    return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
  }

  const btn = (label, onclick, opt = {}) => h('button', { type: 'button', class: 'btn ' + (opt.kind || 'secondary') + (opt.small ? ' sm' : '') + (opt.cls ? ' ' + opt.cls : ''), onclick, title: opt.title || null, disabled: opt.disabled || null, 'data-act': opt.act || null },
    opt.icon ? icon(opt.icon) : null, label ? h('span', {}, label) : null);

  /* ---------- toasts ---------- */
  function toast(msg, kind = 'ok', ms = 3500, actions) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: 'toast ' + kind }, icon(kind === 'ok' ? 'check' : kind === 'warn' ? 'alert' : kind === 'err' ? 'error' : 'info'), h('span', {}, msg,
      actions && actions.length ? h('span', { class: 'toast-acts' }, actions.map((a) => h('button', { type: 'button', class: 'btn sm', onclick: () => { a.run(); t.remove(); } }, a.label))) : null));
    box.append(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  /* ---------- modal dialogs ---------- */
  function modal({ title, body, actions, wide, onclose }) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const close = (v) => { wrap.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); if (onclose) onclose(v); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') close(undefined); };
      const dlg = h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'dlg-head' }, h('h3', {}, title), h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: () => close(undefined) }, icon('x'))),
        h('div', { class: 'dlg-body' }, body),
        h('div', { class: 'dlg-foot' }, (actions || [{ label: 'OK', value: true, kind: 'primary' }]).map((a) => btn(a.label, async () => {
          if (a.validate) { const ok = await a.validate(); if (!ok) return; }
          close(typeof a.value === 'function' ? a.value() : a.value);
        }, { kind: a.kind || 'secondary', icon: a.icon }))));
      const wrap = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === wrap) close(undefined); } }, dlg);
      document.body.append(wrap); document.addEventListener('keydown', key);
      const first = dlg.querySelector('.dlg-body input, .dlg-body select, .dlg-body textarea') || dlg.querySelector('.dlg-foot .btn.primary, .dlg-foot .btn.danger');
      if (first) setTimeout(() => first.focus(), 20);
    });
  }
  const confirmDlg = (title, message, { ok = 'Confirm', danger = false, cancel = 'Cancel' } = {}) =>
    modal({ title, body: h('p', {}, message), actions: [{ label: cancel, value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] }).then((v) => v === true);
  const alertDlg = (title, message) => modal({ title, body: typeof message === 'string' ? h('p', {}, message) : message, actions: [{ label: 'OK', value: true, kind: 'primary' }] });

  /** Friendly error with operation, suggestion and expandable technical details. */
  function errorDlg(operation, err, suggestion) {
    const details = err && (err.details || err.stack || String(err));
    return modal({
      title: 'Something went wrong',
      body: h('div', { class: 'err' },
        h('p', {}, h('b', {}, operation), ' could not be completed.'),
        h('p', {}, (err && err.message && !/^[A-Z][a-z]+Error/.test(err.message) ? err.message : 'An unexpected problem occurred.')),
        suggestion ? h('p', { class: 'muted' }, 'What you can do: ', suggestion) : null,
        details ? h('details', { class: 'diag' }, h('summary', {}, 'Technical details'), h('pre', {}, Array.isArray(details) ? details.join('\n') : String(details))) : null),
      actions: [{ label: 'Close', value: true, kind: 'primary' }],
    });
  }

  /** Form dialog: fields = [{key,label,type,value,options,required,hint}] → resolves object or undefined. */
  function formDlg(title, fields, { ok = 'Save', intro } = {}) {
    const vals = {};
    const els = fields.map((f) => {
      vals[f.key] = f.value ?? '';
      let input;
      if (f.type === 'select') {
        input = h('select', { onchange: (e) => { vals[f.key] = e.target.value; } }, f.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(vals[f.key]) || null }, l)));
      } else if (f.type === 'textarea') {
        input = h('textarea', { rows: 3, oninput: (e) => { vals[f.key] = e.target.value; } }); input.value = vals[f.key];
      } else {
        input = h('input', { type: f.type || 'text', value: vals[f.key], autocomplete: f.autocomplete || 'off', oninput: (e) => { vals[f.key] = e.target.value; } });
      }
      return h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, f.label, f.required ? h('span', { class: 'req' }, ' *') : null), input, f.hint ? h('span', { class: 'hint' }, f.hint) : null);
    });
    const errBox = h('p', { class: 'form-err', role: 'alert' });
    return modal({
      title, body: h('div', { class: 'form' }, intro ? h('p', { class: 'muted' }, intro) : null, els, errBox),
      actions: [{ label: 'Cancel', value: undefined }, { label: ok, kind: 'primary', value: () => vals, validate: () => {
        const miss = fields.filter((f) => f.required && !String(vals[f.key]).trim());
        errBox.textContent = miss.length ? `Required: ${miss.map((f) => f.label).join(', ')}` : '';
        return !miss.length;
      } }],
    });
  }

  /* ---------- tips ---------- */
  function tip(key) {
    const t = CL.refs.TIPS[key];
    if (!t) return null;
    const b = h('button', { type: 'button', class: 'tipbtn', 'aria-label': `About: ${t.t}` }, icon('info', 14));
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showTip(b, t); });
    return b;
  }
  function showTip(anchor, t) {
    document.querySelectorAll('.tippop').forEach((x) => x.remove());
    const ref = t.ref && (CL.refs.REFERENCES.find((r) => r.id === t.ref) || null);
    const pop = h('div', { class: 'tippop', role: 'tooltip' },
      h('div', { class: 'tip-t' }, t.t), h('p', {}, t.x),
      t.r ? h('p', { class: 'tip-r' }, h('b', {}, 'Typical: '), t.r) : null,
      ref ? h('p', { class: 'tip-ref' }, h('b', {}, 'Reference: '), ref.name, ref.clause ? ` §${ref.clause}` : '', ' — ', CL.refs.CLASS_LABEL[ref.classification]) : null);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    const left = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(12, r.left - 20));
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + pop.offsetHeight + 8 > window.innerHeight ? r.top - pop.offsetHeight - 6 : r.bottom + 6) + window.scrollY + 'px';
    const off = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } };
    setTimeout(() => document.addEventListener('mousedown', off), 0);
  }

  /**
   * Bound field. opt: { type, kind (unit kind) | unit (fixed label), options, placeholder, hint,
   * tip, rerender, onSet, wide, readonly, step, min, id (validation field key) }
   * onChange(rerender) is supplied by the caller (marks the project dirty).
   */
  function field(obj, key, label, opt = {}, onChange) {
    const U = CL.units;
    const type = opt.type || 'number';
    const kind = opt.kind;
    const unitLabel = kind ? U.label(kind) : opt.unit;
    const shown = (v) => {
      if (type !== 'number' || !kind) return v == null ? '' : v;
      const d = U.toDisplay(kind, v);
      return d === "" || d == null ? "" : (Number.isFinite(+d) ? +(+d).toFixed(3) : d);
    };
    const set = (raw) => {
      let v = raw;
      if (type === 'number') v = raw === '' ? '' : (kind ? U.fromDisplay(kind, +raw) : +raw);
      if (Object.is(obj[key], v)) return;
      obj[key] = v;
      if (opt.onSet) opt.onSet(v);
      if (onChange) onChange(opt.rerender);
    };
    let input;
    if (type === 'select') {
      input = h('select', { onchange: (e) => set(e.target.value), disabled: opt.readonly || null, id: opt.domId || null });
      for (const o of opt.options) {
        if (o.group) { const g = h('optgroup', { label: o.group }); for (const [v, l] of o.items) g.append(h('option', { value: v, selected: String(obj[key]) === String(v) || null }, l)); input.append(g); }
        else input.append(h('option', { value: o[0], selected: String(obj[key]) === String(o[0]) || null }, o[1]));
      }
    } else if (type === 'textarea') {
      input = h('textarea', { rows: opt.rows || 3, oninput: (e) => set(e.target.value), placeholder: opt.placeholder || null, readonly: opt.readonly || null });
      input.value = obj[key] || '';
    } else {
      input = h('input', {
        type: type === 'number' ? 'text' : type, inputmode: type === 'number' ? 'decimal' : null, placeholder: opt.placeholder != null ? String(shown(opt.placeholder)) : null,
        value: shown(obj[key]), readonly: opt.readonly || null, id: opt.domId || null, autocomplete: 'off', spellcheck: type === 'number' ? 'false' : null,
        oninput: (e) => {
          const raw = e.target.value.trim().replace(',', '.');
          if (type === 'number' && raw !== '' && raw !== '-' && !Number.isFinite(+raw)) { e.target.classList.add('bad'); return; }
          e.target.classList.remove('bad');
          if (raw === '-') return;
          set(raw);
        },
      });
    }
    return h('label', { class: 'field' + (opt.wide ? ' wide' : '') + (opt.cls ? ' ' + opt.cls : ''), 'data-f': opt.id || key },
      label ? h('span', { class: 'lbl' }, label, opt.tip ? tip(opt.tip) : null) : null,
      h('span', { class: 'ctl' }, input, unitLabel ? h('span', { class: 'unit' }, unitLabel) : null),
      opt.hint ? h('span', { class: 'hint' }, opt.hint) : null);
  }

  /* ---------- downloads (OS file associations open the saved file) ---------- */
  async function saveFile(name, data, mime) {
    if (root.desktop) {
      const ext = name.split('.').pop();
      const label = { pdf: 'PDF document', xlsx: 'Excel workbook', csv: 'CSV file', json: 'ColdLoad file' }[ext] || `${ext.toUpperCase()} file`;
      const payload = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
      const r = await root.desktop.saveFile(name, payload, [{ name: label, extensions: [ext] }]);
      return { ...r, picker: true, desktop: true };
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    if (root.showSaveFilePicker) {
      try {
        const ext = '.' + name.split('.').pop();
        const handle = await root.showSaveFilePicker({ suggestedName: name, types: [{ description: ext.toUpperCase() + ' file', accept: { [mime]: [ext] } }] });
        const w = await handle.createWritable(); await w.write(blob); await w.close();
        return { saved: true, name: handle.name, picker: true };
      } catch (e) {
        if (e && e.name === 'AbortError') return { saved: false };
      }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return { saved: true, name, picker: false };
  }

  function readFile(accept) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
      inp.onchange = () => { const f = inp.files[0]; inp.remove(); resolve(f || null); };
      document.body.append(inp); inp.click();
    });
  }
  const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  const slug = (s) => String(s || 'project').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60);

  CL.ui = CL.ui || {};
  Object.assign(CL.ui, { h, icon, fmt, esc, fdate, setDateFormat: (f) => { dateFormat = f; }, btn, toast, modal, confirmDlg, alertDlg, errorDlg, formDlg, tip, field, saveFile, readFile, fileToDataUrl, slug });
})(globalThis);
