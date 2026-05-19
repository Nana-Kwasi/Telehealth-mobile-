import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { addNurseEarning, fetchNurseEarnings } from '../../../services/homeCareService';
import { formatGhs } from '../../../utils/homeCareUtils';
import NursePageHeader from '../../../components/home-care/NursePageHeader';
import { hc } from '../../../components/home-care/homeCareStyles';
import { HomeCareColors as C } from '../../../constants/homeCareColors';

export default function NurseEarningsScreen({ profile, embedded = false }) {
  const [list, setList] = useState([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setList(await fetchNurseEarnings(profile.id));
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, [profile?.id]));

  const add = async () => {
    await addNurseEarning(profile.id, { amount, note });
    setAmount('');
    setNote('');
    load();
  };

  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const body = (
    <>
      <View style={hc.card}>
        <Text style={{ fontWeight: '800', fontSize: 18, color: C.primaryDark }}>Total logged: {formatGhs(total)}</Text>
      </View>
      <Text style={hc.label}>Add entry</Text>
      <TextInput style={hc.input} placeholder="Amount (GHS)" keyboardType="numeric" value={amount} onChangeText={setAmount} />
      <TextInput style={hc.input} placeholder="Note" value={note} onChangeText={setNote} />
      <TouchableOpacity style={hc.btn} onPress={add}><Text style={hc.btnText}>Add</Text></TouchableOpacity>
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {list.map((e) => (
        <View key={e.id} style={hc.card}>
          <Text style={{ fontWeight: '700' }}>{formatGhs(e.amount)}</Text>
          <Text style={hc.sub}>{e.note || '—'}</Text>
        </View>
      ))}
    </>
  );

  if (embedded) return <View>{body}</View>;

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="Earnings log" subtitle="Manual tracking — payments off-platform" />
      {body}
    </ScrollView>
  );
}
