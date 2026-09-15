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
    const h = Math.floor(t / 60);
    return h > 0 ? h + 'h' + String(t % 60).padStart(2, '0') + 'm' : t + 'm';
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shortModel = (m) => m.replace(/^claude-/, '');

  function level(pct, state) {
    return pct >= state.danger ? 'danger' : pct >= state.warn ? 'warn' : '';
  }

  // A non-finite percent would emit width:NaN%, which the browser discards -
  // leaving the fill at its auto width, i.e. a bar that reads as 100%.
  const shown = (w) => w.hasPercent && Number.isFinite(w.percent);
  const clamp = (p) => (Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0);

  // 1h - ring variant. Same data, same type sizes; the projection becomes a tick
  // on the circumference, where its angle reads as a position in the window.
  function ringGauge(s, state, cur) {
    const w = s.block;
    const has = shown(w);
    const cls = level(w.percent, state);
    const R = 39;
    const C = 2 * Math.PI * R;
    const arc = has ? (clamp(w.percent) / 100) * C : 0;
    const caret = caretPercent(s);
    let tick = '';
    if (caret != null) {
      const a = ((clamp(caret) / 100) * 360 - 90) * (Math.PI / 180);
      const pt = (rad) => `${(43 + Math.cos(a) * rad).toFixed(2)} ${(43 + Math.sin(a) * rad).toFixed(2)}`;
      tick = `<line class="ring-tick" x1="${pt(R - 6).split(' ')[0]}" y1="${pt(R - 6).split(' ')[1]}" x2="${pt(R + 6).split(' ')[0]}" y2="${pt(R + 6).split(' ')[1]}"></line>`;
    }
    return `<section>
      <div class="ring-wrap">
        <div class="ring">
          <svg viewBox="0 0 86 86" width="86" height="86" aria-hidden="true">
            <circle class="ring-track" cx="43" cy="43" r="${R}"></circle>
            ${has ? `<circle class="ring-fill ${cls}" cx="43" cy="43" r="${R}" stroke-dasharray="${arc.toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 43 43)"></circle>` : ''}
            ${tick}
          </svg>
          <span class="hero num ${cls === 'danger' ? 'danger' : ''}">${has ? (w.estimated ? '~' : '') + Math.round(w.percent) + '%' : fmt(w.totals.counted)}</span>
        </div>
        <div class="ring-meta">
          <span class="gauge-name">Session</span>
          <span class="gauge-sub">${fmt(w.totals.counted)} tok${s.costEnabled ? ' · ' + cur + w.totals.cost.toFixed(2) : ''}</span>
          <span class="gauge-sub">${dur(w.remainingMs)} left</span>
        </div>
      </div>
    </section>`;
  }

  // 01 - block gauge. The caret marks where the current burn rate lands by reset;
  // past 100% the fill saturates and the caret sits behind it.
  function blockGauge(s, state, cur) {
    const w = s.block;
    const has = shown(w);
    const cls = level(w.percent, state);
    const width = has ? clamp(w.percent) : 0;
    const caret = caretPercent(s);
    return `<section>
      <div class="gauge-head">
        <span class="gauge-name">Session</span>
        <span class="hero num ${cls === 'danger' ? 'danger' : ''}">${has ? (w.estimated ? '~' : '') + Math.round(w.percent) + '%' : fmt(w.totals.counted)}</span>
      </div>
      ${has ? `<div class="track"><div class="fill ${cls}" style="width:${width}%"></div>${
        caret != null ? `<div class="caret" style="left:${clamp(caret)}%" title="projected at current burn"></div>` : ''
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
    const has = shown(w);
    const cls = level(w.percent, state);
    const parts = [];
    if (s.opusWeek != null) { parts.push('opus ' + Math.round(s.opusWeek) + '%'); }
    if (s.sonnetWeek != null) { parts.push('sonnet ' + Math.round(s.sonnetWeek) + '%'); }
    // Always say when the window turns over, even with no per-model figures.
    if (!parts.length) {
      parts.push(has && w.remainingMs > 0
        ? 'resets ' + new Date(w.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : s.weeklyMode === 'rolling7d' ? 'rolling 7 days' : 'this week');
    }
    return `<section class="rule">
      <div class="week-row">
        <span class="gauge-name">Week</span>
        <span class="week-pct num">${has ? (w.estimated ? '~' : '') + Math.round(w.percent) + '%' : fmt(w.totals.counted) + ' tok'}</span>
      </div>
      ${has ? `<div class="track week"><div class="fill ${cls}" style="width:${clamp(w.percent)}%"></div></div>` : ''}
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
      `<span class="${i === s.history.length - 1 ? 'today' : ''}" style="height:${clamp((d.counted / peak) * 100) || 1}%" title="${d.date} · ${fmt(d.counted)} tok"></span>`
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
    if (!s.eventCount && !shown(s.block)) { root.innerHTML = noData(); return; }

    const cur = s.currencySymbol;
    const money = (v) => (s.costEnabled ? cur + v.toFixed(2) : '');
    const state = { warn: s.warnThreshold, danger: s.dangerThreshold };
    document.documentElement.style.setProperty('--accent', s.accentColor);
    // Numbers default to the editor font for tabular figures; the UI font is
    // available for anyone whose editor font clashes with the labels.
    document.documentElement.style.setProperty(
      '--mono',
      s.numberFont === 'ui'
        ? 'var(--vscode-font-family)'
        : 'var(--vscode-editor-font-family, ui-monospace, monospace)'
    );

    root.innerHTML =
      (s.gaugeStyle === 'ring' ? ringGauge(s, state, cur) : blockGauge(s, state, cur)) +
      weekGauge(s, state, cur) +
      tiles(s, cur, money) +
      (s.showModels ? models(s, money) : '') +
      (s.showSessions ? sessions(s, money) : '') +
      (s.showHistory ? history(s) : '') +
      `<footer>
        <span>${s.source === 'account'
          ? (s.reportAgeMs > 120000 ? 'limits ' + Math.round(s.reportAgeMs / 60000) + 'm old' : 'live limits')
          : s.block.estimated ? 'estimated' : 'local only'} · ${s.eventCount} msgs</span>
        <span>${new Date(s.lastUpdate).toLocaleTimeString()}</span>
      </footer>` +
      (s.source !== 'account'
        ? `<section class="rule notice">
             <h2>Account</h2>
             <p class="empty">${s.block.estimated
               ? 'These percentages are <b>estimates</b> against a plan ceiling, because Claude publishes limits as percentages rather than token counts. Connect your account for Claude\'s own figures.'
               : 'Session and weekly limit percentages are computed by Claude and read from your account. The Claude Code sign-in on this machine is used automatically; if that read fails you can paste a token instead.'}</p>
             <div class="actions">
               <button type="button" data-command="claudeUsage.connect">Connect account</button>
               <button type="button" data-command="claudeUsage.diagnostics">Why not?</button>
               <button type="button" class="linkish" data-link="usage">Usage on claude.ai ↗</button>
             </div>
           </section>`
        : '');

    for (const button of root.querySelectorAll('button[data-command]')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'command', id: button.dataset.command });
      });
    }
    for (const button of root.querySelectorAll('button[data-link]')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'openLink', link: button.dataset.link });
      });
    }
  }

  // --- view switching: the meter panel, or the settings surface over it ------

  let latest = null;
  let view = 'meter';

  // Settings never take the whole column: the gauge collapses to a strip that
  // keeps the three things the panel is open for - percent, bar, reset clock.
  function strip(s) {
    if (!s) { return ''; }
    const w = s.block;
    const has = shown(w);
    const state = { warn: s.warnThreshold, danger: s.dangerThreshold };
    const cls = level(w.percent, state);
    return `<div class="strip">
      <div class="strip-head">
        <span class="strip-name">Session</span>
        <span class="strip-pct num ${cls === 'danger' ? 'danger' : ''}">${has ? (w.estimated ? '~' : '') + Math.round(w.percent) + '%' : fmt(w.totals.counted)}</span>
      </div>
      ${has ? `<div class="track"><div class="fill ${cls}" style="width:${clamp(w.percent)}%"></div></div>` : ''}
      <div class="strip-sub"><span>${fmt(w.totals.counted)} tok</span><span>resets in ${dur(w.remainingMs)}</span></div>
    </div>`;
  }

  function paint(keepFocus) {
    if (view === 'settings') {
      root.innerHTML = strip(latest) + '<div class="surface">' + window.ccmSettings.render() + '</div>';
      if (keepFocus === 'filter') {
        const field = root.querySelector('.filter');
        if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
      }
    } else {
      render(latest);
    }
  }

  window.ccmSettings.init((message) => {
    if (message.type === 'rerender') { paint(message.keepFocus); return; }
    vscode.postMessage(message);
  });
  window.ccmSettings.bind(root);

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) { return; }
    if (data.type === 'snapshot') {
      latest = data.snapshot;
      window.ccmSettings.update({ percent: data.snapshot.block && data.snapshot.block.percent });
      paint();
    } else if (data.type === 'settings') {
      window.ccmSettings.update(data);
      if (view === 'settings') { paint(); }
    } else if (data.type === 'view') {
      view = data.view;
      if (view === 'meter') { window.ccmSettings.setOpen(null); }
      paint();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view === 'settings') { vscode.postMessage({ type: 'closeSettings' }); }
  });

  paint();
  vscode.postMessage({ type: 'ready' });
})();
