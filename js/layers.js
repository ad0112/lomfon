// LomFon — Leaflet canvas layers: colour heatmap and animated wind particles.
import { normLon } from './util.js';

const L = window.L;

// A full-viewport canvas that is re-positioned and re-rendered after every move/zoom.
const CanvasLayer = L.Layer.extend({
  options: { pane: 'overlayPane', hidpi: false },

  initialize(options) {
    L.setOptions(this, options);
  },

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'lf-canvas');
    map.getPane(this.options.pane).appendChild(this._canvas);
    map.on('moveend resize', this._reset, this);
    map.on('zoomstart', this._hide, this);
    this._reset();
  },

  onRemove(map) {
    map.off('moveend resize', this._reset, this);
    map.off('zoomstart', this._hide, this);
    this._stop?.();
    L.DomUtil.remove(this._canvas);
    this._canvas = null;
  },

  _hide() {
    if (this._canvas) this._canvas.style.visibility = 'hidden';
    this._stop?.();
  },

  _reset() {
    const map = this._map, c = this._canvas;
    if (!map || !c) return;
    const size = map.getSize();
    const dpr = this.options.hidpi ? Math.min(2, window.devicePixelRatio || 1) : 1;
    c.width = Math.round(size.x * dpr);
    c.height = Math.round(size.y * dpr);
    c.style.width = size.x + 'px';
    c.style.height = size.y + 'px';
    L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
    c.style.visibility = 'visible';
    this._dpr = dpr;
    this._size = size;
    this.render(true);
  },

  // Re-render with the current view (e.g. after the data or time changed).
  refresh() {
    if (this._canvas && this._size) this.render(false);
  },

  // In Web Mercator, longitude depends only on x and latitude only on y.
  _axes(cols, rows, step) {
    const map = this._map;
    const lons = new Float64Array(cols), lats = new Float64Array(rows);
    for (let i = 0; i < cols; i++) lons[i] = normLon(map.containerPointToLatLng([i * step, 0]).lng);
    for (let j = 0; j < rows; j++) lats[j] = map.containerPointToLatLng([0, j * step]).lat;
    return { lons, lats };
  },

  render() {},
});

// Colour field: source(lat, lon) -> value; scale: ColorScale.
export const HeatLayer = CanvasLayer.extend({
  options: { pane: 'heatPane', step: 4 },

  setSource(fn) { this._src = fn; },
  setScale(scale) { this._scale = scale; },

  render() {
    const c = this._canvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this._src || !this._scale) return;
    const step = this.options.step;
    const cols = Math.ceil(this._size.x / step) + 1;
    const rows = Math.ceil(this._size.y / step) + 1;
    const { lons, lats } = this._axes(cols, rows, step);
    const off = this._offscreen || (this._offscreen = document.createElement('canvas'));
    off.width = cols;
    off.height = rows;
    const octx = off.getContext('2d');
    const img = octx.createImageData(cols, rows);
    const px = img.data, lut = this._scale.data, src = this._src, scale = this._scale;
    for (let j = 0; j < rows; j++) {
      const lat = lats[j];
      if (lat > 85.05 || lat < -85.05) continue;
      for (let i = 0; i < cols; i++) {
        const k = scale.index(src(lat, lons[i]));
        if (k < 0) continue;
        const o = (j * cols + i) * 4;
        px[o] = lut[k];
        px[o + 1] = lut[k + 1];
        px[o + 2] = lut[k + 2];
        px[o + 3] = lut[k + 3];
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, cols, rows, 0, 0, cols * step, rows * step);
  },
});

// Animated wind particles: source(lat, lon) -> [u, v] in m/s, or null.
export const ParticleLayer = CanvasLayer.extend({
  options: {
    pane: 'particlePane',
    hidpi: true,
    cell: 8,            // px per velocity-field cell
    velocityScale: 0.1, // px per frame per m/s
    maxAge: 90,         // frames before a particle respawns
    density: 1 / 230,   // particles per px²
    lineWidth: 1.1,
  },

  setSource(fn) { this._src = fn; },

  // full reset: new view → new field and fresh particles
  render(fullReset) {
    this._buildField();
    if (fullReset || !this._px) this._spawnAll();
    this._start();
  },

  _buildField() {
    if (!this._size) return;
    const cell = this.options.cell;
    const cols = Math.ceil(this._size.x / cell) + 1;
    const rows = Math.ceil(this._size.y / cell) + 1;
    const { lons, lats } = this._axes(cols, rows, cell);
    const fu = new Float32Array(cols * rows).fill(NaN);
    const fv = new Float32Array(cols * rows).fill(NaN);
    if (this._src) {
      for (let j = 0; j < rows; j++) {
        const lat = lats[j];
        if (lat > 85 || lat < -85) continue;
        for (let i = 0; i < cols; i++) {
          const w = this._src(lat, lons[i]);
          if (w) {
            fu[j * cols + i] = w[0];
            fv[j * cols + i] = w[1];
          }
        }
      }
    }
    this._field = { fu, fv, cols, rows, cell };
  },

  _spawnAll() {
    const { x: W, y: H } = this._size;
    const n = Math.round(Math.min(5000, Math.max(700, W * H * this.options.density)));
    this._px = new Float32Array(n);
    this._py = new Float32Array(n);
    this._age = new Float32Array(n);
    for (let k = 0; k < n; k++) this._respawn(k, true);
    const ctx = this._canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  },

  _respawn(k, randomAge) {
    this._px[k] = Math.random() * this._size.x;
    this._py[k] = Math.random() * this._size.y;
    this._age[k] = randomAge ? Math.random() * this.options.maxAge : 0;
  },

  _start() {
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this._frame();
    };
    this._raf = requestAnimationFrame(loop);
  },

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  },

  _frame() {
    const c = this._canvas, f = this._field;
    if (!c || !f || !this._px) return;
    const ctx = c.getContext('2d');
    const dpr = this._dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // fade previous trails
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'source-over';
    // alpha fading stalls at a few /255 due to rounding; wipe the residue now and then
    if ((this._tick = (this._tick || 0) + 1) % 90 === 0) {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 14) d[i] = 0;
      ctx.putImageData(img, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = this.options.lineWidth;
    ctx.lineCap = 'round';

    const buckets = [[], [], [], []];
    const { fu, fv, cols, rows, cell } = f;
    const W = this._size.x, H = this._size.y;
    const vs = this.options.velocityScale, maxAge = this.options.maxAge;
    const px = this._px, py = this._py, age = this._age;
    for (let k = 0; k < px.length; k++) {
      const x = px[k], y = py[k];
      const i = (x / cell) | 0, j = (y / cell) | 0;
      if (i < 0 || j < 0 || i >= cols || j >= rows || age[k] > maxAge) { this._respawn(k, false); continue; }
      const u = fu[j * cols + i], v = fv[j * cols + i];
      if (Number.isNaN(u)) { this._respawn(k, false); continue; }
      const nx = x + u * vs, ny = y - v * vs;
      const s = Math.hypot(u, v);
      const b = s < 3 ? 0 : s < 7 ? 1 : s < 12 ? 2 : 3;
      buckets[b].push(x, y, nx, ny);
      px[k] = nx;
      py[k] = ny;
      age[k] += 1;
      if (nx < 0 || ny < 0 || nx > W || ny > H) age[k] = maxAge + 1;
    }
    const styles = ['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0.95)'];
    for (let b = 0; b < 4; b++) {
      const seg = buckets[b];
      if (!seg.length) continue;
      ctx.strokeStyle = styles[b];
      ctx.beginPath();
      for (let s = 0; s < seg.length; s += 4) {
        ctx.moveTo(seg[s], seg[s + 1]);
        ctx.lineTo(seg[s + 2], seg[s + 3]);
      }
      ctx.stroke();
    }
  },
});
