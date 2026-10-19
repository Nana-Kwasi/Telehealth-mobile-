import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Shared building blocks for the pharmacy, lab and scan dashboards on mobile,
 * so the three look like one product and match the web dashboards' sections:
 * a page header, white section cards, KPI tiles, list rows, pills and empty
 * states. Every piece takes an `accent` so each role keeps its own colour.
 */

export const toMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') { const n = Date.parse(ts); return Number.isFinite(n) ? n : 0; }
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
};

export const formatAge = (ms) => {
  if (!ms || ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  if (h < 48) return h < 1 ? '<1h' : `${h}h`;
  return `${Math.floor(ms / 86400000)}d`;
};

export const formatWhen = (ms) => (ms
  ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

export function PageHeader({ title, subtitle, right }) {
  return (
    <View style={s.pageHead}>
      <View style={{ flex: 1 }}>
        <Text style={s.pageTitle}>{title}</Text>
        {subtitle ? <Text style={s.pageSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Section({ title, subtitle, action, onAction, accent = '#0c4a6e', children, style }) {
  return (
    <View style={[s.section, style]}>
      {(title || action) ? (
        <View style={s.sectionHead}>
          <View style={{ flex: 1 }}>
            {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
            {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
          </View>
          {action ? (
            <TouchableOpacity onPress={onAction} hitSlop={8}>
              <Text style={[s.sectionAction, { color: accent }]}>{action}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function KpiGrid({ items }) {
  return (
    <View style={s.kpiGrid}>
      {items.map((k) => (
        <TouchableOpacity key={k.label} style={s.kpi} activeOpacity={k.onPress ? 0.7 : 1} onPress={k.onPress} disabled={!k.onPress}>
          <View style={[s.kpiIcon, { backgroundColor: k.bg || '#f1f5f9' }]}>
            <Ionicons name={k.icon} size={18} color={k.color || '#0f172a'} />
          </View>
          <Text style={[s.kpiValue, { color: k.color || '#0f172a' }]}>{k.value}</Text>
          <Text style={s.kpiLabel} numberOfLines={2}>{k.label}</Text>
          {k.hint ? <Text style={s.kpiHint} numberOfLines={2}>{k.hint}</Text> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Row({ title, subtitle, meta, metaColor, right, onPress, icon, iconColor = '#64748b', last }) {
  const Inner = (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      {icon ? <Ionicons name={icon} size={18} color={iconColor} style={{ marginRight: 10 }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.rowSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={[s.rowMeta, metaColor && { color: metaColor }]}>{meta}</Text> : null}
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={{ marginLeft: 6 }} /> : null}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{Inner}</TouchableOpacity> : Inner;
}

export function Pill({ label, color = '#475569', bg = '#f1f5f9' }) {
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color }]}>{label}</Text></View>;
}

export function Empty({ icon = 'checkmark-circle-outline', text, actionLabel, onAction, accent = '#0c4a6e' }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={26} color="#94a3b8" />
      <Text style={s.emptyText}>{text}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction}><Text style={[s.sectionAction, { color: accent, marginTop: 6 }]}>{actionLabel}</Text></TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Notice({ icon = 'information-circle-outline', text, onPress, tone = 'info' }) {
  const t = TONES[tone] || TONES.info;
  return (
    <TouchableOpacity style={[s.notice, { backgroundColor: t.bg, borderColor: t.border }]} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={t.fg} />
      <Text style={[s.noticeText, { color: t.fg }]}>{text}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={t.fg} /> : null}
    </TouchableOpacity>
  );
}

export function KeyValue({ label, value, mono, right }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      <View style={s.kvValueWrap}>
        <Text style={[s.kvValue, mono && s.mono]} selectable numberOfLines={2}>{value || '—'}</Text>
        {right}
      </View>
    </View>
  );
}

export function Tabs({ tabs, value, onChange, accent = '#0c4a6e' }) {
  return (
    <View style={s.tabs}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <TouchableOpacity key={t.id} onPress={() => onChange(t.id)} style={[s.tab, on && { backgroundColor: accent }]}>
            <Text style={[s.tabText, on && { color: '#fff' }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Button({ label, onPress, accent = '#0c4a6e', variant = 'primary', disabled, icon, style }) {
  const outline = variant === 'outline';
  const danger = variant === 'danger';
  const color = danger ? '#dc2626' : accent;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, outline || danger ? { borderWidth: 1.5, borderColor: color, backgroundColor: '#fff' } : { backgroundColor: color }, disabled && { opacity: 0.5 }, style]}
    >
      {icon ? <Ionicons name={icon} size={16} color={outline || danger ? color : '#fff'} /> : null}
      <Text style={[s.btnText, { color: outline || danger ? color : '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const TONES = {
  info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1e40af' },
  warn: { bg: '#fffbeb', border: '#fde68a', fg: '#92400e' },
  ok: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#166534' },
  err: { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b' },
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f9' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#0f172a', backgroundColor: '#fff',
  },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 10 },
  muted: { fontSize: 12, color: '#64748b', lineHeight: 17 },
});

const s = StyleSheet.create({
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  pageSub: { fontSize: 13, color: '#64748b', marginTop: 3 },
  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e8edf3',
    shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  sectionSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  sectionAction: { fontSize: 13, fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#e8edf3', gap: 4,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kpiValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: '#334155' },
  kpiHint: { fontSize: 11, color: '#94a3b8' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  rowMeta: { fontSize: 12, fontWeight: '700', color: '#64748b', marginLeft: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  pillText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  kv: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  kvLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  kvValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  kvValue: { flex: 1, fontSize: 14, color: '#0f172a', fontWeight: '600' },
  mono: { fontFamily: 'Menlo', fontSize: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: '#fff', borderRadius: 14, padding: 6, borderWidth: 1, borderColor: '#e8edf3' },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  btnText: { fontSize: 14, fontWeight: '800' },
});
