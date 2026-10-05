import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getStoredUserId } from '../../../services/apiClient';
import { requireHomeCarePatient } from '../../../utils/homeCarePatientAuth';
import { fetchApprovedNurses, fetchRecentlyHiredNurses, getCurrentLocationMobile } from '../../../services/homeCareService';
import { HOME_CARE_SPECIALTIES } from '../../../constants/homeCareConstants';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NurseCard from '../../../components/home-care/NurseCard';

export default function HomeCareHomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [nurses, setNurses] = useState([]);
  const [recentNurses, setRecentNurses] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const load = async () => {
    try {
      const loc = await getCurrentLocationMobile();
      const list = await fetchApprovedNurses({
        latitude: loc?.latitude,
        longitude: loc?.longitude,
      });
      setNurses(list);
      const uid = await getStoredUserId();
      setIsLoggedIn(!!uid);
      if (uid) setRecentNurses(await fetchRecentlyHiredNurses(uid));
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = nurses.filter((n) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (n.fullName || '').toLowerCase().includes(q) ||
      (n.specialty || '').toLowerCase().includes(q)
    );
  });

  const topRated = [...nurses].sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0)).slice(0, 5);
  const nearby = nurses.slice(0, 5);

  const openNurse = (nurse) => navigation.navigate('HomeCareNurseProfile', { nurseId: nurse.id });
  const bookNurse = (nurse) => {
    if (!requireHomeCarePatient(navigation, {
      returnScreen: 'HomeCareBook',
      returnParams: { nurseId: nurse.id },
      message: 'Sign up to book this nurse.',
    })) return;
    navigation.navigate('HomeCareBook', { nurseId: nurse.id });
  };

  return (
    <View style={hc.screen}>
      <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
        contentContainerStyle={hc.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        <Text style={hc.title}>Home Care</Text>
        <Text style={hc.sub}>Find verified nurses for care at home.</Text>

        <View style={hc.searchBar}>
          <Ionicons name="search" size={20} color={C.textSecondary} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, fontSize: 15, color: C.text }}
            placeholder="Search nurses or specialty…"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => navigation.navigate('HomeCareSearch', { initialQuery: search })}
          />
          <TouchableOpacity onPress={() => navigation.navigate('HomeCareSearch', { initialQuery: search })}>
            <Ionicons name="options-outline" size={22} color={C.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[hc.card, { borderColor: C.emergency, backgroundColor: '#fef2f2' }]}
          onPress={() => navigation.navigate('HomeCareEmergency')}
        >
          <Text style={{ fontWeight: '800', color: C.emergency }}>🚨 Emergency request</Text>
          <Text style={{ fontSize: 12, color: '#991b1b', marginTop: 4 }}>Urgent care — notify nearby nurses</Text>
        </TouchableOpacity>

        <TouchableOpacity style={hc.btnOutline} onPress={() => navigation.navigate('HomeCareNurseList', { title: 'Nearby nurses', nurses: nearby })}>
          <Text style={hc.btnOutlineText}>Browse nearby nurses →</Text>
        </TouchableOpacity>

        {recentNurses.length > 0 ? (
          <>
            <Text style={[hc.label, { marginTop: 8 }]}>Recently hired</Text>
            {recentNurses.map((n) => (
              <NurseCard key={`r-${n.id}`} nurse={n} onPressProfile={() => openNurse(n)} onPressBook={() => bookNurse(n)} />
            ))}
          </>
        ) : null}

        <Text style={[hc.label, { marginTop: 16 }]}>Top rated</Text>
        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginVertical: 24 }} />
        ) : topRated.length === 0 ? (
          <Text style={hc.sub}>No nurses available yet. Check back soon.</Text>
        ) : (
          topRated.map((n) => (
            <NurseCard key={n.id} nurse={n} onPressProfile={() => openNurse(n)} onPressBook={() => bookNurse(n)} />
          ))
        )}

        <Text style={[hc.label, { marginTop: 8 }]}>Browse by specialty</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {HOME_CARE_SPECIALTIES.slice(0, 6).map((s) => (
            <TouchableOpacity
              key={s}
              style={hc.chip}
              onPress={() => navigation.navigate('HomeCareNurseList', { title: s, specialty: s })}
            >
              <Text style={hc.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoggedIn ? (
          <>
            <TouchableOpacity style={[hc.btnOutline, { marginTop: 16 }]} onPress={() => navigation.navigate('HomeCareOngoingCare')}>
              <Text style={hc.btnOutlineText}>Ongoing care packages</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[hc.btn, { marginTop: 10 }]} onPress={() => navigation.navigate('HomeCareHistory')}>
              <Text style={hc.btnText}>My visit history</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {search ? (
          <>
            <Text style={[hc.label, { marginTop: 16 }]}>Search results</Text>
            {filtered.map((n) => (
              <NurseCard key={`s-${n.id}`} nurse={n} onPressProfile={() => openNurse(n)} onPressBook={() => bookNurse(n)} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
