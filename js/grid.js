// LomFon — model grid: one multi-location Open-Meteo request that feeds every map layer.
import { API, GRID } from './config.js';
import { fetchJSON, qs, clamp } from './util.js';

export class Grid {
  /**
   * @param {{bbox:{s:number,w:number,n:number,e:number}, nx:number, ny:number, model:string,
   *          times:number[], fields:Record<string, Float32Array>}} o
   */
  constructor(o) {
    Object.assign(this, o);
    this.npts = this.nx * this.ny;
    this.dlon = (this.bbox.e - this.bbox.w) / (this.nx - 1);
    this.dlat = (this.bbox.n - this.bbox.s) / (this.ny - 1);
    this.nt = this.times.length;
  }

  covers(b) {
    const eps = 1e-6;
    return b.w >= this.bbox.w - eps && b.e <= this.bbox.e + eps && b.s >= this.bbox.s - eps && b.n <= this.bbox.n + eps;
  }

  nearestTimeIndex(unix) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.nt; i++) {
      const d = Math.abs(this.times[i] - unix);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Fractional grid position, or null when outside the grid (half a cell of slack).
  _pos(lat, lon) {
    const fi = (lon - this.bbox.w) / this.dlon;
    const fj = (lat - this.bbox.s) / this.dlat;
    if (fi < -0.5 || fj < -0.5 || fi > this.nx - 0.5 || fj > this.ny - 0.5) return null;
    const i0 = clamp(Math.floor(fi), 0, this.nx - 2);
    const j0 = clamp(Math.floor(fj), 0, this.ny - 2);
    return { i0, j0, di: clamp(fi - i0, 0, 1), dj: clamp(fj - j0, 0, 1) };
  }

  _bilinear(f, base, p) {
    const { i0, j0, di, dj } = p;
    const nx = this.nx;
    const k = base + j0 * nx + i0;
    const a = f[k], b = f[k + 1], c = f[k + nx], d = f[k + nx + 1];
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) {
      // fall back to the nearest corner that has data
      const near = [
        [a, (1 - di) * (1 - dj)], [b, di * (1 - dj)], [c, (1 - di) * dj], [d, di * dj],
      ].filter(([v]) => !Number.isNaN(v)).sort((x, y) => y[1] - x[1]);
      return near.length ? near[0][0] : NaN;
    }
    return (a * (1 - di) + b * di) * (1 - dj) + (c * (1 - di) + d * di) * dj;
  }

  sample(field, t, lat, lon) {
    const f = this.fields[field];
    if (!f || t < 0 || t >= this.nt) return NaN;
    const p = this._pos(lat, lon);
    return p ? this._bilinear(f, t * this.npts, p) : NaN;
  }

  // Wind vector in m/s: [u (east), v (north)] or null.
  sampleUV(t, lat, lon) {
    if (t < 0 || t >= this.nt) return null;
    const p = this._pos(lat, lon);
    if (!p) return null;
    const base = t * this.npts;
    const u = this._bilinear(this.fields.u, base, p);
    const v = this._bilinear(this.fields.v, base, p);
    return Number.isNaN(u) || Number.isNaN(v) ? null : [u, v];
  }
}

// Choose grid columns/rows for ~N points, matching the bbox's on-screen aspect.
export function gridDims(bbox, N) {
  const midLat = ((bbox.s + bbox.n) / 2) * (Math.PI / 180);
  const aspect = Math.max(0.2, ((bbox.e - bbox.w) * Math.max(0.3, Math.cos(midLat))) / Math.max(0.1, bbox.n - bbox.s));
  let nx = Math.round(Math.sqrt(N * aspect));
  nx = clamp(nx, 4, 26);
  const ny = clamp(Math.round(N / nx), 4, 26);
  return { nx, ny };
}

export function gridPoints(bbox, nx, ny) {
  const lats = [], lons = [];
  for (let j = 0; j < ny; j++) {
    const lat = bbox.s + ((bbox.n - bbox.s) * j) / (ny - 1);
    for (let i = 0; i < nx; i++) {
      const lon = bbox.w + ((bbox.e - bbox.w) * i) / (nx - 1);
      lats.push(+lat.toFixed(3));
      lons.push(+lon.toFixed(3));
    }
  }
  return { lats, lons };
}

// Convert an Open-Meteo multi-location response into a Grid.
export function buildGrid(json, bbox, nx, ny, model) {
  const list = Array.isArray(json) ? json : [json];
  const npts = nx * ny;
  if (list.length !== npts) throw new Error(`Grid size mismatch (${list.length} != ${npts})`);
  const times = list[0].hourly.time;
  const nt = times.length;
  const fields = {};
  for (const name of GRID.vars) {
    const arr = new Float32Array(nt * npts).fill(NaN);
    for (let p = 0; p < npts; p++) {
      const src = list[p].hourly?.[name];
      if (!src) continue;
      for (let t = 0; t < nt; t++) {
        const v = src[t];
        if (v != null) arr[t * npts + p] = v;
      }
    }
    fields[name] = arr;
  }
  // u/v components for smooth wind interpolation (direction = where wind comes FROM)
  const sp = fields.wind_speed_10m, dir = fields.wind_direction_10m;
  const u = new Float32Array(sp.length), v = new Float32Array(sp.length);
  for (let k = 0; k < sp.length; k++) {
    const r = (dir[k] * Math.PI) / 180;
    u[k] = -sp[k] * Math.sin(r);
    v[k] = -sp[k] * Math.cos(r);
  }
  fields.u = u;
  fields.v = v;
  return new Grid({ bbox, nx, ny, model, times, fields });
}

export async function fetchGrid(bbox, model, nx, ny, signal) {
  const { lats, lons } = gridPoints(bbox, nx, ny);
  const url =
    API.forecast +
    '?' +
    qs({
      latitude: lats.join(','),
      longitude: lons.join(','),
      hourly: GRID.vars.join(','),
      forecast_days: GRID.forecastDays,
      timeformat: 'unixtime',
      timezone: 'GMT',
      wind_speed_unit: 'ms',
      models: model,
    });
  const json = await fetchJSON(url, signal);
  return buildGrid(json, bbox, nx, ny, model);
}
