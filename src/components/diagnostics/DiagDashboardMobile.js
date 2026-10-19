import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import LocationSummaryCardMobile from '../LocationSummaryCardMobile';
import { STAGES, fmtHours, money, fmtDateTime, diagRoutes } from './diagUi';
import { PriorityPill } from './DiagActionsMobile';

/**
 * Lab / scan home on mobile (parent and branch). Twin of web DiagOverview — one
 * call to /diagnostics/operations/dashboard, scoped on the server.
 */
export default function DiagDashboardMobile({ type = 'lab', profile, isBranch, colors: C }) {
  const navigation = useNavigation();
  const routes = diagRoutes(type, isBranch);
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (d = days) => {
    try {
      setError('');
      setData(await api(`/api/v1/diagnostics/operations/dashboard?days=${d}`));
    } catch (e) { setError(e?.message || 'Could not load the dashboard.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [days]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const go = (name, params) => navigation.navigate(name, params);
  const t = data?.totals || {};
  const currency = data?.revenue?.currency || 'GHS';
  const name = isBranch ? (profile?.branchName || 'Branch') : (profile?.labName || profile?.centerName || profile?.name || (type === 'lab' ? 'Lab' : 'Scan centre'));
  const hour = new Date().getHours();
  const flow = type === 'scan' ? ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] : ['PENDING', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED'];
  const maxDay = Math.max(1, ...(data?.series || []).map(r => Math.max(r.received, r.completed)));
  const maxMix = Math.max(1, ...(data?.testMix || []).map(m => m.count));
  const pct = data?.tat?.withinTargetPct ?? 0;
  const pctColor = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';

  const Kpi = ({ label, value, sub, color, icon, onPress }) => (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} style={[st.kpi, { borderLeftColor: color }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={st.kpiLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={st.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={st.kpiSub} numberOfLines={1}>{sub}</Text> : null}
    </TouchableOpacity>
  );

  const Row = ({ r, right }) => (
    <TouchableOpacity style={st.row} onPress={() => go(routes.detail, { orderId: r.orderId })}>
      <PriorityPill priority={r.priority} />
      <View style={{ flex: 1 }}>
        <Text style={st.rowTitle} numberOfLines={1}>{r.patientName || 'Patient'} · {r.testType || 'Test'}</Text>
        <Text style={st.rowMeta} numberOfLines={1}>{[r.orderCode, r.branchName].filter(Boolean).join(' · ')}</Text>
      </View>
      {right}
    </TouchableOpacity>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, backgroundColor: C.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}>
      <View style={[st.hero, { backgroundColor: C.primary }]}>
        <Text style={st.heroGreet}>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</Text>
        <Text style={st.heroName} numberOfLines={1}>{name}</Text>
        <Text style={st.heroSub}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        <View style={st.heroStrip}>
          <View style={st.heroCell}><Text style={st.heroNum}>{data?.today?.received ?? '–'}</Text><Text style={st.heroLbl}>Received today</Text></View>
          <View style={st.heroCell}><Text style={st.heroNum}>{data?.today?.completed ?? '–'}</Text><Text style={st.heroLbl}>Done today</Text></View>
          <View style={st.heroCell}><Text style={st.heroNum}>{t.open ?? '–'}</Text><Text style={st.heroLbl}>In queue</Text></View>
        </View>
      </View>

      <View style={st.quick}>
        {[
          { icon: 'list', label: isBranch ? 'Worklist' : 'Orders', to: routes.orders },
          { icon: 'id-card', label: 'Verify ID', to: routes.verify },
          { icon: 'document-text', label: 'Results', to: routes.results },
          { icon: 'pricetags', label: 'Catalog', to: routes.catalog },
          ...(!isBranch ? [{ icon: 'business', label: 'Branches', to: routes.branches }] : []),
        ].map(q => (
          <TouchableOpacity key={q.label} style={st.quickBtn} onPress={() => go(q.to)}>
            <View style={[st.quickIcon, { backgroundColor: C.primaryLight }]}><Ionicons name={q.icon} size={18} color={C.primary} /></View>
            <Text style={st.quickText}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !data ? <ActivityIndicator color={C.primary} style={{ margin: 32 }} /> : null}
      {error ? <Text style={[st.alertText, { color: '#b91c1c', margin: 16 }]}>{error}</Text> : null}
      {data && (
        <>
          {data.results?.criticalInRange > 0 && (
            <View style={[st.alert, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
              <Text style={{ fontSize: 20 }}>🚨</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.alertTitle, { color: '#991b1b' }]}>{data.results.criticalInRange} critical result{data.results.criticalInRange > 1 ? 's' : ''}</Text>
                <Text style={[st.alertText, { color: '#991b1b' }]}>The doctor was alerted. Call them too if your protocol says so.</Text>
              </View>
            </View>
          )}
          {t.overdue > 0 && (
            <TouchableOpacity style={[st.alert, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]} onPress={() => go(routes.orders, { tab: 'overdue' })}>
              <Text style={{ fontSize: 20 }}>⏱️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.alertTitle, { color: '#92400e' }]}>{t.overdue} past turnaround target</Text>
                <Text style={[st.alertText, { color: '#92400e' }]}>{t.urgentOpen ? `${t.urgentOpen} urgent/STAT open · ` : ''}Tap to see them</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#92400e" />
            </TouchableOpacity>
          )}

          <View style={st.rangeRow}>
            {[7, 14, 30, 90].map(d => (
              <TouchableOpacity key={d} onPress={() => { setDays(d); load(d); }} style={[st.rangeBtn, days === d && { backgroundColor: C.primary }]}>
                <Text style={[st.rangeText, days === d && { color: '#fff' }]}>{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={st.kpiGrid}>
            <Kpi icon="time" label="Overdue" value={t.overdue ?? 0} color="#dc2626" sub="Past target" onPress={() => go(routes.orders, { tab: 'overdue' })} />
            <Kpi icon="flash" label="Urgent open" value={t.urgentOpen ?? 0} color="#f97316" sub="STAT / urgent" onPress={() => go(routes.orders, { tab: 'urgent' })} />
            <Kpi icon="speedometer" label="Avg turnaround" value={fmtHours(data.tat?.avgHours)} color="#8b5cf6" sub={`${pct}% on time`} />
            <Kpi icon="cash" label={`Revenue ${days}d`} value={money(data.revenue?.completedValue, currency)} color="#0f766e" sub="At catalog price" />
            <Kpi icon="checkmark-done" label={`Completed ${days}d`} value={t.completedInRange ?? 0} color="#16a34a" sub={`${t.inRange ?? 0} received`} />
            <Kpi icon="close-circle" label="Rejection rate" value={`${data.rejectionRatePct ?? 0}%`} color="#be123c" sub={`${t.rejectedInRange ?? 0} rejected`} />
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>Work pipeline</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {flow.map(s => (
                <TouchableOpacity key={s} style={[st.stage, { backgroundColor: STAGES[s].bg }]} onPress={() => go(routes.orders, { tab: s })}>
                  <Text style={[st.stageN, { color: STAGES[s].fg }]}>{data.stages?.[s] ?? 0}</Text>
                  <Text style={[st.stageL, { color: STAGES[s].fg }]} numberOfLines={2}>{STAGES[s].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={st.card}>
            <View style={st.cardHead}><Text style={st.cardTitle}>Received vs completed</Text><Text style={st.hint}>Last {days} days</Text></View>
            <View style={st.chart}>
              {(data.series || []).slice(-21).map(r => (
                <View key={r.date} style={st.chartCol}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
                    <View style={[st.bar, { height: `${(r.received / maxDay) * 100}%`, backgroundColor: '#93c5fd' }]} />
                    <View style={[st.bar, { height: `${(r.completed / maxDay) * 100}%`, backgroundColor: '#22c55e' }]} />
                  </View>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
              <Text style={st.hint}><Text style={{ color: '#3b82f6' }}>■</Text> Received</Text>
              <Text style={st.hint}><Text style={{ color: '#22c55e' }}>■</Text> Completed</Text>
            </View>
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>Turnaround</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={[st.ring, { borderColor: pctColor }]}><Text style={[st.ringText, { color: pctColor }]}>{pct}%</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={st.body}>{pct}% finished within target</Text>
                <Text style={st.body}>Average {fmtHours(data.tat?.avgHours)} · median {fmtHours(data.tat?.medianHours)}</Text>
                <Text style={st.hint}>Target: STAT 2h · urgent 6h · catalog, else {type === 'lab' ? '24h' : '48h'}</Text>
              </View>
            </View>
          </View>

          <View style={st.card}>
            <View style={st.cardHead}><Text style={st.cardTitle}>⏱️ Overdue</Text><Text style={st.hint}>Most late first</Text></View>
            {data.overdue?.length ? data.overdue.slice(0, 6).map(r => (
              <Row key={r.orderId} r={r} right={<Text style={st.late}>{fmtHours(r.ageHours)}/{fmtHours(r.targetHours)}</Text>} />
            )) : <Text style={st.empty}>✓ Nothing overdue</Text>}
          </View>

          {type === 'scan' ? (
            <View style={st.card}>
              <Text style={st.cardTitle}>📅 Upcoming scans</Text>
              {data.upcoming?.length ? data.upcoming.map(r => <Row key={r.orderId} r={r} right={<Text style={st.hint}>{fmtDateTime(r.scheduledAt)}</Text>} />)
                : <Text style={st.empty}>No scans booked yet.</Text>}
            </View>
          ) : (
            <View style={st.card}>
              <Text style={st.cardTitle}>🚨 Critical results</Text>
              {data.critical?.length ? data.critical.slice(0, 6).map(r => <Row key={r.resultId} r={{ ...r, priority: 'STAT' }} right={<Text style={st.hint}>{fmtDateTime(r.createdAt)}</Text>} />)
                : <Text style={st.empty}>No critical values in this period.</Text>}
            </View>
          )}

          <View style={st.card}>
            <Text style={st.cardTitle}>Most requested {type === 'lab' ? 'tests' : 'scans'}</Text>
            {data.testMix?.length ? data.testMix.map(m => (
              <View key={m.name} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={st.body} numberOfLines={1}>{m.name}</Text><Text style={[st.body, { fontWeight: '800' }]}>{m.count}</Text></View>
                <View style={st.track}><View style={[st.fill, { width: `${(m.count / maxMix) * 100}%`, backgroundColor: C.primary }]} /></View>
              </View>
            )) : <Text style={st.empty}>No orders in this period.</Text>}
          </View>

          {!isBranch && (
            <View style={st.card}>
              <Text style={st.cardTitle}>Branch performance</Text>
              {data.branches?.length ? data.branches.map(b => (
                <TouchableOpacity key={b.branchId} style={st.branch} onPress={() => go(routes.branchDetail, { branchId: b.branchId })}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={st.rowTitle} numberOfLines={1}>{b.name || 'Branch'}</Text>
                    <Text style={[st.hint, { color: b.status === 'active' ? '#16a34a' : '#b91c1c', fontWeight: '800' }]}>{b.status}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={st.hint}>Open <Text style={st.b}>{b.open}</Text></Text>
                    <Text style={st.hint}>Done <Text style={st.b}>{b.completed}</Text></Text>
                    <Text style={[st.hint, b.overdue ? { color: '#b91c1c' } : null]}>Late <Text style={st.b}>{b.overdue}</Text></Text>
                    <Text style={st.hint}>TAT <Text style={st.b}>{fmtHours(b.avgTatHours)}</Text></Text>
                  </View>
                  <Text style={[st.hint, { marginTop: 4 }]}>{money(b.revenue, currency)}</Text>
                </TouchableOpacity>
              )) : <Text style={st.empty}>No branches yet.</Text>}
            </View>
          )}
        </>
      )}

      <LocationSummaryCardMobile profile={profile} onEdit={() => go(type === 'lab' ? (isBranch ? 'LabBranchSettings' : 'LabSettings') : (isBranch ? 'ScanBranchSettings' : 'ScanSettings'))} />
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  hero: { padding: 20, paddingTop: 22, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroGreet: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  heroName: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  heroStrip: { flexDirection: 'row', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 10 },
  heroCell: { flex: 1, alignItems: 'center' },
  heroNum: { color: '#fff', fontSize: 22, fontWeight: '900' },
  heroLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  quick: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  quickBtn: { alignItems: 'center', flex: 1, gap: 6 },
  quickIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  alertTitle: { fontWeight: '800', fontSize: 14 },
  alertText: { fontSize: 12, marginTop: 2 },
  rangeRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 10 },
  rangeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  rangeText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  kpi: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  kpiLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', flex: 1 },
  kpiValue: { fontSize: 22, fontWeight: '900', color: '#0f172a', marginTop: 4 },
  kpiSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  hint: { fontSize: 11, color: '#64748b' },
  b: { fontWeight: '800', color: '#0f172a' },
  body: { fontSize: 13, color: '#334155', flexShrink: 1 },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 8 },
  stage: { flex: 1, borderRadius: 12, padding: 10, minHeight: 74 },
  stageN: { fontSize: 22, fontWeight: '900' },
  stageL: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  chart: { flexDirection: 'row', height: 110, alignItems: 'flex-end', gap: 3 },
  chartCol: { flex: 1, height: '100%' },
  bar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  ring: { width: 70, height: 70, borderRadius: 35, borderWidth: 7, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: 16, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  rowMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  late: { fontSize: 11, fontWeight: '900', color: '#b91c1c', backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#f1f5f9', marginTop: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  branch: { borderWidth: 1, borderColor: '#f1f5f9', backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 8 },
});
