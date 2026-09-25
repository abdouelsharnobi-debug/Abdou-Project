/* Reference guide side panel: stays open while working and follows the current screen/tab. */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, icon } = CL.ui;
  const KEY = 'cl-guide-open';
  let panel = null, pinnedTopic = null;

  function ensure() {
    if (panel) return panel;
    panel = h('aside', { id: 'guide', class: 'guide', 'aria-label': 'Reference guide', hidden: true });
    document.body.append(panel);
    return panel;
  }
  const isOpen = () => panel && !panel.hidden;

  function render() {
    if (!isOpen()) return;
    const G = CL.guide;
    const auto = G.forRoute(App.route, App.ui);
    const topic = pinnedTopic ? G.TOPICS[pinnedTopic] : auto;
    const refs = (topic.refs || []).map((id) => CL.refs.REFERENCES.find((r) => r.id === id)).filter(Boolean);
    const list = (title, items) => (items && items.length ? [h('h4', {}, title), h('ul', {}, items.map((x) => h('li', {}, x)))] : []);
    panel.replaceChildren(
      h('div', { class: 'g-head' }, icon('book', 18), h('b', {}, 'Reference guide'),
        h('select', { 'aria-label': 'Guide topic', onchange: (e) => { pinnedTopic = e.target.value || null; render(); } },
          h('option', { value: '' }, 'Follow current screen'), Object.entries(G.TOPICS).map(([k, t]) => h('option', { value: k, selected: pinnedTopic === k || null }, t.title))),
        h('button', { class: 'iconbtn', 'aria-label': 'Close guide', title: 'Close (F1)', onclick: () => set(false) }, icon('x'))),
      h('div', { class: 'g-body' },
        h('h3', {}, topic.title), h('p', {}, topic.purpose),
        ...list('Method & formulas', topic.method), ...list('Inputs to watch', topic.inputs), ...list('Checks', topic.checks),
        refs.length ? h('h4', {}, 'References') : null,
        refs.length ? h('ul', { class: 'g-refs' }, refs.map((r) => h('li', {}, h('b', {}, r.name), r.clause ? ` §${r.clause}` : '', h('br'), h('span', { class: 'chip sm cls-' + r.classification }, CL.refs.CLASS_LABEL[r.classification]), ' ', h('small', { class: 'muted' }, r.edition)))) : null,
        h('p', { class: 'muted small' }, 'Full register: ', h('a', { href: '#/standards' }, 'Standards & references'), ' · ', h('a', { href: '#/help/method' }, 'Calculation methodology'))));
  }

  function set(open) {
    ensure(); panel.hidden = !open;
    document.body.classList.toggle('guide-open', !!open);
    try { root.localStorage.setItem(KEY, open ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    const b = document.querySelector('.actionbar [data-act="guide"]'); if (b) b.classList.toggle('on', !!open);
    render();
  }

  CL.guidePanel = {
    open: () => set(true), toggle: () => set(!isOpen()), update: render,
    restore: () => { let v = null; try { v = root.localStorage.getItem(KEY); } catch (e) { v = null; } if (v === '1') set(true); },
  };
})(globalThis);
