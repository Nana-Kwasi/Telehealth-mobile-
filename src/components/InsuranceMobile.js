import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Linking, Switch } from 'react-native';
import { api } from '../services/apiClient';

/**
 * Insurance on mobile — twins of web Common/InsuranceCards, ClaimConfirmations
 * and InsuranceNetworks. Keep them in step.
 */

const CARD_STATUS = {
  VERIFIED: ['Verified', '#dcfce7', '#166534'], PENDING: ['Checking…', '#e0f2fe', '#075985'], NOT_FOUND: ['Not found', '#fee2e2', '#991b1b'],
  EXPIRED: ['Expired', '#fef3c7', '#92400e'], SUSPENDED: ['Suspended', '#fef3c7', '#92400e'], ERROR: ['Needs attention', '#fee2e2', '#991b1b'],
};

function Picker({ options, value, onChange, accent }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => (
        <TouchableOpacity key={o.id} onPress={() => onChange(o.id)} style={[s.chip, value === o.id && { backgroundColor: accent, borderColor: accent }]}>
          <Text style={[s.chipText, value === o.id && { color: '#fff' }]}>{o.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** "My insurance": add a card; it is checked with the insurer straight away. */
export function InsuranceCardsMobile({ accent = '#2563eb' }) {
  const [cards, setCards] = useState([]);
  const [insurers, setInsurers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ insurerId: '', memberNo: '', memberName: '', dateOfBirth: '' });
  const [busy, setBusy] = useState(false);
  const [approvals, setApprovals] = useState([]);
  const [consent, setConsent] = useState({ text: '' });
  const [agreed, setAgreed] = useState(false);
  const [open, setOpen] = useState(null);       // { cardId, tab }
  const [balance, setBalance] = useState({});
  const [places, setPlaces] = useState({ list: [], city: '', loading: false });
  const [claims, setClaims] = useState([]);

  const load = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([api('/api/v1/insurance/me/cards'), api('/api/v1/insurance/insurers')]);
      setCards(Array.isArray(c) ? c : []); setInsurers(Array.isArray(i) ? i : []);
      api('/api/v1/insurance/me/preauth').then(p => setApprovals(Array.isArray(p) ? p : [])).catch(() => {});
      api('/api/v1/insurance/me/claims').then(p => setClaims(Array.isArray(p) ? p : [])).catch(() => {});
      api('/api/v1/insurance/consent-text').then(t => setConsent(t || {})).catch(() => {});
    } catch { /* empty */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.insurerId || !form.memberNo.trim()) { Alert.alert('Insurance', 'Choose your insurer and enter your card number.'); return; }
    if (!agreed) { Alert.alert('Insurance', 'Please agree to share claim details with your insurer.'); return; }
    setBusy(true);
    try {
      const card = await api('/api/v1/insurance/me/cards', { method: 'POST', body: { ...form, dateOfBirth: form.dateOfBirth || null, consent: true } });
      await load();
      if (card.status === 'VERIFIED') { Alert.alert('Verified', `${card.insurerName} confirmed your cover (${card.planName || 'plan'}).`); setAdding(false); setAgreed(false); setForm({ insurerId: '', memberNo: '', memberName: '', dateOfBirth: '' }); }
      else Alert.alert('Not verified', card.statusReason || `${card.insurerName} could not confirm this card.`);
    } catch (e) { Alert.alert('Error', e?.message || 'Could not add the card.'); }
    finally { setBusy(false); }
  };
  const showBalance = async (cardId) => {
    setOpen(o => (o && o.cardId === cardId && o.tab === 'balance') ? null : { cardId, tab: 'balance' });
    if (balance[cardId]) return;
    try { const b = await api(`/api/v1/insurance/me/cards/${cardId}/benefits`); setBalance(m => ({ ...m, [cardId]: b })); }
    catch (e) { setBalance(m => ({ ...m, [cardId]: { available: false, note: e?.message || 'Balance unavailable' } })); }
  };
  const findPlaces = async (cardId, city = places.city) => {
    setOpen({ cardId, tab: 'pharmacies' });
    setPlaces(p => ({ ...p, loading: true }));
    try {
      const list = await api(`/api/v1/insurance/me/cards/${cardId}/providers?type=PHARMACY${city ? `&city=${encodeURIComponent(city)}` : ''}`);
      setPlaces({ list: Array.isArray(list) ? list : [], city, loading: false });
    } catch { setPlaces({ list: [], city, loading: false }); }
  };
  const setSharing = (c, give) => {
    if (give) { act(`/api/v1/insurance/me/cards/${c.id}/consent`, 'POST', { give: true }); return; }
    Alert.alert('Stop sharing?', `${c.insurerName} will not receive claim details and this card will not be able to pay until you agree again.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Stop sharing', style: 'destructive', onPress: () => act(`/api/v1/insurance/me/cards/${c.id}/consent`, 'POST', { give: false }) }]);
  };

  const act = async (path, method = 'POST', body) => {
    setBusy(true);
    try { const list = await api(path, { method, ...(body ? { body } : {}) }); if (Array.isArray(list)) setCards(list); }
    catch (e) { Alert.alert('Error', e?.message || 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={s.box}>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>🛡️ My insurance cards</Text>
          <Text style={s.sub}>Checked live with your insurer. Use a verified card at NessaHub pharmacies.</Text>
        </View>
        {!adding && insurers.length > 0 ? <TouchableOpacity onPress={() => setAdding(true)} style={[s.btn, { backgroundColor: accent }]}><Text style={s.btnText}>+ Add</Text></TouchableOpacity> : null}
      </View>

      {adding ? (
        <View style={s.form}>
          <Text style={s.label}>Insurer</Text>
          <Picker options={insurers} value={form.insurerId} onChange={v => setForm({ ...form, insurerId: v })} accent={accent} />
          <Text style={s.label}>Card / member number</Text>
          <TextInput style={s.input} autoCapitalize="characters" value={form.memberNo} onChangeText={v => setForm({ ...form, memberNo: v })} placeholder="As printed on your card" placeholderTextColor="#94a3b8" />
          <Text style={s.label}>Name on card (if different)</Text>
          <TextInput style={s.input} value={form.memberName} onChangeText={v => setForm({ ...form, memberName: v })} />
          <Text style={s.label}>Date of birth (YYYY-MM-DD)</Text>
          <TextInput style={s.input} value={form.dateOfBirth} onChangeText={v => setForm({ ...form, dateOfBirth: v })} placeholder="1990-03-02" placeholderTextColor="#94a3b8" />
          <View style={[s.consent, agreed && { borderColor: accent }]}>
            <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: accent }} />
            <Text style={s.consentText}><Text style={{ fontWeight: '800' }}>I agree to share my claim details with my insurer. </Text>{consent.text || 'NessaHub sends the insurer what they need to pay: service, medicines, amounts, provider and diagnosis code. You can withdraw at any time.'}</Text>
          </View>
          <View style={[s.headRow, { marginTop: 10 }]}>
            <TouchableOpacity onPress={() => setAdding(false)} style={[s.btn, s.btnOutline]}><Text style={[s.btnText, { color: '#334155' }]}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={add} disabled={busy} style={[s.btn, { backgroundColor: accent, flex: 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Add & verify</Text>}</TouchableOpacity>
          </View>
        </View>
      ) : null}

      {cards.length === 0 ? <Text style={[s.sub, { marginTop: 10 }]}>{insurers.length ? 'No cards yet.' : 'No insurers are connected to NessaHub yet.'}</Text> : cards.map(c => {
        const [label, bg, fg] = CARD_STATUS[c.status] || CARD_STATUS.PENDING;
        return (
          <View key={c.id} style={[s.card, { backgroundColor: c.status === 'VERIFIED' ? accent : '#475569' }]}>
            <View style={s.headRow}>
              <Text style={s.cardInsurer}>{c.insurerName}</Text>
              <Text style={[s.badge, { backgroundColor: bg, color: fg }]}>{label}</Text>
            </View>
            <Text style={s.cardNo}>{c.memberNo}</Text>
            <Text style={s.cardMeta}>{c.memberName}{c.planName ? ` · ${c.planName}` : ''}{c.validUntil ? ` · until ${c.validUntil}` : ''}</Text>
            {c.consentGiven === false ? <Text style={[s.cardReason, { backgroundColor: 'rgba(220,38,38,0.85)' }]}>Sharing withdrawn — this card cannot pay until you agree again.</Text> : null}
            {c.status !== 'VERIFIED' && c.statusReason ? <Text style={s.cardReason}>{c.statusReason}</Text> : null}
            <View style={[s.headRow, { marginTop: 8, flexWrap: 'wrap' }]}>
              {c.isDefault ? <Text style={s.cardChip}>Default</Text> : <TouchableOpacity disabled={busy} onPress={() => act(`/api/v1/insurance/me/cards/${c.id}/default`)}><Text style={s.cardChip}>Make default</Text></TouchableOpacity>}
              <TouchableOpacity disabled={busy} onPress={() => act(`/api/v1/insurance/me/cards/${c.id}/recheck`)}><Text style={s.cardChip}>Check again</Text></TouchableOpacity>
              {c.status === 'VERIFIED' ? <TouchableOpacity onPress={() => showBalance(c.id)}><Text style={s.cardChip}>Balance</Text></TouchableOpacity> : null}
              {c.status === 'VERIFIED' ? <TouchableOpacity onPress={() => findPlaces(c.id)}><Text style={s.cardChip}>Where to use</Text></TouchableOpacity> : null}
              <TouchableOpacity disabled={busy} onPress={() => setSharing(c, c.consentGiven === false)}><Text style={[s.cardChip, c.consentGiven === false && { backgroundColor: '#fff', color: '#0f172a' }]}>{c.consentGiven === false ? 'Agree to share' : 'Withdraw sharing'}</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy} onPress={() => Alert.alert('Remove card?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => act(`/api/v1/insurance/me/cards/${c.id}`, 'DELETE') }])}><Text style={s.cardChip}>Remove</Text></TouchableOpacity>
            </View>
          </View>
        );
      })}
      {open && (() => {
        const c = cards.find(x => x.id === open.cardId);
        if (!c) return null;
        if (open.tab === 'balance') {
          const b = balance[c.id];
          return (
            <View style={s.panel}>
              <View style={s.headRow}><Text style={[s.title, { flex: 1 }]}>Benefit balance · {c.insurerName}</Text><TouchableOpacity onPress={() => setOpen(null)}><Text style={s.close}>✕</Text></TouchableOpacity></View>
              {!b ? <ActivityIndicator style={{ marginTop: 8 }} /> : !b.available ? <Text style={s.sub}>{b.note}</Text> : (
                <>
                  {(b.benefits || []).map(x => {
                    const lim = Number(x.limit || 0), rem = Number(x.remaining || 0);
                    const pct = lim > 0 ? Math.max(0, Math.min(100, (rem / lim) * 100)) : 0;
                    return (
                      <View key={x.category} style={s.benefit}>
                        <View style={s.headRow}><Text style={[s.med, { flex: 1 }]}>{x.label}</Text><Text style={[s.med, { color: pct < 20 ? '#b91c1c' : accent }]}>GHS {rem.toFixed(2)}</Text></View>
                        <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: pct < 20 ? '#ef4444' : accent }]} /></View>
                        <Text style={s.sub}>left of GHS {lim.toFixed(0)}{x.copay ? ` · co-pay ${x.copay}` : ''}</Text>
                      </View>
                    );
                  })}
                  <Text style={[s.sub, { marginTop: 6 }]}>From {b.insurerName}'s own records. Your insurer has the final word on cover.</Text>
                </>
              )}
            </View>
          );
        }
        return (
          <View style={s.panel}>
            <View style={s.headRow}><Text style={[s.title, { flex: 1 }]}>Pharmacies that accept {c.insurerName}</Text><TouchableOpacity onPress={() => setOpen(null)}><Text style={s.close}>✕</Text></TouchableOpacity></View>
            <View style={[s.headRow, { marginTop: 8 }]}>
              <TextInput style={[s.input, { flex: 1, marginTop: 0 }]} placeholder="Town or city" placeholderTextColor="#94a3b8" value={places.city} onChangeText={v => setPlaces(p => ({ ...p, city: v }))} onSubmitEditing={() => findPlaces(c.id, places.city)} returnKeyType="search" />
              <TouchableOpacity onPress={() => findPlaces(c.id, places.city)} style={[s.btn, { backgroundColor: accent }]}><Text style={s.btnText}>Search</Text></TouchableOpacity>
            </View>
            {places.loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : places.list.length === 0 ? <Text style={[s.sub, { marginTop: 8 }]}>No pharmacies found{places.city ? ` in ${places.city}` : ''}.</Text> : places.list.map((p, i) => (
              <View key={p.ownerId || i} style={s.codeRow}>
                <View style={{ flex: 1 }}><Text style={s.med}>{p.name}</Text><Text style={s.sub}>{[p.address, p.city].filter(Boolean).join(', ') || '—'}</Text></View>
                {p.phone ? <TouchableOpacity onPress={() => Linking.openURL(`tel:${p.phone}`)}><Text style={[s.link, { color: accent }]}>Call</Text></TouchableOpacity> : null}
                {p.latitude && p.longitude ? <TouchableOpacity onPress={() => Linking.openURL(`https://maps.google.com/?q=${p.latitude},${p.longitude}`)}><Text style={[s.link, { color: accent }]}>Map</Text></TouchableOpacity> : null}
              </View>
            ))}
          </View>
        );
      })()}

      {claims.length ? (
        <View style={{ marginTop: 14 }}>
          <Text style={s.title}>Receipts & claims</Text>
          {claims.slice(0, 20).map(c => (
            <TouchableOpacity key={c.id} style={s.codeRow} onPress={() => Alert.alert(`Receipt ${c.claimRef}`,
              `${c.providerName || ''}\n${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}\nInsurer: ${c.insurerName}\nService: ${c.serviceType}\n\nTotal: GHS ${Number(c.totalAmount || 0).toFixed(2)}\nInsurer pays: GHS ${Number(c.insurerAmount || 0).toFixed(2)}\nYou paid: GHS ${Number(c.patientAmount || 0).toFixed(2)}\nStatus: ${c.status}`)}>
              <View style={{ flex: 1 }}><Text style={s.med}>{c.providerName || c.serviceType}</Text><Text style={s.sub}>{c.claimRef} · {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''} · you paid GHS {Number(c.patientAmount || 0).toFixed(2)}</Text></View>
              <Text style={[s.badge, { backgroundColor: ['APPROVED', 'PAID'].includes(c.status) ? '#dcfce7' : c.status === 'REJECTED' ? '#fee2e2' : '#e0f2fe', color: '#0f172a' }]}>{c.status}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {approvals.length ? (
        <View style={{ marginTop: 14 }}>
          <Text style={s.title}>Approvals from your insurer</Text>
          {approvals.map(a => {
            const label = { APPROVED: 'Approved', PARTIAL: 'Partly approved', REJECTED: 'Not approved', PENDING: 'Waiting for insurer', QUERIED: 'Insurer asked a question', USED: 'Used', CANCELLED: 'Cancelled', EXPIRED: 'Expired' }[a.status] || a.status;
            let what = ''; try { what = JSON.parse(a.itemsJson || '[]').map(i => i.description).join(', '); } catch { what = ''; }
            return (
              <View key={a.id} style={s.codeRow}>
                <View style={{ flex: 1 }}><Text style={s.med}>{what || a.serviceType}</Text><Text style={s.sub}>{a.providerName} · {a.insurerName}{a.decisionReason ? ` — ${a.decisionReason}` : ''}</Text></View>
                <Text style={[s.badge, { backgroundColor: a.status === 'APPROVED' || a.status === 'PARTIAL' ? '#dcfce7' : a.status === 'REJECTED' ? '#fee2e2' : '#fef3c7', color: '#0f172a' }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** "Did you receive your medicine?" on the home screen. Renders nothing when none pending. */
export function ClaimConfirmationsMobile() {
  const [items, setItems] = useState([]);
  const [done, setDone] = useState({});
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { api('/api/v1/insurance/me/claims/pending').then(r => setItems(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const answer = async (c, received) => {
    const go = async () => {
      setBusy(c.id);
      try { await api(`/api/v1/insurance/me/claims/${c.id}/confirm`, { method: 'POST', body: { received } }); setDone(d => ({ ...d, [c.id]: received ? 'Thanks — confirmed.' : 'Thanks — your insurer will review it.' })); setTimeout(load, 2500); }
      catch (e) { Alert.alert('Error', e?.message || 'Could not save your answer.'); }
      finally { setBusy(''); }
    };
    if (received) go();
    else Alert.alert('Not received?', 'Tell your insurer you did NOT receive this medicine? They will review it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes, tell them', style: 'destructive', onPress: go }]);
  };
  if (!items.length) return null;
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 8 }}>
      {items.map(c => (
        <View key={c.id} style={s.confirm}>
          <Text style={s.confirmTitle}>💊 Did you receive your medicine?</Text>
          <Text style={s.confirmText}>{c.placeName || 'A pharmacy'} gave: {(c.lines || []).map(l => `${l.description} ×${Number(l.quantity)}`).join(', ')} · billed to {c.insurerName}{Number(c.patientAmount) > 0 ? ` · you paid GHS ${Number(c.patientAmount).toFixed(2)}` : ''}</Text>
          {done[c.id] ? <Text style={[s.confirmText, { color: '#166534', fontWeight: '800', marginTop: 6 }]}>{done[c.id]}</Text> : (
            <View style={[s.headRow, { marginTop: 8 }]}>
              <TouchableOpacity disabled={busy === c.id} onPress={() => answer(c, true)} style={[s.btn, { backgroundColor: '#16a34a', flex: 1 }]}><Text style={s.btnText}>Yes, I got it</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy === c.id} onPress={() => answer(c, false)} style={[s.btn, s.btnOutline, { borderColor: '#fecaca' }]}><Text style={[s.btnText, { color: '#b91c1c' }]}>No</Text></TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** Settings → Insurance for providers: provider codes, checked with the insurer. */
export function InsuranceNetworksMobile({ accent = '#0f766e' }) {
  const [data, setData] = useState(null);
  const [insurers, setInsurers] = useState([]);
  const [form, setForm] = useState({ insurerId: '', providerCode: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const [d, i] = await Promise.all([api('/api/v1/insurance/provider/codes'), api('/api/v1/insurance/insurers')]); setData(d); setInsurers(Array.isArray(i) ? i : []); }
    catch { /* empty */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.insurerId || !form.providerCode.trim()) { Alert.alert('Insurance', 'Choose the insurer and enter your provider code.'); return; }
    setBusy(true);
    try {
      const codes = await api('/api/v1/insurance/provider/codes', { method: 'POST', body: form });
      setData(d => ({ ...d, codes }));
      const row = codes.find(c => c.insurerId === form.insurerId);
      if (row?.status === 'VERIFIED') { Alert.alert('Verified', `${row.insurerName} confirmed your provider code.`); setForm({ insurerId: '', providerCode: '' }); }
      else Alert.alert('Not verified', row?.statusReason || 'The insurer did not recognise this code.');
    } catch (e) { Alert.alert('Error', e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };
  const remove = (id) => Alert.alert('Remove insurer?', 'You will no longer be able to bill them.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => {
    try { const codes = await api(`/api/v1/insurance/provider/codes/${id}`, { method: 'DELETE' }); setData(d => ({ ...d, codes })); } catch (e) { Alert.alert('Error', e?.message); }
  } }]);
  const codes = data?.codes || [];
  const inherited = (data?.inherited || []).filter(i => i.status === 'VERIFIED' && !codes.some(c => c.insurerId === i.insurerId));
  return (
    <View style={s.box}>
      <Text style={s.title}>Insurance networks</Text>
      <Text style={s.sub}>Enter the provider code each insurer gave you. NessaHub checks it with the insurer, then you can bill them.</Text>
      {insurers.length ? (
        <View style={s.form}>
          <Picker options={insurers} value={form.insurerId} onChange={v => setForm({ ...form, insurerId: v })} accent={accent} />
          <TextInput style={[s.input, { marginTop: 8 }]} autoCapitalize="characters" value={form.providerCode} onChangeText={v => setForm({ ...form, providerCode: v })} placeholder="Your provider code" placeholderTextColor="#94a3b8" />
          <TouchableOpacity onPress={save} disabled={busy} style={[s.btn, { backgroundColor: accent, marginTop: 8 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Add & verify</Text>}</TouchableOpacity>
        </View>
      ) : <Text style={[s.sub, { marginTop: 8 }]}>No insurers are connected to NessaHub yet.</Text>}
      {codes.map(c => (
        <View key={c.id} style={s.codeRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.med}>{c.insurerName}</Text>
            <Text style={s.sub}>{c.providerCode} · {c.status === 'VERIFIED' ? '✓ Verified' : c.status === 'REJECTED' ? 'Not recognised' : 'Insurer unreachable'}{c.statusReason && c.status !== 'VERIFIED' ? ` — ${c.statusReason}` : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => remove(c.id)}><Text style={{ color: '#b91c1c', fontWeight: '700' }}>Remove</Text></TouchableOpacity>
        </View>
      ))}
      {inherited.map(c => <View key={`i-${c.id}`} style={s.codeRow}><Text style={s.med}>{c.insurerName}</Text><Text style={s.sub}>{c.providerCode} · via head office</Text></View>)}
    </View>
  );
}

const s = StyleSheet.create({
  consent: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 10, backgroundColor: '#fff' },
  consentText: { flex: 1, fontSize: 12, color: '#334155', lineHeight: 17 },
  panel: { marginTop: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12 },
  close: { fontSize: 16, fontWeight: '800', color: '#475569', paddingHorizontal: 6 },
  benefit: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 8 },
  bar: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 99, marginVertical: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
  link: { fontWeight: '800', fontSize: 13, paddingHorizontal: 6 },
  box: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginTop: 10, marginBottom: 5 },
  input: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#0f172a' },
  form: { marginTop: 10, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10 },
  btn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#cbd5e1' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chip: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  card: { borderRadius: 16, padding: 14, marginTop: 10 },
  cardInsurer: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
  badge: { fontSize: 10, fontWeight: '900', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  cardNo: { color: '#fff', fontFamily: 'monospace', fontSize: 17, letterSpacing: 2, marginTop: 12 },
  cardMeta: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 4 },
  cardReason: { color: '#fff', fontSize: 11, marginTop: 6, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: 6, overflow: 'hidden' },
  cardChip: { color: '#fff', fontSize: 11, fontWeight: '700', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  confirm: { backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#bfdbfe', borderRadius: 14, padding: 12 },
  confirmTitle: { fontWeight: '800', color: '#1e3a8a', fontSize: 14 },
  confirmText: { color: '#1e40af', fontSize: 12, marginTop: 4, lineHeight: 17 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  med: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
});
