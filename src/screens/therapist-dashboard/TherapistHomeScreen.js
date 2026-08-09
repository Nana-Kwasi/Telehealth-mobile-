import React, { useState, useEffect } from 'react';
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
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/apiClient';
import { calculateClientProgress, progressLabel } from '../../utils/clientProgress';
import { TherapistColors } from '../../constants/colors';
import { LineChart, BarChart } from 'react-native-chart-kit';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';
import TherapistScheduleCallModal from '../../components/therapist/TherapistScheduleCallModal';
import { loadTherapistCalendarClients } from '../../services/therapistCalendarService';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../utils/locationProfile';
import {
  enrichClientRecord,
  getClientDisplayName,
  toFirestoreDate,
} from '../../utils/clientTherapyMetrics';

const { width } = Dimensions.get('window');
const CHART_W = width - 64;
const KPI_CARD_W = 132;

const KPI_NAV = {
  'Active Clients': 'TherapistClients',
  "Today's Sessions": 'TherapistSchedule',
  'Total Sessions': 'TherapistSchedule',
  'Total Notes': 'TherapistNotes',
  'Pending Notes': 'TherapistNotes',
  'Completion Rate': 'TherapistClients',
};

const calDayKey = (year, month, day) => `${year}-${month}-${day}`;

const startOfToday = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

const chartConfig = {
  backgroundColor: '#fff',
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(79,70,229,${opacity})`,
  labelColor: () => TherapistColors.textLight,
  style: { borderRadius: 12 },
  propsForDots: { r: '4', strokeWidth: '2', stroke: TherapistColors.primary },
};

function chartFromMonthly(rows) {
  if (!rows?.length) {
    return { labels: ['—'], datasets: [{ data: [0] }] };
  }
  return {
    labels: rows.map((d) => (d.day || '').slice(0, 8)),
    datasets: [{ data: rows.map((d) => d.sessions || 0) }],
  };
}

function barFromMonthly(rows) {
  if (!rows?.length) {
    return { labels: ['—'], datasets: [{ data: [0] }] };
  }
  return {
    labels: rows.map((d) => (d.day || '').slice(0, 8)),
    datasets: [{ data: rows.map((d) => d.sessions || 0) }],
  };
}

const timeAgo = (date) => {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const TherapistHomeScreen = ({ navigation, profile }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [therapistProfile, setTherapistProfile] = useState(null);
  const [locationProfile, setLocationProfile] = useState(null);
  const [kpis, setKpis] = useState({
    activeClients: 0,
    todaySessions: 0,
    pendingNotes: 0,
    completionRate: 0,
    totalSessions: 0,
    totalNotes: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [clientProgress, setClientProgress] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [calDate, setCalDate] = useState(new Date());
  const [monthAppointmentKeys, setMonthAppointmentKeys] = useState(new Set());
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleModalDate, setScheduleModalDate] = useState(null);
  const [scheduleClients, setScheduleClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [myId, setMyId] = React.useState('');

  const isAdminTherapist =
    profile?.role === 'admin' ||
    profile?.isAdminTherapist === true ||
    therapistProfile?.role === 'admin';

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then(uid => {
      if (uid) { setMyId(uid); loadDashboardData(uid); }
    });
  }, [profile?.role, profile?.isAdminTherapist]);

  const loadDashboardData = async (uid) => {
    const therapistId = uid || myId;
    if (!therapistId) return;
    setIsLoading(true);
    const view = profile?.role === 'admin' || profile?.isAdminTherapist === true || therapistProfile?.role === 'admin';
    await Promise.allSettled([
      loadTherapistProfile(therapistId),
      loadKPIs(view, therapistId),
      loadTodaySchedule(view, therapistId),
      loadUpcomingAppointments(view, therapistId),
      loadClientProgress(view, therapistId),
      loadWeeklyData(view, therapistId),
      loadRecentActivities(view, therapistId),
      loadMonthAppointmentKeys(view, therapistId),
      loadScheduleClientsCache(therapistId),
    ]);
    setIsLoading(false);
    setRefreshing(false);
  };

  const loadScheduleClientsCache = async (therapistId) => {
    try {
      const list = await loadTherapistCalendarClients(therapistId, { lite: true });
      setScheduleClients(list);
    } catch { setScheduleClients([]); }
  };

  const loadTherapistProfile = async (therapistId) => {
    const data = await api(`/api/v1/therapists/${therapistId}`).catch(() => null);
    setTherapistProfile(data);
    const authLoc = await fetchAuthLocationProfile(therapistId);
    setLocationProfile(mergeLocationProfile(profile, authLoc, data));
  };

  const loadKPIs = async (view = false, therapistId) => {
    try {
      // Local date, not UTC — toISOString() rolls over at GMT midnight and would
      // count "today" wrongly for anyone east or west of Greenwich.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`).catch(() => []);
      const activeClients = (Array.isArray(assignments) ? assignments : []).length;

      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`).catch(() => []);
      const allCalls = Array.isArray(calls) ? calls : [];
      // The API field is `scheduledTime`; scheduledAt/startsAt are legacy names
      // that no response carries, so this count was permanently 0 no matter how
      // many sessions were booked for today.
      const sameLocalDay = (raw) => {
        if (!raw) return false;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return false;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === today;
      };
      const todaySessions = allCalls.filter(
        c => String(c.status || '').toLowerCase() !== 'declined'
          && sameLocalDay(c.scheduledTime || c.scheduledAt || c.startsAt),
      ).length;
      const total = allCalls.length;
      const done = allCalls.filter(c => c.status === 'completed').length;
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

      const notes = await api(`/api/v1/clinical-notes?therapistId=${therapistId}`).catch(() => []);
      const noteList = Array.isArray(notes) ? notes : [];
      // Jackson strips the `is` prefix from boolean getters, so the API sends
      // `draft` — `n.isDraft` was undefined and this was always 0 too.
      const pendingNotes = noteList.filter(n => n.draft ?? n.isDraft).length;
      const totalNotes = noteList.length;

      setKpis({
        activeClients,
        todaySessions,
        pendingNotes,
        completionRate,
        totalSessions: total,
        totalNotes,
      });
    } catch (e) {
      console.error('KPI error:', e);
    }
  };

  const loadTodaySchedule = async (view = false, therapistId) => {
    try {
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`).catch(() => []);
      // Local date, not UTC — toISOString() rolls over at GMT midnight and would
      // count "today" wrongly for anyone east or west of Greenwich.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayCalls = (Array.isArray(calls) ? calls : [])
        .filter(c => (c.scheduledAt || c.startsAt || '').startsWith(today))
        .sort((a, b) => new Date(a.scheduledAt || a.startsAt || 0) - new Date(b.scheduledAt || b.startsAt || 0));
      setTodayAppointments(todayCalls);
    } catch (e) { console.error('Today schedule error:', e); }
  };

  const loadUpcomingAppointments = async (view = false, therapistId) => {
    try {
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`).catch(() => []);
      const now = new Date();
      const upcoming = (Array.isArray(calls) ? calls : [])
        .filter(c => new Date(c.scheduledAt || c.startsAt || 0) >= now)
        .sort((a, b) => new Date(a.scheduledAt || a.startsAt || 0) - new Date(b.scheduledAt || b.startsAt || 0))
        .slice(0, 5);
      setUpcomingAppointments(upcoming);
    } catch (e) { console.error('Upcoming appointments error:', e); }
  };

  const loadMonthAppointmentKeys = async (view = false, therapistId) => {
    try {
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`).catch(() => []);
      const keys = new Set();
      (Array.isArray(calls) ? calls : []).forEach(c => {
        const dt = new Date(c.scheduledAt || c.startsAt || 0);
        if (dt.getFullYear() > 1970) keys.add(calDayKey(dt.getFullYear(), dt.getMonth(), dt.getDate()));
      });
      setMonthAppointmentKeys(keys);
    } catch (e) { console.error('Month appointments error:', e); }
  };

  const loadClientProgress = async (view = false, therapistId) => {
    try {
      const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`).catch(() => []);
      const clientIds = (Array.isArray(assignments) ? assignments : []).map(a => a.clientId).filter(Boolean);
      if (clientIds.length === 0) { setClientProgress([]); return; }

      const progressList = [];
      for (const cid of clientIds.slice(0, 6)) {
        try {
          const data = await api(`/api/v1/patients/${cid}`);
          if (!data) continue;
          const enriched = await enrichClientRecord(cid, { id: cid, ...data });
          const noteCount = enriched.noteCount ?? 0;
          // Progress used to be `Math.min(95, 20 + noteCount * 7)` — a count of
          // the notes the THERAPIST had written, which says nothing about how the
          // client is doing and rises even as someone deteriorates. Measure the
          // change in the client's own wellbeing readings instead; null when
          // there aren't enough of them to say anything honest.
          const [moodRows, noteRows] = await Promise.all([
            api(`/api/v1/patients/${cid}/daily-feelings`).catch(() => []),
            api(`/api/v1/clinical-notes?clientId=${cid}`).catch(() => []),
          ]);
          const progressStat = calculateClientProgress(moodRows, noteRows);
          const progress = progressStat ? progressStat.percent : null;
          const lastDt = toFirestoreDate(enriched.lastSession);
          const lastSession = lastDt ? lastDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No sessions yet';
          progressList.push({
            cid, name: enriched.name || getClientDisplayName(enriched), progress,
            progressStat, progressText: progressLabel(progressStat),
            lastSession, noteCount, therapistName: 'Assigned', therapyType: enriched.therapyTypeLabel || 'Not set',
          });
        } catch {}
      }
      setClientProgress(progressList);
    } catch (e) { console.error('Client progress error:', e); }
  };

  const loadWeeklyData = async (view = false, therapistId) => {
    try {
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`).catch(() => []);
      const monthMap = {};
      (Array.isArray(calls) ? calls : []).forEach(c => {
        const dt = new Date(c.scheduledAt || c.startsAt || 0);
        const key = dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (!monthMap[key]) monthMap[key] = { day: key, sessions: 0, notes: 0 };
        monthMap[key].sessions++;
        if (c.status === 'completed') monthMap[key].notes++;
      });
      const monthKeys = Object.keys(monthMap);
      if (monthKeys.length === 0) { setWeeklyData([{ day: 'No sessions yet', sessions: 0, notes: 0 }]); return; }
      setWeeklyData(monthKeys.slice(-12).map(k => monthMap[k]));
    } catch { setWeeklyData([{ day: 'No sessions yet', sessions: 0, notes: 0 }]); }
  };

  const loadRecentActivities = async (view = false, therapistId) => {
    try {
      const activities = [];
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`).catch(() => []);
      (Array.isArray(calls) ? calls : []).slice(0, 5).forEach(c => {
        const dt = new Date(c.scheduledAt || c.startsAt || 0);
        const completed = c.status === 'completed';
        activities.push({
          kind: completed ? 'session_completed' : 'session_scheduled',
          icon: completed ? '✅' : '📅',
          text: `Session with ${c.clientName || 'client'} ${completed ? 'completed' : 'scheduled'}`,
          time: timeAgo(dt), ts: dt.getTime(),
          bg: completed ? '#ecfdf5' : '#eff6ff', border: completed ? '#a7f3d0' : '#bfdbfe', iconBg: completed ? '#d1fae5' : '#dbeafe',
        });
      });
      const notes = await api(`/api/v1/clinical-notes?therapistId=${therapistId}`).catch(() => []);
      (Array.isArray(notes) ? notes : []).slice(0, 3).forEach(n => {
        const dt = new Date(n.createdAt || 0);
        activities.push({
          kind: 'note', icon: '📝', text: `Note saved for client`,
          time: timeAgo(dt), ts: dt.getTime(), bg: '#faf5ff', border: '#e9d5ff', iconBg: '#f3e8ff',
        });
      });
      activities.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setRecentActivities(activities.slice(0, 12));
    } catch (e) { console.error('Recent activities error:', e); }
  };

  const loadNotifications = () => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const uid = await AsyncStorage.getItem('th.userId');
        const notifs = await api(`/api/v1/notifications/events?userId=${uid}&limit=10`).catch(() => []);
        const list = Array.isArray(notifs) ? notifs : [];
        if (!cancelled) {
          setNotifications(list);
          setUnreadNotifications(list.filter(n => !n.read && n.status !== 'read').length);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  };

  const formatTime12 = (timestamp) => {
    const dt = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDateShort = (timestamp) => {
    const dt = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) return 'Today';
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    if (dt.toDateString() === tmrw.toDateString()) return 'Tomorrow';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getSessionStatus = (appt) => {
    if (appt.status === 'completed') return 'completed';
    const dt = appt.scheduledTime?.toDate ? appt.scheduledTime.toDate() : new Date(appt.scheduledTime);
    return dt > new Date() ? 'upcoming' : 'scheduled';
  };

  const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();

  const calCells = () => {
    const total = daysInMonth(calDate);
    const firstDay = firstDayOfMonth(calDate);
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    return cells;
  };

  const greeting = () => {
    const h = currentTime.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  const displayName = therapistProfile?.name || profile?.name || 'Therapist';
  const sessionChart = chartFromMonthly(weeklyData);
  const breakdownChart = barFromMonthly(weeklyData);
  // Grey when there is nothing to report, so "no data" never looks like a score.
  const progressColor = (pct) =>
    (pct === null || pct === undefined) ? '#94a3b8'
      : pct >= 70 ? '#10b981'
      : pct >= 40 ? '#f59e0b'
      : TherapistColors.primary;

  const isPastCalDay = (day) => {
    if (!day) return false;
    const d = new Date(calDate.getFullYear(), calDate.getMonth(), day);
    d.setHours(0, 0, 0, 0);
    return d < startOfToday();
  };

  const handleCalDayPress = (day) => {
    if (!day || isPastCalDay(day)) {
      if (day) Alert.alert('Invalid date', 'You cannot schedule calls in the past.');
      return;
    }
    const date = new Date(calDate.getFullYear(), calDate.getMonth(), day);
    const key = calDayKey(date.getFullYear(), date.getMonth(), date.getDate());
    if (monthAppointmentKeys.has(key)) {
      navigation.navigate('TherapistSchedule');
      return;
    }
    setScheduleModalDate(date);
    setShowScheduleModal(true);
  };

  const visibleActivities = activitiesExpanded
    ? recentActivities
    : recentActivities.slice(0, 5);

  const profilePhoto = therapistProfile?.photoURL || profile?.photoURL;

  const renderProfileAvatar = (size = 48, onPress) => {
    const radius = Math.round(size * 0.29);
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.8 : 1}
        disabled={!onPress}
        style={[styles.avatarCircle, { width: size, height: size, borderRadius: radius }]}
      >
        {profilePhoto ? (
          <Image
            source={{ uri: profilePhoto }}
            style={{ width: size, height: size, borderRadius: radius }}
          />
        ) : (
          <Text style={[styles.avatarLetter, { fontSize: size * 0.42 }]}>
            {displayName[0]?.toUpperCase()}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TherapistColors.primary]} />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingText}>{greeting()},</Text>
            <Text style={styles.nameText}>{displayName}</Text>
            {therapistProfile?.specialization && (
              <Text style={styles.specializationText}>{therapistProfile.specialization}</Text>
            )}
            <Text style={styles.clockText}>
              {currentTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </Text>
            <Text style={styles.dateText}>
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.notifBtn} onPress={() => setShowNotifications(true)}>
              <Ionicons name="notifications-outline" size={22} color="#fff" />
              {unreadNotifications > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
                </View>
              )}
            </TouchableOpacity>
            {renderProfileAvatar(48, () => navigation.navigate('TherapistSettings'))}
          </View>
        </View>
        <View style={styles.todayPill}>
          <Ionicons name="calendar-outline" size={14} color={TherapistColors.primary} />
          <Text style={styles.todayPillText}>
            {kpis.todaySessions === 0
              ? 'No sessions scheduled today'
              : `${kpis.todaySessions} session${kpis.todaySessions > 1 ? 's' : ''} today`}
          </Text>
        </View>
      </View>

      <LocationSummaryCardMobile
        embedded
        profile={locationProfile || mergeLocationProfile(profile, therapistProfile)}
        onEdit={() => navigation.navigate('TherapistSettings')}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.kpiRow}
        style={styles.kpiScroll}
      >
        {[
          { label: 'Active Clients', value: kpis.activeClients, sub: 'Currently assigned', icon: 'people', color: '#3b82f6', bg: '#eff6ff' },
          { label: "Today's Sessions", value: kpis.todaySessions, sub: 'Scheduled today', icon: 'calendar', color: '#10b981', bg: '#f0fdf4' },
          { label: 'Total Sessions', value: kpis.totalSessions, sub: 'All time', icon: 'pulse', color: '#0d9488', bg: '#f0fdfa' },
          { label: 'Total Notes', value: kpis.totalNotes, sub: 'Clinical notes', icon: 'document-text', color: '#6366f1', bg: '#eef2ff' },
          { label: 'Pending Notes', value: kpis.pendingNotes, sub: 'Drafts to complete', icon: 'time', color: '#a855f7', bg: '#fdf4ff' },
          { label: 'Completion Rate', value: `${kpis.completionRate}%`, sub: 'All time', icon: 'trending-up', color: '#f59e0b', bg: '#fffbeb' },
        ].map(({ label, value, sub, icon, color, bg }) => (
          <TouchableOpacity
            key={label}
            style={[styles.kpiCard, { borderTopColor: color }]}
            activeOpacity={0.85}
            onPress={() => KPI_NAV[label] && navigation.navigate(KPI_NAV[label])}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: bg }]}>
              <Ionicons name={`${icon}-outline`} size={18} color={color} />
            </View>
            <Text style={styles.kpiValue}>{value}</Text>
            <Text style={styles.kpiLabel} numberOfLines={2}>
              {label}
            </Text>
            <Text style={styles.kpiSub} numberOfLines={1}>
              {sub}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Today's Schedule</Text>
          <TouchableOpacity onPress={() => navigation.navigate('TherapistSchedule')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {todayAppointments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={32} color={TherapistColors.textLight} />
            <Text style={styles.emptyText}>No sessions scheduled for today</Text>
          </View>
        ) : (
          todayAppointments.map((appt) => {
            const status = getSessionStatus(appt);
            return (
              <View key={appt.id} style={styles.apptItem}>
                <View style={styles.apptTimeBox}>
                  <Text style={styles.apptTime}>{formatTime12(appt.scheduledTime)}</Text>
                  <Text style={styles.apptDateLbl}>Today</Text>
                </View>
                <View style={styles.apptInfo}>
                  <Text style={styles.apptClientName}>{appt.clientName || 'Client'}</Text>
                  <Text style={styles.apptType}>
                    {appt.sessionType || appt.callType || 'Individual'} · {appt.duration || 50}min
                  </Text>
                </View>
                <Ionicons
                  name={status === 'completed' ? 'checkmark-circle' : 'time-outline'}
                  size={20}
                  color={status === 'completed' ? TherapistColors.success : TherapistColors.primary}
                />
              </View>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.calHeader}>
          <TouchableOpacity onPress={() => setCalDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
            <Ionicons name="chevron-back" size={20} color={TherapistColors.text} />
          </TouchableOpacity>
          <Text style={styles.calMonth}>
            {calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => setCalDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
            <Ionicons name="chevron-forward" size={20} color={TherapistColors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.calGrid}>
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <Text key={d} style={styles.calDayLabel}>{d}</Text>
          ))}
          {calCells().map((day, i) => {
            const isToday =
              day &&
              calDate.getMonth() === new Date().getMonth() &&
              calDate.getFullYear() === new Date().getFullYear() &&
              day === new Date().getDate();
            const key = day
              ? calDayKey(calDate.getFullYear(), calDate.getMonth(), day)
              : null;
            const hasAppt = key && monthAppointmentKeys.has(key);
            const isPast = isPastCalDay(day);
            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.calCell,
                  !day && styles.calCellEmpty,
                  isToday && styles.calCellToday,
                  hasAppt && !isToday && styles.calCellHasAppt,
                  isPast && styles.calCellPast,
                ]}
                disabled={!day || isPast}
                onPress={() => handleCalDayPress(day)}
                activeOpacity={0.75}
              >
                {day ? (
                  <>
                    <Text
                      style={[
                        styles.calDayNum,
                        isToday && styles.calDayNumToday,
                        isPast && styles.calDayNumPast,
                      ]}
                    >
                      {day}
                    </Text>
                    {hasAppt && !isToday ? <View style={styles.calDot} /> : null}
                  </>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.calLegend}>
          <View style={styles.calLegendDot} />
          <Text style={styles.calLegendText}>Tap empty day to schedule · dot = has session</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Recent Activity</Text>
          {recentActivities.length > 5 && (
            <TouchableOpacity onPress={() => setActivitiesExpanded((v) => !v)}>
              <Text style={styles.seeAll}>{activitiesExpanded ? 'Show less' : 'See more'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {recentActivities.length === 0 ? (
          <Text style={styles.emptySubtext}>No recent activity yet</Text>
        ) : (
          visibleActivities.map((a, i) => (
            <View
              key={i}
              style={[styles.activityItem, { backgroundColor: a.bg, borderColor: a.border }]}
            >
              <View style={[styles.activityIconWrap, { backgroundColor: a.iconBg }]}>
                <Text style={styles.activityIcon}>{a.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityText}>{a.text}</Text>
                <Text style={styles.activityTime}>{a.time}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Client Progress Overview</Text>
          {clientProgress.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('TherapistClients')}>
              <Text style={styles.seeAll}>Clients</Text>
            </TouchableOpacity>
          )}
        </View>
        {clientProgress.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={32} color={TherapistColors.textLight} />
            <Text style={styles.emptyText}>No client data yet</Text>
            <Text style={styles.emptySubtext}>Progress appears once clients have therapy notes</Text>
          </View>
        ) : (
          clientProgress.map((c) => {
            const color = progressColor(c.progress);
            return (
              <View key={c.cid} style={styles.progressItem}>
                <View style={styles.progressHeader}>
                  <View style={[styles.progressAvatar, { backgroundColor: color }]}>
                    <Text style={styles.progressAvatarText}>{(c.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.progressName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {/* No readings yet means no number — printing 0% or a made-up
                      figure is what made the bar contradict the client. */}
                  <Text style={[styles.progressPct, { color }]}>
                    {c.progress === null || c.progress === undefined ? '—' : `${c.progress}%`}
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${c.progress || 0}%`, backgroundColor: color }]} />
                </View>
                <Text style={styles.progressMetaLine}>
                  Wellbeing: {c.progressText}
                  {c.progressStat ? ` (${c.progressStat.baseline} → ${c.progressStat.latest} of 10)` : ''}
                </Text>
                <Text style={styles.progressMetaLine}>Therapy: {c.therapyType || '—'}</Text>
                <Text style={styles.progressMetaLine}>Therapist: {c.therapistName || '—'}</Text>
                <View style={styles.progressMeta}>
                  <Text style={styles.progressMetaText}>Last: {c.lastSession}</Text>
                  <Text style={styles.progressMetaText}>
                    {c.noteCount} note{c.noteCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Activity (All Time)</Text>
        <Text style={styles.cardHint}>By month</Text>
        <LineChart
          data={sessionChart}
          width={CHART_W}
          height={140}
          chartConfig={chartConfig}
          bezier
          style={{ borderRadius: 10, marginTop: 8 }}
          withDots
          withShadow={false}
          withInnerLines={false}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Breakdown</Text>
        <BarChart
          data={breakdownChart}
          width={CHART_W}
          height={140}
          chartConfig={chartConfig}
          style={{ borderRadius: 10, marginTop: 8 }}
          withInnerLines={false}
          showValuesOnTopOfBars={false}
        />
      </View>

      {upcomingAppointments.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upcoming Sessions</Text>
          {upcomingAppointments.map((appt) => (
            <View key={appt.id} style={styles.upcomingItem}>
              <View style={styles.upcomingAvatar}>
                <Text style={styles.upcomingAvatarText}>{(appt.clientName || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.upcomingClientName}>{appt.clientName || 'Client'}</Text>
                <Text style={styles.upcomingDateTime}>
                  {formatDateShort(appt.scheduledTime)} · {formatTime12(appt.scheduledTime)}
                </Text>
                <Text style={styles.upcomingType}>{appt.sessionType || 'Individual'}</Text>
              </View>
              <View
                style={[
                  styles.upcomingBadge,
                  {
                    backgroundColor:
                      formatDateShort(appt.scheduledTime) === 'Today' ? '#eff6ff' : '#f8fafc',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.upcomingBadgeText,
                    {
                      color:
                        formatDateShort(appt.scheduledTime) === 'Today'
                          ? TherapistColors.primary
                          : TherapistColors.textLight,
                    },
                  ]}
                >
                  {formatDateShort(appt.scheduledTime) === 'Today' ? 'Today' : 'Upcoming'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <TherapistScheduleCallModal
        visible={showScheduleModal}
        initialDate={scheduleModalDate}
        cachedClients={scheduleClients}
        onClose={() => {
          setShowScheduleModal(false);
          setScheduleModalDate(null);
        }}
        onScheduled={() => {
          loadDashboardData();
          loadScheduleClientsCache();
        }}
      />

      <Modal visible={showNotifications} transparent animationType="fade" onRequestClose={() => setShowNotifications(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotifications(false)}>
          <Pressable style={styles.notifPanel} onPress={(e) => e.stopPropagation()}>
            <View style={styles.notifPanelHeader}>
              <Text style={styles.notifPanelTitle}>Notifications</Text>
              {unreadNotifications > 0 && (
                <Text style={styles.notifPanelNew}>{unreadNotifications} new</Text>
              )}
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {notifications.length === 0 ? (
                <Text style={styles.notifEmpty}>No notifications</Text>
              ) : (
                notifications.map((n) => (
                  <View key={n.id} style={[styles.notifRow, !n.read && styles.notifRowUnread]}>
                    <Text style={[styles.notifMsg, !n.read && styles.notifMsgUnread]}>
                      {n.message || n.title}
                    </Text>
                    <Text style={styles.notifTime}>
                      {n.createdAt?.toDate ? timeAgo(n.createdAt.toDate()) : ''}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: TherapistColors.background },
  loadingText: { color: TherapistColors.textSecondary, fontSize: 15, fontWeight: '500' },
  header: {
    backgroundColor: TherapistColors.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  headerRight: { alignItems: 'flex-end', gap: 10 },
  greetingText: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  nameText: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  specializationText: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 },
  clockText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 8 },
  dateText: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  notifBtn: { padding: 8, position: 'relative' },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: '#fff' },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  todayPillText: { fontSize: 13, color: TherapistColors.primary, fontWeight: '600' },
  kpiScroll: { marginTop: 14, marginBottom: 4 },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 4,
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    width: KPI_CARD_W,
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiIconWrap: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  kpiValue: { fontSize: 18, fontWeight: '800', color: TherapistColors.text, marginBottom: 2 },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: TherapistColors.text, lineHeight: 13 },
  kpiSub: { fontSize: 9, color: TherapistColors.textLight, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  cardHint: { fontSize: 11, color: TherapistColors.textLight, marginTop: 2 },
  seeAll: { fontSize: 13, color: TherapistColors.primary, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 14, color: TherapistColors.textLight, fontWeight: '600' },
  emptySubtext: { fontSize: 12, color: TherapistColors.textLight, textAlign: 'center' },
  apptItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  apptTimeBox: { backgroundColor: '#eff6ff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 64, alignItems: 'center' },
  apptTime: { fontSize: 13, fontWeight: '700', color: TherapistColors.primary },
  apptDateLbl: { fontSize: 10, color: TherapistColors.textLight, marginTop: 2 },
  apptInfo: { flex: 1 },
  apptClientName: { fontSize: 14, fontWeight: '600', color: TherapistColors.text },
  apptType: { fontSize: 12, color: TherapistColors.textLight, marginTop: 2 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calMonth: { fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDayLabel: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10, fontWeight: '700', color: TherapistColors.textLight, marginBottom: 6 },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calCellEmpty: { opacity: 0 },
  calCellToday: { backgroundColor: '#eff6ff', borderRadius: 8 },
  calCellHasAppt: { backgroundColor: '#f0fdf4' },
  calCellPast: { backgroundColor: '#e2e8f0' },
  calDayNumPast: { color: '#475569', fontWeight: '600' },
  calDayNum: { fontSize: 13, color: TherapistColors.text, fontWeight: '500' },
  calDayNumToday: { color: TherapistColors.primary, fontWeight: '800' },
  calDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: TherapistColors.primary, marginTop: 2 },
  calLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  calLegendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: TherapistColors.primary },
  calLegendText: { fontSize: 11, color: TherapistColors.textLight },
  upcomingItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  upcomingAvatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: TherapistColors.primary, justifyContent: 'center', alignItems: 'center' },
  upcomingAvatarText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  upcomingClientName: { fontSize: 14, fontWeight: '600', color: TherapistColors.text },
  upcomingDateTime: { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 2 },
  upcomingType: { fontSize: 11, color: TherapistColors.textLight, textTransform: 'capitalize' },
  upcomingBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  upcomingBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  progressItem: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressAvatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  progressName: { flex: 1, fontSize: 14, fontWeight: '600', color: TherapistColors.text },
  progressPct: { fontSize: 14, fontWeight: '800' },
  progressBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, borderRadius: 4 },
  progressMetaLine: { fontSize: 11, color: TherapistColors.textLight, marginTop: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressMetaText: { fontSize: 11, color: TherapistColors.textLight },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIcon: { fontSize: 18, lineHeight: 22 },
  activityText: { fontSize: 13, color: TherapistColors.text, fontWeight: '500', lineHeight: 18 },
  activityTime: { fontSize: 11, color: TherapistColors.textLight, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start', paddingTop: 100, paddingHorizontal: 16 },
  notifPanel: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  notifPanelHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 8 },
  notifPanelTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  notifPanelNew: { fontSize: 12, color: TherapistColors.primary, fontWeight: '600' },
  notifEmpty: { padding: 24, textAlign: 'center', color: TherapistColors.textLight },
  notifRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  notifRowUnread: { backgroundColor: '#f0f7ff' },
  notifMsg: { fontSize: 13, color: '#334155' },
  notifMsgUnread: { fontWeight: '700' },
  notifTime: { fontSize: 11, color: TherapistColors.textLight, marginTop: 4 },
});

export default TherapistHomeScreen;
