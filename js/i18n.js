// LomFon — Thai / English strings.

const STR = {
  th: {
    searchPh: 'ค้นหาเมือง สถานที่…',
    locate: 'ตำแหน่งของฉัน',
    layers: 'ชั้นข้อมูล',
    menu: 'เมนู',
    particles: 'ลมเคลื่อนไหว',
    radar: 'เรดาร์ฝน (สด)',
    satellite: 'ภาพดาวเทียม (รายวัน)',
    model: 'แบบจำลอง',
    focus: 'พื้นที่',
    layer_wind: 'ลม',
    layer_temp: 'อุณหภูมิ',
    layer_rain: 'ฝน (พยากรณ์)',
    layer_clouds: 'เมฆ',
    layer_humidity: 'ความชื้น',
    layer_pressure: 'ความกดอากาศ',
    layer_gust: 'ลมกระโชก',
    layer_none: 'ไม่แสดงสี',
    tab_now: 'ตอนนี้',
    tab_hourly: 'รายชั่วโมง',
    tab_daily: '16 วัน',
    tab_compare: 'เทียบโมเดล',
    feelsLike: 'รู้สึกเหมือน',
    wind: 'ลม',
    gusts: 'กระโชก',
    humidity: 'ความชื้น',
    pressure: 'ความกดอากาศ',
    clouds: 'เมฆ',
    uvMax: 'UV สูงสุด',
    precipToday: 'ฝนวันนี้',
    rainChance: 'โอกาสฝน',
    sunrise: 'พระอาทิตย์ขึ้น',
    sunset: 'พระอาทิตย์ตก',
    next2h: 'ฝน 2 ชั่วโมงข้างหน้า',
    noRain2h: 'ไม่มีฝนใน 2 ชั่วโมงข้างหน้า',
    rainingNow: 'กำลังมีฝนตก',
    rainStartsAt: (time) => `ฝนอาจเริ่มตกราว ${time}`,
    aqi: 'คุณภาพอากาศ (US AQI)',
    aqiLevels: ['ดี', 'ปานกลาง', 'เริ่มมีผลต่อกลุ่มเสี่ยง', 'มีผลต่อสุขภาพ', 'มีผลต่อสุขภาพมาก', 'อันตราย'],
    pm25: 'PM2.5',
    waves: 'คลื่นทะเล',
    wavePeriod: 'คาบคลื่น',
    temperature: 'อุณหภูมิ',
    precip: 'ฝน',
    windSpeed: 'ความเร็วลม',
    loading: 'กำลังโหลด…',
    loadError: 'โหลดข้อมูลไม่สำเร็จ',
    gfsUnavailable: 'ยังไม่มีข้อมูล GFS ทั่วโลก — ใช้ Open-Meteo แทน',
    rateLimited: 'เรียกข้อมูลถี่เกินไป (ขีดจำกัด API ฟรี) — รอสักครู่แล้วลองใหม่',
    retry: 'ลองใหม่',
    favAdd: 'บันทึกเป็นที่โปรด',
    favRemove: 'ลบจากที่โปรด',
    favName: 'ตั้งชื่อสถานที่นี้',
    favorites: 'ที่โปรด',
    noFavs: 'ยังไม่มี — แตะ ☆ ในหน้าพยากรณ์เพื่อบันทึก',
    share: 'แชร์',
    copied: 'คัดลอกลิงก์แล้ว',
    settings: 'ตั้งค่า',
    language: 'ภาษา',
    tempUnit: 'หน่วยอุณหภูมิ',
    windUnit: 'หน่วยความเร็วลม',
    about: 'เกี่ยวกับและแหล่งข้อมูล',
    aboutHtml:
      '<p><b>LomFon (ลมฝน)</b> แผนที่อากาศแบบโอเพนซอร์ส ไม่มีโฆษณา ไม่เก็บข้อมูลผู้ใช้</p>' +
      '<ul><li>พยากรณ์และชั้นข้อมูลแผนที่: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0) รวมแบบจำลองจาก ECMWF, NOAA, DWD, JMA ฯลฯ</li>' +
      '<li>เรดาร์ฝน: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> (ย้อนหลังราว 2 ชม.)</li>' +
      '<li>ภาพดาวเทียม: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a></li>' +
      '<li>แผนที่ฐาน: © Esri, © OpenStreetMap</li></ul>' +
      '<p class="muted">ชั้นข้อมูลแผนที่สร้างจากกริดจุดพยากรณ์ ความละเอียดขึ้นกับระดับซูม เลือก “พื้นที่” เป็นประเทศเพื่อให้ละเอียดขึ้น ข้อมูลใช้เพื่อประกอบการตัดสินใจเท่านั้น</p>',
    close: 'ปิด',
    myLocation: 'ตำแหน่งของฉัน',
    geoError: 'หาตำแหน่งไม่ได้ — ตรวจสอบสิทธิ์การเข้าถึงตำแหน่ง',
    geoUnsupported: 'เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง',
    nowLabel: 'ตอนนี้',
    today: 'วันนี้',
    hoursAhead: (n) => `อีก ${n} ชม.`,
    hoursAgo: (n) => `${n} ชม. ที่แล้ว`,
    minAgo: (n) => (n <= 0 ? 'ล่าสุด' : `${n} นาทีที่แล้ว`),
    radarLabel: 'เรดาร์',
    radarError: 'โหลดเรดาร์ไม่สำเร็จ',
    radarNone: 'ยังไม่มีภาพเรดาร์',
    compareNote: 'เส้นของแต่ละโมเดลยิ่งห่างกัน = พยากรณ์ยิ่งไม่แน่นอน',
    elevation: (m) => `สูง ${m} ม.`,
    updated: 'อัปเดต',
    na: '–',
    noData: 'ไม่มีข้อมูลสำหรับจุดนี้',
    clickHint: 'แตะที่แผนที่เพื่อดูพยากรณ์ของจุดนั้น',
    install: 'เพิ่มลงหน้าจอโฮมได้จากเมนูเบราว์เซอร์ เพื่อใช้เหมือนแอป',
    wmo: {
      0: 'ท้องฟ้าแจ่มใส', 1: 'ส่วนใหญ่แจ่มใส', 2: 'มีเมฆบางส่วน', 3: 'เมฆมาก',
      45: 'หมอก', 48: 'หมอกน้ำค้างแข็ง',
      51: 'ฝนปรอยเล็กน้อย', 53: 'ฝนปรอย', 55: 'ฝนปรอยหนาแน่น', 56: 'ฝนปรอยเยือกแข็ง', 57: 'ฝนปรอยเยือกแข็ง',
      61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนหนัก', 66: 'ฝนเยือกแข็ง', 67: 'ฝนเยือกแข็งหนัก',
      71: 'หิมะเล็กน้อย', 73: 'หิมะ', 75: 'หิมะหนัก', 77: 'เกล็ดหิมะ',
      80: 'ฝนซู่เล็กน้อย', 81: 'ฝนซู่', 82: 'ฝนซู่รุนแรง', 85: 'หิมะโปรย', 86: 'หิมะโปรยหนัก',
      95: 'พายุฝนฟ้าคะนอง', 96: 'พายุฝนฟ้าคะนอง มีลูกเห็บ', 99: 'พายุฝนฟ้าคะนองรุนแรง มีลูกเห็บ',
    },
  },
  en: {
    searchPh: 'Search city or place…',
    locate: 'My location',
    layers: 'Layers',
    menu: 'Menu',
    particles: 'Animated wind',
    radar: 'Rain radar (live)',
    satellite: 'Satellite (daily)',
    model: 'Model',
    focus: 'Area',
    layer_wind: 'Wind',
    layer_temp: 'Temperature',
    layer_rain: 'Rain (forecast)',
    layer_clouds: 'Clouds',
    layer_humidity: 'Humidity',
    layer_pressure: 'Pressure',
    layer_gust: 'Wind gusts',
    layer_none: 'No colour layer',
    tab_now: 'Now',
    tab_hourly: 'Hourly',
    tab_daily: '16 days',
    tab_compare: 'Models',
    feelsLike: 'Feels like',
    wind: 'Wind',
    gusts: 'Gusts',
    humidity: 'Humidity',
    pressure: 'Pressure',
    clouds: 'Clouds',
    uvMax: 'Max UV',
    precipToday: 'Rain today',
    rainChance: 'Rain chance',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    next2h: 'Rain, next 2 hours',
    noRain2h: 'No rain expected in the next 2 hours',
    rainingNow: 'Raining now',
    rainStartsAt: (time) => `Rain may start around ${time}`,
    aqi: 'Air quality (US AQI)',
    aqiLevels: ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'],
    pm25: 'PM2.5',
    waves: 'Sea waves',
    wavePeriod: 'Wave period',
    temperature: 'Temperature',
    precip: 'Precipitation',
    windSpeed: 'Wind speed',
    loading: 'Loading…',
    loadError: 'Could not load data',
    gfsUnavailable: 'Global GFS data is not available — using Open-Meteo instead',
    rateLimited: 'Too many requests (free API limit) — wait a moment and try again',
    retry: 'Retry',
    favAdd: 'Save to favourites',
    favRemove: 'Remove from favourites',
    favName: 'Name this place',
    favorites: 'Favourites',
    noFavs: 'None yet — tap ☆ on a forecast to save it',
    share: 'Share',
    copied: 'Link copied',
    settings: 'Settings',
    language: 'Language',
    tempUnit: 'Temperature unit',
    windUnit: 'Wind unit',
    about: 'About & data sources',
    aboutHtml:
      '<p><b>LomFon</b> is an open-source weather map. No ads, no tracking.</p>' +
      '<ul><li>Forecasts and map layers: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0), combining ECMWF, NOAA, DWD, JMA and other models</li>' +
      '<li>Rain radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> (about 2 h of history)</li>' +
      '<li>Satellite imagery: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a></li>' +
      '<li>Base map: © Esri, © OpenStreetMap</li></ul>' +
      '<p class="muted">Map layers are built from a grid of forecast points whose spacing depends on zoom. Pick a country under “Area” for finer detail. For guidance only.</p>',
    close: 'Close',
    myLocation: 'My location',
    geoError: 'Could not get your location — check location permission',
    geoUnsupported: 'Geolocation is not supported by this browser',
    nowLabel: 'Now',
    today: 'Today',
    hoursAhead: (n) => `in ${n} h`,
    hoursAgo: (n) => `${n} h ago`,
    minAgo: (n) => (n <= 0 ? 'latest' : `${n} min ago`),
    radarLabel: 'Radar',
    radarError: 'Could not load radar',
    radarNone: 'No radar frames yet',
    compareNote: 'The further apart the model lines, the less certain the forecast',
    elevation: (m) => `${m} m elevation`,
    updated: 'Updated',
    na: '–',
    noData: 'No data for this point',
    clickHint: 'Tap the map to see the forecast for that spot',
    install: 'Add to your home screen from the browser menu to use it like an app',
    wmo: {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Rime fog',
      51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain',
      71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
      80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
    },
  },
};

let lang = 'th';

export function setLang(l) {
  lang = STR[l] ? l : 'en';
  document.documentElement.lang = lang;
}
export const getLang = () => lang;
export const locale = () => (lang === 'th' ? 'th-TH' : 'en-GB');

export function t(key, ...args) {
  const v = STR[lang][key] ?? STR.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', el.title);
  });
}
