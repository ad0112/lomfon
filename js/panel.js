// LomFon — point forecast panel: now, hourly, 16 days, model comparison.
import { API, MODELS, COMPARE_MODELS, COMPARE_COLORS } from './config.js';
import { t, getLang } from './i18n.js';
import {
  fetchJSON, qs, fmtTemp, fmtWind, fmtMM, fmtValue, convert, unitLabel, compass, windArrow,
  fmtTime, HM, wmo, aqiInfo, escapeHtml, fmtCoord, icon,
} from './util.js';

const TABS = ['now', 'hourly', 'daily', 'compare'];

export class PointPanel {
  constructor({ el, getModel, isFav, onToggleFav, onShare, onOpen, onClose }) {
    this.el = el;
    this.getModel = getModel;
    this.isFav = isFav;
    this.onToggleFav = onToggleFav;
    this.onShare = onShare;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.tab = 'now';
    this.cmpVar = 'temperature_2m';
    this.charts = [];
    this.lat = null;

    el.innerHTML = `
      <div class="grabber"></div>
      <header class="panel-head">
        <div class="ph-text"><h2 class="ph-title"></h2><div class="ph-sub muted"></div></div>
        <div class="ph-actions">
          <button class="icon-btn sm" data-act="fav"></button>
          <button class="icon-btn sm" data-act="share">${icon('share')}</button>
          <button class="icon-btn sm" data-act="close">${icon('x')}</button>
        </div>
      </header>
      <nav class="tabs" role="tablist"></nav>
      <div class="panel-body"></div>`;
    this.$title = el.querySelector('.ph-title');
    this.$sub = el.querySelector('.ph-sub');
    this.$tabs = el.querySelector('.tabs');
    this.$body = el.querySelector('.panel-body');
    this.$fav = el.querySelector('[data-act="fav"]');

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-tab],[data-cmp]');
      if (!b) return;
      if (b.dataset.tab) return this.setTab(b.dataset.tab);
      if (b.dataset.cmp) {
        this.cmpVar = b.dataset.cmp;
        return this.renderBody();
      }
      switch (b.dataset.act) {
        case 'close': return this.close();
        case 'share': return this.onShare?.();
        case 'fav': this.onToggleFav?.(this.lat, this.lon, this.name); return this.renderHead();
        case 'retry': return this.load();
      }
    });
    // mobile: tap the grabber to expand/collapse
    el.querySelector('.grabber').addEventListener('click', () => el.classList.toggle('expanded'));
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(lat, lon, name = null) {
    this.lat = lat;
    this.lon = lon;
    this.name = name;
    this.data = null;
    this.cmp = null;
    this.el.hidden = false;
    document.body.classList.add('panel-open');
    this.render();
    this.load();
    this.onOpen?.(lat, lon);
  }

  close() {
    this.ctl?.abort();
    this.destroyCharts();
    this.el.hidden = true;
    this.el.classList.remove('expanded');
    document.body.classList.remove('panel-open');
    this.lat = null;
    this.onClose?.();
  }

  setTab(tab) {
    this.tab = tab;
    this.render();
    if (tab === 'compare' && !this.cmp) this.loadCompare();
  }

  reload() {
    if (!this.isOpen) return;
    this.data = null;
    this.cmp = null;
    this.render();
    this.load();
  }

  // ---------- data ----------
  async load() {
    this.ctl?.abort();
    const ctl = (this.ctl = new AbortController());
    this.error = null;
    this.renderBody();
    const { lat, lon } = this;
    const model = this.getModel();
    const fcUrl = API.forecast + '?' + qs({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset,uv_index_max',
      minutely_15: 'precipitation',
      forecast_minutely_15: 8,
      forecast_days: 16,
      timezone: 'auto',
      timeformat: 'unixtime',
      wind_speed_unit: 'ms',
      models: model,
    });
    const aqUrl = API.air + '?' + qs({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), current: 'us_aqi,pm2_5,pm10', timezone: 'auto' });
    const mrUrl = API.marine + '?' + qs({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), current: 'wave_height,wave_direction,wave_period', timezone: 'auto' });
    const [fc, aq, mr] = await Promise.allSettled([
      fetchJSON(fcUrl, ctl.signal),
      fetchJSON(aqUrl, ctl.signal),
      fetchJSON(mrUrl, ctl.signal),
    ]);
    if (ctl !== this.ctl) return; // superseded
    if (fc.status === 'rejected') {
      if (fc.reason?.name === 'AbortError') return;
      this.error = fc.reason?.status === 429 ? t('rateLimited') : `${t('loadError')}: ${fc.reason?.message || ''}`;
      return this.renderBody();
    }
    this.data = {
      fc: fc.value,
      aq: aq.status === 'fulfilled' ? aq.value : null,
      mr: mr.status === 'fulfilled' ? mr.value : null,
    };
    this.render();
  }

  async loadCompare() {
    const { lat, lon } = this;
    const url = API.forecast + '?' + qs({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      hourly: 'temperature_2m,precipitation,wind_speed_10m',
      models: COMPARE_MODELS.join(','),
      forecast_days: 7,
      timezone: 'auto',
      timeformat: 'unixtime',
      wind_speed_unit: 'ms',
    });
    try {
      const j = await fetchJSON(url);
      if (lat !== this.lat || lon !== this.lon) return;
      this.cmp = j;
    } catch (e) {
      this.cmp = { error: e.status === 429 ? t('rateLimited') : `${t('loadError')}: ${e.message}` };
    }
    if (this.tab === 'compare') this.renderBody();
  }

  // ---------- rendering ----------
  render() {
    this.renderHead();
    this.$tabs.innerHTML = TABS.map(
      (k) => `<button role="tab" data-tab="${k}" class="${k === this.tab ? 'active' : ''}">${t('tab_' + k)}</button>`
    ).join('');
    this.renderBody();
  }

  renderHead() {
    if (this.lat == null) return;
    this.$title.textContent = this.name || fmtCoord(this.lat, this.lon);
    const fc = this.data?.fc;
    const sub = [];
    if (this.name) sub.push(fmtCoord(this.lat, this.lon));
    if (fc?.elevation != null && !Number.isNaN(fc.elevation)) sub.push(t('elevation', Math.round(fc.elevation)));
    if (fc?.timezone_abbreviation) sub.push(fc.timezone_abbreviation);
    this.$sub.textContent = sub.join(' · ');
    const fav = this.isFav?.(this.lat, this.lon);
    this.$fav.innerHTML = icon('star', fav ? 'ic filled' : 'ic');
    this.$fav.title = fav ? t('favRemove') : t('favAdd');
    this.$fav.setAttribute('aria-label', this.$fav.title);
    this.el.querySelector('[data-act="share"]').title = t('share');
    this.el.querySelector('[data-act="close"]').title = t('close');
  }

  destroyCharts() {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  }

  renderBody() {
    this.destroyCharts();
    if (this.error) {
      this.$body.innerHTML = `<div class="empty">${escapeHtml(this.error)}<br><button class="btn" data-act="retry">${t('retry')}</button></div>`;
      return;
    }
    if (!this.data) {
      this.$body.innerHTML = `<div class="empty"><span class="spinner"></span>${t('loading')}</div>`;
      return;
    }
    const fn = { now: this.htmlNow, hourly: this.htmlHourly, daily: this.htmlDaily, compare: this.htmlCompare }[this.tab];
    this.$body.innerHTML = fn.call(this);
    if (this.tab === 'hourly') this.chartHourly();
    if (this.tab === 'compare') this.chartCompare();
    this.$body.scrollTop = 0;
  }

  _startIndex(times) {
    const now = Date.now() / 1000 - 1800;
    const i = times.findIndex((x) => x >= now);
    return i < 0 ? 0 : i;
  }

  htmlNow() {
    const { fc, aq, mr } = this.data;
    const c = fc.current || {};
    const d = fc.daily || {};
    const tz = fc.timezone;
    const w = wmo(c.weather_code, c.is_day);
    const stat = (label, value) => `<div class="stat"><div class="stat-l">${label}</div><div class="stat-v">${value}</div></div>`;
    const dir = c.wind_direction_10m;
    let html = `
      <div class="now-hero">
        <div class="now-icon">${w.icon}</div>
        <div>
          <div class="now-temp">${fmtTemp(c.temperature_2m)}</div>
          <div class="now-desc">${escapeHtml(w.text)}</div>
          <div class="muted">${t('feelsLike')} ${fmtTemp(c.apparent_temperature)}</div>
        </div>
      </div>`;
    html += this.htmlNowcast();
    html += `<div class="stats">
      ${stat(t('wind'), `${windArrow(dir)} ${fmtWind(c.wind_speed_10m)} <span class="muted">${compass(dir)}</span>`)}
      ${stat(t('gusts'), fmtWind(c.wind_gusts_10m))}
      ${stat(t('humidity'), fmtValue('percent', c.relative_humidity_2m))}
      ${stat(t('pressure'), fmtValue('pressure', c.pressure_msl))}
      ${stat(t('clouds'), fmtValue('percent', c.cloud_cover))}
      ${stat(t('uvMax'), d.uv_index_max?.[0] != null ? d.uv_index_max[0].toFixed(1) : t('na'))}
      ${stat(t('precipToday'), fmtMM(d.precipitation_sum?.[0]))}
      ${stat(t('rainChance'), d.precipitation_probability_max?.[0] != null ? d.precipitation_probability_max[0] + '%' : t('na'))}
      ${stat(t('sunrise'), d.sunrise?.[0] ? fmtTime(d.sunrise[0], HM, tz) : t('na'))}
      ${stat(t('sunset'), d.sunset?.[0] ? fmtTime(d.sunset[0], HM, tz) : t('na'))}
    </div>`;
    const a = aq?.current;
    const info = aqiInfo(a?.us_aqi);
    if (info) {
      html += `<div class="card aqi"><div><div class="stat-l">${t('aqi')}</div>
        <div class="aqi-v"><span class="aqi-dot" style="background:${info.color}"></span>${Math.round(a.us_aqi)} · ${escapeHtml(info.level)}</div></div>
        <div class="muted">${t('pm25')} ${a.pm2_5 != null ? a.pm2_5.toFixed(0) : t('na')} µg/m³</div></div>`;
    }
    const m = mr?.current;
    if (m && m.wave_height != null) {
      html += `<div class="card"><div class="stat-l">${t('waves')}</div>
        <div class="stat-v">${windArrow(m.wave_direction)} ${m.wave_height.toFixed(1)} m <span class="muted">· ${t('wavePeriod')} ${m.wave_period != null ? m.wave_period.toFixed(0) + ' s' : t('na')}</span></div></div>`;
    }
    const model = MODELS.find((x) => x.id === this.getModel());
    html += `<p class="muted small">${t('model')}: ${escapeHtml(model ? model.label[getLang()] : this.getModel())}${c.time ? ' · ' + t('updated') + ' ' + fmtTime(c.time, HM, tz) : ''}</p>`;
    return html;
  }

  htmlNowcast() {
    const m = this.data.fc.minutely_15;
    if (!m?.precipitation?.length) return '';
    const tz = this.data.fc.timezone;
    const p = m.precipitation.map((v) => v ?? 0);
    const first = p.findIndex((v) => v >= 0.05);
    let msg;
    if (first < 0) msg = t('noRain2h');
    else if (first === 0) msg = t('rainingNow');
    else msg = t('rainStartsAt', fmtTime(m.time[first], HM, tz));
    const max = Math.max(1, ...p);
    const bars = p
      .map((v, i) => `<div class="nc-bar" title="${fmtTime(m.time[i], HM, tz)} · ${v.toFixed(1)} mm"><span style="height:${Math.max(2, (v / max) * 100)}%"></span></div>`)
      .join('');
    return `<div class="card nowcast"><div class="stat-l">${t('next2h')}</div><div class="nc-msg">${msg}</div>
      <div class="nc-bars">${bars}</div>
      <div class="nc-axis muted small"><span>${fmtTime(m.time[0], HM, tz)}</span><span>${fmtTime(m.time[m.time.length - 1], HM, tz)}</span></div></div>`;
  }

  htmlHourly() {
    const h = this.data.fc.hourly;
    const tz = this.data.fc.timezone;
    const s = this._startIndex(h.time);
    const cols = [];
    for (let i = s; i < Math.min(h.time.length, s + 48); i++) {
      const w = wmo(h.weather_code[i], h.is_day?.[i] ?? 1);
      const hour = fmtTime(h.time[i], { hour: '2-digit', hour12: false }, tz);
      const isMidnight = /^0?0$/.test(hour.replace(/\D/g, ''));
      cols.push(`<div class="hcol${isMidnight ? ' day-start' : ''}">
        <div class="muted small">${isMidnight ? fmtTime(h.time[i], { weekday: 'short' }, tz) : hour + ':00'}</div>
        <div class="hicon">${w.icon}</div>
        <div class="htemp">${fmtTemp(h.temperature_2m[i])}</div>
        <div class="hrain">${h.precipitation_probability?.[i] != null ? h.precipitation_probability[i] + '%' : ''}</div>
        <div class="hwind">${windArrow(h.wind_direction_10m[i])}${fmtValue('wind', h.wind_speed_10m[i], false)}</div>
      </div>`);
    }
    return `<div class="chart-box"><canvas id="chHourly"></canvas></div>
      <div class="hstrip">${cols.join('')}</div>
      <p class="muted small">${t('rainChance')} % · ${t('wind')} ${unitLabel('wind')}</p>`;
  }

  chartHourly() {
    const Chart = window.Chart;
    const cv = this.$body.querySelector('#chHourly');
    if (!Chart || !cv) return;
    const h = this.data.fc.hourly;
    const tz = this.data.fc.timezone;
    const s = this._startIndex(h.time);
    const e = Math.min(h.time.length, s + 48);
    const labels = [], temp = [], rain = [];
    for (let i = s; i < e; i++) {
      labels.push(fmtTime(h.time[i], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, tz));
      temp.push(convert('temp', h.temperature_2m[i]));
      rain.push(h.precipitation[i]);
    }
    this.charts.push(
      new Chart(cv, {
        data: {
          labels,
          datasets: [
            {
              type: 'line', label: `${t('temperature')} (${unitLabel('temp')})`, data: temp, yAxisID: 'y',
              borderColor: '#ffb86b', backgroundColor: 'rgba(255,184,107,0.12)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
            },
            { type: 'bar', label: `${t('precip')} (mm)`, data: rain, yAxisID: 'y1', backgroundColor: 'rgba(90,170,255,0.75)', borderRadius: 2 },
          ],
        },
        options: chartOptions({ y1: true }),
      })
    );
  }

  htmlDaily() {
    const d = this.data.fc.daily;
    const tz = this.data.fc.timezone;
    const valid = d.temperature_2m_max.map((v) => v != null);
    const maxs = d.temperature_2m_max.filter((v) => v != null);
    const mins = d.temperature_2m_min.filter((v) => v != null);
    const lo = Math.min(...mins), hi = Math.max(...maxs);
    const rows = d.time
      .map((tm, i) => {
        if (!valid[i]) return '';
        const w = wmo(d.weather_code[i], 1);
        const a = ((d.temperature_2m_min[i] - lo) / (hi - lo || 1)) * 100;
        const b = ((d.temperature_2m_max[i] - lo) / (hi - lo || 1)) * 100;
        return `<div class="drow">
          <div class="dday">${i === 0 ? t('today') : fmtTime(tm, { weekday: 'short', day: 'numeric', month: 'short' }, tz)}</div>
          <div class="dicon" title="${escapeHtml(w.text)}">${w.icon}</div>
          <div class="drain">${d.precipitation_probability_max?.[i] != null ? d.precipitation_probability_max[i] + '%' : ''}<span class="muted"> ${d.precipitation_sum[i] ? fmtMM(d.precipitation_sum[i]) : ''}</span></div>
          <div class="dtemp"><span class="muted">${fmtTemp(d.temperature_2m_min[i])}</span>
            <span class="trange"><span style="left:${a}%;width:${Math.max(4, b - a)}%"></span></span>
            <span>${fmtTemp(d.temperature_2m_max[i])}</span></div>
          <div class="dwind">${windArrow(d.wind_direction_10m_dominant[i])}${fmtValue('wind', d.wind_speed_10m_max[i], false)}</div>
        </div>`;
      })
      .join('');
    return `<div class="daily">${rows}</div><p class="muted small">${t('rainChance')} · ${t('wind')} max ${unitLabel('wind')}</p>`;
  }

  htmlCompare() {
    const vars = [
      ['temperature_2m', t('temperature')],
      ['precipitation', t('precip')],
      ['wind_speed_10m', t('windSpeed')],
    ];
    const seg = vars
      .map(([k, label]) => `<button data-cmp="${k}" class="${k === this.cmpVar ? 'active' : ''}">${label}</button>`)
      .join('');
    let body;
    if (!this.cmp) body = `<div class="empty"><span class="spinner"></span>${t('loading')}</div>`;
    else if (this.cmp.error) body = `<div class="empty">${escapeHtml(this.cmp.error)}</div>`;
    else body = `<div class="chart-box tall"><canvas id="chCompare"></canvas></div>`;
    return `<div class="seg">${seg}</div>${body}<p class="muted small">${t('compareNote')}</p>`;
  }

  chartCompare() {
    const Chart = window.Chart;
    const cv = this.$body.querySelector('#chCompare');
    if (!Chart || !cv || !this.cmp?.hourly) return;
    const h = this.cmp.hourly;
    const tz = this.cmp.timezone;
    const s = this._startIndex(h.time);
    const idx = [];
    for (let i = s; i < h.time.length; i++) idx.push(i);
    const labels = idx.map((i) => fmtTime(h.time[i], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, tz));
    const unitType = { temperature_2m: 'temp', precipitation: 'precip', wind_speed_10m: 'wind' }[this.cmpVar];
    const datasets = [];
    COMPARE_MODELS.forEach((m, k) => {
      const arr = h[`${this.cmpVar}_${m}`];
      if (!arr || arr.every((v) => v == null)) return;
      const model = MODELS.find((x) => x.id === m);
      datasets.push({
        type: 'line',
        label: model ? model.label[getLang()] : m,
        data: idx.map((i) => (arr[i] == null ? null : convert(unitType, arr[i]))),
        borderColor: COMPARE_COLORS[k % COMPARE_COLORS.length],
        backgroundColor: COMPARE_COLORS[k % COMPARE_COLORS.length],
        pointRadius: 0,
        borderWidth: 1.6,
        tension: 0.3,
        spanGaps: true,
      });
    });
    if (!datasets.length) {
      this.$body.querySelector('.chart-box').outerHTML = `<div class="empty">${t('noData')}</div>`;
      return;
    }
    const opts = chartOptions({});
    opts.scales.y.title = { display: true, text: unitLabel(unitType) };
    this.charts.push(new Chart(cv, { data: { labels, datasets }, options: opts }));
  }
}

function chartOptions({ y1 = false }) {
  const grid = { color: 'rgba(255,255,255,0.07)' };
  const scales = {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0, autoSkip: true } },
    y: { position: 'left', grid },
  };
  if (y1) scales.y1 = { position: 'right', min: 0, suggestedMax: 4, grid: { drawOnChartArea: false } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10 } } },
    scales,
  };
}
