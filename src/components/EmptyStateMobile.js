import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import ICONS from './healthIconData';

/*
 * Big, colourful icons for empty screens and headings on mobile.
 *
 *  <EmptyStateMobile icon="Medicines" tone="emerald" title="No prescriptions yet">
 *    Prescriptions from your doctor will appear here.
 *  </EmptyStateMobile>
 *
 * `icon` is a Health Icons name (see healthIconData.js) or any icon component,
 * such as one from lucide-react-native.
 */

export const TONES = {
  indigo: ['#4f46e5', '#e0e7ff'], sky: ['#0284c7', '#e0f2fe'], teal: ['#0d9488', '#ccfbf1'], emerald: ['#059669', '#d1fae5'],
  rose: ['#e11d48', '#ffe4e6'], pink: ['#db2777', '#fce7f3'], violet: ['#7c3aed', '#ede9fe'], amber: ['#d97706', '#fef3c7'],
  orange: ['#ea580c', '#ffedd5'], blue: ['#2563eb', '#dbeafe'], slate: ['#475569', '#e2e8f0'],
};

/** A Health Icon drawn with react-native-svg. */
export function HealthIcon({ name, size = 24, color = '#0f172a', variant = 'filled' }) {
  const icon = ICONS[name];
  const drawing = icon && (icon[variant] || icon.outline || icon.filled);
  if (!drawing) return null;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${drawing.size} ${drawing.size}`}>
      {drawing.nodes.map((n, i) => <Path key={i} d={n.d} fill={color} fillRule={n.fr || 'nonzero'} clipRule={n.fr || 'nonzero'} />)}
    </Svg>
  );
}

/** A coloured circle holding an icon. */
export function IconBubbleMobile({ icon, tone = 'indigo', size = 40, variant = 'filled' }) {
  const [ink, bg] = TONES[tone] || TONES.indigo;
  const box = Math.round(size * 1.8);
  const Lucide = typeof icon === 'string' ? null : icon;
  return (
    <View style={[st.bubble, { width: box, height: box, borderRadius: box / 2, backgroundColor: bg, shadowColor: ink }]}>
      {Lucide ? <Lucide size={size} color={ink} strokeWidth={2} /> : <HealthIcon name={icon} size={size} color={ink} variant={variant} />}
    </View>
  );
}

export default function EmptyStateMobile({ icon = 'Health', tone = 'indigo', title, children, action, compact = false }) {
  return (
    <View style={[st.wrap, compact && st.compact]} accessibilityRole="text">
      <IconBubbleMobile icon={icon} tone={tone} size={compact ? 28 : 44} />
      {title ? <Text style={[st.title, compact && { fontSize: 15 }]}>{title}</Text> : null}
      {children ? (typeof children === 'string' ? <Text style={st.text}>{children}</Text> : children) : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

/** An Ionicons icon in a coloured circle, for empty states that already used one. */
export function IonBubble({ name, tone = 'indigo', size = 36 }) {
  const [ink, bg] = TONES[tone] || TONES.indigo;
  const box = Math.round(size * 1.8);
  return (
    <View style={[st.bubble, { width: box, height: box, borderRadius: box / 2, backgroundColor: bg, shadowColor: ink, marginBottom: 6 }]}>
      <Ionicons name={name} size={size} color={ink} />
    </View>
  );
}

/**
 * A short "nothing here" line: a small coloured icon beside the text. Takes the
 * text's original style, so it drops in where a plain <Text> was.
 */
export function EmptyLineMobile({ icon = 'Health', tone = 'indigo', style, children }) {
  const flat = StyleSheet.flatten(style) || {};
  return (
    <View style={[st.line, flat.textAlign === 'center' && { justifyContent: 'center' }, flat.marginTop != null && { marginTop: flat.marginTop }]}>
      <IconBubbleMobile icon={icon} tone={tone} size={16} />
      <Text style={[style, { marginTop: 0, flexShrink: 1, textAlign: 'left' }]}>{children}</Text>
    </View>
  );
}

/** A heading with a small coloured icon. */
export function IconHeadingMobile({ icon, tone = 'indigo', children, style }) {
  return (
    <View style={[st.heading, style]}>
      <IconBubbleMobile icon={icon} tone={tone} size={16} />
      <Text style={st.headingText}>{children}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  bubble: { alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  wrap: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16 },
  compact: { paddingVertical: 14 },
  title: { marginTop: 12, fontSize: 17, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  text: { marginTop: 4, fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  headingText: { fontSize: 15, fontWeight: '700', color: '#0f172a', flexShrink: 1 },
});
