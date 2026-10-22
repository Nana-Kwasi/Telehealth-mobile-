import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { api } from '../../services/apiClient';

/**
 * A doctor's or therapist's earnings on the phone: next payout, what is still
 * clearing, every booking (price − commission − refunds), payout history, and
 * where payouts go. Same data and rules as the web Earnings page.
 */
const GHS = (v) => `GHS ${Number(v || 0).toFixed(2)}`;
const fmt = (v) => (v ? new Date(v).toLocaleDateString() : '');
const STATE = { PENDING: ['Pending', '#d97706'], AVAILABLE: ['Available', '#16a34a'], IN_PAYOUT: ['In payout', '#4f46e5'], PAID_OUT: ['Paid out', '#0f766e'], REFUNDED: ['Refunded', '#64748b'] };
const ITEM = { PENDING: ['On its way', '#d97706'], PAID: ['Paid', '#16a34a'], FAILED: ['Failed — check your details', '#dc2626'] };
const NETWORKS = ['MTN MoMo', 'Telecel Cash', 'AT Money'];
const POLICY = 'https://policy.nessahub.com/policy.html?slug=provider-commission-payout-policy';

export default function EarningsScreen({ serviceKey = 'consultation', accent = '#1e6bb8' }) {
  const [s, setS] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [rates, setRates] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [sum, led, pay, rt] = await Promise.all([
        api('/api/v1/finance/earnings/summary'),
        api('/api/v1/finance/earnings/ledger').catch(() => []),
        api('/api/v1/finance/payouts').catch(() => []),
        api('/api/v1/finance/rates').catch(() => null),
      ]);
      setS(sum); setLedger(led || []); setPayouts(pay || []); setRates(rt); setError('');
    } catch (e) { setError(e?.message || 'Could not load your earnings.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rate = rates?.commissionPercent?.[serviceKey];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={st.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Text style={st.muted}>
        {rate != null ? `NessaHub's commission on your bookings is ${rate}% of your price; you keep the rest. ` : ''}
        Payouts are monthly to your bank or mobile money.
      </Text>
      <TouchableOpacity onPress={() => Linking.openURL(POLICY)}><Text style={[st.link, { color: accent }]}>How fees and payouts work</Text></TouchableOpacity>
      {error ? <Text style={st.err}>{error}</Text> : null}
      {!s ? <ActivityIndicator style={{ marginTop: 24 }} /> : (
        <>
          <View style={st.tiles}>
            <Tile label="Next payout" value={GHS(s.balance)} sub={`Around ${fmt(s.nextPayoutDate)}`} color="#16a34a" />
            <Tile label="Pending" value={GHS(s.pending)} sub={`Available ${s.clearingDays} day(s) after each session`} color="#d97706" />
            {Number(s.adjustments) !== 0 ? <Tile label="Refund adjustments" value={GHS(s.adjustments)} sub="On bookings already paid out" color="#d97706" /> : null}
            <Tile label="Paid to you" value={GHS(s.paidOut)} />
            <Tile label="Bookings" value={String(s.bookings)} sub={`${GHS(s.lifetimeGross)} booked`} />
          </View>
          <PayoutDetails method={s.payoutMethod} onSaved={load} accent={accent} />
          <Text style={st.h2}>Bookings</Text>
          {ledger.length === 0 ? <Text style={st.muted}>No bookings yet.</Text> : ledger.map((e) => {
            const [label, color] = STATE[e.state] || [e.state, '#64748b'];
            return (
              <View key={e.reference} style={st.card}>
                <View style={st.rowBetween}>
                  <Text style={st.bold}>{e.patientName || 'Patient'}</Text>
                  <Text style={[st.badge, { backgroundColor: color }]}>{label}</Text>
                </View>
                <Text style={st.small}>Paid {fmt(e.paidAt)}{e.serviceAt ? ` · session ${fmt(e.serviceAt)}` : ''}</Text>
                <Text style={st.small}>Price {GHS(e.price)} − commission {GHS(e.commission)}{Number(e.refundDeducted) > 0 ? ` − refund ${GHS(e.refundDeducted)}` : ''}</Text>
                <Text style={st.bold}>You earn {GHS(e.net)}</Text>
              </View>
            );
          })}
          <Text style={st.h2}>Payouts</Text>
          {payouts.length === 0 ? <Text style={st.muted}>No payouts yet.</Text> : payouts.map((p) => {
            const [label, color] = ITEM[p.status] || [p.status, '#64748b'];
            return (
              <View key={p.id} style={st.card}>
                <View style={st.rowBetween}>
                  <Text style={st.bold}>{GHS(p.amount)}</Text>
                  <Text style={[st.badge, { backgroundColor: color }]}>{label}</Text>
                </View>
                <Text style={st.small}>Up to {p.periodEnd} · {p.bookingCount} booking(s) · {p.method}</Text>
                {p.transferReference ? <Text style={st.small}>Ref {p.transferReference}</Text> : null}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function Tile({ label, value, sub, color }) {
  return (
    <View style={[st.tile, color ? { borderLeftColor: color, borderLeftWidth: 4 } : null]}>
      <Text style={st.tileLabel}>{label}</Text>
      <Text style={st.tileValue}>{value}</Text>
      {sub ? <Text style={st.small}>{sub}</Text> : null}
    </View>
  );
}

function PayoutDetails({ method, onSaved, accent }) {
  const [editing, setEditing] = useState(!method);
  const [kind, setKind] = useState('MOMO');
  const [network, setNetwork] = useState('MTN MoMo');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });

  const save = async () => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try {
      await api('/api/v1/finance/payout-method', { method: 'PUT', body: { method: kind, providerName: network, accountName: name, accountNumber: number, bankBranch: branch } });
      setMsg({ ok: 'Saved. NessaHub finance will confirm these details before your next payout.', err: '' });
      setEditing(false);
      onSaved();
    } catch (e) { setMsg({ ok: '', err: e?.message || 'Could not save.' }); } finally { setBusy(false); }
  };

  return (
    <View style={st.card}>
      <Text style={st.h3}>Where we pay you</Text>
      {method && !editing ? (
        <>
          <Text style={st.body}>{method.providerName} {method.accountMasked} — {method.accountName}</Text>
          <Text style={st.small}>{method.verified ? 'Confirmed by NessaHub finance.' : 'Waiting for NessaHub finance to confirm — payouts are held until then.'}</Text>
          <TouchableOpacity style={st.btn} onPress={() => setEditing(true)}><Text style={st.btnText}>Change payout details</Text></TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={st.small}>For your security, a change pauses payouts until our finance team confirms it, and we email you every time.</Text>
          <View style={st.chips}>
            {[['MOMO', 'Mobile money'], ['BANK', 'Bank account']].map(([k, l]) => (
              <TouchableOpacity key={k} onPress={() => { setKind(k); setNetwork(k === 'MOMO' ? 'MTN MoMo' : ''); }}
                style={[st.chip, kind === k && { backgroundColor: accent, borderColor: accent }]}>
                <Text style={[st.chipText, kind === k && { color: '#fff' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {kind === 'MOMO' ? (
            <View style={st.chips}>
              {NETWORKS.map((n) => (
                <TouchableOpacity key={n} onPress={() => setNetwork(n)} style={[st.chip, network === n && { backgroundColor: accent, borderColor: accent }]}>
                  <Text style={[st.chipText, network === n && { color: '#fff' }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : <TextInput style={st.input} placeholder="Bank (e.g. GCB Bank)" value={network} onChangeText={setNetwork} />}
          <TextInput style={st.input} placeholder="Account name (as registered)" value={name} onChangeText={setName} />
          <TextInput style={st.input} placeholder={kind === 'MOMO' ? 'Mobile money number' : 'Account number'} value={number} onChangeText={setNumber} keyboardType="number-pad" />
          {kind === 'BANK' ? <TextInput style={st.input} placeholder="Branch" value={branch} onChangeText={setBranch} /> : null}
          <TouchableOpacity style={[st.btn, { backgroundColor: accent, borderColor: accent }]} disabled={busy} onPress={save}>
            <Text style={[st.btnText, { color: '#fff' }]}>{busy ? 'Saving…' : 'Save payout details'}</Text>
          </TouchableOpacity>
        </>
      )}
      {msg.ok ? <Text style={st.ok}>{msg.ok}</Text> : null}
      {msg.err ? <Text style={st.err}>{msg.err}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  muted: { color: '#64748b', lineHeight: 20 },
  link: { fontWeight: '700', marginVertical: 8 },
  h2: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 18, marginBottom: 8 },
  h3: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tile: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, width: '48%' },
  tileLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  tileValue: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginTop: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  bold: { fontWeight: '700', color: '#0f172a', marginTop: 2 },
  body: { color: '#0f172a' },
  small: { color: '#64748b', fontSize: 12, marginTop: 2 },
  badge: { color: '#fff', fontSize: 11, fontWeight: '700', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipText: { color: '#334155', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, backgroundColor: '#fff', marginTop: 8 },
  btn: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#fff' },
  btnText: { fontWeight: '700', color: '#0f172a' },
  ok: { color: '#166534', marginTop: 8 },
  err: { color: '#b91c1c', marginTop: 8 },
});
