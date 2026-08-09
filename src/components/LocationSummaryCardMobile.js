import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

function pickLocation(profile = {}) {
  const src = profile || {};
  const locationMeta = src.locationMeta || {};
  // `location` may be a structured object OR a plain address string (staff/doctor
  // profiles store a string). Live coords captured on app open land in
  // `currentLocation` (or `metadata.currentLocation`).
  const location = (src.location && typeof src.location === 'object') ? src.location : {};
  const locationStr = (typeof src.location === 'string') ? src.location.trim() : '';
  const current = src.currentLocation || src.metadata?.currentLocation || {};
  const country = src.country || locationMeta.country || location.country || '';
  const city = src.city || locationMeta.city || location.city || '';
  const area = src.area || locationMeta.area || location.area || '';
  const region = src.region || locationMeta.region || location.region || '';
  const street = src.street || locationMeta.street || location.street || '';
  const rawAddress = String(
    src.address || location.address || src.formattedAddress || current.address || locationStr || '',
  ).trim();
  const codeMatch = rawAddress.match(/\b[A-Z]{2}-\d{3}-\d{4}\b/i);
  const ghanaDigitalAddress = src.ghanaDigitalAddress || locationMeta.ghanaDigitalAddress || location.ghanaDigitalAddress || (codeMatch ? codeMatch[0].toUpperCase() : '');
  const latitude = Number(src.latitude ?? locationMeta.latitude ?? location.latitude ?? current.latitude);
  const longitude = Number(src.longitude ?? locationMeta.longitude ?? location.longitude ?? current.longitude);
  return {
    country,
    city,
    area,
    region,
    street,
    address: rawAddress,
    ghanaDigitalAddress,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function normalizeCountryCode(country = '') {
  const raw = String(country || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const table = {
    ghana: 'GH',
    nigeria: 'NG',
    kenya: 'KE',
    uganda: 'UG',
    rwanda: 'RW',
    tanzania: 'TZ',
    southafrica: 'ZA',
    unitedstates: 'US',
    usa: 'US',
    unitedkingdom: 'GB',
    uk: 'GB',
    canada: 'CA',
    india: 'IN',
    australia: 'AU',
    germany: 'DE',
    france: 'FR',
    italy: 'IT',
    spain: 'ES',
  };
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  return table[key] || '';
}

function flagFromCountry(country = '') {
  const cc = normalizeCountryCode(country);
  if (!cc) return '🏳️';
  const points = [...cc].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...points);
}

export default function LocationSummaryCardMobile({ profile, title = 'Your Saved Location', onEdit, embedded = false }) {
  const loc = pickLocation(profile);
  const composedAddress = [loc.area || loc.street, loc.city].filter(Boolean).join(', ');
  const rawFormatted = (loc.address || '').trim();
  const isDigitalCodeOnly = /^[A-Z]{2}-\d{3}-\d{4}$/i.test(rawFormatted);
  const formattedAddress = composedAddress || (rawFormatted && !isDigitalCodeOnly ? rawFormatted : '');
  const hasStructured = Boolean(loc.country || loc.city || loc.area || loc.region || loc.street);
  const hasLocation = Boolean(formattedAddress) || hasStructured || Boolean(loc.ghanaDigitalAddress) || (Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude));
  const flag = flagFromCountry(loc.country);

  const CardWrapper = onEdit ? TouchableOpacity : View;
  return (
    <CardWrapper style={[s.card, embedded && s.cardEmbedded]} onPress={onEdit} activeOpacity={0.85}>
      <View style={s.header}>
        <View style={s.titleWrap}>
          <View style={s.flagCircle}>
            <Text style={s.flagText}>{flag}</Text>
          </View>
          <Text style={s.countryText}>{loc.country || 'Location'}</Text>
        </View>
        <View style={[s.badge, hasLocation ? s.badgeOk : s.badgeMissing]}>
          <Text style={[s.badgeText, hasLocation ? s.badgeTextOk : s.badgeTextMissing]}>
            {hasLocation ? 'Saved' : 'Missing'}
          </Text>
        </View>
      </View>
      {hasLocation ? (
        <View style={{ gap: 0 }}>
          {!!formattedAddress && <Text style={[s.line, { fontWeight: '600' }]} numberOfLines={1}>{formattedAddress}</Text>}
        </View>
      ) : null}
      {onEdit ? <Text style={s.cta}>Update location</Text> : null}
    </CardWrapper>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fafc',
    padding: 8,
  },
  cardEmbedded: {
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flagCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 16,
    lineHeight: 18,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  countryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeOk: { backgroundColor: '#dcfce7' },
  badgeMissing: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  badgeTextOk: { color: '#166534' },
  badgeTextMissing: { color: '#991b1b' },
  line: {
    fontSize: 11,
    color: '#334155',
  },
  subtle: {
    marginTop: 2,
    fontSize: 11,
    color: '#64748b',
  },
  cta: {
    marginTop: 4,
    fontSize: 11,
    color: '#1d4ed8',
    fontWeight: '700',
  },
});
