/* Settings surface: two-level drill-down with a filter, inside the panel. */
(function () {
  const api = {};
  window.ccmSettings = api;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n));

  // Meter glyphs, mirrored from the status bar so the preview is the real thing.
  const GLYPHS = {
    ticks: ['▰', '▱'], circles: ['●', '○'], circleHalves: ['●', '○'],
    halfblocks: ['█', '░'], blocks: ['█', '░'], braille: ['⣿', '⣀'], ascii: ['#', '-']
  };
  const STEPS = {
    halfblocks: ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'],
    braille: ['', '⣀', '⣤', '⣶'],
    circles: ['', '◔', '◑', '◕'],
    circleHalves: ['', '◐', '●']
  };
  const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  function meter(percent, width, style) {
    if (style === 'sparkline') {
      return Array.from({ length: width }, (_, i) => SPARK[(i * 3 + 2) % SPARK.length]).join('');
    }
    const [full, empty] = GLYPHS[style] || GLYPHS.halfblocks;
    const exact = Math.max(0, Math.min(1, (percent || 0) / 100)) * width;
    const filled = Math.floor(exact);
    const steps = STEPS[style];
    let body;
    if (steps && filled < width) {
      const round = style === 'circles' || style === 'circleHalves' ? Math.ceil : Math.round;
      const partial = steps[Math.min(steps.length - 1, round((exact - filled) * steps.length))] || '';
      body = full.repeat(filled) + partial + empty.repeat(width - filled - (partial ? 1 : 0));
    } else {
      const whole = Math.min(width, Math.round(exact));
      body = full.repeat(whole) + empty.repeat(width - whole);
    }
    return style === 'ascii' ? '[' + body + ']' : body;
  }

  const METER_STYLES = [
    ['halfblocks', 'default · 1.25% steps'],
    ['blocks', '10% steps'],
    ['circleHalves', '2.5% steps'],
    ['circles', 'lightest'],
    ['ticks', 'countable'],
    ['braille', 'font risk'],
    ['ascii', 'universal'],
    ['sparkline', 'burn, not fill']
  ];
  const SWATCHES = [
    ['#D97757', 'coral'], ['#8A9A5B', 'sage'], ['#6B7FA3', 'slate'], ['#9A7AA0', 'mauve']
  ];

  let state = { sections: [], specs: [], values: [], open: null, filter: '', percent: 62.4, confirm: null };
  let post = () => {};

  api.init = (poster) => { post = poster; };
  api.update = (payload) => {
    state.sections = payload.sections;
    state.specs = payload.specs;
    state.values = payload.values;
    if (payload.percent != null) { state.percent = payload.percent; }
  };
  api.setOpen = (id) => { state.open = id; state.confirm = null; };
  api.openSection = () => state.open;

  const valueOf = (key) => (state.values.find((v) => v.key === key) || {}).value;
  const stateOf = (key) => state.values.find((v) => v.key === key) || {};
  const specOf = (key) => state.specs.find((s) => s.key === key);

  /** A row is inert when its parent is off, or set to a value it does not apply to. */
  function inert(spec) {
    if (!spec.parent) { return false; }
    const parent = valueOf(spec.parent);
    if (spec.parentValue !== undefined) { return parent !== spec.parentValue; }
    return !parent;
  }

  function gutter(st) {
    if (st.external) { return 'gut external'; }
    return st.changed ? 'gut changed' : 'gut';
  }

  // --- controls -------------------------------------------------------------

  function control(spec) {
    const st = stateOf(spec.key);
    const v = st.value;
    const k = esc(spec.key);
    const ro = st.external ? ' disabled' : '';
    switch (spec.kind) {
      case 'toggle':
        return `<button class="sw${v ? ' on' : ''}" role="switch" aria-checked="${!!v}" data-act="toggle" data-key="${k}"${ro}><span class="knob"></span></button>`;
      case 'dropdown':
        return `<select class="ctl" data-act="set" data-key="${k}"${ro}>${
          spec.options.map((o) => `<option value="${esc(o.value)}"${o.value === v ? ' selected' : ''}>${esc(o.label)}</option>`).join('')
        }</select>`;
      case 'stepper':
        return `<span class="step"><input class="ctl numfield" type="number" value="${esc(v)}" min="${spec.min}" max="${spec.max}" data-act="set" data-key="${k}"${ro}></span>`;
      case 'slider':
        return `<span class="sliderwrap"><input class="rng" type="range" min="${spec.min}" max="${spec.max}" value="${esc(v)}" data-act="set" data-key="${k}"${ro}><b class="num">${esc(v)}%</b></span>`;
      case 'text':
        return `<input class="ctl textfield" type="text" value="${esc(v)}" data-act="set" data-key="${k}"${ro}>`;
      case 'path':
        return pathControl(spec, v, ro);
      case 'colour':
        return colourControl(v, ro);
      case 'list':
        return listControl(v || [], ro);
      case 'pricing':
        return pricingControl(v || {});
      case 'meterStyle':
        return meterStyleControl(v);
      case 'meterWidth':
        return meterWidthControl(spec, v, ro);
      case 'gaugeStyle':
        return gaugeStyleControl(v);
      case 'numberFont':
        return numberFontControl(v);
      default:
        return '';
    }
  }

  function pathControl(spec, v, ro) {
    const shown = v ? String(v) : '';
    return `<span class="pathwrap">
      <input class="ctl pathfield" type="text" value="${esc(shown)}" placeholder="default (~/.claude)" dir="rtl" data-act="set" data-key="${esc(spec.key)}"${ro}>
      <button class="mini" data-act="pickFolder" title="Choose folder"${ro}>…</button>
    </span>`;
  }

  function colourControl(v) {
    return `<span class="swatches">${
      SWATCHES.map(([hex, name]) =>
        `<button class="sw-chip${String(v).toLowerCase() === hex.toLowerCase() ? ' on' : ''}" style="background:${hex}" title="${name}" data-act="setValue" data-key="dashboard.accentColor" data-value="${hex}"></button>`
      ).join('')
    }<input class="ctl hexfield" type="text" value="${esc(v)}" maxlength="7" data-act="set" data-key="dashboard.accentColor"></span>`;
  }

  function listControl(values, ro) {
    const sorted = [...values].sort((a, b) => a - b);
    const chips = sorted.map((n, i) =>
      `<span class="chip">${n}%<button class="x" data-act="listRemove" data-key="notifications.thresholds" data-index="${i}"${ro}>✕</button></span>`
    ).join('');
    const ticks = sorted.map((n) => `<i style="left:${Math.max(0, Math.min(100, n))}%"></i>`).join('');
    return `<span class="listwrap">
      <span class="chips">${chips}<button class="add" data-act="listAdd" data-key="notifications.thresholds"${ro}>＋</button></span>
      ${sorted.length ? `<span class="scale">${ticks}</span>` : '<span class="hint">no alerts</span>'}
    </span>`;
  }

  const RATE_FIELDS = [['input', 'in'], ['output', 'out'], ['cacheWrite5m', 'w5m'], ['cacheRead', 'read']];
  const KNOWN_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'];

  function pricingControl(obj) {
    const models = [...new Set([...Object.keys(obj), ...KNOWN_MODELS])];
    const cards = models.map((model) => {
      const rates = obj[model] || {};
      const overridden = Object.keys(rates).length > 0;
      const cells = RATE_FIELDS.map(([field, label]) =>
        `<label class="cell"><i>${label}</i><input class="jsoncell" type="text" value="${rates[field] != null ? esc(rates[field]) : '—'}"
          data-act="setRate" data-model="${esc(model)}" data-field="${field}"></label>`
      ).join('');
      return `<div class="card${overridden ? '' : ' builtin'}">
        <div class="card-head">${esc(model.replace(/^claude-/, ''))}${overridden ? '' : '<em>built-in</em>'}</div>
        <div class="grid">${cells}</div>
      </div>`;
    }).join('');
    return `<span class="pricing">${cards}<button class="linkish" data-act="openJson" data-key="cost.pricing">Edit as JSON ↗</button></span>`;
  }

  function meterStyleControl(current) {
    const width = valueOf('statusBar.meterWidth') || 10;
    return `<span class="stylelist">${
      METER_STYLES.map(([id, note]) =>
        `<button class="styleopt${id === current ? ' on' : ''}" data-act="setValue" data-key="statusBar.meterStyle" data-value="${id}">
           <span class="glyphs">${meter(state.percent, width, id)}</span>
           <span class="styleid">${id}</span><span class="stylenote">${esc(note)}</span>
         </button>`
      ).join('')
    }</span>`;
  }

  function meterWidthControl(spec, v) {
    return `<span class="widthwrap">
      <input class="rng" type="range" min="${spec.min}" max="${spec.max}" value="${esc(v)}" data-act="set" data-key="statusBar.meterWidth">
      <b class="num">${esc(v)}</b>
      <span class="glyphs preview">${meter(state.percent, Number(v) || 10, valueOf('statusBar.meterStyle') || 'halfblocks')}</span>
    </span>`;
  }

  function gaugeStyleControl(v) {
    const pct = Math.round(state.percent);
    const R = 13, C = 2 * Math.PI * R;
    return `<span class="gauges">
      <button class="gaugeopt${v === 'bar' ? ' on' : ''}" data-act="setValue" data-key="dashboard.gaugeStyle" data-value="bar">
        <span class="mini-bar"><i style="width:${pct}%"></i></span><span class="styleid">bar</span>
      </button>
      <button class="gaugeopt${v === 'ring' ? ' on' : ''}" data-act="setValue" data-key="dashboard.gaugeStyle" data-value="ring">
        <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="${R}" class="mini-track"></circle>
        <circle cx="16" cy="16" r="${R}" class="mini-fill" stroke-dasharray="${(pct / 100) * C} ${C}" transform="rotate(-90 16 16)"></circle></svg>
        <span class="styleid">ring</span>
      </button>
    </span>`;
  }

  function numberFontControl(v) {
    return `<span class="fonts">
      <button class="fontopt${v === 'editor' ? ' on' : ''}" data-act="setValue" data-key="dashboard.numberFont" data-value="editor">
        <b style="font-family:var(--vscode-editor-font-family,monospace)">111.85M</b><span class="styleid">editor font</span>
      </button>
      <button class="fontopt${v === 'ui' ? ' on' : ''}" data-act="setValue" data-key="dashboard.numberFont" data-value="ui">
        <b style="font-family:var(--vscode-font-family)">111.85M</b><span class="styleid">UI font</span>
      </button>
    </span>`;
  }

  // --- rows and views -------------------------------------------------------

  function row(spec) {
    const st = stateOf(spec.key);
    const dead = inert(spec);
    const depth = spec.depth || 0;
    const wide = ['meterStyle', 'pricing', 'list', 'gaugeStyle', 'numberFont', 'colour', 'meterWidth'].includes(spec.kind);
    return `<div class="row${dead ? ' dead' : ''}${wide ? ' wide' : ''}" data-depth="${depth}">
      <span class="${gutter(st)}"></span>
      <div class="rowbody">
        <div class="rowhead">
          <span class="lbl">${esc(spec.label)}</span>
          ${st.external ? `<span class="tag" data-act="openJson" data-key="${esc(spec.key)}">${esc(st.externalLabel || 'settings.json')}</span>` : ''}
          ${st.changed && !st.external ? `<button class="reset" data-act="reset" data-key="${esc(spec.key)}" title="Reset to ${esc(JSON.stringify(st.default))}">↺</button>` : '<span class="reset-slot"></span>'}
        </div>
        ${spec.help && !wide ? `<span class="help">${esc(spec.help)}</span>` : ''}
        <div class="ctlwrap">${control(spec)}</div>
      </div>
    </div>`;
  }

  function counts(sectionId) {
    const specs = state.specs.filter((s) => s.section === sectionId);
    const changed = specs.filter((s) => stateOf(s.key).changed).length;
    return { total: specs.length, changed };
  }

  function index() {
    const filter = state.filter.trim().toLowerCase();
    if (filter) { return filtered(filter); }
    const rows = state.sections.map((sec) => {
      const c = counts(sec.id);
      return `<button class="navrow" data-act="open" data-section="${sec.id}">
        <span class="navlabel">${esc(sec.label)}</span>
        <span class="navmeta">${c.total}${c.changed ? ` · <b>${c.changed} changed</b>` : ''}</span>
        <span class="chev">›</span>
      </button>`;
    }).join('');
    const totalChanged = state.values.filter((v) => v.changed).length;
    return `${filterRow()}<div class="nav">${rows}</div>
      <div class="surface-foot">
        <span>${state.specs.length} settings${totalChanged ? ` · ${totalChanged} changed` : ''}</span>
        ${totalChanged ? resetControl('all', totalChanged) : ''}
      </div>`;
  }

  function filtered(filter) {
    const hits = state.specs.filter((s) =>
      s.label.toLowerCase().includes(filter) || s.key.toLowerCase().includes(filter)
    );
    if (!hits.length) {
      return `${filterRow()}<p class="empty" style="padding:10px 2px">No setting matches “${esc(state.filter)}”.</p>`;
    }
    return `${filterRow()}<div class="rows">${hits.map((s) => `
      <div class="hit"><span class="hitsec">${esc((state.sections.find((x) => x.id === s.section) || {}).label || '')}</span>${row(s)}</div>
    `).join('')}</div>`;
  }

  function filterRow() {
    return `<div class="filterrow">
      <input class="filter" type="search" placeholder="Filter 46 settings" value="${esc(state.filter)}" data-act="filter">
    </div>`;
  }

  function section(id) {
    const sec = state.sections.find((s) => s.id === id);
    const specs = state.specs.filter((s) => s.section === id);
    const c = counts(id);

    // The one place the dim-don't-hide rule yields to volume.
    let body;
    if (id === 'statusBar' && !valueOf('statusBar.enabled')) {
      const toggle = specs.find((s) => s.key === 'statusBar.enabled');
      body = row(toggle) + `<button class="collapsed" data-act="revealDimmed">${specs.length - 1} settings hidden while off</button>`;
    } else {
      body = specs.map(row).join('');
    }

    return `<div class="secbar">
        <button class="back" data-act="open" data-section="">‹</button>
        <span class="sectitle">${esc(sec.label)}</span>
        <span class="navmeta">${c.total}</span>
      </div>
      <div class="rows">${body}</div>
      ${c.changed ? `<div class="surface-foot">${resetControl(id, c.changed)}</div>` : ''}`;
  }

  function resetControl(scope, n) {
    if (state.confirm === scope) {
      return `<span class="confirm">Reset ${n} setting${n === 1 ? '' : 's'}?
        <button class="yes" data-act="resetConfirm" data-scope="${scope}">yes</button>
        <button class="no" data-act="confirm" data-scope="">no</button></span>`;
    }
    return `<button class="linkish" data-act="confirm" data-scope="${scope}">${scope === 'all' ? 'Reset all' : 'Reset section'}</button>`;
  }

  api.render = () => (state.open ? section(state.open) : index());

  // --- events ---------------------------------------------------------------

  api.bind = (root) => {
    root.addEventListener('click', (event) => {
      const el = event.target.closest('[data-act]');
      if (!el) { return; }
      const act = el.dataset.act;
      if (act === 'open') { api.setOpen(el.dataset.section || null); post({ type: 'rerender' }); }
      else if (act === 'toggle') { post({ type: 'set', key: el.dataset.key, value: !valueOf(el.dataset.key) }); }
      else if (act === 'setValue') { post({ type: 'set', key: el.dataset.key, value: el.dataset.value }); }
      else if (act === 'reset') { post({ type: 'reset', key: el.dataset.key }); }
      else if (act === 'openJson') { post({ type: 'openJson', key: el.dataset.key }); }
      else if (act === 'pickFolder') { post({ type: 'pickFolder' }); }
      else if (act === 'confirm') { state.confirm = el.dataset.scope || null; post({ type: 'rerender' }); }
      else if (act === 'resetConfirm') {
        const scope = el.dataset.scope;
        const keys = state.values
          .filter((v) => v.changed && !v.external)
          .filter((v) => scope === 'all' || (specOf(v.key) || {}).section === scope)
          .map((v) => v.key);
        state.confirm = null;
        post({ type: 'resetMany', keys });
      } else if (act === 'listRemove') {
        const list = [...(valueOf(el.dataset.key) || [])].sort((a, b) => a - b);
        list.splice(Number(el.dataset.index), 1);
        post({ type: 'set', key: el.dataset.key, value: list });
      } else if (act === 'listAdd') {
        post({ type: 'promptNumber', key: el.dataset.key });
      } else if (act === 'revealDimmed') {
        post({ type: 'set', key: 'statusBar.enabled', value: true });
      }
    });

    const commit = (event) => {
      const el = event.target.closest('[data-act]');
      if (!el) { return; }
      if (el.dataset.act === 'filter') { state.filter = el.value; post({ type: 'rerender', keepFocus: 'filter' }); return; }
      if (el.dataset.act === 'setRate') {
        const raw = el.value.trim();
        post({ type: 'setRate', model: el.dataset.model, field: el.dataset.field, value: raw === '' || raw === '—' ? null : Number(raw) });
        return;
      }
      if (el.dataset.act !== 'set') { return; }
      const spec = specOf(el.dataset.key);
      let value = el.value;
      if (spec && (spec.kind === 'stepper' || spec.kind === 'slider' || spec.kind === 'meterWidth')) { value = Number(value); }
      post({ type: 'set', key: el.dataset.key, value });
    };
    root.addEventListener('change', commit);
    root.addEventListener('input', (event) => {
      const el = event.target.closest('[data-act]');
      if (el && (el.dataset.act === 'filter' || el.classList.contains('rng'))) { commit(event); }
    });
  };
})();
