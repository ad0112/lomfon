// LomFon — animated rain radar from the RainViewer public API.
import { API, RADAR } from './config.js';

const L = window.L;

export class Radar {
  constructor(map, { onFrame, onError } = {}) {
    this.map = map;
    this.onFrame = onFrame;
    this.onError = onError;
    this.frames = [];
    this.layers = new Map(); // path -> tileLayer
    this.idx = -1;
    this.visible = false;
    this.playing = false;
    this._timer = null;
    this._refresh = null;
  }

  async load() {
    const r = await fetch(API.rainviewer, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    this.host = j.host;
    const past = (j.radar?.past || []).map((f) => ({ ...f, kind: 'past' }));
    const cast = (j.radar?.nowcast || []).map((f) => ({ ...f, kind: 'nowcast' }));
    const wasLatest = this.idx < 0 || this.idx >= this.lastPast;
    this.frames = [...past, ...cast];
    this.lastPast = past.length - 1;
    // drop layers for frames that rolled off
    const keep = new Set(this.frames.map((f) => f.path));
    for (const [path, layer] of this.layers) {
      if (!keep.has(path)) {
        this.map.removeLayer(layer);
        this.layers.delete(path);
      }
    }
    if (wasLatest || this.idx >= this.frames.length) this.idx = Math.max(0, this.lastPast);
  }

  _layer(frame) {
    let layer = this.layers.get(frame.path);
    if (!layer) {
      const url = `${this.host}${frame.path}/${RADAR.tileSize}/{z}/{x}/{y}/${RADAR.color}/${RADAR.options}.png`;
      layer = L.tileLayer(url, {
        pane: 'radarPane',
        tileSize: RADAR.tileSize,
        zoomOffset: -1,
        maxNativeZoom: RADAR.maxUrlZoom + 1, // url zoom = tile zoom - 1
        maxZoom: 18,
        opacity: 0,
        attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
      });
      this.layers.set(frame.path, layer);
    }
    return layer;
  }

  async setVisible(v) {
    this.visible = v;
    if (!v) {
      this.pause();
      for (const layer of this.layers.values()) this.map.removeLayer(layer);
      clearInterval(this._refresh);
      this._refresh = null;
      return;
    }
    try {
      await this.load();
    } catch (e) {
      this.onError?.(e);
      return;
    }
    if (!this.visible) return;
    if (!this.frames.length) {
      this.onFrame?.(null);
      return;
    }
    // preload all frames (transparent) so the animation is smooth
    for (const f of this.frames) {
      const layer = this._layer(f);
      if (!this.map.hasLayer(layer)) layer.addTo(this.map);
    }
    this.show(this.idx);
    clearInterval(this._refresh);
    this._refresh = setInterval(() => this._reload(), RADAR.refreshMs);
  }

  async _reload() {
    if (!this.visible) return;
    try {
      await this.load();
      for (const f of this.frames) {
        const layer = this._layer(f);
        if (!this.map.hasLayer(layer)) layer.addTo(this.map);
      }
      this.show(this.idx);
    } catch {
      /* keep showing what we have */
    }
  }

  show(i) {
    if (!this.frames.length) return;
    this.idx = ((i % this.frames.length) + this.frames.length) % this.frames.length;
    this.frames.forEach((f, k) => {
      const layer = this.layers.get(f.path);
      if (layer) layer.setOpacity(k === this.idx ? RADAR.opacity : 0);
    });
    this.onFrame?.(this.frames[this.idx], this.idx, this.frames.length);
  }

  play() {
    if (this.playing || !this.frames.length) return;
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      const next = this.idx + 1;
      this.show(next >= this.frames.length ? 0 : next);
      const atEnd = this.idx === this.frames.length - 1;
      this._timer = setTimeout(tick, atEnd ? RADAR.frameMs + RADAR.holdLastMs : RADAR.frameMs);
    };
    this._timer = setTimeout(tick, RADAR.frameMs);
  }

  pause() {
    this.playing = false;
    clearTimeout(this._timer);
  }

  toggle() {
    this.playing ? this.pause() : this.play();
    return this.playing;
  }
}
