import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import { RX_STATUSES, toMillis, parseRangeBounds, rxTouchesBranch, buildMetrics } from '../../utils/pharmacyReportMetrics';
import { PageHeader, Section, KpiGrid, Row, Button, Notice, ui } from '../../components/provider/ProviderUI';
import DateField from '../../components/provider/DateField';

/**
 * Pharmacy reports on mobile — the twin of web PharmacyReports / BranchReports:
 * a date range (prescriptions created in it), one branch or the whole network,
 * the same metrics from the shared pharmacyReportMetrics helpers, and a
 * NessaHub PDF to share.
 */
const pct = (v) => `${(Number(v) || 0).toFixed(1)}%`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PRESETS = [['7 days', 7], ['30 days', 30], ['90 days', 90]];

export default function PharmacyReportsScreen({ profile, isBranch = false }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => iso(new Date()));
  const [branchId, setBranchId] = useState('all');
  const [applied, setApplied] = useState(() => ({ from: daysAgo(30), to: iso(new Date()), branchId: 'all' }));
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    const id = profile?.id;
    if (!id) { setLoading(false); return; }
    try {
      if (isBranch) {
        const list = await api(`/api/v1/medical/prescriptions/branch/${id}`).catch(() => []) || [];
        setPrescriptions(list);
        setBranches([{ id, branchName: profile?.branchName || 'This branch', status: 'active' }]);
      } else {
        const orgId = profile?.organizationId || id;
        const [list, brs] = await Promise.all([
          api(`/api/v1/medical/prescriptions/pharmacy/${orgId}`).catch(() => []),
          api(`/api/v1/pharmacy-branches?pharmacyId=${orgId}`).catch(() => []),
        ]);
        setPrescriptions(list || []);
        setBranches(brs || []);
      }
    } finally { setLoading(false); }
  }, [profile?.id, profile?.organizationId, profile?.branchName, isBranch]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const { startMs, endMs } = parseRangeBounds(applied.from, applied.to);
    return prescriptions.filter(rx => {
      const ms = toMillis(rx.createdAt);
      if (!ms || (startMs && ms < startMs) || (endMs && ms > endMs)) return false;
      return isBranch || rxTouchesBranch(rx, applied.branchId);
    });
  }, [prescriptions, applied, isBranch]);

  const m = useMemo(() => buildMetrics(branches, filtered), [branches, filtered]);
  const scopeName = applied.branchId === 'all' ? (isBranch ? (profile?.branchName || 'This branch') : 'All branches')
    : (branches.find(b => b.id === applied.branchId)?.branchName || 'Branch');

  const generate = () => {
    if (from > to) { Alert.alert('Dates', 'The start date must be on or before the end date.'); return; }
    setApplied({ from, to, branchId });
  };

  const preset = (n) => { const f = daysAgo(n); const t = iso(new Date()); setFrom(f); setTo(t); setApplied({ from: f, to: t, branchId }); };

  const sharePdf = async () => {
    setPdfBusy(true);
    try {
      const counts = m.rxCounts || {};
      const kpi = (l, v, h = '') => `<td><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div><div class="h">${esc(h)}</div></td>`;
      const html = `<html><head><meta name="viewport" content="width=device-width"><style>
        body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0f172a;padding:28px}
        h1{font-size:20px;margin:0}.sub{color:#64748b;font-size:12px;margin:4px 0 18px}
        .bar{border-bottom:3px solid #14b8a6;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}td,th{padding:8px;font-size:12px;text-align:left}
        .k td{border:1px solid #e2e8f0;width:25%;vertical-align:top}.l{color:#64748b;font-size:10px;text-transform:uppercase}.v{font-size:20px;font-weight:800}.h{color:#94a3b8;font-size:10px}
        .t th{background:#f1f5f9}.t td{border-bottom:1px solid #f1f5f9}h2{font-size:14px;margin:18px 0 8px}
      </style></head><body>
        <div class="bar"><div><h1>${esc(profile?.pharmacyName || profile?.branchName || 'Pharmacy')} — Operational report</h1>
        <div class="sub">${esc(applied.from)} to ${esc(applied.to)} · ${esc(scopeName)} · prescriptions created in range</div></div><b style="color:#0c4a6e">NessaHub</b></div>
        <table class="k"><tr>${kpi('Prescriptions', m.totalRx, `${m.unassigned} unassigned`)}${kpi('Delivered', counts.delivered || 0, `${pct(m.completionRate)} completion`)}${kpi('Ready backlog', m.readyBacklog, 'ready, not delivered')}${kpi('Branches', branches.length, `${m.branchCounts?.active || 0} active`)}</tr>
        <tr>${kpi('Drug availability', pct(m.availabilityRate), `${m.medsTotal} lines`)}${kpi('Stock-out rate', pct(m.stockoutRate))}${kpi('Alternatives suggested', pct(m.altRate))}${kpi('Alternatives approved', pct(m.altApprovalRate))}</tr></table>
        <h2>Prescription funnel</h2><table class="t"><tr>${RX_STATUSES.map(s => `<th>${esc(s.replace(/_/g, ' '))}</th>`).join('')}</tr><tr>${RX_STATUSES.map(s => `<td>${counts[s] || 0}</td>`).join('')}</tr></table>
        ${(m.branchRows || []).length ? `<h2>Branch performance</h2><table class="t"><tr><th>Branch</th><th>Total</th><th>Active</th><th>Ready</th><th>Delivered</th></tr>${m.branchRows.map(r => `<tr><td>${esc(r.branchName)}</td><td>${r.total}</td><td>${r.active}</td><td>${r.ready}</td><td>${r.delivered}</td></tr>`).join('')}</table>` : ''}
        <div class="sub">Generated ${esc(new Date().toLocaleString())} on NessaHub.</div>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Pharmacy report', UTI: 'com.adobe.pdf' });
      else Alert.alert('Report saved', uri);
    } catch (e) {
      Alert.alert('Could not build the PDF', e?.message || 'Please try again.');
    } finally { setPdfBusy(false); }
  };

  if (loading) return <View style={[ui.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.primary} size="large" /></View>;
  const counts = m.rxCounts || {};

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
      <PageHeader title={isBranch ? 'Branch reports' : 'Pharmacy reports'} subtitle="Prescriptions created in the chosen dates" />

      <Section title="Report scope" accent={C.primary}>
        <View style={st.chips}>
          {PRESETS.map(([l, n]) => (
            <TouchableOpacity key={n} style={[st.chip, applied.from === daysAgo(n) && applied.to === iso(new Date()) && st.chipOn]} onPress={() => preset(n)}>
              <Text style={[st.chipText, applied.from === daysAgo(n) && applied.to === iso(new Date()) && { color: '#fff' }]}>Last {l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={st.dates}>
          <DateField label="From" value={from} onChange={setFrom} accent={C.primary} maximumDate={new Date()} />
          <DateField label="To" value={to} onChange={setTo} accent={C.primary} maximumDate={new Date()} />
        </View>
        {!isBranch && branches.length ? (
          <>
            <Text style={ui.label}>Branch</Text>
            <View style={st.chips}>
              {[{ id: 'all', branchName: 'All branches' }, ...branches].map(b => (
                <TouchableOpacity key={b.id} style={[st.chip, branchId === b.id && st.chipOn]} onPress={() => setBranchId(b.id)}>
                  <Text style={[st.chipText, branchId === b.id && { color: '#fff' }]}>{b.branchName || 'Branch'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        <View style={st.actions}>
          <Button accent={C.primary} icon="bar-chart-outline" label="Generate report" onPress={generate} style={{ flex: 1 }} />
          <Button accent={C.primary} variant="outline" icon="document-outline" label={pdfBusy ? 'Building…' : 'Share PDF'} onPress={sharePdf} disabled={pdfBusy} style={{ flex: 1 }} />
        </View>
      </Section>

      <Notice text={`${applied.from} to ${applied.to} · ${scopeName} · ${m.totalRx} prescription${m.totalRx === 1 ? '' : 's'}`} />

      <KpiGrid items={[
        ...(isBranch ? [] : [{ label: 'Branches (network)', value: branches.length, hint: `${m.branchCounts?.active || 0} active · ${m.branchCounts?.suspended || 0} suspended`, icon: 'storefront-outline', color: '#0369a1', bg: '#e0f2fe' }]),
        { label: 'Prescriptions in scope', value: m.totalRx, hint: isBranch ? undefined : `${m.unassigned} unassigned to a branch`, icon: 'medical-outline', color: '#7c3aed', bg: '#f3e8ff' },
        { label: 'Delivered', value: counts.delivered || 0, hint: `${pct(m.completionRate)} completion`, icon: 'bag-check-outline', color: '#15803d', bg: '#dcfce7' },
        { label: 'Ready backlog', value: m.readyBacklog, hint: 'Ready, not delivered', icon: 'time-outline', color: '#b45309', bg: '#fef3c7' },
        ...(isBranch ? [] : [{ label: 'Branch password resets', value: m.pendingPasswordResets, hint: 'First sign-in reset pending', icon: 'key-outline', color: '#64748b', bg: '#f1f5f9' }]),
      ]} />

      <Section title="Medicines" subtitle={`${m.medsTotal} medication lines`} accent={C.primary}>
        <Row title="Drug availability" meta={pct(m.availabilityRate)} metaColor="#15803d" />
        <Row title="Stock-out rate" meta={pct(m.stockoutRate)} metaColor="#b91c1c" />
        <Row title="Alternatives suggested" meta={pct(m.altRate)} />
        <Row title="Alternatives approved" meta={pct(m.altApprovalRate)} last />
      </Section>

      <Section title="Prescription funnel" accent={C.primary}>
        {RX_STATUSES.map((s, i) => <Row key={s} title={s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())} meta={String(counts[s] || 0)} last={i === RX_STATUSES.length - 1} />)}
      </Section>

      {!isBranch ? (
        <Section title="Branch performance" subtitle="Total · active · ready · delivered" accent={C.primary}>
          {(m.branchRows || []).length === 0 ? <Text style={ui.muted}>No prescriptions in this range.</Text> : m.branchRows.map((r, i) => (
            <Row key={`${r.branchName}-${i}`} title={r.branchName} subtitle={`${r.active} active · ${r.ready} ready · ${r.delivered} delivered`} meta={String(r.total)} last={i === m.branchRows.length - 1} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  dates: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
