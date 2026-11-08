// LomFon — configuration: data sources, layers, colour scales, regions.

export const APP = { name: 'LomFon', version: '1.0.0' };

export const API = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
  air: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  marine: 'https://marine-api.open-meteo.com/v1/marine',
  rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
};

export const BASEMAP = {
  base: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
  labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

// RainViewer free (personal-use) API: past ~2 h of radar, 10-min steps,
// max tile zoom 7, "Universal Blue" colour scheme (2) only.
export const RADAR = {
  tileSize: 512,
  maxUrlZoom: 7,
  color: 2,
  options: '1_1', // smooth=1, snow=1
  frameMs: 550,
  holdLastMs: 1500,
  refreshMs: 5 * 60 * 1000,
  opacity: 0.8,
};

// NASA GIBS daily true-colour satellite mosaic (no key required).
// The first layer that loads is used; the next is a fallback.
export const SATELLITE = {
  layers: ['VIIRS_SNPP_CorrectedReflectance_TrueColor', 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'MODIS_Terra_CorrectedReflectance_TrueColor'],
  url: (layer, date) =>
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
  maxNativeZoom: 9,
  attribution: 'Imagery &copy; <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>',
};

// Model grid that feeds the map layers (one Open-Meteo multi-location request).
export const GRID = {
  vars: [
    'temperature_2m',
    'precipitation',
    'cloud_cover',
    'relative_humidity_2m',
    'pressure_msl',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
  ],
  forecastDays: 5,
  pointsWorld: 160, // grid points when following the viewport
  pointsFocus: 220, // grid points when a country is focused
};

export const MODELS = [
  { id: 'best_match', label: { th: 'อัตโนมัติ (ดีที่สุด)', en: 'Auto (best match)' } },
  { id: 'ecmwf_ifs025', label: { th: 'ECMWF IFS', en: 'ECMWF IFS' } },
  { id: 'gfs_seamless', label: { th: 'NOAA GFS', en: 'NOAA GFS' } },
  { id: 'icon_seamless', label: { th: 'DWD ICON', en: 'DWD ICON' } },
  { id: 'jma_seamless', label: { th: 'JMA (ญี่ปุ่น)', en: 'JMA (Japan)' } },
  { id: 'gem_seamless', label: { th: 'GEM (แคนาดา)', en: 'GEM (Canada)' } },
  { id: 'meteofrance_seamless', label: { th: 'Météo-France', en: 'Météo-France' } },
  { id: 'ukmo_seamless', label: { th: 'UK Met Office', en: 'UK Met Office' } },
];

export const COMPARE_MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'jma_seamless', 'gem_seamless', 'ukmo_seamless'];
export const COMPARE_COLORS = ['#ffb86b', '#5ab0ff', '#7ee787', '#ff7b9c', '#c39bff', '#f2e05c'];

// Colour scales: [value (base unit), r, g, b, alpha 0-1]
const WIND_SCALE = [
  [0, 98, 113, 183, 0.75],
  [3, 57, 97, 159, 0.75],
  [6, 74, 148, 169, 0.75],
  [9, 77, 141, 123, 0.75],
  [12, 83, 165, 83, 0.75],
  [15, 53, 159, 53, 0.75],
  [18, 167, 157, 81, 0.75],
  [21, 159, 127, 58, 0.75],
  [25, 161, 108, 92, 0.75],
  [30, 129, 58, 78, 0.78],
  [40, 175, 80, 136, 0.8],
  [50, 117, 74, 147, 0.8],
];

const TEMP_SCALE = [
  [-40, 130, 22, 146, 0.72],
  [-25, 70, 40, 180, 0.72],
  [-10, 48, 110, 200, 0.72],
  [0, 70, 170, 210, 0.72],
  [10, 80, 180, 130, 0.72],
  [20, 190, 200, 80, 0.72],
  [27, 240, 170, 60, 0.72],
  [33, 230, 100, 50, 0.74],
  [40, 190, 40, 50, 0.76],
  [50, 120, 20, 40, 0.78],
];

const RAIN_SCALE = [
  [0, 80, 150, 255, 0],
  [0.1, 80, 150, 255, 0.0],
  [0.25, 90, 170, 255, 0.45],
  [1, 40, 120, 245, 0.65],
  [2, 20, 190, 140, 0.72],
  [5, 240, 220, 40, 0.78],
  [10, 250, 140, 30, 0.82],
  [20, 230, 40, 40, 0.85],
  [50, 200, 40, 200, 0.9],
];

const CLOUD_SCALE = [
  [0, 230, 235, 245, 0],
  [20, 230, 235, 245, 0.05],
  [60, 225, 230, 240, 0.45],
  [100, 245, 247, 250, 0.82],
];

const HUM_SCALE = [
  [0, 160, 110, 60, 0.7],
  [30, 200, 170, 90, 0.7],
  [55, 120, 180, 140, 0.7],
  [75, 60, 150, 200, 0.72],
  [100, 40, 70, 180, 0.75],
];

const PRESS_SCALE = [
  [960, 110, 40, 150, 0.72],
  [985, 60, 90, 190, 0.72],
  [1000, 60, 160, 200, 0.72],
  [1013, 90, 180, 120, 0.72],
  [1022, 220, 200, 80, 0.72],
  [1032, 230, 120, 60, 0.74],
  [1045, 190, 50, 60, 0.76],
];

export const LAYERS = {
  wind: { field: 'wind_speed_10m', unitType: 'wind', scale: WIND_SCALE, ticks: [0, 5, 10, 15, 20, 30, 40], swatch: '#53a553' },
  temp: { field: 'temperature_2m', unitType: 'temp', scale: TEMP_SCALE, ticks: [-30, -10, 0, 10, 20, 30, 40], swatch: '#f0aa3c' },
  rain: { field: 'precipitation', unitType: 'precip', scale: RAIN_SCALE, ticks: [0.25, 1, 2, 5, 10, 20, 50], transform: 'sqrt', swatch: '#2878f5' },
  clouds: { field: 'cloud_cover', unitType: 'percent', scale: CLOUD_SCALE, ticks: [0, 25, 50, 75, 100], swatch: '#dfe4ee' },
  humidity: { field: 'relative_humidity_2m', unitType: 'percent', scale: HUM_SCALE, ticks: [0, 25, 50, 75, 100], swatch: '#3c96c8' },
  pressure: { field: 'pressure_msl', unitType: 'pressure', scale: PRESS_SCALE, ticks: [970, 990, 1000, 1013, 1025, 1040], swatch: '#5ab478' },
  gust: { field: 'wind_gusts_10m', unitType: 'wind', scale: WIND_SCALE, ticks: [0, 5, 10, 15, 20, 30, 40], swatch: '#a79d51' },
};
export const LAYER_ORDER = ['wind', 'temp', 'rain', 'clouds', 'humidity', 'pressure', 'gust', 'none'];

// bbox: [south, west, north, east]
export const COUNTRIES = [
  { code: 'WORLD', th: 'ทั่วโลก (ตามมุมมองแผนที่)', en: 'Worldwide (follow map view)' },
  { code: 'SEA', th: 'เอเชียตะวันออกเฉียงใต้', en: 'Southeast Asia', bbox: [-11, 92, 28.6, 141] },
  { code: 'TH', th: 'ไทย', en: 'Thailand', bbox: [5.6, 97.3, 20.5, 105.7] },
  { code: 'LA', th: 'ลาว', en: 'Laos', bbox: [13.9, 100.0, 22.6, 107.7] },
  { code: 'MM', th: 'เมียนมา', en: 'Myanmar', bbox: [9.5, 92.1, 28.6, 101.2] },
  { code: 'KH', th: 'กัมพูชา', en: 'Cambodia', bbox: [10.4, 102.3, 14.7, 107.7] },
  { code: 'VN', th: 'เวียดนาม', en: 'Vietnam', bbox: [8.4, 102.1, 23.4, 109.5] },
  { code: 'MY', th: 'มาเลเซีย', en: 'Malaysia', bbox: [0.8, 99.6, 7.4, 119.3] },
  { code: 'SG', th: 'สิงคโปร์', en: 'Singapore', bbox: [1.15, 103.6, 1.48, 104.1] },
  { code: 'ID', th: 'อินโดนีเซีย', en: 'Indonesia', bbox: [-11.0, 95.0, 6.1, 141.0] },
  { code: 'PH', th: 'ฟิลิปปินส์', en: 'Philippines', bbox: [4.6, 116.9, 21.1, 126.6] },
  { code: 'CN', th: 'จีน', en: 'China', bbox: [18.1, 73.5, 53.6, 134.8] },
  { code: 'TW', th: 'ไต้หวัน', en: 'Taiwan', bbox: [21.9, 120.0, 25.3, 122.0] },
  { code: 'JP', th: 'ญี่ปุ่น', en: 'Japan', bbox: [24.0, 122.9, 45.6, 146.0] },
  { code: 'KR', th: 'เกาหลีใต้', en: 'South Korea', bbox: [33.1, 124.6, 38.6, 131.0] },
  { code: 'IN', th: 'อินเดีย', en: 'India', bbox: [6.7, 68.1, 35.5, 97.4] },
  { code: 'AU', th: 'ออสเตรเลีย', en: 'Australia', bbox: [-43.7, 113.3, -10.6, 153.6] },
  { code: 'NZ', th: 'นิวซีแลนด์', en: 'New Zealand', bbox: [-47.3, 166.4, -34.4, 178.6] },
  { code: 'GB', th: 'สหราชอาณาจักร', en: 'United Kingdom', bbox: [49.9, -8.2, 58.7, 1.8] },
  { code: 'FR', th: 'ฝรั่งเศส', en: 'France', bbox: [42.3, -4.8, 51.1, 8.2] },
  { code: 'DE', th: 'เยอรมนี', en: 'Germany', bbox: [47.3, 5.9, 55.1, 15.0] },
  { code: 'US', th: 'สหรัฐอเมริกา (แผ่นดินหลัก)', en: 'United States (contiguous)', bbox: [24.5, -124.8, 49.4, -66.9] },
  { code: 'CA', th: 'แคนาดา', en: 'Canada', bbox: [41.7, -141.0, 70.0, -52.6] },
  { code: 'BR', th: 'บราซิล', en: 'Brazil', bbox: [-33.8, -74.0, 5.3, -34.8] },
];
