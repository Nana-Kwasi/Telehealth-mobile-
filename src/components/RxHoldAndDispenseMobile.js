import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/apiClient';

/**
 * Hold timer + counted handover on the prescription operations screen. Mobile
 * twin of web Pharmacy/RxHoldAndDispensePanel.js — keep in step. Each part shows
 * only when it applies, so routed prescriptions without quantities look as before.
 */
function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function RxHoldAndDispenseMobile({ rx, onChanged, backRoute }) {
  const navigation = useNavigation();
  const [rows, setRows] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitKey, setSubmitKey] = useState(newKey);
  const [cards, setCards] = useState([]);
  const [payer, setPayer] = useState('SELF');
  const [cardId, setCardId] = useState('');
  const [prices, setPrices] = useState({});
  const [quote, setQuote] = useState(null);

  // Insurance: the patient's verified cards this pharmacy can bill (web twin: RxHoldAndDispensePanel).
  useEffect(() => {
    if (!rx?.id) return;
    api(`/api/v1/insurance/pharmacy/prescriptions/${rx.id}`).then(d => {
      const usable = (d?.cards || []).filter(c => c.status === 'VERIFIED' && c.pharmacyInNetwork);
      setCards(usable);
      if (usable.length) setCardId((usable.find(c => c.isDefault) || usable[0]).id);
    }).catch(() => {});
  }, [rx?.id]);
  const insuredLines = () => Object.entries(amounts)
    .map(([medIndex, q]) => ({ medIndex: Number(medIndex), quantity: Number(q), unitPrice: prices[medIndex] ? Number(prices[medIndex]) : null, name: rows.find(r => r.medIndex === Number(medIndex))?.name }))
    .filter(i => i.quantity > 0);
  const checkCover = async () => {
    const lines = insuredLines();
    if (!lines.length || lines.some(l => l.unitPrice == null)) { Alert.alert('Insurance', 'Enter a quantity and unit price for each medicine.'); return; }
    setBusy(true); setQuote(null);
    try { setQuote(await api(`/api/v1/insurance/pharmacy/prescriptions/${rx.id}/preview`, { method: 'POST', body: { cardId, lines } })); }
    catch (e) { Alert.alert('Insurance', e?.message || 'Could not check cover.'); }
    finally { setBusy(false); }
  };

  const closed = !!rx?.deliveredAt || ['DISPENSED', 'CANCELLED', 'EXPIRED'].includes(rx?.lifecycleStatus);
  const held = !!rx?.openToAll && !!rx?.claimedAt && !closed;

  const loadRows = useCallback(async () => {
    if (!rx?.id) return;
    try {
      const d = await api(`/api/v1/medical/prescriptions/${rx.id}/dispensings`);
      setRows(Array.isArray(d) ? d : []);
    } catch { setRows([]); }
  }, [rx?.id]);

  useEffect(() => { loadRows(); }, [loadRows, rx?.medicationsJson, rx?.lifecycleStatus]);

  const extend = async () => {
    setBusy(true);
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/hold/extend`, { method: 'POST' });
      onChanged?.();
    } catch (e) { Alert.alert('Error', e?.message || 'Could not extend the hold.'); }
    finally { setBusy(false); }
  };

  const release = () => Alert.alert('Release prescription',
    'It will be offered to other pharmacies, and anything you recorded on it will be cleared.', [
      { text: 'Keep it', style: 'cancel' },
      { text: "Can't fill this", style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await api(`/api/v1/pharmacy/prescriptions/${rx.id}/hold/release`, { method: 'POST' });
          if (backRoute) navigation.navigate(backRoute); else navigation.goBack();
        } catch (e) { Alert.alert('Error', e?.message || 'Could not release the prescription.'); }
        finally { setBusy(false); }
      } },
    ]);

  const dispense = async () => {
    const insured = payer === 'INSURANCE';
    const items = insured
      ? insuredLines().map(({ medIndex, quantity, unitPrice }) => ({ medIndex, quantity, unitPrice }))
      : Object.entries(amounts).map(([medIndex, q]) => ({ medIndex: Number(medIndex), quantity: Number(q) })).filter(i => i.quantity > 0);
    if (items.length === 0) { Alert.alert('Nothing entered', 'Enter how many of each medicine you are handing over.'); return; }
    if (insured && items.some(i => i.unitPrice == null)) { Alert.alert('Insurance', 'Enter the unit price of each medicine to bill the insurer.'); return; }
    setBusy(true);
    try {
      await api(`/api/v1/pharmacy/prescriptions/${rx.id}/dispensings`, {
        method: 'POST', body: { items, idempotencyKey: submitKey, ...(insured ? { payer: 'INSURANCE', insuranceCardId: cardId } : {}) },
      });
      if (insured) Alert.alert('Billed to insurer', 'The patient has been asked to confirm they received the medicine before the claim is sent.');
      setPrices({}); setQuote(null);
      setAmounts({});
      setSubmitKey(newKey());
      await loadRows();
      onChanged?.();
    } catch (e) {
      Alert.alert('Could not record', e?.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  const qRows = rows.filter(r => r.quantity != null);
  if (!held && qRows.length === 0) return null;

  return (
    <View>
      {held ? (
        <View style={[s.card, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
          <Text style={[s.title, { color: '#1e3a8a' }]}>Taken from the open list</Text>
          <Text style={s.sub}>
            {rx.holdExpiresAt
              ? `Held for you until ${new Date(rx.holdExpiresAt).toLocaleString()}. With no update by then it is offered to other pharmacies.`
              : 'Held for your pharmacy.'}
          </Text>
          <View style={s.row}>
            <TouchableOpacity style={[s.btn, { backgroundColor: '#1d4ed8' }]} disabled={busy} onPress={extend}>
              <Text style={s.btnText}>Still working on it</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnOutline]} disabled={busy} onPress={release}>
              <Text style={[s.btnText, { color: '#b91c1c' }]}>Can't fill this</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {qRows.length > 0 ? (
        <View style={s.card}>
          <Text style={s.title}>Hand over medicines</Text>
          {!closed && cards.length > 0 ? (
            <View style={s.payer}>
              <Text style={s.sub}>Who pays?</Text>
              <View style={s.row}>
                {[['SELF', 'Patient'], ['INSURANCE', 'Bill insurer']].map(([k, label]) => (
                  <TouchableOpacity key={k} onPress={() => { setPayer(k); setQuote(null); }} style={[s.seg, payer === k && s.segOn]}><Text style={[s.segText, payer === k && { color: '#fff' }]}>{label}</Text></TouchableOpacity>
                ))}
              </View>
              {payer === 'INSURANCE' ? cards.map(c => (
                <TouchableOpacity key={c.id} onPress={() => { setCardId(c.id); setQuote(null); }} style={[s.cardOpt, cardId === c.id && { borderColor: '#0f766e', backgroundColor: '#f0fdfa' }]}>
                  <Text style={s.med}>{cardId === c.id ? '● ' : '○ '}{c.insurerName} · {c.planName || 'plan'}</Text><Text style={s.sub}>{c.memberNo}</Text>
                </TouchableOpacity>
              )) : null}
            </View>
          ) : null}
          {qRows.map(r => {
            const left = Number(r.remaining || 0);
            return (
              <View key={r.medIndex} style={s.line}>
                <View style={{ flex: 1 }}>
                  <Text style={s.med}>{r.name}</Text>
                  <Text style={s.sub}>
                    Given {Number(r.dispensed)} of {Number(r.quantity)}{r.quantityUnit ? ` ${r.quantityUnit}` : ''} · {left} left
                  </Text>
                </View>
                {!closed && left > 0 ? (
                  <TextInput style={s.input} keyboardType="numeric" placeholder="0" placeholderTextColor="#94a3b8"
                    value={amounts[r.medIndex] ?? ''} editable={!busy}
                    onChangeText={v => setAmounts(a => ({ ...a, [r.medIndex]: v }))} />
                ) : null}
                {!closed && left > 0 && payer === 'INSURANCE' ? (
                  <TextInput style={[s.input, { width: 80 }]} keyboardType="decimal-pad" placeholder="GHS/unit" placeholderTextColor="#94a3b8"
                    value={prices[r.medIndex] ?? ''} editable={!busy}
                    onChangeText={v => { setPrices(p => ({ ...p, [r.medIndex]: v })); setQuote(null); }} />
                ) : null}
              </View>
            );
          })}
          {quote ? (
            <View style={[s.quote, ['COVERED', 'PARTIAL'].includes(quote.outcome) ? { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' } : { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
              <Text style={s.med}>{quote.insurerName}: {quote.outcome === 'COVERED' ? 'Covered' : quote.outcome === 'PARTIAL' ? 'Partly covered' : 'Not covered'}{quote.reason ? ` — ${quote.reason}` : ''}</Text>
              <Text style={s.sub}>Insurer pays GHS {Number(quote.coveredTotal || 0).toFixed(2)} · patient pays GHS {Number(quote.patientTotal || 0).toFixed(2)}</Text>
              {(quote.lines || []).filter(l => l.reason).map(l => <Text key={l.medIndex} style={[s.sub, { color: '#b45309' }]}>⚠ {l.name}: {l.reason}</Text>)}
            </View>
          ) : null}
          {!closed ? (
            <View style={s.row}>
              {payer === 'INSURANCE' ? (
                <TouchableOpacity style={[s.btn, s.btnOutline, { borderColor: '#0f766e', marginTop: 8 }]} disabled={busy} onPress={checkCover}>
                  <Text style={[s.btnText, { color: '#0f766e' }]}>Check cover</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[s.btn, { backgroundColor: '#0f766e', marginTop: 8 }]} disabled={busy || (payer === 'INSURANCE' && quote && !['COVERED', 'PARTIAL'].includes(quote.outcome))} onPress={dispense}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{payer === 'INSURANCE' ? 'Hand over & bill' : 'Record handover'}</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, marginBottom: 12, gap: 4 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12, color: '#475569' },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#fecaca' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  med: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  payer: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginVertical: 6, gap: 6 },
  seg: { flex: 1, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  segText: { fontWeight: '800', color: '#334155', fontSize: 13 },
  cardOpt: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 8, backgroundColor: '#fff' },
  quote: { borderWidth: 1.5, borderRadius: 10, padding: 10, marginTop: 8, gap: 2 },
  input: { width: 70, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'center', color: '#0f172a' },
});
