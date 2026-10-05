import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { pickLocation } from './LocationSummaryCardMobile';
import { fetchCurrentWeather } from '../services/weatherService';

/**
 * Current conditions where the patient is. Coordinates come from the same
 * profile the location card reads, so a location the patient updates carries
 * straight through to the weather without any extra wiring.
 *
 * Renders nothing when there are no coordinates or the service cannot be
 * reached — an error box over something this peripheral would be worse than
 * simply leaving it out.
 */
export default function WeatherCardMobile({ profile, embedded = false }) {
  const { latitude, longitude, city, area, region, country } = pickLocation(profile);
  const [weather, setWeather] = useState(null);

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
    // Re-runs on a new location: that is the whole point of the card.
  }, [latitude, longitude]);

  if (!weather) return null;

  const place = [area || city, region && region !== city ? region : '', country]
    .filter(Boolean).slice(0, 2).join(', ');

  return (
    <View style={[styles.card, embedded && styles.cardEmbedded]}>
      <View style={styles.main}>
        <Text style={styles.icon}>{weather.icon}</Text>
        <View style={styles.headline}>
          <Text style={styles.temp}>{weather.tempC}°C</Text>
          <Text style={styles.label}>{weather.label}</Text>
        </View>
        {place ? <Text style={styles.place} numberOfLines={1}>{place}</Text> : null}
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaItem}>Feels {weather.feelsLikeC}°</Text>
        <Text style={styles.metaItem}>Humidity {weather.humidity}%</Text>
        <Text style={styles.metaItem}>Wind {weather.windKph} km/h</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Embedded: no surface of its own. It is sitting INSIDE another card, and
  // a second background, border and margin there reads as clutter rather than
  // as structure.
  cardEmbedded: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  card: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#dbeafe',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 30, lineHeight: 34 },
  headline: { flexShrink: 0 },
  temp: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginTop: 1 },
  place: { flex: 1, textAlign: 'right', fontSize: 12, color: '#64748b' },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  metaItem: { fontSize: 11, color: '#94a3b8' },
});
