import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, ScrollView, Linking, Alert, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import {
  STAGES, OPEN_STAGES, PRIORITY, stageOf, priorityOf, fmtDate, fmtDateTime, fmtHours, ageHours, targetHours, tatState,
  FLAG_META, money, parseParams, toDate, diagRoutes,
} from './diagUi';
import { StagePill, PriorityPill, useCatalogMobile, useOrderActionsMobile } from './DiagActionsMobile';
import { InsuranceBillMobile } from '../ProviderInsuranceMobile';

const OPS = '/api/v1/diagnostics/operations';
const TAT_STYLE = { ok: ['#dcfce7', '#166534'], soon: ['#fef3c7', '#92400e'], late: ['#fee2e2', '#b91c1c'], closed: ['#f1f5f9', '#475569'] };

function TatChip({ order, type }) {
  const s = tatState(order, type);
  const [bg, fg] = TAT_STYLE[s];
  return <Text style={[st.tat, { backgroundColor: bg, color: fg }]}>{fmtHours(ageHours(order))}{s !== 'closed' ? ` / ${fmtHours(targetHours(order, type))}` : ''}</Text>;
}

// ── Worklist ─────────────────────────────────────────────────────────────────

export function DiagWorklistMobile({ type = 'lab', profile, isBranch, colors: C }) {
  const navigation = useNavigation();
  const route = useRoute();
  const routes = diagRoutes(type, isBranch);
  const catalog = useCatalogMobile(type);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState(route.params?.tab || 'open');
  const [q, setQ] = useState('');

  useEffect(() => { if (route.params?.tab) setTab(route.params.tab); }, [route.params?.tab]);

  const load = useCallback(async () => {
    try {
      const list = await api(isBranch ? `${OPS}/orders?branchId=${profile?.id}` : `${OPS}/orders`).catch(() => []);
      setOrders((Array.isArray(list) ? list : []).filter(o => String(o.diagnosticType || o.centerType || type).toLowerCase().includes(type)));
    } finally { setLoading(false); setRefreshing(false); }
  }, [isBranch, profile?.id, type]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const actions = useOrderActionsMobile(type, catalog, C.primary, () => load());
  const enriched = useMemo(() => orders.map(o => ({ ...o, tatHours: catalog.find(o)?.tatHours || null })), [orders, catalog]);

  const tabs = [
    ['open', 'Open'], ['PENDING', type === 'lab' ? 'To collect' : 'To book'],
    [type === 'lab' ? 'SAMPLE_COLLECTED' : 'SCHEDULED', type === 'lab' ? 'Collected' : 'Booked'],
    ['IN_PROGRESS', 'In progress'], ['overdue', 'Overdue'], ['urgent', 'Urgent'], ['COMPLETED', 'Done'], ['REJECTED', 'Rejected'], ['all', 'All'],
  ];
  const inTab = (o, t) => {
    const s = stageOf(o.status);
    if (t === 'all') return true;
    if (t === 'open') return OPEN_STAGES.includes(s);
    if (t === 'overdue') return tatState(o, type) === 'late';
    if (t === 'urgent') return OPEN_STAGES.includes(s) && priorityOf(o.priority) !== 'ROUTINE';
    return s === t;
  };
  const base = enriched.filter(o => {
    const s = q.trim().toLowerCase();
    return !s || [o.patientName, o.orderCode, o.accessionNo, o.testType, o.doctorName, o.branchName].some(v => String(v || '').toLowerCase().includes(s));
  });
  const shown = base.filter(o => inTab(o, tab)).sort((a, b) => {
    const oa = OPEN_STAGES.includes(stageOf(a.status)), ob = OPEN_STAGES.includes(stageOf(b.status));
    if (oa && ob) {
      const pr = PRIORITY[priorityOf(a.priority)].rank - PRIORITY[priorityOf(b.priority)].rank;
      if (pr) return pr;
      return ageHours(b) / targetHours(b, type) - ageHours(a) / targetHours(a, type);
    }
    return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
  });

  const renderItem = ({ item: o }) => {
    const urgent = priorityOf(o.priority) !== 'ROUTINE' && OPEN_STAGES.includes(stageOf(o.status));
    return (
      <TouchableOpacity style={[st.card, urgent && { borderLeftWidth: 4, borderLeftColor: '#dc2626' }]} onPress={() => navigation.navigate(routes.detail, { orderId: o.id })}>
        <View style={st.cardTop}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flex: 1 }}>
            <PriorityPill priority={o.priority} />
            <Text style={st.patient} numberOfLines={1}>{o.patientName || 'Patient'}</Text>
          </View>
          <StagePill status={o.status} />
        </View>
        <Text style={st.test}>{o.testType || '—'}</Text>
        <View style={st.metaRow}>
          <Text style={st.meta} numberOfLines={1}>{o.orderCode || o.id.slice(0, 8)}{o.accessionNo ? ` · ${o.accessionNo}` : ''}{!isBranch && o.branchName ? ` · ${o.branchName}` : ''}</Text>
          <TatChip order={o} type={type} />
        </View>
        <Text style={st.meta}>Dr. {o.doctorName || '—'} · {fmtDate(o.createdAt)}{o.scheduledAt ? ` · 📅 ${fmtDateTime(o.scheduledAt)}` : ''}</Text>
        {stageOf(o.status) === 'REJECTED' && o.rejectReason ? <Text style={[st.meta, { color: '#b91c1c' }]} numberOfLines={2}>{o.rejectReason}</Text> : null}
        {actions.buttons(o)}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View style={st.searchWrap}>
        <Ionicons name="search" size={16} color="#94a3b8" />
        <TextInput style={st.search} value={q} onChangeText={setQ} placeholder="Name on National ID, order, accession, test" placeholderTextColor="#94a3b8" />
        {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color="#94a3b8" /></TouchableOpacity> : null}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8 }}>
          {tabs.map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && { backgroundColor: C.primary, borderColor: C.primary }]}>
              <Text style={[st.tabText, tab === k && { color: '#fff' }]}>{label} {base.filter(o => inTab(o, k)).length}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {loading ? <ActivityIndicator color={C.primary} style={{ margin: 32 }} /> : (
        <FlatList data={shown} keyExtractor={o => o.id} renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingTop: 4, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
          ListEmptyComponent={<View style={{ alignItems: 'center', padding: 40 }}><Ionicons name="checkmark-done-circle-outline" size={44} color="#cbd5e1" /><Text style={st.empty}>{q ? 'No orders match that name.' : 'Nothing here right now.'}</Text></View>} />
      )}
      {actions.element}
    </View>
  );
}

// ── Order detail ─────────────────────────────────────────────────────────────

function parseValues(json) { try { const v = JSON.parse(json || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

export function ResultCardMobile({ r }) {
  const values = parseValues(r.valuesJson);
  return (
    <View style={st.result}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <Text style={st.patient}>{fmtDateTime(r.createdAt)}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {r.critical ? <Text style={[st.flag, { backgroundColor: '#dc2626', color: '#fff' }]}>CRITICAL</Text> : r.abnormal ? <Text style={[st.flag, { backgroundColor: '#ffedd5', color: '#9a3412' }]}>Abnormal</Text> : null}
          <Text style={[st.flag, r.releasedToPatient ? { backgroundColor: '#dcfce7', color: '#166534' } : { backgroundColor: '#f1f5f9', color: '#475569' }]}>{r.releasedToPatient ? 'Shared by doctor' : 'With doctor'}</Text>
        </View>
      </View>
      {values.map((v, i) => (
        <View key={i} style={st.valueRow}>
          <Text style={[st.meta, { flex: 1, color: '#0f172a' }]}>{v.name}</Text>
          <Text style={[st.meta, { fontWeight: '900', color: '#0f172a' }]}>{v.value} {v.unit}</Text>
          {v.flag && FLAG_META[v.flag] && v.flag !== 'N' ? <Text style={[st.flag, { backgroundColor: FLAG_META[v.flag].bg, color: FLAG_META[v.flag].fg, marginLeft: 6 }]}>{v.flag}</Text> : null}
        </View>
      ))}
      {r.findings ? <Text style={[st.body, { marginTop: 8 }]}>{r.findings}</Text> : null}
      {r.conclusion ? <Text style={[st.body, { marginTop: 6 }]}><Text style={{ fontWeight: '800' }}>Impression: </Text>{r.conclusion}</Text> : null}
      {r.techNote ? <Text style={[st.meta, { marginTop: 6 }]}>Internal note: {r.techNote}</Text> : null}
      {r.reportUrl && /^https?:/i.test(r.reportUrl) ? (
        <TouchableOpacity onPress={() => Linking.openURL(r.reportUrl)} style={st.fileBtn}><Text style={st.fileBtnText}>📄 Open file</Text></TouchableOpacity>
      ) : null}
    </View>
  );
}

const EVENT_LABEL = {
  SAMPLE_COLLECTED: 'Sample collected', SCAN_SCHEDULED: 'Scan booked', ORDER_STARTED: 'Work started', ORDER_STATUS_UPDATED: 'Status updated',
  ORDER_COMPLETED: 'Result uploaded', ORDER_REJECTED: 'Order rejected', PRIORITY_CHANGED: 'Priority changed',
};

export function DiagOrderDetailMobile({ type = 'lab', colors: C }) {
  const route = useRoute();
  const navigation = useNavigation();
  const orderId = route.params?.orderId;
  const catalog = useCatalogMobile(type);
  const [order, setOrder] = useState(null);
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!orderId) { setLoading(false); return; }
    try {
      const [o, ev, rs] = await Promise.all([
        api(`${OPS}/orders/${orderId}`).catch(() => null),
        api(`${OPS}/events?orderId=${orderId}`).catch(() => []),
        api(`${OPS}/orders/${orderId}/results`).catch(() => []),
      ]);
      setOrder(o); setEvents(Array.isArray(ev) ? ev : []); setResults(Array.isArray(rs) ? rs : []);
    } finally { setLoading(false); }
  }, [orderId]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const actions = useOrderActionsMobile(type, catalog, C.primary, () => load());

  if (loading) return <View style={st.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  if (!order) return <View style={st.center}><Text style={st.empty}>Order not found, or not with your centre.</Text><TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ color: C.primary, fontWeight: '800', marginTop: 10 }}>← Back</Text></TouchableOpacity></View>;
  const o = { ...order, tatHours: catalog.find(order)?.tatHours || null };
  const steps = type === 'scan'
    ? [['Ordered', order.createdAt], ['Booked', order.scheduledAt], ['Started', order.startedAt], ['Reported', order.completedAt]]
    : [['Ordered', order.createdAt], ['Collected', order.sampleCollectedAt], ['Started', order.startedAt], ['Resulted', order.completedAt]];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 14, gap: 12 }}>
      <View style={st.card}>
        <View style={st.cardTop}><Text style={[st.test, { fontSize: 18, flex: 1 }]}>{order.testType || 'Order'}</Text><StagePill status={order.status} /></View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center' }}><PriorityPill priority={order.priority} /><TatChip order={o} type={type} /></View>
        <Text style={[st.body, { marginTop: 8 }]}>{order.patientName || 'Patient'} · Dr. {order.doctorName || '—'}</Text>
        <Text style={st.meta}>{order.branchName || order.centerName || ''}</Text>
        {actions.buttons(order)}
      </View>

      <View style={st.card}>
        <Text style={st.section}>Progress</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {steps.map(([label, at], i) => (
            <View key={label} style={{ flex: 1, borderTopWidth: 4, borderTopColor: at ? C.primary : '#e2e8f0', paddingTop: 6 }}>
              <Text style={[st.meta, { fontWeight: '800', color: at ? '#0f172a' : '#94a3b8' }]}>{i + 1}. {label}</Text>
              <Text style={[st.meta, { fontSize: 10 }]}>{at ? fmtDateTime(at) : '—'}</Text>
            </View>
          ))}
        </View>
        {stageOf(order.status) === 'REJECTED' ? <Text style={[st.body, { color: '#b91c1c', marginTop: 10 }]}>Rejected: {order.rejectReason || 'no reason recorded'}</Text> : null}
      </View>

      <InsuranceBillMobile order={order} type={type} accent={C.primary} />

      <View style={st.card}>
        <Text style={st.section}>Details</Text>
        {[['Order no.', order.orderCode || order.id.slice(0, 8)], ['Accession', order.accessionNo], ['Specimen', order.specimenType],
          ['Booked for', order.scheduledAt && fmtDateTime(order.scheduledAt)], ['Price', order.price != null ? money(order.price) : null], ['Doctor’s note', order.notes]]
          .filter(([, v]) => v).map(([k, v]) => (
            <View key={k} style={st.detailRow}><Text style={st.meta}>{k}</Text><Text style={[st.body, { flex: 1, textAlign: 'right' }]}>{v}</Text></View>
          ))}
      </View>

      <View style={st.card}>
        <Text style={st.section}>Result</Text>
        {results.length ? results.map(r => <ResultCardMobile key={r.id} r={r} />) : <Text style={st.empty}>No result yet.</Text>}
      </View>

      <View style={st.card}>
        <Text style={st.section}>Activity</Text>
        {events.length ? events.map(e => (
          <View key={e.id} style={{ borderLeftWidth: 3, borderLeftColor: C.primary, paddingLeft: 10, marginBottom: 10 }}>
            <Text style={[st.body, { fontWeight: '800' }]}>{EVENT_LABEL[e.eventType || e.action] || String(e.eventType || e.action || 'Activity').replace(/_/g, ' ')}</Text>
            {e.fromStatus || e.toStatus ? <Text style={st.meta}>{STAGES[e.fromStatus]?.short || e.fromStatus || '—'} → {STAGES[e.toStatus]?.short || e.toStatus || '—'}</Text> : null}
            {e.notes ? <Text style={st.meta}>{e.notes}</Text> : null}
            <Text style={[st.meta, { fontSize: 10 }]}>{fmtDateTime(e.createdAt)}</Text>
          </View>
        )) : <Text style={st.empty}>No activity yet.</Text>}
      </View>
      {actions.element}
    </ScrollView>
  );
}

// ── Results log ──────────────────────────────────────────────────────────────

export function DiagResultsMobile({ type = 'lab', isBranch, colors: C }) {
  const navigation = useNavigation();
  const routes = diagRoutes(type, isBranch);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    try {
      const r = await api(`${OPS}/results-query`).catch(() => []);
      setRows((Array.isArray(r) ? r : []).filter(x => String(x.resultType || x.diagnosticType || 'lab').toLowerCase().includes(type)));
    } finally { setLoading(false); setRefreshing(false); }
  }, [type]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const match = (r, k) => k === 'all' || (k === 'critical' ? r.critical : k === 'abnormal' ? r.abnormal : !r.abnormal);
  const shown = rows.filter(r => match(r, filter));
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View style={{ flexDirection: 'row', gap: 6, padding: 12 }}>
        {[['all', 'All'], ['critical', '🚨 Critical'], ['abnormal', 'Abnormal'], ['normal', 'Normal']].map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[st.tab, filter === k && { backgroundColor: C.primary, borderColor: C.primary }]}>
            <Text style={[st.tabText, filter === k && { color: '#fff' }]}>{l} {rows.filter(r => match(r, k)).length}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={C.primary} style={{ margin: 32 }} /> : (
        <FlatList data={shown} keyExtractor={r => r.id} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
          ListEmptyComponent={<Text style={[st.empty, { padding: 40 }]}>No results yet.</Text>}
          renderItem={({ item: r }) => (
            <TouchableOpacity style={st.card} onPress={() => setOpen(open === r.id ? null : r.id)}>
              <View style={st.cardTop}>
                <Text style={st.patient} numberOfLines={1}>{r.patientName || 'Patient'}</Text>
                {r.critical ? <Text style={[st.flag, { backgroundColor: '#dc2626', color: '#fff' }]}>CRITICAL</Text> : r.abnormal ? <Text style={[st.flag, { backgroundColor: '#ffedd5', color: '#9a3412' }]}>Abnormal</Text> : <Text style={[st.flag, { backgroundColor: '#dcfce7', color: '#166534' }]}>Normal</Text>}
              </View>
              <Text style={st.test}>{r.testType || '—'}</Text>
              <Text style={st.meta}>{[r.orderCode, r.branchName, fmtDateTime(r.createdAt)].filter(Boolean).join(' · ')}</Text>
              {open === r.id ? (
                <View style={{ marginTop: 10 }}>
                  <ResultCardMobile r={r} />
                  <TouchableOpacity onPress={() => navigation.navigate(routes.detail, { orderId: r.orderId })}><Text style={{ color: C.primary, fontWeight: '800', marginTop: 8 }}>Open order →</Text></TouchableOpacity>
                </View>
              ) : null}
            </TouchableOpacity>
          )} />
      )}
    </View>
  );
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export function DiagCatalogMobile({ type = 'lab', isBranch, colors: C }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const r = await api(`${OPS}/catalog/mine?diagnosticType=${type}`); setItems(Array.isArray(r) ? r : []); }
    catch { setItems([]); } finally { setLoading(false); }
  }, [type]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: edit.name.trim(), price: edit.price === '' ? null : Number(edit.price), tatHours: edit.tatHours === '' ? null : Number(edit.tatHours), preparation: edit.preparation || null };
      if (edit.id) await api(`${OPS}/catalog/${edit.id}`, { method: 'PATCH', body });
      else await api(`${OPS}/catalog`, { method: 'POST', body: { ...body, diagnosticType: type } });
      setEdit(null); load();
    } catch (e) { Alert.alert('Error', e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };
  const shown = items.filter(i => !q || `${i.name} ${i.code}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View style={st.searchWrap}>
        <Ionicons name="search" size={16} color="#94a3b8" />
        <TextInput style={st.search} value={q} onChangeText={setQ} placeholder={`Search ${type === 'lab' ? 'tests' : 'scans'}`} placeholderTextColor="#94a3b8" />
        {!isBranch ? <TouchableOpacity onPress={() => setEdit({ name: '', price: '', tatHours: '', preparation: '' })}><Ionicons name="add-circle" size={26} color={C.primary} /></TouchableOpacity> : null}
      </View>
      <Text style={[st.meta, { paddingHorizontal: 16, marginBottom: 6 }]}>{isBranch ? 'Set by head office. Reference ranges here drive result flags.' : 'Tap to edit price and turnaround. Reference ranges: edit on the web dashboard.'}</Text>
      {loading ? <ActivityIndicator color={C.primary} style={{ margin: 32 }} /> : (
        <FlatList data={shown} keyExtractor={i => i.id} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 8, flexGrow: 1 }}
          ListEmptyComponent={<Text style={[st.empty, { padding: 40 }]}>{isBranch ? 'Head office has not published a catalog yet.' : 'No items yet. Tap + to add, or use Quick add on the web.'}</Text>}
          renderItem={({ item: i }) => (
            <TouchableOpacity activeOpacity={isBranch ? 1 : 0.7} style={[st.card, !i.active && { opacity: 0.55 }]}
              onPress={isBranch ? undefined : () => setEdit({ id: i.id, name: i.name, price: i.price != null ? String(i.price) : '', tatHours: i.tatHours != null ? String(i.tatHours) : '', preparation: i.preparation || '' })}>
              <View style={st.cardTop}><Text style={st.patient} numberOfLines={1}>{i.name}</Text><Text style={[st.test, { fontSize: 14 }]}>{i.price != null ? money(i.price) : '—'}</Text></View>
              <Text style={st.meta}>{[i.code, i.tatHours ? `${i.tatHours}h turnaround` : null, i.specimenType, `${(parseParams(i.parametersJson) || []).length || 'default'} ranges`, i.active ? null : 'inactive'].filter(Boolean).join(' · ')}</Text>
              {i.preparation ? <Text style={[st.meta, { marginTop: 4 }]} numberOfLines={2}>Prep: {i.preparation}</Text> : null}
            </TouchableOpacity>
          )} />
      )}
      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10 }}>
            <Text style={[st.test, { fontSize: 17 }]}>{edit?.id ? 'Edit' : 'Add'} {type === 'lab' ? 'test' : 'scan'}</Text>
            {[['name', 'Name'], ['price', 'Price (GHS)', 'decimal-pad'], ['tatHours', 'Turnaround target (hours)', 'number-pad'], ['preparation', 'Patient preparation']].map(([k, label, kb]) => (
              <View key={k}><Text style={[st.meta, { fontWeight: '800', marginBottom: 4 }]}>{label}</Text>
                <TextInput style={st.input} value={edit?.[k] ?? ''} keyboardType={kb || 'default'} multiline={k === 'preparation'} onChangeText={(v) => setEdit(e => ({ ...e, [k]: v }))} /></View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <TouchableOpacity onPress={() => setEdit(null)} style={st.btn}><Text style={st.btnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy || !edit?.name?.trim()} onPress={save} style={[st.btn, { backgroundColor: C.primary, borderColor: C.primary }, (busy || !edit?.name?.trim()) && { opacity: 0.5 }]}><Text style={[st.btnText, { color: '#fff' }]}>{busy ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', margin: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12 },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  tab: { borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tabText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  patient: { fontSize: 14, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  test: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 8 },
  meta: { fontSize: 12, color: '#64748b', flexShrink: 1 },
  body: { fontSize: 13, color: '#334155', lineHeight: 19 },
  section: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  tat: { fontSize: 11, fontWeight: '900', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  flag: { fontSize: 10, fontWeight: '900', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  result: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#f8fafc', marginBottom: 8 },
  valueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  fileBtn: { marginTop: 10, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: '#fff' },
  fileBtnText: { fontWeight: '800', color: '#0f172a' },
  input: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#0f172a' },
  btn: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { fontWeight: '800', color: '#0f172a' },
});
