import React, { useState, useEffect } from 'react';
import PriceTag from '../components/PriceTag';
import { quotePrices } from '../services/pricing';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredUserId } from '../services/apiClient';
import { Colors } from '../constants/colors';
import { COUPLE_STORAGE_KEYS } from '../constants/coupleTherapyConfig';
import {
  loadCouple,
  canBrowseTherapists,
  getCoupleMatchedTherapists,
  proposeCoupleTherapist,
  confirmCoupleTherapist,
} from '../services/coupleTherapyService';
import { therapistFee } from '../utils/therapistFee';
import { resolveFileUrl } from '../utils/mediaUrl';


/** A therapist's own per-session charge (kept in their profile metadata). */
export function therapistRate(t) {
  // One implementation, shared with every other fee reader.
  const raw = therapistFee(t);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MatchTherapistScreen = ({ navigation, route }) => {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coupleProfile, setCoupleProfile] = useState(null);
  const [coupleBlocked, setCoupleBlocked] = useState(false);
  const [availabilityOverlap, setAvailabilityOverlap] = useState(true);
  const [myPartnerKey, setMyPartnerKey] = useState(null);

  // Keyed by therapist id. Declared here with the other hooks — below an early
  // return it would run conditionally, which React forbids.
  const [quotes, setQuotes] = useState({});

  // One request for the whole list rather than one per card, so the list
  // cannot render half discounted and half not.
  useEffect(() => {
    const items = therapists
      .map((t) => ({
        key: t.id || t.uid,
        providerId: t.id || t.uid,
        serviceType: 'therapy',
        baseAmount: therapistRate(t),
      }))
      .filter((i) => i.key && i.baseAmount > 0);
    if (!items.length) { setQuotes({}); return undefined; }
    let live = true;
    quotePrices(items).then((map) => { if (live) setQuotes(map || {}); });
    return () => { live = false; };
  }, [therapists]);

  useEffect(() => {
    loadTherapists();
  }, []);

  const calculateRelevanceScore = (therapist, data) => {
    let score = 50;
    
    // Role bonus (admin therapists get highest scores)
    if (therapist.role === 'admin') score += 25;
    else if (therapist.role === 'therapist') score += 15;
    else if (therapist.role === 'user') score += 10;
    
    // Type match (the API returns `therapyType`; `type` is the Firestore-era name)
    const therapistType = therapist.therapyType || therapist.type;
    if (therapistType && data.therapyType) {
      if (String(therapistType).toLowerCase().includes(String(data.therapyType).toLowerCase())) score += 10;
    }
    
    // Religious match
    if (data.preferChristianTherapist === 'Yes' && therapist.religion === 'Christianity') {
      score += 8;
    }
    
    // Gender preference match
    if (data.therapistGender && data.therapistGender !== 'No preference') {
      if (therapist.gender && therapist.gender.toLowerCase() === data.therapistGender.toLowerCase()) {
        score += 5;
      }
    }
    
    // LGBTQIA+ match
    if (data.lgbtqia === 'Yes, this is important to me' && therapist.lgbtqiaAffirming) {
      score += 7;
    }
    
    // Experience bonus
    if (therapist.yearsExperience) {
      score += Math.min(therapist.yearsExperience, 20) * 0.5;
    }
    
    return score;
  };

  const loadTherapists = async () => {
    try {
      setLoading(true);
      const questionnaireData = await AsyncStorage.getItem('th.onboard');
      const clientId = await AsyncStorage.getItem('th.clientId');
      const coupleId = (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId)) || null;
      const data = questionnaireData ? JSON.parse(questionnaireData) : {};

      const routeCoupleId = route.params?.coupleId;
      const resolvedCoupleId = routeCoupleId || coupleId || data.coupleId;

      if (resolvedCoupleId || data.therapyType === 'couples' || route.params?.therapyType === 'couples') {
        const id = resolvedCoupleId;
        const couple = await loadCouple(id);
        setCoupleProfile(couple);
        const uid = await getStoredUserId();
        const pk = couple?.partnerA?.authUid === uid ? 'partnerA' : couple?.partnerB?.authUid === uid ? 'partnerB' : null;
        setMyPartnerKey(pk);

        if (!canBrowseTherapists(couple)) {
          setCoupleBlocked(true);
          setTherapists([]);
          setLoading(false);
          return;
        }
        setCoupleBlocked(false);

        const match = await getCoupleMatchedTherapists(id);
        setAvailabilityOverlap(match.availabilityOverlap !== false);
        const list = (match.therapists || []).map((t) => ({
          ...t,
          score: t.matchScore || 50,
        }));
        setTherapists(list);
        setLoading(false);
        return;
      }

      const allTherapistsRaw = await api('/api/v1/therapists').catch(() => []);
      const allTherapists = Array.isArray(allTherapistsRaw) ? allTherapistsRaw : [];
      // Only exclude a therapist on a *definite* mismatch. These filters used to read
      // `t.type` (the API returns `therapyType`) and treated a therapist with no
      // recorded gender / religion / affirming flag as a mismatch — so a single stated
      // preference emptied the whole list and the screen rendered no names at all.
      // Preference strength is already expressed by calculateRelevanceScore ranking.
      const matchesPreference = (value, pref) => {
        if (!pref) return true;
        if (value == null || value === '') return true; // unknown → don't exclude
        return String(value).toLowerCase() === String(pref).toLowerCase();
      };
      const filtered = allTherapists.filter((t) => {
        // Therapy modality (individual/couples/teen) is its own axis — do NOT fold
        // specialization/specialties in here, or a therapist listed under "Anxiety"
        // gets excluded from individual therapy.
        //
        // `t.type` is NOT a modality: promoting a therapist to admin stores
        // type='Administrator', which matched no modality and silently removed
        // them from every client's match list. Read therapyType only.
        const therapistType = String(t.therapyType || '').toLowerCase();
        const typeMatch =
          !data.therapyType || !therapistType || therapistType.includes(String(data.therapyType).toLowerCase());
        const religionMatch =
          data.preferChristianTherapist !== 'Yes' || matchesPreference(t.religion, 'christianity');
        const genderPref = data.therapistGender === 'No preference' ? null : data.therapistGender;
        const genderMatch = matchesPreference(t.gender, genderPref);
        const lgbtqiaMatch =
          data.lgbtqia !== 'Yes, this is important to me' ||
          t.lgbtqiaAffirming == null ||
          t.lgbtqiaAffirming === true ||
          String(t.lgbtqiaAffirming).toLowerCase() === 'true';
        return typeMatch && religionMatch && genderMatch && lgbtqiaMatch;
      });
      const scored = filtered.map((t) => ({ ...t, score: calculateRelevanceScore(t, data) }));
      scored.sort((a, b) => b.score - a.score);
      setTherapists(scored);
    } catch (error) {
      console.error('Error loading therapists:', error);
      setTherapists([]);
    } finally {
      setLoading(false);
    }
  };

  const chooseTherapist = async (therapist) => {
    try {
      const clientId = await AsyncStorage.getItem('th.clientId');
      const coupleId =
        coupleProfile?.id || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));

      if (coupleId && coupleProfile) {
        const proposal = coupleProfile.therapistProposal;
        if (proposal?.status === 'pending' && proposal.proposedBy !== myPartnerKey) {
          await confirmCoupleTherapist(coupleId, true);
          Alert.alert('Confirmed', 'Your couple therapist has been confirmed.');
          navigation.replace('Main');
          return;
        }
        await proposeCoupleTherapist(coupleId, therapist.id, therapist.name || therapist.displayName);
        Alert.alert(
          'Proposal sent',
          'Your partner will be asked to confirm this therapist before assignment is final.',
        );
        navigation.replace('CoupleDashboard', { coupleId });
        return;
      }

      // Individual therapy: hand the chosen therapist to Payment so the client is
      // charged that therapist's own session rate. The assignment is written after
      // payment succeeds — choosing someone is not the same as booking them.
      navigation.navigate('Payment', {
        therapist: {
          id: therapist.id,
          name: therapist.name || therapist.fullName || therapist.displayName || 'Therapist',
          specialization: therapist.specialization || therapist.therapyType || '',
          sessionRate: therapistRate(therapist),
          photoURL: therapist.photoURL || null,
        },
        clientId,
      });
    } catch (error) {
      console.error('Error assigning therapist:', error);
      Alert.alert('Error', 'There was an error assigning your therapist. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading therapists...</Text>
      </View>
    );
  }

  const pendingProposal =
    coupleProfile?.therapistProposal?.status === 'pending' ? coupleProfile.therapistProposal : null;
  const awaitingMyConfirm = pendingProposal && pendingProposal.proposedBy !== myPartnerKey;

  if (coupleBlocked) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Therapist selection locked</Text>
        <Text style={styles.subtitle}>
          Complete both partners intake, consent, and couple payment before browsing therapists.
        </Text>
        <TouchableOpacity style={styles.selectButton} onPress={() => navigation.replace('CoupleDashboard', { coupleId: coupleProfile?.id })}>
          <Text style={styles.selectButtonText}>View couple status</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>
        {coupleProfile ? 'Choose your couple therapist' : 'Choose your therapist'}
      </Text>
      <Text style={styles.subtitle}>
        {awaitingMyConfirm
          ? `Your partner proposed ${pendingProposal.therapistName}. Confirm below.`
          : coupleProfile
            ? 'One therapist for both — your partner must confirm your selection'
            : 'We matched options based on your preferences'}
      </Text>

      {/* Escape hatch, matching web and the medical patient flow: go to the
          dashboard now and choose a therapist later. Couples can't skip — that
          flow needs both partners on one therapist. */}
      {!coupleProfile ? (
        <TouchableOpacity onPress={() => navigation.replace('Main')} style={styles.skipLink}>
          <Text style={styles.skipLinkText}>Skip for now — I'll choose a therapist later</Text>
        </TouchableOpacity>
      ) : null}

      {coupleProfile && !availabilityOverlap ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            No overlapping availability detected. Consider updating your availability in intake or choose the closest match.
          </Text>
        </View>
      ) : null}

      {awaitingMyConfirm ? (
        <TouchableOpacity
          style={[styles.selectButton, { marginBottom: 20 }]}
          onPress={() => chooseTherapist({ id: pendingProposal.therapistId, name: pendingProposal.therapistName })}
        >
          <Text style={styles.selectButtonText}>Confirm {pendingProposal.therapistName}</Text>
        </TouchableOpacity>
      ) : null}

      {therapists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No matches found. We'll assign the best available therapist shortly.</Text>
        </View>
      ) : (
        <View style={styles.therapistsList}>
          {therapists.map((therapist) => (
            <TouchableOpacity
              key={therapist.id}
              style={styles.therapistCard}
              onPress={() => chooseTherapist(therapist)}
            >
              <View style={styles.therapistHeader}>
                {therapist.photoURL ? (
                  <Image source={{ uri: resolveFileUrl(therapist.photoURL) }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>🧑‍⚕️</Text>
                  </View>
                )}
                <View style={styles.therapistInfo}>
                  <Text style={styles.therapistName}>
                    {therapist.name || therapist.fullName || therapist.displayName || 'Therapist'}
                  </Text>
                  <Text style={styles.therapistType}>
                    {therapist.therapyType || therapist.type || therapist.specialization || 'Therapist'}
                  </Text>
                  {therapist.yearsExperience && (
                    <Text style={styles.therapistExp}>{therapist.yearsExperience} years experience</Text>
                  )}
                </View>
              </View>
              {therapist.specialties && therapist.specialties.length > 0 && (
                <Text style={styles.specialties}>
                  Specialties: {Array.isArray(therapist.specialties) ? therapist.specialties.join(', ') : therapist.specialties}
                </Text>
              )}
              {therapist.languagesSpoken && therapist.languagesSpoken.length > 0 && (
                <Text style={styles.languages}>
                  Languages: {Array.isArray(therapist.languagesSpoken) ? therapist.languagesSpoken.join(', ') : therapist.languagesSpoken}
                </Text>
              )}
              <View style={styles.therapistRateRow}>
                {therapistRate(therapist) != null ? (
                  <PriceTag
                    quote={quotes[therapist.id || therapist.uid]}
                    baseAmount={therapistRate(therapist)}
                    suffix=" / session"
                    size="sm"
                  />
                ) : (
                  <Text style={styles.rateMissing}>Rate not published</Text>
                )}
              </View>
              {therapist.score && (
                <View style={styles.matchScore}>
                  <Text style={styles.matchScoreText}>Match: {Math.round(therapist.score)}%</Text>
                </View>
              )}
              {!awaitingMyConfirm ? (
                <TouchableOpacity style={styles.selectButton} onPress={() => chooseTherapist(therapist)}>
                  <Text style={styles.selectButtonText}>
                    {coupleProfile ? 'Propose This Therapist' : 'Select This Therapist'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  therapistsList: {
    gap: 16,
  },
  therapistCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  therapistHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 30,
  },
  therapistInfo: {
    flex: 1,
  },
  therapistName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  therapistType: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  therapistExp: {
    fontSize: 12,
    color: Colors.textLight,
  },
  therapistRate: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  // A View, so it carries spacing only — font props on a View are ignored and
  // warn in development.
  therapistRateRow: { marginBottom: 8 },
  rateMissing: { fontSize: 14, color: Colors.textSecondary },
  specialties: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  languages: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  matchScore: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  matchScoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  selectButton: {
    backgroundColor: Colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  skipLink: { alignSelf: 'flex-start', marginBottom: 16 },
  skipLinkText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  warnBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  warnText: { color: '#92400e', fontSize: 14, lineHeight: 20 },
});

export default MatchTherapistScreen;
