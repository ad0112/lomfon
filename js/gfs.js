// LomFon — global 0.5° GFS grid, pre-built every 6 h by the GitHub Action
// (.github/workflows/gfs.yml → scripts/fetch_gfs.py). Same interface as Grid in
// grid.js, but it covers the whole globe and loads each time step on demand.
import { GFS } from './config.js';
import { fetchJSON, HttpError } from './util.js';

// app field name → file in the data set
const FIELD_VAR = {
  temperature_2m: 'tmp',
  precipitation: 'prcp',
  cloud_cover: 'cld',
  relative_humidity_2m: 'rh',
  pressure_msl: 'prs',
  wind_gusts_10m: 'gust',
  wind_speed_10m: 'wind',
};
const MAX_CACHED = 110; // files kept in memory (~0.26–0.52 MB each)

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new HttpError('HTTP ' + r.status, r.status);
  let buf = new Uint8Array(await r.arrayBuffer());
  // gzip magic: the server did not decompress it for us
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return buf;
}

export class GfsGrid {
  constructor(manifest, base) {
    const g = manifest.grid;
    this.manifest = manifest;
    this.base = base;
    this.model = GFS.id;
    this.run = manifest.run;
    this.times = manifest.times;
    this.nt = this.times.length;
    this.nx = g.nx;
    this.ny = g.ny;
    this.npts = g.nx * g.ny;
    this.lon0 = g.lon0;
    this.lat0 = g.lat0;
    this.dlon = g.dlon;
    this.dlat = g.dlat;
    this.bbox = { s: -90, w: -180, n: 90, e: 180 };
    // byte → value lookup per variable (255 = no data)
    this.luts = {};
    for (const [name, v] of Object.entries(manifest.vars)) {
      const lut = new Float32Array(256);
      for (let b = 0; b < 255; b++) lut[b] = v.square ? (b * v.scale) ** 2 : b * v.scale + v.offset;
      lut[255] = NaN;
      this.luts[name] = lut;
    }
    this._data = new Map(); // "t/var" → Uint8Array
    this._pending = new Map();
    this._last = {}; // var → most recently shown frame, drawn while the next one loads
  }

  covers() { return true; }

  nearestTimeIndex(unix) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.nt; i++) {
      const d = Math.abs(this.times[i] - unix);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  _vars(fields) {
    return [...new Set(fields.map((f) => FIELD_VAR[f]).filter(Boolean))];
  }

  has(t, fields) {
    return this._vars(fields).every((v) => this._data.has(t + '/' + v));
  }

  // Load the files that `fields` need at time index t.
  load(t, fields) {
    return Promise.all(this._vars(fields).map((v) => this._loadVar(t, v)));
  }

  _loadVar(t, name) {
    const key = t + '/' + name;
    if (this._data.has(key)) return Promise.resolve();
    let p = this._pending.get(key);
    if (!p) {
      const url = this.base + this.manifest.path.replace('{run}', this.run).replace('{step}', this.manifest.steps[t]).replace('{var}', name);
      p = fetchBytes(url)
        .then((buf) => {
          const want = this.npts * (this.manifest.vars[name].planes || 1);
          if (buf.length !== want) throw new Error(`GFS file size mismatch (${buf.length} != ${want})`);
          this._data.set(key, buf);
          for (const k of this._data.keys()) {
            if (this._data.size <= MAX_CACHED) break;
            this._data.delete(k);
          }
        })
        .finally(() => this._pending.delete(key));
      this._pending.set(key, p);
    }
    return p;
  }

  _frame(t, name) {
    const d = this._data.get(t + '/' + name);
    if (d) return (this._last[name] = d);
    return this._last[name];
  }

  // Bilinear sample of one plane; longitude wraps around the date line.
  _bilinear(d, lut, plane, lat, lon) {
    const nx = this.nx;
    let fi = (((lon - this.lon0) % 360) + 360) % 360 / this.dlon;
    let fj = (lat - this.lat0) / this.dlat;
    if (fj < 0) fj = 0;
    else if (fj > this.ny - 1) fj = this.ny - 1;
    let i0 = Math.floor(fi);
    const di = fi - i0;
    i0 %= nx;
    const i1 = (i0 + 1) % nx;
    const j0 = Math.min(Math.floor(fj), this.ny - 2);
    const dj = fj - j0;
    const r0 = plane * this.npts + j0 * nx, r1 = r0 + nx;
    const a = lut[d[r0 + i0]], b = lut[d[r0 + i1]], c = lut[d[r1 + i0]], e = lut[d[r1 + i1]];
    return (a * (1 - di) + b * di) * (1 - dj) + (c * (1 - di) + e * di) * dj;
  }

  sample(field, t, lat, lon) {
    const name = FIELD_VAR[field];
    if (!name || t < 0 || t >= this.nt) return NaN;
    const d = this._frame(t, name);
    if (!d) return NaN;
    const lut = this.luts[name];
    if (name !== 'wind') return this._bilinear(d, lut, 0, lat, lon);
    return Math.hypot(this._bilinear(d, lut, 0, lat, lon), this._bilinear(d, lut, 1, lat, lon));
  }

  // Wind vector in m/s: [u (east), v (north)] or null.
  sampleUV(t, lat, lon) {
    if (t < 0 || t >= this.nt) return null;
    const d = this._frame(t, 'wind');
    if (!d) return null;
    const lut = this.luts.wind;
    const u = this._bilinear(d, lut, 0, lat, lon), v = this._bilinear(d, lut, 1, lat, lon);
    return Number.isNaN(u) || Number.isNaN(v) ? null : [u, v];
  }
}

let current = null;

// Fetch the manifest and return a GfsGrid (the same instance while the run is unchanged).
export async function loadGfsGrid(signal) {
  const m = await fetchJSON(GFS.url + 'manifest.json', signal);
  if (m.version !== 1 || !m.times?.length || !m.grid) throw new Error('Bad GFS manifest');
  if (m.times[m.times.length - 1] < Date.now() / 1000 + GFS.minHoursAhead * 3600) throw new Error('GFS data is out of date');
  if (!current || current.run !== m.run) current = new GfsGrid(m, GFS.url);
  return current;
}
