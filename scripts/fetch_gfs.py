#!/usr/bin/env python3
"""LomFon — build a compact global weather grid from the latest NOAA GFS run.

Downloads only the GRIB2 records the map needs (HTTP range requests against the
public NOAA bucket on AWS), re-grids them to lon -180..179.5 / lat -90..90 and
writes one small gzip'd uint8 file per variable and forecast step:

    <out>/manifest.json
    <out>/<run>/<step>/<var>.bin.gz      e.g. 2026111512/003/tmp.bin.gz

Byte value 255 = no data; otherwise value = byte * scale + offset (then squared
when "square" is set). `wind` holds two planes: u (east) then v (north).

Usage:  python scripts/fetch_gfs.py --out data/gfs
Needs:  pip install -r scripts/requirements.txt
"""
import argparse
import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import eccodes
import numpy as np

BUCKET = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com'
NX, NY = 720, 361  # 0.5 degree global

# GRIB records to pull: key -> (variable, level) as written in the .idx file
RECORDS = {
    'tmp': ('TMP', '2 m above ground'),
    'rh': ('RH', '2 m above ground'),
    'u': ('UGRD', '10 m above ground'),
    'v': ('VGRD', '10 m above ground'),
    'gust': ('GUST', 'surface'),
    'prs': ('PRMSL', 'mean sea level'),
    'cld': ('TCDC', 'entire atmosphere'),
    'prate': ('PRATE', 'surface'),
}

# Output encoding. value = byte * scale + offset; "square" → value = (byte * scale) ** 2
VARS = {
    'tmp': {'scale': 0.5, 'offset': -80.0, 'unit': 'degC'},
    'rh': {'scale': 1.0, 'offset': 0.0, 'unit': '%'},
    'cld': {'scale': 1.0, 'offset': 0.0, 'unit': '%'},
    'prs': {'scale': 0.625, 'offset': 905.0, 'unit': 'hPa'},
    'gust': {'scale': 0.25, 'offset': 0.0, 'unit': 'm/s'},
    'prcp': {'scale': 0.04, 'offset': 0.0, 'square': True, 'unit': 'mm/h'},
    'wind': {'scale': 0.4, 'offset': -50.8, 'planes': 2, 'unit': 'm/s'},
}


def http_get(url, byte_range=None, tries=4):
    headers = {'User-Agent': 'lomfon-gfs-fetch'}
    if byte_range:
        headers['Range'] = 'bytes=%d-%s' % (byte_range[0], '' if byte_range[1] is None else byte_range[1])
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404) or attempt == tries - 1:
                raise
        except Exception:
            if attempt == tries - 1:
                raise
        time.sleep(2 * (attempt + 1))


def file_url(run, step):
    return '%s/gfs.%s/%s/atmos/gfs.t%sz.pgrb2.0p50.f%03d' % (BUCKET, run[:8], run[8:], run[8:], step)


def run_is_complete(run, last_step):
    try:
        http_get(file_url(run, last_step) + '.idx', tries=2)
        return True
    except Exception:
        return False


def latest_run(last_step):
    now = datetime.now(timezone.utc)
    t = now.replace(hour=now.hour // 6 * 6, minute=0, second=0, microsecond=0)
    for _ in range(8):  # look back up to 48 h
        run = t.strftime('%Y%m%d%H')
        if run_is_complete(run, last_step):
            return run
        t -= timedelta(hours=6)
    raise SystemExit('No complete GFS run found in the last 48 h')


def parse_idx(text):
    """→ list of dicts {start, end, var, level, kind} (end None = to end of file)."""
    rows = []
    for line in text.strip().splitlines():
        p = line.split(':')
        if len(p) >= 6:
            rows.append({'start': int(p[1]), 'var': p[3], 'level': p[4], 'kind': p[5]})
    for a, b in zip(rows, rows[1:]):
        a['end'] = b['start'] - 1
    if rows:
        rows[-1]['end'] = None
    return rows


def decode(msg):
    """GRIB2 message bytes → float32 [NY, NX], south→north, lon -180..179.5."""
    gid = eccodes.codes_new_from_message(msg)
    try:
        ni, nj = eccodes.codes_get(gid, 'Ni'), eccodes.codes_get(gid, 'Nj')
        if (ni, nj) != (NX, NY):
            raise ValueError('unexpected grid %dx%d' % (ni, nj))
        a = eccodes.codes_get_values(gid).astype(np.float32).reshape(nj, ni)
        if eccodes.codes_get(gid, 'bitmapPresent'):
            a[a == eccodes.codes_get(gid, 'missingValue')] = np.nan
        if not eccodes.codes_get(gid, 'jScansPositively'):
            a = a[::-1]
        if eccodes.codes_get(gid, 'iScansNegatively'):
            a = a[:, ::-1]
        lon0 = eccodes.codes_get(gid, 'longitudeOfFirstGridPointInDegrees') % 360
        # column of lon -180 (= 180) goes first
        return np.roll(a, -int(round((180 - lon0) / (360 / ni))), axis=1)
    finally:
        eccodes.codes_release(gid)


def fetch_step(run, step):
    url = file_url(run, step)
    rows = parse_idx(http_get(url + '.idx').decode())
    out = {}
    for key, (var, level) in RECORDS.items():
        cands = [r for r in rows if r['var'] == var and r['level'] == level]
        inst = next((r for r in cands if 'ave' not in r['kind'] and 'acc' not in r['kind']), None)
        if key == 'prate':
            ave = next((r for r in cands if 'ave' in r['kind']), None)
            if ave:
                m = re.match(r'(\d+)-(\d+) hour', ave['kind'])
                out['prate_ave'] = decode(http_get(url, (ave['start'], ave['end'])))
                out['prate_win'] = (int(m.group(1)), int(m.group(2))) if m else None
        if inst:
            out[key] = decode(http_get(url, (inst['start'], inst['end'])))
    missing = [k for k in RECORDS if k not in out]
    if missing:
        raise RuntimeError('f%03d: missing records %s' % (step, missing))
    print('  f%03d ok' % step, flush=True)
    return out


def quantize(a, spec):
    x = np.sqrt(np.maximum(a, 0)) if spec.get('square') else a - spec['offset']
    q = np.clip(np.rint(x / spec['scale']), 0, 254)
    return np.where(np.isnan(a), 255, q).astype(np.uint8)


def precip_rates(frames, steps):
    """mm/h over the interval ending at each step, from GFS running averages.

    GFS averages restart every 6 h (0-3, 0-6, 6-9, 6-12 …); a 6 h window is turned
    into its last 3 h using the previous step. Falls back to the instantaneous rate.
    """
    out = []
    for i, f in enumerate(frames):
        rate = f['prate']
        ave, win = f.get('prate_ave'), f.get('prate_win')
        if ave is not None and win:
            rate = ave
            prev = frames[i - 1] if i else None
            pw = prev.get('prate_win') if prev else None
            if pw and pw[0] == win[0] and pw[1] == steps[i - 1] and win[1] - win[0] > win[1] - pw[1]:
                n, k = win[1] - win[0], pw[1] - pw[0]
                rate = (ave * n - prev['prate_ave'] * k) / (n - k)
        out.append(np.maximum(rate, 0) * 3600.0)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default='data/gfs', help='output directory (default: data/gfs)')
    ap.add_argument('--run', help='model run YYYYMMDDHH (default: latest complete run)')
    ap.add_argument('--hours', type=int, default=120, help='forecast length in hours (default: 120)')
    ap.add_argument('--step', type=int, default=3, help='hours between steps (default: 3)')
    ap.add_argument('--skip-if-current', metavar='URL', help='exit early when the manifest at URL is already this run')
    ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args()

    steps = list(range(0, a.hours + 1, a.step))
    run = a.run or latest_run(steps[-1])
    print('GFS run', run, '· steps', len(steps))

    updated = True
    if a.skip_if_current:
        try:
            updated = json.loads(http_get(a.skip_if_current, tries=1)).get('run') != run
        except Exception:
            pass  # no manifest published yet
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as fh:
            fh.write('updated=%s\nrun=%s\n' % (str(updated).lower(), run))
    if not updated:
        print('Already published — nothing to do')
        return

    with ThreadPoolExecutor(a.workers) as pool:
        frames = list(pool.map(lambda s: fetch_step(run, s), steps))
    rains = precip_rates(frames, steps)

    out = Path(a.out)
    total = 0
    for s, f, rain in zip(steps, frames, rains):
        planes = {
            'tmp': quantize(f['tmp'] - 273.15, VARS['tmp']),
            'rh': quantize(f['rh'], VARS['rh']),
            'cld': quantize(f['cld'], VARS['cld']),
            'prs': quantize(f['prs'] / 100.0, VARS['prs']),
            'gust': quantize(f['gust'], VARS['gust']),
            'prcp': quantize(rain, VARS['prcp']),
            'wind': np.concatenate([quantize(f['u'], VARS['wind']), quantize(f['v'], VARS['wind'])]),
        }
        d = out / run / ('%03d' % s)
        d.mkdir(parents=True, exist_ok=True)
        for name, arr in planes.items():
            blob = gzip.compress(arr.tobytes(), 9, mtime=0)
            (d / (name + '.bin.gz')).write_bytes(blob)
            total += len(blob)

    t0 = datetime.strptime(run, '%Y%m%d%H').replace(tzinfo=timezone.utc)
    manifest = {
        'version': 1,
        'source': 'NOAA GFS 0.5 deg',
        'run': run,
        'runTime': int(t0.timestamp()),
        'generated': int(time.time()),
        'grid': {'nx': NX, 'ny': NY, 'lon0': -180.0, 'lat0': -90.0, 'dlon': 360 / NX, 'dlat': 180 / (NY - 1)},
        'steps': ['%03d' % s for s in steps],
        'times': [int(t0.timestamp()) + s * 3600 for s in steps],
        'path': '{run}/{step}/{var}.bin.gz',
        'vars': VARS,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')))
    print('Wrote %d files, %.1f MB → %s' % (len(steps) * len(VARS), total / 1e6, out))


if __name__ == '__main__':
    sys.exit(main())
