import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, StyleSheet } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '../../services/apiClient';
import { fmtHours, money, fmtDateTime } from './diagUi';
import { PageHeader, Section, KpiGrid, Row, Pill, Button, Empty, ui } from '../provider/ProviderUI';

/**
 * Lab / scan reports on mobile — the twin of web Diagnostic/DiagReports.js:
 * volume, turnaround, quality and revenue for the period, the whole network or
 * one branch, and a PDF to share (web offers CSV and print).
 */
const RANGES = [7, 30, 90, 180];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default function DiagReportsMobile({ type = 'lab', isBranch, colors: C, profile }) {
  const [days, setDays] = useState(30);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const noun = type === 'lab' ? 'tests' : 'scans';

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/v1/diagnostics/operations/dashboard?days=${days}${branchId ? `&branchId=${branchId}` : ''}`);
      setData(d);
      if (!isBranch && !branchId && Array.isArray(d?.branches)) setBranches(d.branches);
    } catch { setData(null); } finally { setLoading(false); setRefreshing(false); }
  }, [days, branchId, isBranch]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const t = data?.totals || {};
  const currency = data?.revenue?.currency || 'GHS';
  const series = Array.isArray(data?.series) ? data.series.slice(-14) : [];
  const peak = Math.max(1, ...series.map(s => Math.max(s.received || 0, s.completed || 0)));
  const scope = branchId ? (branches.find(b => b.branchId === branchId)?.name || 'Branch') : (isBranch ? 'This branch' : 'Whole network');

  const sharePdf = async () => {
    if (!data) return;
    setPdfBusy(true);
    try {
      const k = (l, v, h = '') => `<td><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div><div class="h">${esc(h)}</div></td>`;
      const html = `<html><head><style>
        body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0f172a;padding:28px}h1{font-size:20px;margin:0}
        .sub{color:#64748b;font-size:12px;margin:4px 0 16px}.bar{border-bottom:3px solid #14b8a6;padding-bottom:10px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-bottom:14px}td,th{padding:7px;font-size:12px;text-align:left}
        .k td{border:1px solid #e2e8f0;width:25%;vertical-align:top}.l{color:#64748b;font-size:10px;text-transform:uppercase}.v{font-size:18px;font-weight:800}.h{color:#94a3b8;font-size:10px}
        .t th{background:#f1f5f9}.t td{border-bottom:1px solid #f1f5f9}h2{font-size:14px;margin:16px 0 6px}
      </style></head><body>
        <div class="bar"><h1>${esc(profile?.labName || profile?.centerName || profile?.branchName || (type === 'lab' ? 'Laboratory' : 'Scan centre'))} — Report</h1>
        <div class="sub">Last ${days} days · ${esc(scope)} · NessaHub</div></div>
        <table class="k"><tr>${k('Orders received', t.inRange ?? 0)}${k('Completed', t.completedInRange ?? 0)}${k('Rejected', t.rejectedInRange ?? 0, `${data.rejectionRatePct ?? 0}% of received`)}${k('Revenue', money(data.revenue?.completedValue, currency))}</tr>
        <tr>${k('Avg turnaround', fmtHours(data.tat?.avgHours), `median ${fmtHours(data.tat?.medianHours)}`)}${k('Within target', `${data.tat?.withinTargetPct ?? 0}%`)}${k('Abnormal results', data.results?.abnormalInRange ?? 0)}${k('Critical results', data.results?.criticalInRange ?? 0)}</tr></table>
        ${(data.series || []).length ? `<h2>Daily volume</h2><table class="t"><tr><th>Date</th><th>Received</th><th>Completed</th></tr>${data.series.map(s => `<tr><td>${esc(s.date)}</td><td>${s.received || 0}</td><td>${s.completed || 0}</td></tr>`).join('')}</table>` : ''}
        ${(data.testMix || []).length ? `<h2>Top ${noun}</h2><table class="t"><tr><th>Name</th><th>Orders</th></tr>${data.testMix.map(m => `<tr><td>${esc(m.name || m.testType)}</td><td>${m.count ?? m.total ?? 0}</td></tr>`).join('')}</table>` : ''}
        ${!isBranch && !branchId && (data.branches || []).length ? `<h2>Branch comparison</h2><table class="t"><tr><th>Branch</th><th>Orders</th><th>Open</th><th>Completed</th><th>Overdue</th><th>Avg TAT</th><th>Revenue</th></tr>${data.branches.map(b => `<tr><td>${esc(b.name)}</td><td>${b.total ?? 0}</td><td>${b.open ?? 0}</td><td>${b.completed ?? 0}</td><td>${b.overdue ?? 0}</td><td>${esc(fmtHours(b.avgTatHours))}</td><td>${esc(money(b.revenue, currency))}</td></tr>`).join('')}</table>` : ''}
        <div class="sub">Generated ${esc(new Date().toLocaleString())}.</div></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Report' });
    } catch (e) { Alert.alert('Could not build the PDF', e?.message || 'Please try again.'); } finally { setPdfBusy(false); }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}>
      <PageHeader title="Reports" subtitle="Volume, turnaround, quality and revenue for the period" />

      <Section accent={C.primary}>
        <View style={st.chips}>
          {RANGES.map(d => (
            <TouchableOpacity key={d} onPress={() => setDays(d)} style={[st.chip, days === d && { backgroundColor: C.primary, borderColor: C.primary }]}>
              <Text style={[st.chipText, days === d && { color: '#fff' }]}>{d} days</Text>
            </TouchableOpacity>
          ))}
        </View>
        {!isBranch && branches.length ? (
          <View style={[st.chips, { marginTop: 10 }]}>
            {[{ branchId: '', name: 'Whole network' }, ...branches].map(b => (
              <TouchableOpacity key={b.branchId || 'all'} onPress={() => setBranchId(b.branchId)} style={[st.chip, branchId === b.branchId && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={[st.chipText, branchId === b.branchId && { color: '#fff' }]}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <Button accent={C.primary} variant="outline" icon="document-outline" label={pdfBusy ? 'Building…' : 'Share PDF'} onPress={sharePdf} disabled={!data || pdfBusy} style={{ marginTop: 12 }} />
      </Section>

      {loading && !data ? <ActivityIndicator color={C.primary} style={{ marginTop: 24 }} /> : !data ? (
        <Section><Empty icon="bar-chart-outline" text="Could not load the report. Pull down to try again." /></Section>
      ) : (
        <>
          <KpiGrid items={[
            { label: 'Orders received', value: t.inRange ?? 0, icon: 'download-outline', color: '#3b82f6', bg: '#eff6ff' },
            { label: 'Completed', value: t.completedInRange ?? 0, icon: 'checkmark-done-outline', color: '#16a34a', bg: '#dcfce7' },
            { label: 'Rejected', value: t.rejectedInRange ?? 0, hint: `${data.rejectionRatePct ?? 0}% of received`, icon: 'close-circle-outline', color: '#be123c', bg: '#ffe4e6' },
            { label: 'Avg turnaround', value: fmtHours(data.tat?.avgHours), hint: `median ${fmtHours(data.tat?.medianHours)}`, icon: 'timer-outline', color: '#8b5cf6', bg: '#f3e8ff' },
            { label: 'Within target', value: `${data.tat?.withinTargetPct ?? 0}%`, icon: 'speedometer-outline', color: C.primary, bg: C.primaryLight },
            { label: 'Revenue', value: money(data.revenue?.completedValue, currency), hint: 'Completed × catalogue price', icon: 'cash-outline', color: '#0f766e', bg: '#ccfbf1' },
            { label: 'Abnormal results', value: data.results?.abnormalInRange ?? 0, icon: 'alert-circle-outline', color: '#ea580c', bg: '#ffedd5' },
            { label: 'Critical results', value: data.results?.criticalInRange ?? 0, icon: 'warning-outline', color: '#dc2626', bg: '#fee2e2' },
          ]} />

          <Section title="Daily volume" subtitle="Received (light) and completed, last 14 days" accent={C.primary}>
            {series.length === 0 ? <Text style={ui.muted}>No orders in this period.</Text> : (
              <View style={st.chart}>
                {series.map(s => (
                  <View key={s.date} style={st.col}>
                    <View style={st.bars}>
                      <View style={[st.bar, { height: `${((s.received || 0) / peak) * 100}%`, backgroundColor: C.primaryLight }]} />
                      <View style={[st.bar, { height: `${((s.completed || 0) / peak) * 100}%`, backgroundColor: C.primary }]} />
                    </View>
                    <Text style={st.colLabel}>{String(s.date || '').slice(8, 10)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          <Section title={`Top ${noun}`} accent={C.primary}>
            {(data.testMix || []).length === 0 ? <Text style={ui.muted}>Nothing yet.</Text> : data.testMix.slice(0, 8).map((m, i, a) => (
              <Row key={`${m.name || m.testType}-${i}`} title={m.name || m.testType || '—'} meta={String(m.count ?? m.total ?? 0)} last={i === a.length - 1} />
            ))}
          </Section>

          <Section title="Critical results" accent={C.primary}>
            {(data.critical || []).length === 0 ? <Text style={ui.muted}>None in this period.</Text> : data.critical.slice(0, 10).map((c, i, a) => (
              <Row key={c.id || i} title={c.patientName || 'Patient'} subtitle={`${c.testType || ''} · ${fmtDateTime(c.createdAt)}`}
                right={<Pill label="Critical" color="#fff" bg="#dc2626" />} last={i === a.length - 1} />
            ))}
          </Section>

          {!isBranch && !branchId && (data.branches || []).length ? (
            <Section title="Branch comparison" subtitle="Orders · open · overdue · average turnaround" accent={C.primary}>
              {data.branches.map((b, i, a) => (
                <Row key={b.branchId || i} title={b.name} subtitle={`${b.open ?? 0} open · ${b.overdue ?? 0} overdue · ${fmtHours(b.avgTatHours)} avg · ${money(b.revenue, currency)}`}
                  meta={String(b.total ?? 0)} last={i === a.length - 1} />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 },
  col: { flex: 1, alignItems: 'center', height: '100%' },
  bars: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  bar: { width: '40%', borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  colLabel: { fontSize: 9, color: '#94a3b8', marginTop: 4 },
});
