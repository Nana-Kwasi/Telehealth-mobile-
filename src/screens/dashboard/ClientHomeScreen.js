import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchClientData, getCachedClientData, getCachedTherapistData } from '../../services/clientDataService';
import { api } from '../../services/apiClient';
import { Colors } from '../../constants/colors';
import { buildProgressMetrics, overallProgressScore } from '../../utils/clientDashboardMetrics';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';
import WeatherCardMobile from '../../components/WeatherCardMobile';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../utils/locationProfile';

const { width } = Dimensions.get('window');

async function resolveMoodClientId(client) {
  return (await AsyncStorage.getItem('th.clientId')) || client?.id || (await AsyncStorage.getItem('th.userId'));
}

const chartConfig = {
  backgroundColor: Colors.surface,
  backgroundGradientFrom: Colors.surface,
  backgroundGradientTo: Colors.surface,
  decimalPlaces: 0,
  color: (opacity = 1) => Colors.primary,
  labelColor: () => Colors.textSecondary,
  style: { borderRadius: 12 },
};

function calculateTherapyProgress(therapyNotes) {
  if (!therapyNotes || therapyNotes.length === 0) {
    return { overallProgress: 0 };
  }
  const baseProgress = Math.min(50, therapyNotes.length * 5);
  const moodMultipliers = {
    'Depressed': 0.2, 'Sad': 0.3, 'Anxious': 0.4, 'Stressed': 0.5, 'Angry': 0.4,
    'Neutral': 0.7, 'Calm': 0.9, 'Hopeful': 0.95, 'Optimistic': 1.0, 'Excited': 1.0
  };
  const progressMultipliers = {
    'Worsened': 0.1, 'Slight Decline': 0.3, 'No Change': 0.5, 'Slight Improvement': 0.8,
    'Improved': 1.0, 'Significantly Improved': 1.2
  };
  let totalMood = 0, totalProgress = 0, totalRating = 0, validNotes = 0;
  therapyNotes.forEach(note => {
    if (note.mood && moodMultipliers[note.mood] !== undefined) {
      totalMood += moodMultipliers[note.mood];
      validNotes++;
    }
    if (note.progressAssessment && progressMultipliers[note.progressAssessment] !== undefined) {
      totalProgress += progressMultipliers[note.progressAssessment];
    }
    if (note.moodRating >= 1 && note.moodRating <= 10) totalRating += note.moodRating / 10;
  });
  const avgMood = validNotes > 0 ? totalMood / validNotes : 0.5;
  const avgProgress = validNotes > 0 ? totalProgress / validNotes : 0.5;
  const avgRating = validNotes > 0 ? totalRating / validNotes : 0.5;
  const qualityMultiplier = Math.max(0.1, Math.min(1.5,
    avgMood * 0.4 + avgProgress * 0.4 + avgRating * 0.2
  ));
  const monthsInTherapy = therapyNotes.length / 4;
  const timeBonus = Math.min(20, monthsInTherapy * 1);
  let consistencyBonus = 0;
  if (therapyNotes.length >= 3) {
    const recent = therapyNotes.slice(-3);
    const positiveCount = recent.filter(note =>
      (note.mood && ['Calm', 'Hopeful', 'Optimistic', 'Excited'].includes(note.mood)) ||
      (note.progressAssessment && ['Improved', 'Significantly Improved'].includes(note.progressAssessment)) ||
      (note.moodRating && note.moodRating >= 7)
    ).length;
    consistencyBonus = (positiveCount / 3) * 10;
  }
  const rawProgress = baseProgress + timeBonus + consistencyBonus;
  const finalProgress = Math.round(rawProgress * qualityMultiplier);
  return { overallProgress: Math.max(0, Math.min(100, finalProgress)) };
}

const CRISIS_HOTLINES = [
  // Ghana national crisis and emergency lines — the previous list was US-only
  // (988 / 741741 / 911) and unreachable from Ghana.
  { name: 'National Emergency — 112', desc: 'Police, ambulance & fire · 24/7 toll-free', tel: '112', icon: 'warning-outline' },
  { name: 'Mental Health Authority Helpline', desc: '0509 405 480 · 24/7 crisis counselling', tel: '+233509405480', icon: 'call-outline' },
  { name: 'Suicide Prevention (Ghana)', desc: '0244 846 701 · trained volunteers', tel: '+233244846701', icon: 'heart-outline' },
  { name: 'National Ambulance — 193', desc: 'Ambulance dispatch, nationwide', tel: '193', icon: 'medkit-outline' },
  { name: 'Accra Psychiatric Hospital', desc: '030 266 6987 · emergency psychiatric care', tel: '+233302666987', icon: 'business-outline' },
];

const MOOD_OPTIONS = [
  { emoji: '😄', label: 'Great', value: 9 },
  { emoji: '😊', label: 'Good', value: 7 },
  { emoji: '😐', label: 'Okay', value: 5 },
  { emoji: '😔', label: 'Low', value: 3 },
  { emoji: '😢', label: 'Sad', value: 2 },
  { emoji: '😰', label: 'Anxious', value: 4 },
];

const ClientHomeScreen = ({ navigation }) => {
  const [clientData, setClientData] = useState(null);
  // The signed-in account's name — the same source the drawer uses. Kept separate
  // because the patient-profile row returns a blank name for therapy clients.
  const [sessionName, setSessionName] = useState('');
  const [locationProfile, setLocationProfile] = useState(null);
  const [therapistData, setTherapistData] = useState(null);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [clientGoals, setClientGoals] = useState([]);
  const [progressMetrics, setProgressMetrics] = useState([]);
  const [progressScore, setProgressScore] = useState(0);
  const [nextSession, setNextSession] = useState(null);
  const [scheduledDates, setScheduledDates] = useState(new Set());
  const [sessionsByMonth, setSessionsByMonth] = useState([]);
  const [moodTrendData, setMoodTrendData] = useState([]);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [allScheduledCalls, setAllScheduledCalls] = useState([]);
  const [selectedDateForModal, setSelectedDateForModal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const snapshotUnsubRef = useRef(null);

  // Emergency modal
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  // Mood check-in
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [moodStep, setMoodStep] = useState(0); // 0=emoji, 1=journal
  const [selectedMood, setSelectedMood] = useState(null);
  const [moodJournal, setMoodJournal] = useState('');
  const [submittingMood, setSubmittingMood] = useState(false);

  // Mood distribution (pie chart)
  const [moodDistribution, setMoodDistribution] = useState([]);
  const [moodEntries, setMoodEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const token = await AsyncStorage.getItem('th.token');
      if (!token) { setIsLoading(false); return; }
      try {
        await loadDashboardData();
        const clientId = await AsyncStorage.getItem('th.clientId') || await AsyncStorage.getItem('th.userId');
        const pollNextSession = async () => {
          if (cancelled) return;
          try {
            const calls = await api(`/api/v1/scheduled-calls?clientId=${clientId}`);
            const sessions = (Array.isArray(calls) ? calls : [])
              .filter(s => s.status === 'scheduled' && new Date(s.scheduledTime || s.scheduledAt || s.startsAt) >= new Date())
              .sort((a, b) => new Date(a.scheduledTime || a.scheduledAt || a.startsAt) - new Date(b.scheduledTime || b.scheduledAt || b.startsAt));
            if (!cancelled) setNextSession(sessions.length > 0 ? sessions[0] : null);
          } catch {}
        };
        pollNextSession();
        snapshotUnsubRef.current = setInterval(pollNextSession, 30_000);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setIsLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
      if (snapshotUnsubRef.current) clearInterval(snapshotUnsubRef.current);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      let client = getCachedClientData();
      if (!client) client = await fetchClientData();
      setClientData(client);
      const uid = await AsyncStorage.getItem('th.userId');
      let storedProfile = null;
      try {
        const profileStr = await AsyncStorage.getItem('userProfile');
        storedProfile = profileStr ? JSON.parse(profileStr) : null;
      } catch {
        storedProfile = null;
      }
      const authLoc = uid ? await fetchAuthLocationProfile(uid) : null;
      setLocationProfile(mergeLocationProfile(storedProfile, authLoc, client));
      setSessionName(
        storedProfile?.fullName || storedProfile?.name || storedProfile?.displayName || '',
      );
      // Prefer the therapist just resolved from the server; only fall back to the
      // device cache. The other order let a stale cache (or its absence) decide,
      // so a freshly-assigned therapist never appeared.
      const therapist = client?.therapist || getCachedTherapistData();
      setTherapistData(therapist || null);

      const clientId = await AsyncStorage.getItem('th.clientId') || client?.id || await AsyncStorage.getItem('th.userId');
      if (!clientId) {
        setIsLoading(false);
        return;
      }

      let notes = [];
      try {
        const notesData = await api(`/api/v1/clinical-notes?clientId=${clientId}&visibleOnly=true`);
        notes = Array.isArray(notesData) ? notesData : [];
        setTherapyNotes(notes);
      } catch (e) {
        console.error('Error fetching therapy notes:', e);
      }

      const allCallsData = await api(`/api/v1/scheduled-calls?clientId=${clientId}`).catch(() => []);
      const allCalls = Array.isArray(allCallsData) ? allCallsData : [];
      setAllScheduledCalls(allCalls);
      const completedCount = allCalls.filter(c => (c.status || '').toLowerCase() === 'completed').length;
      const upcomingCount = allCalls.filter(c => ['scheduled', 'pending', 'confirmed'].includes((c.status || '').toLowerCase())).length;
      // Sessions COMPLETED, not notes written. Counting notes made this tile read 1
      // while the web dashboard read 0 for the same client — a therapist writing two
      // notes about one session is not two sessions.
      setSessionsCompleted(completedCount);
      setUpcomingCount(upcomingCount);

      // Treatment goals — the client home screen showed none at all.
      const goalsData = await api(`/api/v1/therapy-management/goals?clientId=${clientId}`).catch(() => []);
      const goals = Array.isArray(goalsData) ? goalsData : [];
      setClientGoals(goals);

      // One shared metric model with the web dashboard, so the two cannot drift.
      const moodRows = await api(`/api/v1/therapy-engagement/clients/${clientId}/moods`).catch(() => []);
      const metrics = buildProgressMetrics({
        moodEntries: Array.isArray(moodRows) ? moodRows : [],
        notes,
        goals,
        sessions: allCalls,
      });
      setProgressMetrics(metrics);
      setProgressScore(overallProgressScore(metrics));

      const datesSet = new Set();
      const now = new Date();
      const monthCounts = {};
      const currentYear = now.getFullYear();
      for (let m = 0; m <= now.getMonth() + 1; m++) {
        const d = new Date(currentYear, m, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthCounts[key] = { month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), completed: 0, new: 0 };
      }
      allCalls.forEach(call => {
        const t = call.scheduledTime?.toDate?.() || call.scheduledTime;
        if (t) {
          const d = new Date(t);
          datesSet.add(d.toISOString().split('T')[0]);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const status = (call.status || '').toLowerCase();
          if (monthCounts[key]) {
            if (status === 'completed') monthCounts[key].completed += 1;
            else if (status === 'scheduled' || status === 'pending' || status === 'confirmed') monthCounts[key].new += 1;
          }
        }
      });
      notes.forEach(note => {
        const d = note.sessionDate ? new Date(note.sessionDate) : null;
        if (d) datesSet.add(d.toISOString().split('T')[0]);
      });
      setScheduledDates(datesSet);
      setSessionsByMonth(
        Object.entries(monthCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v)
      );

      const moodTrend = notes
        .slice(-10)
        .map((n, i) => ({
          session: i + 1,
          mood: n.moodRating ?? 5,
          label: `S${i + 1}`,
        }));
      setMoodTrendData(moodTrend);

      const upcoming = allCalls
        .filter(s => s.status === 'scheduled')
        .map(s => ({ ...s, scheduledTime: s.scheduledTime?.toDate?.() || s.scheduledTime }))
        .filter(s => new Date(s.scheduledTime) >= now)
        .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
      setNextSession(upcoming.length > 0 ? upcoming[0] : null);

      await loadMoodDistribution(await resolveMoodClientId(client));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const onRefresh = async () => {
    const token = await AsyncStorage.getItem('th.token');
    if (!token) { setRefreshing(false); return; }
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const getCalendarDays = () => {
    const y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(first);
    start.setDate(start.getDate() - first.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(start));
      start.setDate(start.getDate() + 1);
    }
    return days;
  };
  const isScheduledDay = (date) => scheduledDates.has(date.toISOString().split('T')[0]);
  const isCurrentMonthDay = (date) => date.getMonth() === calendarMonth.getMonth();
  const isToday = (date) => {
    const t = new Date();
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
  };
  const getSessionsForDate = (dateStr) => {
    return allScheduledCalls.filter(call => {
      const t = call.scheduledTime?.toDate?.() || call.scheduledTime;
      return t && new Date(t).toISOString().split('T')[0] === dateStr;
    });
  };
  const formatTimeOnly = (timestamp) => {
    const d = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Check if mood check-in is due (once per day)
  useEffect(() => {
    const checkMoodDue = async () => {
      const last = await AsyncStorage.getItem('lastMoodCheck');
      if (!last) { setShowMoodModal(true); return; }
      const lastDate = new Date(last).toDateString();
      if (lastDate !== new Date().toDateString()) setShowMoodModal(true);
    };
    checkMoodDue();
  }, []);

  const handleMoodSubmit = async () => {
    if (!selectedMood) return;
    setSubmittingMood(true);
    try {
      const moodClientId = await resolveMoodClientId(clientData);
      const therapistId = clientData?.assignedTherapistId || clientData?.assignedTherapist || therapistData?.id || null;

      await api('/api/v1/therapy-engagement/clients/moods', {
        method: 'POST',
        body: {
          clientId: moodClientId,
          therapistId,
          moodScore: selectedMood.value,
          notes: `${selectedMood.label}: ${moodJournal}`,
        },
      });
      await AsyncStorage.setItem('lastMoodCheck', new Date().toISOString());
      setShowMoodModal(false);
      setMoodStep(0);
      setSelectedMood(null);
      setMoodJournal('');
      if (moodClientId) await loadMoodDistribution(moodClientId);
      Alert.alert('Mood Saved', 'Your mood check-in has been recorded.');
    } catch (err) {
      console.error('Mood submit error:', err);
    } finally {
      setSubmittingMood(false);
    }
  };

  const loadMoodDistribution = async (clientId) => {
    try {
      const moodData = await api(`/api/v1/therapy-engagement/clients/${clientId}/moods`);
      const moodList = Array.isArray(moodData) ? moodData : [];
      // Keep the raw rows too — the progress metrics need the 1-10 readings, not
      // just the chart's per-label counts.
      setMoodEntries(moodList);
      const counts = {};
      moodList.forEach(d => {
        const label = (d.notes || '').split(':')[0] || 'Unknown';
        counts[label] = (counts[label] || 0) + 1;
      });
      const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
      const dist = Object.entries(counts).map(([label, count], i) => ({
        name: label,
        population: count,
        color: colors[i % colors.length],
        legendFontColor: '#374151',
        legendFontSize: 12,
      }));
      setMoodDistribution(dist);
    } catch (e) {
      console.error('Mood distribution load error:', e);
    }
  };

  const handleCrisisCall = (hotline) => {
    if (hotline.sms) {
      Linking.openURL(`sms:${hotline.sms}${hotline.body ? `?body=${hotline.body}` : ''}`);
    } else {
      Linking.openURL(`tel:${hotline.tel}`);
    }
  };

  const quickActions = [
    { icon: 'chatbubbles-outline', label: 'Messages', screen: 'Messages', color: Colors.primary },
    { icon: 'videocam-outline', label: 'Video Call', screen: 'Video', color: '#10B981' },
    { icon: 'calendar-outline', label: 'Book Session', screen: 'Schedule', color: '#F59E0B' },
    { icon: 'book-outline', label: 'Resources', screen: 'Resources', color: '#8B5CF6' },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back!</Text>
          {/* The patient profile returns an empty fullName for therapy clients —
              the name lives on the user account, which is what the drawer reads.
              Fall through the same chain here so the greeting matches. */}
          <Text style={styles.name}>
            {clientData?.name || clientData?.fullName || sessionName || 'Client'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.moodCheckBtn} onPress={() => setShowMoodModal(true)}>
            <Ionicons name="happy-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <LocationSummaryCardMobile
        profile={locationProfile || clientData}
        onEdit={() => navigation.navigate('Settings')}
      />
      {/* Conditions at that same saved location — it follows the coordinates,
          so updating the location updates the weather. */}
      <WeatherCardMobile profile={locationProfile || clientData} />

      {clientData?.coupleId ? (
        <TouchableOpacity
          style={styles.coupleBanner}
          onPress={() => navigation.navigate('CoupleDashboard', { coupleId: clientData.coupleId })}
        >
          <Ionicons name="people" size={20} color="#047857" />
          <Text style={styles.coupleBannerText}>Couple therapy hub — shared status & therapist</Text>
          <Ionicons name="chevron-forward" size={18} color="#047857" />
        </TouchableOpacity>
      ) : null}

      {/* Emergency Banner */}
      <TouchableOpacity style={styles.emergencyBanner} onPress={() => setShowEmergencyModal(true)} activeOpacity={0.85}>
        <Ionicons name="warning" size={18} color="#dc2626" />
        <Text style={styles.emergencyBannerText}>In crisis? Tap for immediate help</Text>
        <Ionicons name="chevron-forward" size={18} color="#dc2626" />
      </TouchableOpacity>

      {/* Emergency Modal */}
      <Modal visible={showEmergencyModal} transparent animationType="slide" onRequestClose={() => setShowEmergencyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.emergencyModal}>
            <View style={styles.emergencyModalHeader}>
              <Ionicons name="warning" size={28} color="#dc2626" />
              <Text style={styles.emergencyModalTitle}>Crisis & Emergency Support</Text>
              <TouchableOpacity onPress={() => setShowEmergencyModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.emergencyModalSubtitle}>You are not alone. Reach out now:</Text>
            {CRISIS_HOTLINES.map((h, i) => (
              <TouchableOpacity key={i} style={styles.hotlineRow} onPress={() => handleCrisisCall(h)}>
                <View style={styles.hotlineIcon}>
                  <Ionicons name={h.icon} size={22} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hotlineName}>{h.name}</Text>
                  <Text style={styles.hotlineDesc}>{h.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.messageTherapistBtn} onPress={() => { setShowEmergencyModal(false); navigation.navigate('Messages'); }}>
              <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
              <Text style={styles.messageTherapistText}>Message My Therapist</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Mood Check-in Modal */}
      <Modal visible={showMoodModal} transparent animationType="slide" onRequestClose={() => setShowMoodModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.moodModal}>
            <Text style={styles.moodModalTitle}>Daily Mood Check-in</Text>
            <Text style={styles.moodModalSubtitle}>How are you feeling today?</Text>
            {moodStep === 0 ? (
              <>
                <View style={styles.moodGrid}>
                  {MOOD_OPTIONS.map((m, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.moodOption, selectedMood?.label === m.label && styles.moodOptionSelected]}
                      onPress={() => setSelectedMood(m)}
                    >
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={styles.moodLabel}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.moodModalFooter}>
                  <TouchableOpacity style={styles.moodSkipBtn} onPress={async () => { await AsyncStorage.setItem('lastMoodCheck', new Date().toISOString()); setShowMoodModal(false); }}>
                    <Text style={styles.moodSkipText}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.moodNextBtn, !selectedMood && styles.moodNextBtnDisabled]} onPress={() => selectedMood && setMoodStep(1)}>
                    <Text style={styles.moodNextText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.moodJournalLabel}>Anything on your mind? (optional)</Text>
                <TextInput
                  style={styles.moodJournalInput}
                  multiline
                  numberOfLines={4}
                  placeholder="Write your thoughts..."
                  value={moodJournal}
                  onChangeText={setMoodJournal}
                  textAlignVertical="top"
                />
                <View style={styles.moodModalFooter}>
                  <TouchableOpacity style={styles.moodSkipBtn} onPress={() => setMoodStep(0)}>
                    <Text style={styles.moodSkipText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.moodNextBtn} onPress={handleMoodSubmit} disabled={submittingMood}>
                    {submittingMood ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.moodNextText}>Submit</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Therapist Card */}
      {therapistData && (
        <TouchableOpacity 
          style={styles.therapistCard}
          onPress={() => navigation.navigate('Messages')}
        >
          <Ionicons name="person-circle" size={48} color={Colors.primary} />
          <View style={styles.therapistInfo}>
            <Text style={styles.therapistLabel}>Your Therapist</Text>
            <Text style={styles.therapistName}>{therapistData.name || 'Not assigned'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* No therapist yet → route back into selection, the same way a medical
          patient who skipped doctor booking gets a "Find a Doctor" CTA.
          Deliberately the exact inverse of the card above: gating this on
          coupleId as well meant a client carrying a stale cached coupleId saw
          NEITHER card and had no way back to therapist selection. MatchTherapist
          handles the couple flow itself, so sending couples there is safe. */}
      {!therapistData && (
        <TouchableOpacity
          style={styles.findTherapistCard}
          onPress={() => navigation.navigate('MatchTherapist')}
        >
          <Ionicons name="search-circle" size={48} color={Colors.primary} />
          <View style={styles.therapistInfo}>
            <Text style={styles.therapistLabel}>No therapist yet</Text>
            <Text style={styles.therapistName}>Find a Therapist</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle" size={32} color="#10B981" />
          <Text style={styles.statNumber}>{sessionsCompleted}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="trending-up" size={32} color={Colors.primary} />
          <Text style={styles.statNumber}>{progressScore}%</Text>
          <Text style={styles.statLabel}>Progress</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="calendar" size={32} color="#F59E0B" />
          <Text style={styles.statNumber}>{upcomingCount}</Text>
          <Text style={styles.statLabel}>New schedules</Text>
        </View>
      </View>

      {/* Progress bar (same % as therapist dashboard) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your progress</Text>
        {/* Same four metrics, same maths, as the web dashboard — see
            utils/clientDashboardMetrics.js. A metric with nothing recorded shows
            "—" and says why, rather than a 0% bar that reads as a real score. */}
        {progressMetrics.map((m) => {
          const hasValue = typeof m.value === 'number';
          return (
            <View key={m.key} style={styles.metricRow}>
              <View style={styles.metricHeader}>
                <Text style={styles.metricLabel}>{m.label}</Text>
                <Text style={styles.metricValue}>{hasValue ? `${m.value}%` : '—'}</Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${hasValue ? m.value : 0}%` }]} />
              </View>
              <Text style={styles.metricDetail}>{m.detail}</Text>
            </View>
          );
        })}
      </View>

      {/* Treatment goals — the client home screen showed none at all, even though
          the therapist sets them and the client's own dashboard tile counts them. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your goals</Text>
        {clientGoals.length === 0 ? (
          <Text style={styles.emptyHint}>Your therapist has not set any goals yet.</Text>
        ) : (
          clientGoals.map((g) => {
            const done = String(g.status || '').toLowerCase() === 'completed' || Number(g.progress) >= 100;
            return (
              <View key={g.id} style={styles.goalRow}>
                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={done ? '#10b981' : '#cbd5e1'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.goalRowTitle, done && styles.goalRowTitleDone]}>
                    {g.title || g.goalTitle}
                  </Text>
                  {g.description ? <Text style={styles.goalRowDesc}>{g.description}</Text> : null}
                  {g.targetDate ? <Text style={styles.goalRowMeta}>Target {g.targetDate}</Text> : null}
                </View>
                <Text style={styles.goalRowPct}>{Number(g.progress) || 0}%</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Live calendar - days with sessions marked */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My sessions calendar</Text>
        <View style={styles.calendarCard}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
              <Ionicons name="chevron-forward" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.weekdayRow}>
            {weekDays.map(day => (
              <Text key={day} style={styles.weekdayLabel}>{day}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {getCalendarDays().map((day, i) => {
              const dateStr = day.toISOString().split('T')[0];
              const scheduled = isScheduledDay(day);
              const dayContent = (
                <>
                  <Text style={[
                    styles.calendarDayNum,
                    !isCurrentMonthDay(day) && styles.calendarDayNumOther,
                    scheduled && styles.calendarDayNumScheduled,
                  ]}>
                    {day.getDate()}
                  </Text>
                  {scheduled && <Ionicons name="checkmark" size={12} color="#fff" style={styles.calendarTick} />}
                </>
              );
              const dayStyle = [
                styles.calendarDay,
                !isCurrentMonthDay(day) && styles.calendarDayOther,
                isToday(day) && styles.calendarDayToday,
                scheduled && styles.calendarDayScheduled,
              ];
              return scheduled ? (
                <TouchableOpacity
                  key={i}
                  style={dayStyle}
                  onPress={() => setSelectedDateForModal(dateStr)}
                  activeOpacity={0.7}
                >
                  {dayContent}
                </TouchableOpacity>
              ) : (
                <View key={i} style={dayStyle}>{dayContent}</View>
              );
            })}
          </View>
          <Text style={styles.calendarLegend}>✓ = day with a session (tap for details)</Text>
        </View>
      </View>

      <Modal
        visible={!!selectedDateForModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDateForModal(null)}
      >
        <TouchableOpacity
          style={styles.dateModalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedDateForModal(null)}
        >
          <TouchableOpacity style={styles.dateModalContent} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.dateModalTitle}>
              {selectedDateForModal
                ? new Date(selectedDateForModal + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                : ''}
            </Text>
            {selectedDateForModal && getSessionsForDate(selectedDateForModal).length > 0 ? (
              getSessionsForDate(selectedDateForModal).map((session, idx) => (
                <View key={session.id || idx} style={styles.dateModalSession}>
                  <Text style={styles.dateModalTime}>{formatTimeOnly(session.scheduledTime)}</Text>
                  <Text style={styles.dateModalMeta}>
                    {session.duration ? `${session.duration} min` : ''} • {session.status || 'scheduled'}
                  </Text>
                  {session.therapistName && (
                    <Text style={styles.dateModalTherapist}>Therapist: {session.therapistName}</Text>
                  )}
                  {session.notes ? (
                    <Text style={styles.dateModalNotes} numberOfLines={3}>{session.notes}</Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.dateModalEmpty}>No session details for this date.</Text>
            )}
            <TouchableOpacity
              style={styles.dateModalClose}
              onPress={() => setSelectedDateForModal(null)}
            >
              <Text style={styles.dateModalCloseText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={styles.actionCard}
              onPress={() => navigation.navigate(action.screen)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: `${action.color}20` }]}>
                <Ionicons name={action.icon} size={28} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Charts */}
      {sessionsByMonth.length > 0 && (() => {
        const groupedLabels = sessionsByMonth.flatMap(m => [m.month, '']);
        const groupedData = sessionsByMonth.flatMap(m => [m.completed, m.new]);
        const groupedColors = groupedData.map((_, i) => (opacity = 1) => (i % 2 === 0 ? '#10B981' : '#F59E0B'));
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sessions per month</Text>
            <View style={styles.chartCard}>
              <BarChart
                data={{
                  labels: groupedLabels,
                  datasets: [{ data: groupedData, colors: groupedColors }],
                }}
                width={width - 80}
                height={200}
                chartConfig={{ ...chartConfig, barPercentage: 0.5 }}
                style={styles.chart}
                fromZero
                showBarTops={false}
                yAxisLabel=""
                yAxisSuffix=""
                withCustomBarColorFromData
              />
              <View style={styles.chartLegend}>
                <View style={styles.chartLegendItem}>
                  <View style={[styles.chartLegendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.chartLegendText}>Completed</Text>
                </View>
                <View style={styles.chartLegendItem}>
                  <View style={[styles.chartLegendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.chartLegendText}>New (scheduled/pending)</Text>
                </View>
              </View>
            </View>
          </View>
        );
      })()}
      {moodTrendData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session mood rating (last 10)</Text>
          <View style={styles.chartCard}>
            <LineChart
              data={{
                labels: moodTrendData.map(d => d.label),
                datasets: [{ data: moodTrendData.map(d => d.mood) }],
              }}
              width={width - 80}
              height={200}
              chartConfig={{ ...chartConfig, color: () => '#8B5CF6' }}
              style={styles.chart}
              fromZero
              yAxisSuffix="/10"
              bezier
            />
          </View>
        </View>
      )}

      {/* Daily Mood Distribution Pie Chart */}
      {moodDistribution.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Mood Distribution</Text>
          <View style={styles.chartCard}>
            <PieChart
              data={moodDistribution}
              width={width - 80}
              height={200}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="10"
              center={[0, 0]}
              absolute={false}
            />
          </View>
        </View>
      )}

      {/* Next Session */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Session</Text>
        {nextSession ? (
          <View style={styles.sessionCard}>
            <View style={styles.sessionHeader}>
              <Ionicons name="calendar" size={24} color={Colors.primary} />
              <Text style={styles.sessionDate}>{formatDate(nextSession.scheduledTime)}</Text>
            </View>
            {nextSession.notes && (
              <Text style={styles.sessionNotes} numberOfLines={2}>{nextSession.notes}</Text>
            )}
            <TouchableOpacity
              style={styles.viewDetailsButton}
              onPress={() => navigation.navigate('Schedule')}
            >
              <Text style={styles.viewDetailsText}>View Details</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No upcoming sessions</Text>
            <TouchableOpacity
              style={styles.scheduleButton}
              onPress={() => navigation.navigate('Video')}
            >
              <Text style={styles.scheduleButtonText}>Schedule a Session</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  therapistCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  findTherapistCard: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#a5b4fc',
  },
  therapistInfo: {
    marginLeft: 16,
    flex: 1,
  },
  therapistLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  therapistName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  metricRow: { marginBottom: 14 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  metricLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  metricValue: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  metricDetail: { fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 15 },
  goalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  goalRowTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  goalRowTitleDone: { textDecorationLine: 'line-through', color: '#94a3b8' },
  goalRowDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  goalRowMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  goalRowPct: { fontSize: 12, fontWeight: '700', color: '#6366f1' },
  emptyHint: { fontSize: 13, color: '#94a3b8' },
  progressBarWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  progressBarTrack: {
    height: 12,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 6,
  },
  progressBarLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  calendarCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayLabel: {
    width: (width - 64) / 7,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: (width - 64) / 7,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calendarDayOther: {
    opacity: 0.4,
  },
  calendarDayToday: {
    backgroundColor: `${Colors.primary}20`,
  },
  calendarDayScheduled: {
    backgroundColor: Colors.primary,
  },
  calendarDayNum: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  calendarDayNumOther: {
    color: Colors.textSecondary,
  },
  calendarDayNumScheduled: {
    color: '#fff',
  },
  calendarTick: {
    position: 'absolute',
    bottom: 2,
  },
  calendarLegend: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  dateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dateModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  dateModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  dateModalSession: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  dateModalTime: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  dateModalMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  dateModalTherapist: {
    fontSize: 13,
    color: Colors.text,
    marginTop: 4,
  },
  dateModalNotes: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  dateModalEmpty: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  dateModalClose: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  dateModalCloseText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 12,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
  },
  chartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chartLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chartLegendText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionDate: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 12,
  },
  sessionNotes: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  viewDetailsButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  viewDetailsText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 12,
    marginBottom: 20,
  },
  scheduleButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  scheduleButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  // Header actions
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moodCheckBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Emergency banner
  coupleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  coupleBannerText: { flex: 1, color: '#047857', fontWeight: '600', fontSize: 14 },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  emergencyBannerText: {
    flex: 1,
    color: '#991b1b',
    fontWeight: '600',
    fontSize: 14,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  emergencyModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  emergencyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  emergencyModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  emergencyModalSubtitle: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 16,
  },
  hotlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  hotlineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff1f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hotlineName: {
    fontWeight: '600',
    color: '#1f2937',
    fontSize: 14,
  },
  hotlineDesc: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  messageTherapistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  messageTherapistText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  // Mood modal
  moodModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  moodModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  moodModalSubtitle: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 20,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  moodOption: {
    width: '30%',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  moodOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}12`,
  },
  moodEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  moodModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  moodSkipBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  moodSkipText: {
    color: '#374151',
    fontWeight: '600',
  },
  moodNextBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  moodNextBtnDisabled: {
    backgroundColor: '#9ca3af',
  },
  moodNextText: {
    color: '#fff',
    fontWeight: '600',
  },
  moodJournalLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    marginBottom: 8,
  },
  moodJournalInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    height: 100,
    marginBottom: 20,
  },
});

export default ClientHomeScreen;
