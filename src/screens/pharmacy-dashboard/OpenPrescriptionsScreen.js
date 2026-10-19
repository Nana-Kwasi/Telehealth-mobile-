import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../services/apiClient';

/**
 * Prescriptions offered to every approved NessaHub pharmacy. Mobile twin of web
 * Pharmacy/OpenPrescriptions.js. Only medicines, quantities and the patient's
 * city are shown until a pharmacy takes one; taking it locks it to that pharmacy.
 */
export default function OpenPrescriptionsScreen({ rxOpsRoute }) {
  const navigation = useNavigation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [takingId, setTakingId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api('/api/v1/pharmacy/open-prescriptions');
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load open prescriptions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const take = async (id) => {
    setTakingId(id);
    try {
      await api(`/api/v1/pharmacy/open-prescriptions/${id}/take`, { method: 'POST', body: {} });
      navigation.navigate(rxOpsRoute, { rxId: id });
    } catch (e) {
      Alert.alert('Could not take it', e?.message || 'Please try again.');
      load();
    } finally { setTakingId(null); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <FlatList showsVerticalScrollIndicator={false}
      style={s.container}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={rows}
      keyExtractor={r => String(r.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View>
          <Text style={s.heading}>Open prescriptions</Text>
          <Text style={s.sub}>Offered to every NessaHub pharmacy. The first to take one prepares it.</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={<Text style={s.empty}>No open prescriptions right now.</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          {(item.medications || []).map((m, i) => (
            <Text key={i} style={s.med}>
              • <Text style={{ fontWeight: '700' }}>{m.name}</Text>{m.strength ? ` ${m.strength}` : ''}
              {m.quantity ? ` · ${m.quantity}${m.quantityUnit ? ` ${m.quantityUnit}` : ''}` : ''}
            </Text>
          ))}
          <Text style={s.meta}>
            {item.patientCity ? `Patient's city: ${item.patientCity} · ` : ''}
            {item.createdAt ? `Issued ${new Date(item.createdAt).toLocaleDateString()}` : ''}
          </Text>
          <TouchableOpacity style={s.btn} onPress={() => take(item.id)} disabled={takingId === item.id}>
            {takingId === item.id ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Take this prescription</Text>}
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 8 },
  error: { color: '#b91c1c', fontSize: 13 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0', padding: 14, gap: 4 },
  med: { fontSize: 14, color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  btn: { marginTop: 10, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
