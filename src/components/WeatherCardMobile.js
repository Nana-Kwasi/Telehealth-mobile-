import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, ScrollView, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pickLocation } from './LocationSummaryCardMobile';
import { fetchCurrentWeather, weatherTheme } from '../services/weatherService';

/**
 * Current conditions where the person is, with the next few hours — the app's
 * version of the web WeatherCard, same data and same look.
 *
 * The sky follows the weather; rain and snow fall across the card, the sun
 * pulses, a storm flashes. Today's high/low, rain chance, UV, wind, sunrise/
 * sunset, an hourly strip and one practical tip. Motion is skipped when the
 * phone has Reduce Motion on.
 *
 * Renders nothing without coordinates or when the service can't be reached.
 * embedded: no outer margin (it sits inside another card).
 */

// White frosted glass with only a faint tint of the weather; the icons carry the colour.
const SKIES = {
  'clear-day':    ['rgba(255,255,255,0.92)', 'rgba(254,243,199,0.75)'],
  'partly-day':   ['rgba(255,255,255,0.92)', 'rgba(254,243,199,0.6)'],
  'clear-night':  ['rgba(255,255,255,0.92)', 'rgba(224,231,255,0.8)'],
  'partly-night': ['rgba(255,255,255,0.92)', 'rgba(224,231,255,0.7)'],
  cloudy:         ['rgba(255,255,255,0.92)', 'rgba(226,232,240,0.8)'],
  fog:            ['rgba(255,255,255,0.92)', 'rgba(226,232,240,0.8)'],
  rain:           ['rgba(255,255,255,0.92)', 'rgba(219,234,254,0.85)'],
  storm:          ['rgba(255,255,255,0.92)', 'rgba(237,233,254,0.9)'],
  snow:           ['rgba(255,255,255,0.92)', 'rgba(224,242,254,0.9)'],
};
export const WEATHER_ICON_COLORS = {
  'clear-day': '#f59e0b', 'partly-day': '#f59e0b', 'clear-night': '#6366f1', 'partly-night': '#6366f1',
  cloudy: '#64748b', fog: '#94a3b8', rain: '#3b82f6', storm: '#7c3aed', snow: '#38bdf8',
};
const STAT_COLORS = {
  thermometer: '#ef4444', 'water-percent': '#0ea5e9', 'weather-windy': '#14b8a6',
  'umbrella-outline': '#6366f1', 'weather-sunny-alert': '#f59e0b',
};

export function weatherIconName(theme, code) {
  const c = Number(code);
  switch (theme) {
    case 'storm': return 'weather-lightning-rainy';
    case 'rain': return c >= 51 && c <= 57 ? 'weather-rainy' : 'weather-pouring';
    case 'snow': return c === 75 || c === 86 ? 'weather-snowy-heavy' : 'weather-snowy';
    case 'fog': return 'weather-fog';
    case 'cloudy': return 'weather-cloudy';
    case 'partly-day': return 'weather-partly-cloudy';
    case 'partly-night': return 'weather-night-partly-cloudy';
    case 'clear-night': return 'weather-night';
    default: return 'weather-sunny';
  }
}

/** One falling drop or flake, looping. */
function Particle({ x, delay, duration, snow, height }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(y, { toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [y, delay, duration]);
  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [-20, height + 20] });
  const translateX = y.interpolate({ inputRange: [0, 1], outputRange: [0, snow ? 14 : -8] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[snow ? st.flake : st.drop, { left: `${x}%`, transform: [{ translateY }, { translateX }] }]}
    />
  );
}

function Precipitation({ theme, height }) {
  if (!['rain', 'storm', 'snow'].includes(theme) || !height) return null;
  const snow = theme === 'snow';
  const n = snow ? 12 : 18;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: n }, (_, i) => (
        <Particle
          key={i}
          x={(i * 97) % 100}
          delay={((i * 37) % 100) * 12}
          duration={snow ? 3200 + (i % 4) * 400 : 800 + (i % 5) * 90}
          snow={snow}
          height={height}
        />
      ))}
    </View>
  );
}

/** Sun pulses, clouds drift, rain bobs, storms flash. */
function AnimatedIcon({ theme, name, size, color, motion }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!motion) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: theme === 'storm' ? 1600 : 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: theme === 'storm' ? 1600 : 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, theme, motion]);
  const sunny = theme === 'clear-day' || theme === 'partly-day';
  const style = sunny
    ? { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }
    : theme === 'storm'
      ? { opacity: v.interpolate({ inputRange: [0, 0.85, 0.9, 0.95, 1], outputRange: [1, 1, 0.4, 1, 1] }) }
      : { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] };
  const tint = WEATHER_ICON_COLORS[theme] || color;
  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons name={name} size={size} color={tint} />
    </Animated.View>
  );
}

export default function WeatherCardMobile({ profile, embedded = false, compact = false }) {
  const { latitude, longitude, city, area, region, country } = pickLocation(profile);
  const [weather, setWeather] = useState(null);
  const [height, setHeight] = useState(0);
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((r) => setMotion(!r)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setWeather(null);
      return undefined;
    }
    let alive = true;
    const load = async () => {
      const w = await fetchCurrentWeather(latitude, longitude);
      if (alive) setWeather(w);
    };
    load();
    // Conditions drift through the day and this screen is often left open.
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [latitude, longitude]);

  const theme = useMemo(() => (weather ? weather.theme || weatherTheme(weather.code, weather.isDay) : 'clear-day'), [weather]);
  if (!weather) return null;

  const fg = '#0f172a';
  const sub = '#64748b';
  const chip = 'rgba(255,255,255,0.75)';
  const place = [area || city, region && region !== city ? region : '', country].filter(Boolean).slice(0, 2).join(', ');
  const hiLo = weather.highC != null && weather.lowC != null ? `H ${weather.highC}°  L ${weather.lowC}°` : '';
  const iconName = weatherIconName(theme, weather.code);

  const stats = [
    { icon: 'thermometer', label: 'Feels like', value: `${weather.feelsLikeC}°` },
    { icon: 'water-percent', label: 'Humidity', value: `${weather.humidity}%` },
    { icon: 'weather-windy', label: 'Wind', value: `${weather.windKph} km/h${weather.windDir ? ` ${weather.windDir}` : ''}` },
    weather.rainChance != null ? { icon: 'umbrella-outline', label: 'Rain', value: `${weather.rainChance}%` } : null,
    weather.uvMax != null ? { icon: 'weather-sunny-alert', label: 'UV', value: `${weather.uvMax}` } : null,
  ].filter(Boolean);

  return (
    <LinearGradient
      colors={SKIES[theme] || SKIES['clear-day']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[st.card, embedded && st.embedded, compact && st.compact]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      accessible
      accessibilityLabel={`${weather.label}, ${weather.tempC} degrees${place ? `, ${place}` : ''}`}
    >
      {motion ? <Precipitation theme={theme} height={height} /> : null}

      <View style={st.top}>
        <View style={{ flex: 1 }}>
          {place ? (
            <View style={st.placeRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={14} color="#e11d48" />
              <Text style={[st.place, { color: sub }]} numberOfLines={1}>{place}</Text>
            </View>
          ) : null}
          <Text style={[st.temp, { color: fg }, compact && st.tempCompact]}>
            {weather.tempC}°<Text style={st.tempUnit}>C</Text>
          </Text>
          <Text style={[st.label, { color: fg }]}>{weather.label}</Text>
          {hiLo ? <Text style={[st.hilo, { color: sub }]}>{hiLo}</Text> : null}
        </View>
        <AnimatedIcon theme={theme} name={iconName} size={compact ? 52 : 72} color={fg} motion={motion} />
      </View>

      {!compact ? (
        <>
          <View style={st.stats}>
            {stats.map((x) => (
              <View key={x.label} style={[st.stat, { backgroundColor: chip }]}>
                <MaterialCommunityIcons name={x.icon} size={18} color={STAT_COLORS[x.icon] || fg} />
                <View>
                  <Text style={[st.statLabel, { color: sub }]}>{x.label}</Text>
                  <Text style={[st.statValue, { color: fg }]}>{x.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {weather.hourly?.length ? (
            <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hours}>
              {weather.hourly.map((h) => (
                <View key={h.iso} style={[st.hour, { backgroundColor: chip }]}>
                  <Text style={[st.hourTime, { color: sub }]}>{h.time}</Text>
                  <MaterialCommunityIcons name={weatherIconName(h.theme, h.code)} size={22} color={WEATHER_ICON_COLORS[h.theme] || fg} />
                  <Text style={[st.hourTemp, { color: fg }]}>{h.tempC}°</Text>
                  <Text style={[st.hourRain, { color: sub }]}>{h.rainChance ? `${h.rainChance}%` : ' '}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={st.foot}>
            {weather.sunrise ? (
              <View style={st.footItem}>
                <MaterialCommunityIcons name="weather-sunset-up" size={17} color="#f97316" />
                <Text style={[st.footText, { color: sub }]}>{weather.sunrise}</Text>
              </View>
            ) : null}
            {weather.sunset ? (
              <View style={st.footItem}>
                <MaterialCommunityIcons name="weather-sunset-down" size={17} color="#e11d48" />
                <Text style={[st.footText, { color: sub }]}>{weather.sunset}</Text>
              </View>
            ) : null}
          </View>
          {weather.tip ? <Text style={[st.tip, { color: fg, backgroundColor: chip }]}>{weather.tip}</Text> : null}
        </>
      ) : (
        <View style={st.compactRow}>
          {weather.rainChance != null ? (
            <View style={st.footItem}>
              <MaterialCommunityIcons name="umbrella-outline" size={14} color="#6366f1" />
              <Text style={[st.footText, { color: sub }]}>{weather.rainChance}%</Text>
            </View>
          ) : null}
          <View style={st.footItem}>
            <MaterialCommunityIcons name="water-percent" size={14} color="#0ea5e9" />
            <Text style={[st.footText, { color: sub }]}>{weather.humidity}%</Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  card: {
    borderRadius: 20, padding: 16, overflow: 'hidden', marginHorizontal: 16, marginVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  embedded: { marginHorizontal: 0, marginVertical: 0 },
  compact: { padding: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  place: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  temp: { fontSize: 46, fontWeight: '800', letterSpacing: -1, lineHeight: 52 },
  tempCompact: { fontSize: 34, lineHeight: 40 },
  tempUnit: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  hilo: { fontSize: 13, marginTop: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, minWidth: '30%', flexGrow: 1, borderWidth: 1, borderColor: 'rgba(148,163,184,0.25)' },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 14, fontWeight: '700' },
  hours: { gap: 8, marginTop: 12, paddingRight: 4 },
  hour: { width: 58, alignItems: 'center', gap: 3, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(148,163,184,0.25)' },
  hourTime: { fontSize: 11 },
  hourTemp: { fontSize: 14, fontWeight: '700' },
  hourRain: { fontSize: 10.5 },
  foot: { flexDirection: 'row', gap: 16, marginTop: 10 },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footText: { fontSize: 13 },
  tip: { marginTop: 10, padding: 10, borderRadius: 12, fontSize: 13.5, lineHeight: 19, overflow: 'hidden' },
  compactRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  drop: { position: 'absolute', top: 0, width: 1.5, height: 16, borderRadius: 2, backgroundColor: 'rgba(59,130,246,0.4)' },
  flake: { position: 'absolute', top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(56,189,248,0.55)' },
});
