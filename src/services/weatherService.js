// ─── NessaHub Mobile — Weather ───────────────────────────────────────────────
// Live conditions for the patient's own location, shown on the dashboard home.
//
// Open-Meteo is used deliberately: it needs no API key and no account, so there
// is no secret to ship inside the app binary and nothing to expire. It is called
// directly rather than proxied through our backend — the request carries only a
// coarse latitude/longitude and no patient identifier.
//
// Kept byte-for-byte in step with the web copy at
// Telehealth/src/services/weatherService.js so both dashboards describe the same
// sky the same way.

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

// WMO weather interpretation codes. Open-Meteo returns the number; everything a
// patient actually reads (wording, emoji, day/night variant) is derived here.
const WMO = {
  0:  { label: 'Clear sky',            icon: '☀️', night: '🌙' },
  1:  { label: 'Mainly clear',         icon: '🌤️', night: '🌙' },
  2:  { label: 'Partly cloudy',        icon: '⛅', night: '☁️' },
  3:  { label: 'Overcast',             icon: '☁️' },
  45: { label: 'Fog',                  icon: '🌫️' },
  48: { label: 'Freezing fog',         icon: '🌫️' },
  51: { label: 'Light drizzle',        icon: '🌦️' },
  53: { label: 'Drizzle',              icon: '🌦️' },
  55: { label: 'Heavy drizzle',        icon: '🌧️' },
  56: { label: 'Freezing drizzle',     icon: '🌧️' },
  57: { label: 'Freezing drizzle',     icon: '🌧️' },
  61: { label: 'Light rain',           icon: '🌦️' },
  63: { label: 'Rain',                 icon: '🌧️' },
  65: { label: 'Heavy rain',           icon: '🌧️' },
  66: { label: 'Freezing rain',        icon: '🌧️' },
  67: { label: 'Freezing rain',        icon: '🌧️' },
  71: { label: 'Light snow',           icon: '🌨️' },
  73: { label: 'Snow',                 icon: '🌨️' },
  75: { label: 'Heavy snow',           icon: '❄️' },
  77: { label: 'Snow grains',          icon: '🌨️' },
  80: { label: 'Light showers',        icon: '🌦️' },
  81: { label: 'Showers',              icon: '🌧️' },
  82: { label: 'Heavy showers',        icon: '⛈️' },
  85: { label: 'Snow showers',         icon: '🌨️' },
  86: { label: 'Heavy snow showers',   icon: '❄️' },
  95: { label: 'Thunderstorm',         icon: '⛈️' },
  96: { label: 'Thunderstorm, hail',   icon: '⛈️' },
  99: { label: 'Thunderstorm, hail',   icon: '⛈️' },
};

export function describeWeatherCode(code, isDay = true) {
  const entry = WMO[Number(code)];
  if (!entry) return { label: 'Unavailable', icon: '🌡️' };
  return { label: entry.label, icon: (!isDay && entry.night) || entry.icon };
}

// Coordinates are rounded to ~1km before they become a cache key or leave the
// browser. Street-level precision buys nothing for weather and there is no
// reason to send a patient's exact position to a third party.
const coarse = (n) => Math.round(Number(n) * 100) / 100;

// Weather does not move fast enough to justify refetching on every mount, and a
// dashboard remounts constantly as the patient navigates between tabs.
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();

/**
 * Current conditions at a point, or null when the coordinates are unusable or
 * the service cannot be reached. Never throws: the widget is decoration on a
 * medical dashboard, so a weather outage must not surface as an error state.
 */
/**
 * The visual family a weather code belongs to — drives the card's colours,
 * icon and animation (falling rain, a turning sun, lightning).
 */
export function weatherTheme(code, isDay = true) {
  const c = Number(code);
  if ([95, 96, 99].includes(c)) return 'storm';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c === 45 || c === 48) return 'fog';
  if (c === 3) return 'cloudy';
  if (c === 2) return isDay ? 'partly-day' : 'partly-night';
  return isDay ? 'clear-day' : 'clear-night';
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => (Number.isFinite(Number(deg)) ? COMPASS[Math.round(Number(deg) / 45) % 8] : '');
const hhmm = (iso) => (typeof iso === 'string' && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '');

/** One short, practical line for a health app — never alarming. */
export function weatherTip(w) {
  if (w.theme === 'storm') return 'Thunderstorms around — a video session from home is the safer choice today.';
  if (w.theme === 'rain' || (w.rainChance ?? 0) >= 60) return 'Rain likely — take an umbrella if you are heading out.';
  if (w.tempC >= 32) return 'Hot today — drink water regularly and avoid the midday sun.';
  if ((w.uvMax ?? 0) >= 8) return 'Very strong sun — use sunscreen and find shade between 10am and 4pm.';
  if (w.tempC <= 12) return 'Chilly — dress warmly if you go out.';
  if (w.humidity >= 85) return 'Very humid — keep cool and stay hydrated.';
  if (w.theme === 'clear-night' || w.theme === 'partly-night') return 'A calm evening — a good time to wind down and rest.';
  return 'Good weather for a short walk — fresh air can lift your mood.';
}

/** Forecast details added to the current conditions (all optional). */
function extras(data, cur, isDay) {
  const d = data?.daily || {};
  const h = data?.hourly || {};
  const nowHour = String(cur.time || '').slice(0, 13);
  const hourly = (h.time || [])
    .map((t, i) => ({
      time: hhmm(t),
      tempC: Math.round(h.temperature_2m?.[i]),
      code: h.weather_code?.[i],
      isDay: h.is_day?.[i] !== 0,
      rainChance: h.precipitation_probability?.[i] ?? null,
      iso: t,
    }))
    .filter((x) => x.iso.slice(0, 13) > nowHour)
    .slice(0, 6)
    .map((x) => ({ ...x, theme: weatherTheme(x.code, x.isDay) }));
  const out = {
    theme: weatherTheme(cur.weather_code, isDay),
    highC: Number.isFinite(d.temperature_2m_max?.[0]) ? Math.round(d.temperature_2m_max[0]) : null,
    lowC: Number.isFinite(d.temperature_2m_min?.[0]) ? Math.round(d.temperature_2m_min[0]) : null,
    rainChance: d.precipitation_probability_max?.[0] ?? null,
    uv: Number.isFinite(cur.uv_index) ? Math.round(cur.uv_index) : null,
    uvMax: Number.isFinite(d.uv_index_max?.[0]) ? Math.round(d.uv_index_max[0]) : null,
    windDir: compass(cur.wind_direction_10m),
    precipitationMm: Number.isFinite(cur.precipitation) ? cur.precipitation : null,
    sunrise: hhmm(d.sunrise?.[0]),
    sunset: hhmm(d.sunset?.[0]),
    hourly,
  };
  return out;
}

export async function fetchCurrentWeather(latitude, longitude, { signal } = {}) {
  const lat = coarse(latitude);
  const lon = coarse(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const key = `${lat},${lon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const url = `${ENDPOINT}?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,'
    + 'wind_direction_10m,precipitation,uv_index'
    + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=7'
    + '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max&forecast_days=1'
    + '&timezone=auto';

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return null;

    const isDay = cur.is_day !== 0;
    const { label, icon } = describeWeatherCode(cur.weather_code, isDay);
    const value = {
      tempC: Math.round(cur.temperature_2m),
      feelsLikeC: Math.round(cur.apparent_temperature),
      humidity: Math.round(cur.relative_humidity_2m),
      windKph: Math.round(cur.wind_speed_10m),
      code: cur.weather_code,
      isDay,
      label,
      icon,
      observedAt: cur.time,
      ...extras(data, cur, isDay),
    };
    value.tip = weatherTip(value);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null; // Offline, blocked, or aborted — the card simply hides.
  }
}
