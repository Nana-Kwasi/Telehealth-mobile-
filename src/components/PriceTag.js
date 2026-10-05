import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatMoney } from '../services/pricing';

/**
 * A fee with its discount, shown the way every shop shows one: the old price
 * struck through, the new price beside it, and a badge saying how much came off.
 *
 * When `quote` is missing or says `discounted: false` this renders the plain
 * fee and nothing else. A line through an identical number is worse than no
 * line at all.
 */
export default function PriceTag({
  quote,
  baseAmount,
  suffix = '',
  size = 'md',
  currency = 'GHS',
  showEnds = true,
}) {
  const base = Number(quote?.baseAmount ?? baseAmount);
  const s = SIZES[size] || SIZES.md;

  if (!Number.isFinite(base) || base <= 0) {
    return <Text style={[styles.plain, { fontSize: s.final }]}>Rate not set</Text>;
  }

  if (!quote?.discounted) {
    return (
      <Text style={[styles.final, { fontSize: s.final }]}>
        {formatMoney(base, currency)}{suffix}
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.was, { fontSize: s.was }]}>
          {formatMoney(base, currency)}
        </Text>
        <Text style={[styles.final, { fontSize: s.final }]}>
          {formatMoney(quote.finalAmount, currency)}{suffix}
        </Text>
        <View style={[styles.badge, { backgroundColor: quote.badgeColour || '#b3121f' }]}>
          <Text style={[styles.badgeText, { fontSize: s.badge }]}>
            {quote.badgeLabel || `-${quote.percentOff}%`}
          </Text>
        </View>
      </View>
      {showEnds && quote.endsAt ? (
        <Text style={[styles.ends, { fontSize: s.ends }]}>
          Offer ends {new Date(quote.endsAt).toLocaleDateString(undefined, {
            day: 'numeric', month: 'short',
          })}
        </Text>
      ) : null}
    </View>
  );
}

const SIZES = {
  sm: { was: 11,   final: 13, badge: 9,  ends: 10 },
  md: { was: 12.5, final: 15, badge: 10, ends: 11 },
  lg: { was: 15,   final: 24, badge: 11, ends: 12 },
};

const styles = StyleSheet.create({
  // No flex:1 anywhere here. In a column parent it stretches a one-line price
  // to fill the screen — the gap that turned up between chat responses.
  wrap: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  was: {
    color: '#8a90a0',
    textDecorationLine: 'line-through',
    fontWeight: '500',
  },
  final: { color: '#0f1424', fontWeight: '800' },
  plain: { color: '#6f7787' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: '#ffffff', fontWeight: '800', letterSpacing: 0.2 },
  ends: { color: '#6f7787', marginTop: 3 },
});
