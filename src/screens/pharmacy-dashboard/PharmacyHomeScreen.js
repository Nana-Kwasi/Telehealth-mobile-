import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';
import RoleAssistantMobile from '../../components/RoleAssistantMobile';
import {
  PageHeader, Section, KpiGrid, Row, Pill, Empty, Notice, KeyValue, ui,
  toMillis, formatAge, formatWhen,
} from '../../components/provider/ProviderUI';

/**
 * Parent pharmacy overview — the mobile twin of web PharmacyOverview.js:
 * KPIs, week-on-week deltas, the attention queue, branch health, recent
 * activity, operational KPIs and shortcuts, computed the same way.
 */
const MS_DAY = 86400000;
const MS_48H = 48 * 3600000;

const STATUS_LABEL = { sent: 'Incoming', accepted: 'Accepted', partially_fulfilled: 'Partial', ready: 'Ready', delivered: 'Delivered' };
const ATTENTION = {
  incoming: { label: 'Incoming', color: '#a16207' },
  overdue_pickup: { label: 'Pickup overdue', color: '#b45309' },
  refill_block: { label: 'Needs review', color: '#7c3aed' },
  stuck: { label: 'Stuck >48h', color: '#b91c1c' },
};

const dayKey = (ms) => new Date(ms).toDateString();
const activityTs = (rx) => Math.max(toMillis(rx.updatedAt), toMillis(rx.createdAt));

function classify(rx) {
  const st = rx.pharmacyStatus || 'sent';
  const updated = toMillis(rx.updatedAt);
  const created = toMillis(rx.createdAt);
  if (st === 'sent') return { kind: 'incoming', score: 300 + (Date.now() - created) / MS_DAY };
  if (st === 'ready') {
    const age = Date.now() - updated;
    return age > MS_48H ? { kind: 'overdue_pickup', score: 250 + age / MS_DAY } : null;
  }
  if (st === 'partially_fulfilled') {
    const blocked = (rx.medications || []).some(m => ['not_available', 'alternative_suggested', 'pending'].includes(m.drugStatus));
    if (blocked) return { kind: 'refill_block', score: 280 + (Date.now() - updated) / MS_DAY };
  }
  if (st === 'accepted') {
    const last = Math.max(updated, created);
    if (Date.now() - last > MS_48H) return { kind: 'stuck', score: 200 + (Date.now() - last) / MS_DAY };
  }
  return null;
}

function delta(cur, prev) {
  if (prev === 0 && cur === 0) return { text: '0', color: '#64748b' };
  if (prev === 0) return { text: `↑ ${cur}`, color: '#15803d' };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: `${cur} (0%)`, color: '#64748b' };
  return pct > 0 ? { text: `↑ ${pct}% (${cur})`, color: '#15803d' } : { text: `↓ ${Math.abs(pct)}% (${cur})`, color: '#b91c1c' };
}

export default function PharmacyHomeScreen({ profile }) {
  const navigation = useNavigation();
  const [branches, setBranches] = useState([]);
  const [rxList, setRxList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Admin-onboarded pharmacies sign in with a user id that differs from the
  // organisation id; every query is by organisation.
  const orgId = profile?.organizationId || profile?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    try {
      const [br, rx] = await Promise.all([
        api(`/api/v1/pharmacy-branches?pharmacyId=${orgId}`).catch(() => []),
        api(`/api/v1/medical/prescriptions/pharmacy/${orgId}`).catch(() => []),
      ]);
      setBranches(Array.isArray(br) ? br : []);
      setRxList(Array.isArray(rx) ? rx : []);
    } finally { setLoading(false); setRefreshing(false); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const branchName = useCallback((rx) => rx.branchName || branches.find(b => b.id === rx.branchId)?.branchName || 'Unassigned', [branches]);

  const stats = useMemo(() => ({
    branches: branches.length,
    active: branches.filter(b => (b.status || 'active').toLowerCase() === 'active').length,
    incoming: rxList.filter(r => (r.pharmacyStatus || 'sent') === 'sent').length,
    inProgress: rxList.filter(r => ['accepted', 'partially_fulfilled'].includes(r.pharmacyStatus)).length,
    completed: rxList.filter(r => ['ready', 'delivered'].includes(r.pharmacyStatus)).length,
  }), [branches, rxList]);

  const period = useMemo(() => {
    const end = Date.now();
    const curStart = end - 7 * MS_DAY;
    const prevStart = end - 14 * MS_DAY;
    let newCur = 0, newPrev = 0, doneCur = 0, donePrev = 0;
    rxList.forEach(rx => {
      const c = toMillis(rx.createdAt);
      if (c >= curStart) newCur += 1; else if (c >= prevStart) newPrev += 1;
      if (rx.pharmacyStatus === 'delivered') {
        const d = toMillis(rx.deliveredAt) || toMillis(rx.updatedAt);
        if (d >= curStart) doneCur += 1; else if (d >= prevStart) donePrev += 1;
      }
    });
    const live = branches.filter(b => (b.status || 'active').toLowerCase() !== 'suspended');
    const idle = (from, to) => live.filter(b => !rxList.some(rx => rx.branchId === b.id && activityTs(rx) >= from && activityTs(rx) < to)).length;
    return { newCur, newPrev, doneCur, donePrev, idleCur: idle(curStart, end + 1), idlePrev: idle(prevStart, curStart) };
  }, [rxList, branches]);

  const queue = useMemo(() => rxList
    .map(rx => ({ rx, c: classify(rx) }))
    .filter(x => x.c)
    .sort((a, b) => b.c.score - a.c.score)
    .slice(0, 8), [rxList]);

  const branchHealth = useMemo(() => {
    const today = dayKey(Date.now());
    return branches.map(b => {
      let todayCount = 0, open = 0;
      rxList.forEach(rx => {
        if (rx.branchId !== b.id) return;
        if (dayKey(toMillis(rx.createdAt)) === today) todayCount += 1;
        const st = rx.pharmacyStatus || 'sent';
        if (st === 'sent') open += 1;
        else if (st === 'partially_fulfilled' && (rx.medications || []).some(m => ['not_available', 'alternative_suggested', 'pending'].includes(m.drugStatus))) open += 1;
      });
      return { id: b.id, name: b.branchName || 'Branch', status: (b.status || 'active').toLowerCase(), todayCount, open };
    }).sort((a, b) => b.open - a.open || b.todayCount - a.todayCount);
  }, [branches, rxList]);

  const feed = useMemo(() => [...rxList].sort((a, b) => activityTs(b) - activityTs(a)).slice(0, 10), [rxList]);

  const ops = useMemo(() => {
    const stuck = rxList.filter(rx => rx.pharmacyStatus === 'accepted' && Date.now() - activityTs(rx) > MS_48H).length;
    const hours = rxList
      .filter(rx => ['ready', 'delivered'].includes(rx.pharmacyStatus))
      .map(rx => {
        const start = toMillis(rx.createdAt);
        const end = rx.pharmacyStatus === 'delivered' ? (toMillis(rx.deliveredAt) || toMillis(rx.updatedAt)) : toMillis(rx.updatedAt);
        return start && end > start ? (end - start) / 3600000 : null;
      })
      .filter(h => h != null)
      .sort((a, b) => a - b);
    const mid = Math.floor(hours.length / 2);
    const med = hours.length ? (hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2) : null;
    return { stuck, med: med == null ? '—' : med < 24 ? `${med.toFixed(1)}h` : `${(med / 24).toFixed(1)}d` };
  }, [rxList]);

  const openRx = (rx) => navigation.navigate('PharmacyRxOps', { rxId: rx.id });
  const go = (name, params) => navigation.navigate(name, params);

  const deltas = [
    ['New prescriptions', delta(period.newCur, period.newPrev)],
    ['Marked delivered', delta(period.doneCur, period.donePrev)],
    ['Active branches with no activity', delta(period.idleCur, period.idlePrev)],
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={ui.screen}
        contentContainerStyle={ui.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        <PageHeader title="Dashboard overview" subtitle={`${profile?.pharmacyName || 'Your pharmacy'} — all branches`} />
        <LocationSummaryCardMobile profile={profile} onEdit={() => go('PharmacySettings')} />

        {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} /> : (
          <>
            {stats.branches === 0 ? (
              <Notice tone="warn" icon="add-circle-outline" text="Add your first branch so doctors can route prescriptions to you." onPress={() => go('PharmacyBranches')} />
            ) : null}
            {profile?.emailVerified === false ? (
              <Notice icon="mail-outline" text="Verify your email in Settings for full account access." onPress={() => go('PharmacyPreferences')} />
            ) : null}
            {stats.branches > 0 && stats.incoming === 0 ? (
              <Notice icon="stats-chart-outline" text="No incoming prescriptions right now. Open Reports or check branch activity." onPress={() => go('PharmacyReports')} />
            ) : null}

            <Section title="At a glance" accent={C.primary}>
              <KpiGrid items={[
                { label: 'Branches', value: stats.branches, hint: `${stats.active} active`, icon: 'storefront-outline', color: '#0369a1', bg: '#e0f2fe', onPress: () => go('PharmacyBranches') },
                { label: 'Incoming Rx', value: stats.incoming, icon: 'download-outline', color: '#a16207', bg: '#fef9c3', onPress: () => go('PharmacyPrescriptions') },
                { label: 'In progress', value: stats.inProgress, icon: 'flash-outline', color: '#15803d', bg: '#dcfce7', onPress: () => go('PharmacyPrescriptions') },
                { label: 'Completed', value: stats.completed, icon: 'checkmark-done-outline', color: '#16a34a', bg: '#f0fdf4', onPress: () => go('PharmacyPrescriptions') },
              ]} />
              <Text style={[ui.label, { marginTop: 16 }]}>Last 7 days vs the week before</Text>
              {deltas.map(([label, d], i) => (
                <Row key={label} title={label} meta={d.text} metaColor={d.color} last={i === deltas.length - 1} />
              ))}
            </Section>

            <Section title="Attention queue" subtitle="Prescriptions that need action first" accent={C.primary}>
              {queue.length === 0 ? <Empty text="Nothing urgent — you're caught up." /> : queue.map(({ rx, c }, i) => {
                const m = ATTENTION[c.kind];
                const age = c.kind === 'overdue_pickup' ? Date.now() - (toMillis(rx.updatedAt) || toMillis(rx.createdAt)) : Date.now() - toMillis(rx.createdAt);
                return (
                  <Row key={rx.id} title={rx.patientName || 'Patient'} subtitle={`${branchName(rx)} · ${formatAge(age)}`}
                    right={<Pill label={m.label} color={m.color} bg="#f8fafc" />} onPress={() => openRx(rx)} last={i === queue.length - 1} />
                );
              })}
            </Section>

            <Section title="Branches" subtitle="Today's prescriptions and open items" action="Manage" onAction={() => go('PharmacyBranches')} accent={C.primary}>
              {branchHealth.length === 0 ? (
                <Empty icon="storefront-outline" text="No branches yet." actionLabel="Add a branch" onAction={() => go('PharmacyBranches')} accent={C.primary} />
              ) : branchHealth.map((b, i) => (
                <Row key={b.id} title={b.name} subtitle={`${b.todayCount} today · ${b.open ? `${b.open} open` : 'nothing open'}`}
                  right={<Pill label={b.status} color={b.status === 'active' ? '#15803d' : '#b91c1c'} bg={b.status === 'active' ? '#dcfce7' : '#fee2e2'} />}
                  onPress={() => go('PharmacyBranchDetail', { branchId: b.id })} last={i === branchHealth.length - 1} />
              ))}
            </Section>

            <Section title="Recent activity" action="All" onAction={() => go('PharmacyPrescriptions')} accent={C.primary}>
              {feed.length === 0 ? <Empty icon="receipt-outline" text="No prescription activity yet." /> : feed.map((rx, i) => (
                <Row key={rx.id} title={`${rx.patientName || 'Patient'} · ${STATUS_LABEL[rx.pharmacyStatus || 'sent'] || rx.pharmacyStatus}`}
                  subtitle={`${branchName(rx)} · ${formatWhen(activityTs(rx))}`} onPress={() => openRx(rx)} last={i === feed.length - 1} />
              ))}
            </Section>

            <Section title="Operational KPIs" accent={C.primary}>
              <KeyValue label="Median time to ready / delivered" value={ops.med} />
              <KeyValue label="Accepted over 48h with no progress" value={String(ops.stuck)} />
            </Section>

            <Section title="Shortcuts" accent={C.primary}>
              <Row icon="storefront-outline" title="Manage branches" onPress={() => go('PharmacyBranches')} />
              <Row icon="medical-outline" title="All prescriptions" onPress={() => go('PharmacyPrescriptions')} />
              <Row icon="library-outline" title="Formulary" onPress={() => go('PharmacyFormulary')} />
              <Row icon="stats-chart-outline" title="Reports" onPress={() => go('PharmacyReports')} />
              <Row icon="settings-outline" title="Settings" onPress={() => go('PharmacyPreferences')} last />
            </Section>
          </>
        )}
      </ScrollView>
      <RoleAssistantMobile kind="pharmacy" accent={C.primary} />
    </View>
  );
}
