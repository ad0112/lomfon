// LomFon — helpers: units, formatting, colour scales, storage, fetch.
import { t, locale } from './i18n.js';

// ---------- storage (never throws) ----------
export const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem('lomfon:' + key);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('lomfon:' + key, JSON.stringify(val));
    } catch {
      /* storage unavailable */
    }
  },
};

// ---------- units ----------
export const units = { temp: 'C', wind: 'kmh' };

export function convert(unitType, v) {
  if (v == null || Number.isNaN(v)) return NaN;
  switch (unitType) {
    case 'temp':
      return units.temp === 'F' ? (v * 9) / 5 + 32 : v;
    case 'wind':
      switch (units.wind) {
        case 'kmh': return v * 3.6;
        case 'kt': return v * 1.943844;
        case 'mph': return v * 2.236936;
        default: return v;
      }
    default:
      return v;
  }
}

export function unitLabel(unitType) {
  switch (unitType) {
    case 'temp': return units.temp === 'F' ? '°F' : '°C';
    case 'wind': return { kmh: 'km/h', ms: 'm/s', kt: 'kt', mph: 'mph' }[units.wind];
    case 'precip': return 'mm/h';
    case 'percent': return '%';
    case 'pressure': return 'hPa';
    default: return '';
  }
}

export function fmtValue(unitType, v, withUnit = true) {
  const c = convert(unitType, v);
  if (Number.isNaN(c)) return t('na');
  let s;
  if (unitType === 'precip') s = c < 10 ? c.toFixed(1) : c.toFixed(0);
  else s = Math.round(c).toString();
  if (!withUnit) return s;
  if (unitType === 'temp') return s + '°';
  return s + ' ' + unitLabel(unitType);
}

export const fmtTemp = (c) => fmtValue('temp', c);
export const fmtWind = (ms) => fmtValue('wind', ms);
export const fmtMM = (mm) => (mm == null || Number.isNaN(mm) ? t('na') : (mm < 10 ? mm.toFixed(1) : mm.toFixed(0)) + ' mm');

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compass(deg) {
  if (deg == null || Number.isNaN(deg)) return '';
  return DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

// Arrow showing where the wind blows TO (meteorological direction = FROM).
export function windArrow(deg) {
  if (deg == null || Number.isNaN(deg)) return '';
  return `<span class="arrow" style="transform:rotate(${deg + 180}deg)">↑</span>`;
}

// ---------- time formatting ----------
const fmtCache = new Map();
export function fmtTime(unix, opts, timeZone) {
  const key = locale() + JSON.stringify(opts) + (timeZone || '');
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale(), { ...opts, timeZone });
    } catch {
      f = new Intl.DateTimeFormat(locale(), opts);
    }
    fmtCache.set(key, f);
  }
  return f.format(new Date(unix * 1000));
}
export const HM = { hour: '2-digit', minute: '2-digit', hour12: false };

// ---------- weather codes ----------
const WMO_ICON = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
  61: '🌦️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️', 85: '🌨️', 86: '❄️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};
export function wmo(code, isDay = 1) {
  if (code == null) return { icon: '·', text: t('na') };
  let icon = WMO_ICON[code] ?? '·';
  if (!isDay && code <= 1) icon = '🌙';
  if (!isDay && code === 2) icon = '☁️';
  return { icon, text: t('wmo')[code] ?? '' };
}

export function aqiInfo(aqi) {
  if (aqi == null || Number.isNaN(aqi)) return null;
  const bands = [50, 100, 150, 200, 300, Infinity];
  const colors = ['#3ecf6e', '#e8d33f', '#f29a3a', '#e8483f', '#9b59d0', '#8a1c3b'];
  const i = bands.findIndex((b) => aqi <= b);
  return { level: t('aqiLevels')[i], color: colors[i] };
}

// ---------- colour scale ----------
export class ColorScale {
  constructor(stops, transform, n = 512) {
    this.n = n;
    this.tf = transform === 'sqrt' ? (v) => Math.sqrt(Math.max(0, v)) : (v) => v;
    this.lo = this.tf(stops[0][0]);
    this.hi = this.tf(stops[stops.length - 1][0]);
    const ts = stops.map((s) => this.tf(s[0]));
    this.data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const x = this.lo + ((this.hi - this.lo) * i) / (n - 1);
      let k = 0;
      while (k < stops.length - 2 && x > ts[k + 1]) k++;
      const span = ts[k + 1] - ts[k] || 1;
      const f = Math.min(1, Math.max(0, (x - ts[k]) / span));
      const a = stops[k], b = stops[k + 1];
      this.data[i * 4] = a[1] + (b[1] - a[1]) * f;
      this.data[i * 4 + 1] = a[2] + (b[2] - a[2]) * f;
      this.data[i * 4 + 2] = a[3] + (b[3] - a[3]) * f;
      this.data[i * 4 + 3] = 255 * (a[4] + (b[4] - a[4]) * f);
    }
  }
  // position 0..1 of a value along the scale
  pos(v) {
    return Math.min(1, Math.max(0, (this.tf(v) - this.lo) / (this.hi - this.lo)));
  }
  // LUT index *4, or -1 for no data
  index(v) {
    if (v == null || Number.isNaN(v)) return -1;
    return Math.round(this.pos(v) * (this.n - 1)) * 4;
  }
  rgba(v) {
    const i = this.index(v);
    if (i < 0) return 'transparent';
    const d = this.data;
    return `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${(d[i + 3] / 255).toFixed(2)})`;
  }
  cssGradient(steps = 14) {
    const parts = [];
    for (let s = 0; s <= steps; s++) {
      const i = Math.round((s / steps) * (this.n - 1)) * 4;
      const d = this.data;
      const a = Math.max(0.25, d[i + 3] / 255);
      parts.push(`rgba(${d[i]},${d[i + 1]},${d[i + 2]},${a.toFixed(2)}) ${((s / steps) * 100).toFixed(1)}%`);
    }
    return `linear-gradient(to right, ${parts.join(',')})`;
  }
}

// ---------- misc ----------
export function debounce(fn, ms) {
  let id;
  return (...a) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...a), ms);
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtCoord(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function icon(name, cls = 'ic') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function fetchJSON(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) {
    let reason = '';
    try {
      reason = (await r.json()).reason || '';
    } catch {
      /* not JSON */
    }
    throw new HttpError(reason || 'HTTP ' + r.status, r.status);
  }
  const j = await r.json();
  if (j && j.error) throw new HttpError(j.reason || 'API error', 400);
  return j;
}

// Build a query string keeping commas readable (Open-Meteo accepts either).
export function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`)
    .join('&');
}
