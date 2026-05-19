import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { fetchApprovedNurses, getCurrentLocationMobile } from '../../../services/homeCareService';
import { formatDistanceKm } from '../../../utils/homeCareGeo';
import { HOME_CARE_SPECIALTIES } from '../../../constants/homeCareConstants';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NurseCard from '../../../components/home-care/NurseCard';
import { requireHomeCarePatient } from '../../../utils/homeCarePatientAuth';

export default function HomeCareSearchScreen({ navigation, route }) {
  const [filters, setFilters] = useState({
    specialty: '',
    gender: '',
    minRating: '',
    onlineOnly: false,
    language: '',
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState(route.params?.initialQuery || '');

  const runSearch = async () => {
    setLoading(true);
    try {
      const loc = await getCurrentLocationMobile();
      let list = await fetchApprovedNurses({
        specialty: filters.specialty,
        gender: filters.gender,
        minRating: filters.minRating ? Number(filters.minRating) : 0,
        onlineOnly: filters.onlineOnly,
        language: filters.language,
        latitude: loc?.latitude,
        longitude: loc?.longitude,
      });
      const q = query.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (n) =>
            (n.fullName || '').toLowerCase().includes(q) ||
            (n.specialty || '').toLowerCase().includes(q),
        );
      }
      setResults(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runSearch(); }, []);

  const book = (nurse) => {
    if (!requireHomeCarePatient(navigation, {
      returnScreen: 'HomeCareBook',
      returnParams: { nurseId: nurse.id },
    })) return;
    navigation.navigate('HomeCareBook', { nurseId: nurse.id });
  };

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Search & filter</Text>
      <TextInput style={hc.input} placeholder="Search by name" value={query} onChangeText={setQuery} />

      <Text style={hc.label}>Specialty</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <TouchableOpacity style={[hc.chip, !filters.specialty && hc.chipActive]} onPress={() => setFilters((f) => ({ ...f, specialty: '' }))}>
          <Text style={!filters.specialty ? hc.chipTextActive : hc.chipText}>All</Text>
        </TouchableOpacity>
        {HOME_CARE_SPECIALTIES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[hc.chip, filters.specialty === s && hc.chipActive]}
            onPress={() => setFilters((f) => ({ ...f, specialty: s }))}
          >
            <Text style={filters.specialty === s ? hc.chipTextActive : hc.chipText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={hc.label}>Gender</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {['', 'female', 'male'].map((g) => (
          <TouchableOpacity
            key={g || 'any'}
            style={[hc.chip, filters.gender === g && hc.chipActive]}
            onPress={() => setFilters((f) => ({ ...f, gender: g }))}
          >
            <Text style={filters.gender === g ? hc.chipTextActive : hc.chipText}>{g || 'Any'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={hc.label}>Min rating</Text>
      <TextInput style={hc.input} keyboardType="decimal-pad" placeholder="e.g. 4" value={filters.minRating} onChangeText={(v) => setFilters((f) => ({ ...f, minRating: v }))} />

      <TouchableOpacity
        style={[hc.chip, filters.onlineOnly && hc.chipActive, { alignSelf: 'flex-start' }]}
        onPress={() => setFilters((f) => ({ ...f, onlineOnly: !f.onlineOnly }))}
      >
        <Text style={filters.onlineOnly ? hc.chipTextActive : hc.chipText}>Online only</Text>
      </TouchableOpacity>

      <TouchableOpacity style={hc.btn} onPress={runSearch}>
        <Text style={hc.btnText}>Apply filters</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} /> : null}
      {results.map((n) => (
        <NurseCard
          key={n.id}
          nurse={n}
          onPressProfile={() => navigation.navigate('HomeCareNurseProfile', { nurseId: n.id })}
          onPressBook={() => book(n)}
        />
      ))}
    </ScrollView>
  );
}
