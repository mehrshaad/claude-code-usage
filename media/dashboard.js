(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  const fmt = (n) => {
    if (n >= 1e9) { return (n / 1e9).toFixed(2) + 'B'; }
    if (n >= 1e6) { return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'; }
    if (n >= 1e3) { return (n / 1e3).toFixed(0) + 'k'; }
    return String(Math.round(n));
  };
  // Always NhNNm, so a countdown losing a digit never reflows the row.
  const dur = (ms) => {
    const t = Math.max(0, Math.floor(ms / 60000));
    return Math.floor(t / 60) + 'h' + String(t % 60).padStart(2, '0') + 'm';
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shortModel = (m) => m.replace(/^claude-/, '');

  function level(pct, state) {
    return pct >= state.danger ? 'danger' : pct >= state.warn ? 'warn' : '';
  }

  // 01 - block gauge. The caret marks where the current burn rate lands by reset;
  // past 100% the fill saturates and the caret sits behind it.
  function blockGauge(s, state, cur) {
    const w = s.block;
    const cls = level(w.percent, state);
    const width = w.hasPercent ? Math.min(100, w.percent) : 0;
    const caret = caretPercent(s);
    return `<section>
      <div class="gauge-head">
        <span class="gauge-name">Session</span>
        <span class="hero num ${cls === 'danger' ? 'danger' : ''}">${w.hasPercent ? Math.round(w.percent) + '%' : fmt(w.totals.counted)}</span>
      </div>
      ${w.hasPercent ? `<div class="track"><div class="fill ${cls}" style="width:${width}%"></div>${
        caret != null ? `<div class="caret" style="left:${Math.min(100, caret)}%" title="projected at current burn"></div>` : ''
      }</div>` : ''}
      <div class="gauge-sub">
        <span>${fmt(w.totals.counted)} tok${s.costEnabled ? ' · ' + cur + w.totals.cost.toFixed(2) : ''}</span>
        <span>${dur(w.remainingMs)}</span>
      </div>
    </section>`;
  }

  function caretPercent(s) {
    if (!s.block.hasPercent || !s.burnPerMin || s.block.percent <= 0) { return null; }
    const minutes = s.block.remainingMs / 60000;
    if (minutes <= 0) { return null; }
    // Extrapolate the observed rate of percentage gain across the rest of the window.
    const elapsed = (s.lastUpdate - s.block.start) / 60000;
    if (elapsed <= 1) { return null; }
    return s.block.percent + (s.block.percent / elapsed) * minutes;
  }

  // 02 - week. Secondary by size and weight only, never by hue.
  function weekGauge(s, state, cur) {
    const w = s.week;
    const cls = level(w.percent, state);
    const parts = [];
    if (s.opusWeek != null) { parts.push('opus ' + Math.round(s.opusWeek) + '%'); }
    if (s.sonnetWeek != null) { parts.push('sonnet ' + Math.round(s.sonnetWeek) + '%'); }
    return `<section class="rule">
      <div class="week-row">
        <span class="gauge-name">Week</span>
        <span class="week-pct num">${w.hasPercent ? Math.round(w.percent) + '%' : fmt(w.totals.counted) + ' tok'}</span>
      </div>
      ${w.hasPercent ? `<div class="track week"><div class="fill ${cls}" style="width:${Math.min(100, w.percent)}%"></div></div>` : ''}
      <div class="gauge-sub">
        <span>${fmt(w.totals.counted)} tok${s.costEnabled ? ' · ' + cur + w.totals.cost.toFixed(2) : ''}</span>
        <span>${esc(parts.join(' · '))}</span>
      </div>
    </section>`;
  }

  function tiles(s, cur, money) {
    const cell = (label, value, sub) =>
      `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div><div class="tile-sub">${sub}</div></div>`;
    return `<section class="rule"><div class="tiles">
      ${cell('Today', fmt(s.today.counted), money(s.today.cost) || s.today.messages + ' msgs')}
      ${cell('Session', s.session ? fmt(s.session.totals.counted) : '—', s.session ? esc(s.session.project) : 'idle')}
      ${cell('Burn', fmt(s.burnPerMin), 'tok/min')}
      ${cell('Total', fmt(s.allTime.counted), money(s.allTime.cost) || s.allTime.messages + ' msgs')}
    </div></section>`;
  }

  function models(s, money) {
    if (!s.models.length) { return '<section class="rule"><h2>By model</h2><p class="empty">No activity in this window.</p></section>'; }
    const peak = Math.max(1, ...s.models.map((m) => m.totals.counted));
    const rows = s.models.map((m) => `
      <tr>
        <td class="name">${esc(shortModel(m.model))}</td>
        <td class="n tok lead">${fmt(m.totals.counted)}</td>
        ${s.costEnabled ? `<td class="n cost">${money(m.totals.cost)}</td>` : ''}
        <td class="n msgs">${m.totals.messages}</td>
      </tr>
      <tr><td class="share-cell" colspan="4"><div class="share" style="width:${(m.totals.counted / peak) * 100}%"></div></td></tr>`).join('');
    return `<section class="rule"><h2>By model</h2><table><tbody>${rows}</tbody></table></section>`;
  }

  function sessions(s, money) {
    if (!s.sessions.length) { return ''; }
    const rows = s.sessions.map((x) => `
      <tr>
        <td class="name"><span class="dot ${x.active ? '' : 'idle'}"></span>${esc(x.project)}</td>
        <td class="n sess lead">${fmt(x.totals.counted)}</td>
        ${s.costEnabled ? `<td class="n scost">${money(x.totals.cost)}</td>` : ''}
      </tr>`).join('');
    return `<section class="rule"><h2>Sessions</h2><table><tbody>${rows}</tbody></table></section>`;
  }

  function history(s) {
    const peak = Math.max(1, ...s.history.map((d) => d.counted));
    const bars = s.history.map((d, i) =>
      `<span class="${i === s.history.length - 1 ? 'today' : ''}" style="height:${Math.max(1, (d.counted / peak) * 100)}%" title="${d.date} · ${fmt(d.counted)} tok"></span>`
    ).join('');
    return `<section class="rule"><h2>30 days</h2><div class="spark">${bars}</div>
      <div class="axis"><span>${esc(s.history[0].date.slice(5))}</span><span>${esc(s.history[s.history.length - 1].date.slice(5))}</span></div></section>`;
  }

  function skeleton() {
    return `<div class="scanning">
      <section>
        <div class="gauge-head"><span class="gauge-name">Session</span><span class="hero num">—</span></div>
        <div class="track"></div>
        <div class="gauge-sub"><span>— tok</span><span>—h—m</span></div>
      </section>
      <section class="rule">
        <div class="week-row"><span class="gauge-name">Week</span><span class="week-pct num">—</span></div>
        <div class="track week"></div>
        <div class="gauge-sub"><span>— tok</span><span></span></div>
      </section>
      <section class="rule"><div class="tiles">
        ${['Today', 'Session', 'Burn', 'Total'].map((l) =>
          `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">—</div><div class="tile-sub">—</div></div>`).join('')}
      </div></section>
    </div>`;
  }

  function noData() {
    return `<div class="nodata">
      <h3>No usage data</h3>
      <p class="empty">Nothing found in the Claude Code transcript directory yet. Run Claude Code once, or point <code>claudeUsage.claudeDir</code> at the right location.</p>
    </div>`;
  }

  function render(s) {
    if (!s) { root.innerHTML = skeleton(); return; }
    if (!s.eventCount && !s.block.hasPercent) { root.innerHTML = noData(); return; }

    const cur = s.currencySymbol;
    const money = (v) => (s.costEnabled ? cur + v.toFixed(2) : '');
    const state = { warn: s.warnThreshold, danger: s.dangerThreshold };
    document.documentElement.style.setProperty('--accent', s.accentColor);

    root.innerHTML =
      blockGauge(s, state, cur) +
      weekGauge(s, state, cur) +
      tiles(s, cur, money) +
      (s.showModels ? models(s, money) : '') +
      (s.showSessions ? sessions(s, money) : '') +
      (s.showHistory ? history(s) : '') +
      `<footer>
        <span>${s.source === 'account' ? 'live limits' : 'local only'} · ${s.eventCount} msgs</span>
        <span>${new Date(s.lastUpdate).toLocaleTimeString()}</span>
      </footer>` +
      (s.source !== 'account'
        ? '<p class="empty" style="margin-top:8px">Limit percentages need your account — run <b>Claude Usage: Connect Account</b>.</p>'
        : '');
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'snapshot') { render(event.data.snapshot); }
  });

  render(null);
  vscode.postMessage({ type: 'ready' });
})();
