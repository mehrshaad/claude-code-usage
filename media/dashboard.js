(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  const fmt = (n) => {
    if (n >= 1e9) { return (n / 1e9).toFixed(2) + 'B'; }
    if (n >= 1e6) { return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'; }
    if (n >= 1e3) { return (n / 1e3).toFixed(0) + 'k'; }
    return String(Math.round(n));
  };
  const dur = (ms) => {
    if (ms <= 0) { return '0m'; }
    const t = Math.floor(ms / 60000);
    const h = Math.floor(t / 60);
    return h > 0 ? h + 'h' + String(t % 60).padStart(2, '0') + 'm' : (t % 60) + 'm';
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function gauge(name, w, sub, state, s, cur) {
    const cls = w.percent >= state.danger ? 'danger' : w.percent >= state.warn ? 'warn' : '';
    const pct = w.hasPercent ? Math.min(100, w.percent) : 0;
    return `<div class="gauge">
      <div class="gauge-head"><span class="gauge-name">${esc(name)}</span>
      <span class="gauge-pct">${w.hasPercent ? Math.round(w.percent) + '%' : fmt(w.totals.counted) + ' tok'}</span></div>
      ${w.hasPercent ? `<div class="track"><div class="fill ${cls}" style="width:${pct}%"></div></div>` : ''}
      <div class="gauge-sub"><span>${fmt(w.totals.counted)} tok${s.costEnabled ? ' · ' + cur + w.totals.cost.toFixed(2) : ''}</span><span>${esc(sub)}</span></div>
    </div>`;
  }

  function render(s) {
    if (!s) { root.innerHTML = '<p class="scanning">Reading Claude Code transcripts…</p>'; return; }
    const cur = s.currencySymbol;
    const money = (v) => (s.costEnabled ? cur + v.toFixed(2) : '');
    const state = { warn: s.warnThreshold, danger: s.dangerThreshold };
    document.documentElement.style.setProperty('--accent', s.accentColor);

    const peak = Math.max(1, ...s.history.map((d) => d.counted));
    const bars = s.history.map((d, i) =>
      `<span class="${i === s.history.length - 1 ? 'today' : ''}" style="height:${Math.max(2, (d.counted / peak) * 100)}%" title="${d.date} · ${fmt(d.counted)} tok"></span>`
    ).join('');

    const models = s.models.length
      ? `<table><thead><tr><th>Model</th><th>Tokens</th>${s.costEnabled ? '<th>Cost</th>' : ''}<th>Msgs</th></tr></thead><tbody>` +
        s.models.map((m) =>
          `<tr><td class="name">${esc(m.model.replace(/^claude-/, ''))}</td><td>${fmt(m.totals.counted)}</td>${s.costEnabled ? `<td>${money(m.totals.cost)}</td>` : ''}<td>${m.totals.messages}</td></tr>`
        ).join('') + '</tbody></table>'
      : '<p class="empty">No activity in this window.</p>';

    const sessions = s.sessions.length
      ? `<table><tbody>` + s.sessions.map((x) =>
          `<tr><td class="name"><span class="dot ${x.active ? 'live' : ''}"></span>${esc(x.project)}</td><td>${fmt(x.totals.counted)}</td>${s.costEnabled ? `<td>${money(x.totals.cost)}</td>` : ''}</tr>`
        ).join('') + '</tbody></table>'
      : '<p class="empty">No sessions yet.</p>';

    root.innerHTML = `
      <section>
        ${gauge('Session', s.block, 'resets in ' + dur(s.block.remainingMs), state, s, cur)}
        ${gauge('Week', s.week, s.source === 'account' ? 'resets ' + new Date(s.week.end).toLocaleDateString() : (s.weeklyMode === 'rolling7d' ? 'rolling 7 days' : 'resets ' + new Date(s.week.end).toLocaleDateString()), state, s, cur)}
        ${s.opusWeek != null ? `<div class="gauge-sub"><span>Opus week ${Math.round(s.opusWeek)}%</span><span>${s.sonnetWeek != null ? 'Sonnet week ' + Math.round(s.sonnetWeek) + '%' : ''}</span></div>` : ''}
        ${s.source !== 'account' ? '<p class="empty">Limit percentages need your account — run <b>Claude Usage: Connect Account</b>.</p>' : ''}
      </section>
      <section class="tiles">
        <div class="tile"><div class="tile-label">Today</div><div class="tile-value">${fmt(s.today.counted)}</div><div class="tile-sub">${money(s.today.cost) || s.today.messages + ' msgs'}</div></div>
        <div class="tile"><div class="tile-label">Session</div><div class="tile-value">${s.session ? fmt(s.session.totals.counted) : '—'}</div><div class="tile-sub">${s.session ? esc(s.session.project) : 'idle'}</div></div>
        <div class="tile"><div class="tile-label">Burn</div><div class="tile-value">${fmt(s.burnPerMin)}</div><div class="tile-sub">tok/min${s.projectedExhaustionMs != null ? ' · cap ~' + dur(s.projectedExhaustionMs) : ''}</div></div>
        <div class="tile"><div class="tile-label">Total</div><div class="tile-value">${fmt(s.allTime.counted)}</div><div class="tile-sub">${money(s.allTime.cost) || s.allTime.messages + ' msgs'}</div></div>
      </section>
      ${s.showModels ? `<section><h2>By model</h2>${models}</section>` : ''}
      ${s.showSessions ? `<section><h2>Sessions</h2>${sessions}</section>` : ''}
      ${s.showHistory ? `<section><h2>Last 30 days</h2><div class="spark">${bars}</div>
        <div class="axis"><span>${esc(s.history[0].date.slice(5))}</span><span>${esc(s.history[s.history.length - 1].date.slice(5))}</span></div></section>` : ''}
      <footer><span>${s.source === 'account' ? 'live limits' : 'local only'} · ${s.eventCount} msgs</span><span>${new Date(s.lastUpdate).toLocaleTimeString()}</span></footer>`;
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'snapshot') { render(event.data.snapshot); }
  });

  render(null);
  vscode.postMessage({ type: 'ready' });
})();
