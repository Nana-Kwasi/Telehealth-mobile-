import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, getDoc,
  orderBy, limit, Timestamp
} from 'firebase/firestore';
import { TherapistColors } from '../../constants/colors';
import { LineChart, BarChart } from 'react-native-chart-kit';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';

const { width } = Dimensions.get('window');

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

const TherapistHomeScreen = ({ navigation }) => {
  const [therapistProfile, setTherapistProfile] = useState(null);
  const [kpis, setKpis] = useState({ activeClients: 0, todaySessions: 0, pendingNotes: 0, completionRate: 0 });
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [weeklyData, setWeeklyData] = useState({ labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets: [{ data: [0,0,0,0,0,0,0] }] });
  const [recentClients, setRecentClients] = useState([]);
  const [clientProgress, setClientProgress] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadProfile(),
        loadKPIs(),
        loadTodaySchedule(),
        loadUpcoming(),
        loadAllSessionsChart(),
        loadRecentClients(),
        loadClientProgress(),
        loadRecentActivities(),
      ]);
    } catch (e) {
      console.error('TherapistHome load error:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const loadProfile = async () => {
    try {
      const snap = await getDoc(doc(db, 'therapists', currentUser.uid));
      if (snap.exists()) { setTherapistProfile(snap.data()); return; }
      // Fallback: check doctors collection
      const docSnap = await getDoc(doc(db, 'doctors', currentUser.uid));
      if (docSnap.exists()) setTherapistProfile(docSnap.data());
    } catch (e) { console.error('loadProfile error:', e); }
  };

  const loadKPIs = async () => {
    try {
      const clientsSnap = await getDocs(collection(db, 'therapists', currentUser.uid, 'clients'));
      const activeClients = clientsSnap.size;

      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
      const todayQ = query(
        collection(db, 'scheduledCalls'),
        where('therapistId', '==', currentUser.uid),
        where('scheduledTime', '>=', Timestamp.fromDate(todayStart)),
        where('scheduledTime', '<=', Timestamp.fromDate(todayEnd))
      );
      const todaySnap = await getDocs(todayQ);

      let pendingNotes = 0;
      try {
        const notesQ = query(collection(db, 'clinicalNotes'), where('therapistId','==',currentUser.uid), where('isDraft','==',true));
        const notesSnap = await getDocs(notesQ);
        pendingNotes = notesSnap.size;
      } catch (_) {}

      const weekStart = new Date(); weekStart.setDate(weekStart.getDate()-7); weekStart.setHours(0,0,0,0);
      const weekQ = query(collection(db,'scheduledCalls'), where('therapistId','==',currentUser.uid), where('scheduledTime','>=',Timestamp.fromDate(weekStart)));
      const weekSnap = await getDocs(weekQ);
      const done = weekSnap.docs.filter(d=>d.data().status==='completed').length;
      const completionRate = weekSnap.size > 0 ? Math.round((done/weekSnap.size)*100) : 0;

      setKpis({ activeClients, todaySessions: todaySnap.size, pendingNotes, completionRate });
    } catch (e) { console.error('KPI error:', e); }
  };

  const resolveClientName = async (clientId) => {
    if (!clientId) return 'Client';
    try {
      const snap = await getDoc(doc(db, 'clients', clientId));
      if (snap.exists()) {
        const d = snap.data();
        return d.name || d.displayName || d.email || 'Client';
      }
    } catch (_) {}
    return 'Client';
  };

  const loadTodaySchedule = async () => {
    try {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
      const q = query(
        collection(db,'scheduledCalls'),
        where('therapistId','==',currentUser.uid),
        where('scheduledTime','>=',Timestamp.fromDate(todayStart)),
        where('scheduledTime','<=',Timestamp.fromDate(todayEnd)),
        orderBy('scheduledTime','asc')
      );
      const snap = await getDocs(q);
      const appts = await Promise.all(snap.docs.map(async d => {
        const data = { id: d.id, ...d.data() };
        if (!data.clientName && data.clientId) {
          data.clientName = await resolveClientName(data.clientId);
        }
        return data;
      }));
      setTodayAppointments(appts);
    } catch (e) { console.error('Today schedule error:', e); }
  };

  const loadUpcoming = async () => {
    try {
      const q = query(
        collection(db,'scheduledCalls'),
        where('therapistId','==',currentUser.uid),
        where('scheduledTime','>=',Timestamp.fromDate(new Date())),
        orderBy('scheduledTime','asc'),
        limit(5)
      );
      const snap = await getDocs(q);
      const appts = await Promise.all(snap.docs.map(async d => {
        const data = { id: d.id, ...d.data() };
        if (!data.clientName && data.clientId) {
          data.clientName = await resolveClientName(data.clientId);
        }
        return data;
      }));
      setUpcomingAppointments(appts);
    } catch (e) { console.error('Upcoming error:', e); }
  };

  // Load ALL sessions, group by month (last 6 months)
  const loadAllSessionsChart = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'scheduledCalls'), where('therapistId', '==', currentUser.uid), orderBy('scheduledTime', 'asc'))
      );
      const monthCounts = {};
      snap.docs.forEach(d => {
        const dt = d.data().scheduledTime?.toDate?.() || new Date();
        const key = dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthCounts[key] = (monthCounts[key] || 0) + 1;
      });
      const keys = Object.keys(monthCounts).slice(-6);
      if (keys.length === 0) {
        setWeeklyData({ labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ data: [0,0,0,0,0,0] }] });
        return;
      }
      setWeeklyData({ labels: keys, datasets: [{ data: keys.map(k => monthCounts[k] || 0) }] });
    } catch (e) {
      setWeeklyData({ labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ data: [2,4,3,5,4,1] }] });
    }
  };

  const loadClientProgress = async () => {
    try {
      const clientsRef = collection(db, 'therapists', currentUser.uid, 'clients');
      const clientsSnap = await getDocs(clientsRef);
      const ids = clientsSnap.docs.map(d => d.data().clientId).filter(Boolean).slice(0, 6);
      const list = [];
      for (const cid of ids) {
        try {
          const cSnap = await getDoc(doc(db, 'clients', cid));
          if (!cSnap.exists()) continue;
          const cd = cSnap.data();
          const name = cd.name || cd.displayName || cd.email || 'Client';
          // Progress = based on therapy notes count
          let noteCount = 0;
          try {
            const notesSnap = await getDocs(collection(db, 'clients', cid, 'therapyNotes'));
            noteCount = notesSnap.size;
          } catch (_) {}
          const progress = Math.min(95, 20 + noteCount * 7);
          // Last session
          let lastSession = 'No sessions yet';
          try {
            const sQ = query(
              collection(db, 'scheduledCalls'),
              where('therapistId', '==', currentUser.uid),
              where('clientId', '==', cid),
              orderBy('scheduledTime', 'desc'),
              limit(1)
            );
            const sSnap = await getDocs(sQ);
            if (!sSnap.empty) {
              const dt = sSnap.docs[0].data().scheduledTime?.toDate?.() || new Date();
              lastSession = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
          } catch (_) {}
          list.push({ cid, name, progress, lastSession, noteCount });
        } catch (_) {}
      }
      setClientProgress(list);
    } catch (e) { console.error('Client progress error:', e); }
  };

  const loadRecentActivities = async () => {
    try {
      const activities = [];
      const q = query(
        collection(db, 'scheduledCalls'),
        where('therapistId', '==', currentUser.uid),
        orderBy('scheduledTime', 'desc'),
        limit(5)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const data = d.data();
        const dt = data.scheduledTime?.toDate?.() || new Date();
        activities.push({
          icon: '📅',
          text: `Session with ${data.clientName || 'client'} ${data.status === 'completed' ? 'completed' : 'scheduled'}`,
          time: timeAgo(dt),
        });
      });
      try {
        const notesQ = query(
          collection(db, 'clinicalNotes'),
          where('therapistId', '==', currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        const notesSnap = await getDocs(notesQ);
        notesSnap.docs.forEach(d => {
          const data = d.data();
          const dt = data.createdAt?.toDate?.() || new Date();
          activities.push({ icon: '📝', text: `Note saved for ${data.clientName || 'client'}`, time: timeAgo(dt) });
        });
      } catch (_) {}
      setRecentActivities(activities.slice(0, 6));
    } catch (e) { console.error('Activities error:', e); }
  };

  const timeAgo = (date) => {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const loadRecentClients = async () => {
    try {
      const clientsRef = collection(db, 'therapists', currentUser.uid, 'clients');
      const snap = await getDocs(clientsRef);
      const ids = snap.docs.map(d=>d.data().clientId).filter(Boolean).slice(0,5);
      const clients = [];
      for (const id of ids) {
        try {
          const cSnap = await getDoc(doc(db,'clients',id));
          if (cSnap.exists()) clients.push({ id, ...cSnap.data() });
        } catch (_) {}
      }
      setRecentClients(clients);
    } catch (e) { console.error('Recent clients error:', e); }
  };

  const fmt12 = (ts) => {
    if (!ts) return '';
    const dt = ts.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  };

  const fmtDateShort = (ts) => {
    if (!ts) return '';
    const dt = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    if (dt.toDateString()===today.toDateString()) return 'Today';
    const tmrw = new Date(); tmrw.setDate(tmrw.getDate()+1);
    if (dt.toDateString()===tmrw.toDateString()) return 'Tomorrow';
    return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={TherapistColors.primary} />
      <Text style={styles.loadingText}>Loading dashboard…</Text>
    </View>
  );

  const displayName = therapistProfile?.name || 'Therapist';

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[TherapistColors.primary]} />}
    >
      {/* ── Welcome Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greetingText}>{greeting()},</Text>
            <Text style={styles.nameText}>{displayName}</Text>
            {therapistProfile?.specialization && (
              <Text style={styles.specializationText}>{therapistProfile.specialization}</Text>
            )}
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{displayName[0]?.toUpperCase()}</Text>
          </View>
        </View>

        {/* Today's session count pill */}
        <View style={styles.todayPill}>
          <Ionicons name="calendar-outline" size={14} color={TherapistColors.primary} />
          <Text style={styles.todayPillText}>
            {kpis.todaySessions === 0
              ? 'No sessions scheduled today'
              : `${kpis.todaySessions} session${kpis.todaySessions > 1 ? 's' : ''} today`}
          </Text>
        </View>
      </View>
      <LocationSummaryCardMobile profile={therapistProfile} onEdit={() => navigation.navigate('TherapistSettings')} />

      {/* ── KPI Cards ── */}
      <View style={styles.kpiGrid}>
        {[
          { label:'Clients',        value: kpis.activeClients,    icon:'people',        color:'#4f46e5', bg:'#eff6ff' },
          { label:"Today's",        value: kpis.todaySessions,    icon:'calendar',      color:'#0d9488', bg:'#f0fdfa' },
          { label:'Pending Notes',  value: kpis.pendingNotes,     icon:'document-text', color:'#a855f7', bg:'#fdf4ff' },
          { label:'Completion',     value:`${kpis.completionRate}%`, icon:'trending-up', color:'#f59e0b', bg:'#fffbeb' },
        ].map(({ label, value, icon, color, bg }) => (
          <View key={label} style={[styles.kpiCard, { borderTopColor: color }]}>
            <View style={[styles.kpiIconWrap, { backgroundColor: bg }]}>
              <Ionicons name={`${icon}-outline`} size={20} color={color} />
            </View>
            <Text style={styles.kpiValue}>{value}</Text>
            <Text style={styles.kpiLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Session Activity Chart ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Activity (All Time)</Text>
        <LineChart
          data={weeklyData}
          width={width - 64}
          height={140}
          chartConfig={chartConfig}
          bezier
          style={{ borderRadius: 10, marginTop: 8 }}
          withDots
          withShadow={false}
          withInnerLines={false}
        />
      </View>

      {/* ── Today's Schedule ── */}
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
            <Text style={styles.emptyText}>No sessions today</Text>
          </View>
        ) : todayAppointments.map(appt => (
          <View key={appt.id} style={styles.apptItem}>
            <View style={styles.apptTimeBox}>
              <Text style={styles.apptTime}>{fmt12(appt.scheduledTime)}</Text>
            </View>
            <View style={styles.apptInfo}>
              <Text style={styles.apptClientName}>{appt.clientName || 'Client'}</Text>
              <Text style={styles.apptType}>{appt.sessionType || 'Individual'} · {appt.duration || 50}min</Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: appt.status === 'completed' ? TherapistColors.success : TherapistColors.primary }]} />
          </View>
        ))}
      </View>

      {/* ── Upcoming Sessions ── */}
      {upcomingAppointments.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upcoming Sessions</Text>
          {upcomingAppointments.map(appt => (
            <View key={appt.id} style={styles.upcomingItem}>
              <View style={styles.upcomingAvatar}>
                <Text style={styles.upcomingAvatarText}>{(appt.clientName||'?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={styles.upcomingClientName}>{appt.clientName || 'Client'}</Text>
                <Text style={styles.upcomingDateTime}>{fmtDateShort(appt.scheduledTime)} · {fmt12(appt.scheduledTime)}</Text>
                <Text style={styles.upcomingType}>{appt.sessionType || 'Individual'}</Text>
              </View>
              <View style={[styles.upcomingBadge, { backgroundColor: fmtDateShort(appt.scheduledTime) === 'Today' ? '#eff6ff' : '#f8fafc' }]}>
                <Text style={[styles.upcomingBadgeText, { color: fmtDateShort(appt.scheduledTime) === 'Today' ? TherapistColors.primary : TherapistColors.textLight }]}>
                  {fmtDateShort(appt.scheduledTime)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Client Progress Overview ── */}
      {clientProgress.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Client Progress Overview</Text>
          {clientProgress.map(c => (
            <View key={c.cid} style={styles.progressItem}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.progressPct}>{c.progress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${c.progress}%` }]} />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.progressMetaText}>Last: {c.lastSession}</Text>
                <Text style={styles.progressMetaText}>{c.noteCount} note{c.noteCount !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Recent Activity ── */}
      {recentActivities.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Activity</Text>
          {recentActivities.map((a, i) => (
            <View key={i} style={styles.activityItem}>
              <Text style={styles.activityIcon}>{a.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityText}>{a.text}</Text>
                <Text style={styles.activityTime}>{a.time}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── My Clients ── */}
      {recentClients.length > 0 && (
        <View style={[styles.card, { marginBottom: 24 }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>My Clients</Text>
            <TouchableOpacity onPress={() => navigation.navigate('TherapistClients')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {recentClients.map(c => (
            <View key={c.id} style={styles.clientItem}>
              <View style={styles.clientAvatar}>
                <Text style={styles.clientAvatarText}>{(c.name||c.displayName||'?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={styles.clientName}>{c.name || c.displayName || c.email || 'Client'}</Text>
                <Text style={styles.clientEmail}>{c.email || ''}</Text>
              </View>
              <View style={[styles.clientStatusBadge, { backgroundColor: c.status==='active' ? '#dcfce7' : '#f1f5f9' }]}>
                <Text style={[styles.clientStatusText, { color: c.status==='active' ? '#16a34a' : '#64748b' }]}>{c.status||'active'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex:1, justifyContent:'center', alignItems:'center', gap:12, backgroundColor: TherapistColors.background },
  loadingText: { color: TherapistColors.textSecondary, fontSize:15, fontWeight:'500' },
  header: {
    backgroundColor: TherapistColors.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },
  greetingText: { fontSize:13, color:'rgba(255,255,255,0.65)', fontWeight:'500' },
  nameText: { fontSize:22, fontWeight:'800', color:'#fff', marginTop:2 },
  specializationText: { fontSize:12, color:'rgba(255,255,255,0.55)', marginTop:3 },
  avatarCircle: { width:52, height:52, borderRadius:26, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center' },
  avatarLetter: { fontSize:22, fontWeight:'800', color:'#fff' },
  todayPill: { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.12)', paddingHorizontal:12, paddingVertical:7, borderRadius:20, alignSelf:'flex-start' },
  todayPillText: { fontSize:13, color:'rgba(255,255,255,0.9)', fontWeight:'600' },

  kpiGrid: { flexDirection:'row', flexWrap:'wrap', padding:12, gap:10, justifyContent:'space-between' },
  kpiCard: { backgroundColor:'#fff', borderRadius:14, padding:14, width:(width-44)/2, borderTopWidth:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:6, elevation:2 },
  kpiIconWrap: { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center', marginBottom:10 },
  kpiValue: { fontSize:22, fontWeight:'800', color: TherapistColors.text, marginBottom:3 },
  kpiLabel: { fontSize:12, color: TherapistColors.textSecondary, fontWeight:'500' },

  card: { backgroundColor:'#fff', borderRadius:16, marginHorizontal:16, marginBottom:14, padding:16, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.04, shadowRadius:8, elevation:2 },
  cardHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  cardTitle: { fontSize:16, fontWeight:'700', color: TherapistColors.text },
  seeAll: { fontSize:13, color: TherapistColors.primary, fontWeight:'600' },

  emptyState: { alignItems:'center', paddingVertical:20, gap:8 },
  emptyText: { fontSize:14, color: TherapistColors.textLight, fontWeight:'500' },

  apptItem: { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#f1f5f9' },
  apptTimeBox: { backgroundColor:'#eff6ff', borderRadius:10, paddingHorizontal:10, paddingVertical:6, minWidth:60, alignItems:'center' },
  apptTime: { fontSize:13, fontWeight:'700', color: TherapistColors.primary },
  apptInfo: { flex:1 },
  apptClientName: { fontSize:14, fontWeight:'600', color: TherapistColors.text },
  apptType: { fontSize:12, color: TherapistColors.textLight, marginTop:2 },
  statusDot: { width:8, height:8, borderRadius:4 },

  upcomingItem: { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#f1f5f9' },
  upcomingAvatar: { width:42, height:42, borderRadius:21, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center' },
  upcomingAvatarText: { fontSize:17, fontWeight:'700', color:'#fff' },
  upcomingClientName: { fontSize:14, fontWeight:'600', color: TherapistColors.text },
  upcomingDateTime: { fontSize:12, color: TherapistColors.textSecondary, marginTop:2 },
  upcomingType: { fontSize:11, color: TherapistColors.textLight },
  upcomingBadge: { paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  upcomingBadgeText: { fontSize:11, fontWeight:'700' },

  progressItem: { marginBottom: 14 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  progressName: { fontSize: 13, fontWeight: '600', color: TherapistColors.text, flex: 1 },
  progressPct: { fontSize: 13, fontWeight: '700', color: TherapistColors.primary },
  progressBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: TherapistColors.primary, borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressMetaText: { fontSize: 11, color: TherapistColors.textLight },

  activityItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  activityIcon: { fontSize: 18, lineHeight: 22 },
  activityText: { fontSize: 13, color: TherapistColors.text, fontWeight: '500', lineHeight: 18 },
  activityTime: { fontSize: 11, color: TherapistColors.textLight, marginTop: 2 },

  clientItem: { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#f1f5f9' },
  clientAvatar: { width:42, height:42, borderRadius:21, backgroundColor:'#818cf8', justifyContent:'center', alignItems:'center' },
  clientAvatarText: { fontSize:17, fontWeight:'700', color:'#fff' },
  clientName: { fontSize:14, fontWeight:'600', color: TherapistColors.text },
  clientEmail: { fontSize:12, color: TherapistColors.textLight },
  clientStatusBadge: { paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  clientStatusText: { fontSize:11, fontWeight:'700', textTransform:'capitalize' },
});

export default TherapistHomeScreen;
