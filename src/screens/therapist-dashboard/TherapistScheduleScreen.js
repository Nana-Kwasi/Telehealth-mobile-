import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, getDoc,
  addDoc, serverTimestamp, orderBy, Timestamp
} from 'firebase/firestore';
import { TherapistColors } from '../../constants/colors';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const TherapistScheduleScreen = ({ navigation }) => {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calDate, setCalDate] = useState(new Date());
  const [sessionsByDay, setSessionsByDay] = useState({});
  const [showBookModal, setShowBookModal] = useState(false);
  const [clients, setClients] = useState([]);
  const [bookForm, setBookForm] = useState({ clientId:'', clientName:'', date:'', time:'', duration:'50', sessionType:'individual', notes:'' });
  const [saving, setSaving] = useState(false);

  const currentUser = auth.currentUser;

  useEffect(() => { if (currentUser) loadData(); }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadSessions(), loadClients()]);
    } catch (e) {
      console.error('Schedule load error:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const loadSessions = async () => {
    const monthStart = new Date(calDate.getFullYear(), calDate.getMonth(), 1);
    const monthEnd   = new Date(calDate.getFullYear(), calDate.getMonth()+1, 0);
    monthEnd.setHours(23,59,59,999);

    try {
      const q = query(
        collection(db,'scheduledCalls'),
        where('therapistId','==',currentUser.uid),
        where('scheduledTime','>=',Timestamp.fromDate(monthStart)),
        where('scheduledTime','<=',Timestamp.fromDate(monthEnd)),
        orderBy('scheduledTime','asc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d=>({id:d.id,...d.data()}));
      setSessions(list);
      // Group by day
      const byDay = {};
      list.forEach(s => {
        const dt = s.scheduledTime?.toDate?.() || new Date(s.scheduledTime);
        const key = dt.getDate();
        if (!byDay[key]) byDay[key] = [];
        byDay[key].push(s);
      });
      setSessionsByDay(byDay);
    } catch (e) {
      console.error('Load sessions error:', e);
    }
  };

  const loadClients = async () => {
    try {
      const ref = collection(db,'therapists',currentUser.uid,'clients');
      const snap = await getDocs(ref);
      const ids = snap.docs.map(d=>d.data().clientId).filter(Boolean);
      const list = [];
      for (const id of ids) {
        try {
          const cSnap = await getDoc(doc(db,'clients',id));
          if (cSnap.exists()) {
            const cd = cSnap.data();
            list.push({ id, name: cd.name||cd.displayName||cd.email||'Client' });
          }
        } catch (_) {}
      }
      setClients(list);
    } catch (e) {}
  };

  const handleBook = async () => {
    if (!bookForm.clientId || !bookForm.date || !bookForm.time) {
      Alert.alert('Missing Info', 'Please fill in client, date, and time.');
      return;
    }
    setSaving(true);
    try {
      const [y,m,d] = bookForm.date.split('-').map(Number);
      const [h,min] = bookForm.time.split(':').map(Number);
      const scheduledTime = new Date(y,m-1,d,h,min);

      await addDoc(collection(db,'scheduledCalls'), {
        therapistId: currentUser.uid,
        clientId: bookForm.clientId,
        clientName: bookForm.clientName,
        scheduledTime: Timestamp.fromDate(scheduledTime),
        duration: parseInt(bookForm.duration)||50,
        sessionType: bookForm.sessionType,
        notes: bookForm.notes,
        status: 'scheduled',
        createdAt: serverTimestamp(),
      });

      setShowBookModal(false);
      setBookForm({ clientId:'', clientName:'', date:'', time:'', duration:'50', sessionType:'individual', notes:'' });
      Alert.alert('Booked!', 'Session scheduled successfully.');
      await loadSessions();
    } catch (e) {
      Alert.alert('Error', 'Failed to book session.');
    } finally {
      setSaving(false);
    }
  };

  const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const firstDay = (d) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();

  const calCells = () => {
    const total = daysInMonth(calDate);
    const first = firstDay(calDate);
    const cells = [];
    for (let i=0; i<first; i++) cells.push(null);
    for (let d=1; d<=total; d++) cells.push(d);
    return cells;
  };

  const isToday = (day) => {
    const now = new Date();
    return day === now.getDate() && calDate.getMonth() === now.getMonth() && calDate.getFullYear() === now.getFullYear();
  };

  const isSelected = (day) => {
    return day === selectedDate.getDate() && calDate.getMonth() === selectedDate.getMonth() && calDate.getFullYear() === selectedDate.getFullYear();
  };

  const selectedDaySessions = sessions.filter(s => {
    const dt = s.scheduledTime?.toDate?.() || new Date(s.scheduledTime);
    return dt.getDate() === selectedDate.getDate() && dt.getMonth() === selectedDate.getMonth() && dt.getFullYear() === selectedDate.getFullYear();
  });

  const fmt12 = (ts) => {
    if (!ts) return '';
    const dt = ts.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  };

  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={TherapistColors.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);loadData();}} colors={[TherapistColors.primary]} />}
      >
        {/* ── Mini Calendar ── */}
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}>
              <Ionicons name="chevron-back" size={22} color={TherapistColors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.calMonthLabel}>{MONTHS[calDate.getMonth()]} {calDate.getFullYear()}</Text>
            <TouchableOpacity onPress={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}>
              <Ionicons name="chevron-forward" size={22} color={TherapistColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Day labels */}
          <View style={styles.calDayLabels}>
            {DAYS.map(d => <Text key={d} style={styles.calDayLabel}>{d}</Text>)}
          </View>

          {/* Cells */}
          <View style={styles.calGrid}>
            {calCells().map((day, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.calCell,
                  !day && { backgroundColor:'transparent' },
                  isToday(day) && styles.calCellToday,
                  isSelected(day) && !isToday(day) && styles.calCellSelected,
                  day && sessionsByDay[day] && !isToday(day) && !isSelected(day) && styles.calCellHasSession,
                ]}
                onPress={() => { if (day) setSelectedDate(new Date(calDate.getFullYear(), calDate.getMonth(), day)); }}
                disabled={!day}
                activeOpacity={day ? 0.7 : 1}
              >
                <Text style={[styles.calCellText, (isToday(day)||isSelected(day)) && { color:'#fff' }]}>
                  {day || ''}
                </Text>
                {day && sessionsByDay[day] && (
                  <View style={[styles.calDot, (isToday(day)||isSelected(day)) && { backgroundColor:'rgba(255,255,255,0.7)' }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Selected Day Sessions ── */}
        <View style={styles.daySection}>
          <View style={styles.daySectionHeader}>
            <Text style={styles.daySectionTitle}>
              {selectedDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
            </Text>
            <Text style={styles.daySectionCount}>{selectedDaySessions.length} session{selectedDaySessions.length !== 1 ? 's' : ''}</Text>
          </View>

          {selectedDaySessions.length === 0 ? (
            <View style={styles.emptyDay}>
              <Ionicons name="calendar-outline" size={32} color={TherapistColors.textLight} />
              <Text style={styles.emptyDayText}>No sessions on this day</Text>
            </View>
          ) : selectedDaySessions.map(s => (
            <View key={s.id} style={styles.sessionCard}>
              <View style={styles.sessionTimeCol}>
                <Text style={styles.sessionTime}>{fmt12(s.scheduledTime)}</Text>
                <Text style={styles.sessionDuration}>{s.duration||50}min</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={styles.sessionClient}>{s.clientName || 'Client'}</Text>
                <Text style={styles.sessionType}>{s.sessionType || 'Individual'}</Text>
                {s.notes ? <Text style={styles.sessionNotes} numberOfLines={1}>{s.notes}</Text> : null}
              </View>
              <View style={[styles.sessionStatus, { backgroundColor: s.status==='completed' ? '#dcfce7' : s.status==='cancelled' ? '#fee2e2' : '#eff6ff' }]}>
                <Text style={[styles.sessionStatusText, { color: s.status==='completed' ? '#16a34a' : s.status==='cancelled' ? '#dc2626' : TherapistColors.primary }]}>
                  {s.status||'scheduled'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowBookModal(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Book Session Modal ── */}
      <Modal visible={showBookModal} transparent animationType="slide" onRequestClose={() => setShowBookModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book Session</Text>
              <TouchableOpacity onPress={() => setShowBookModal(false)}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding:16, gap:12 }}>
              {/* Client picker */}
              <View>
                <Text style={styles.formLabel}>Client</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:6 }}>
                  {clients.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.clientChip, bookForm.clientId===c.id && styles.clientChipActive]}
                      onPress={() => setBookForm(p => ({...p, clientId:c.id, clientName:c.name}))}
                    >
                      <Text style={[styles.clientChipText, bookForm.clientId===c.id && { color:'#fff' }]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={{ flexDirection:'row', gap:10 }}>
                <View style={{ flex:1 }}>
                  <Text style={styles.formLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="2024-12-25"
                    placeholderTextColor={TherapistColors.textLight}
                    value={bookForm.date}
                    onChangeText={v => setBookForm(p=>({...p, date:v}))}
                  />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={styles.formLabel}>Time (HH:MM)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="14:00"
                    placeholderTextColor={TherapistColors.textLight}
                    value={bookForm.time}
                    onChangeText={v => setBookForm(p=>({...p, time:v}))}
                  />
                </View>
              </View>

              <View style={{ flexDirection:'row', gap:10 }}>
                <View style={{ flex:1 }}>
                  <Text style={styles.formLabel}>Duration (min)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="50"
                    placeholderTextColor={TherapistColors.textLight}
                    keyboardType="numeric"
                    value={bookForm.duration}
                    onChangeText={v => setBookForm(p=>({...p, duration:v}))}
                  />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={styles.formLabel}>Type</Text>
                  <View style={{ flexDirection:'row', gap:6, marginTop:4 }}>
                    {['individual','couples','group'].map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeChip, bookForm.sessionType===t && styles.typeChipActive]}
                        onPress={() => setBookForm(p=>({...p, sessionType:t}))}
                      >
                        <Text style={[styles.typeChipText, bookForm.sessionType===t && { color:'#fff' }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View>
                <Text style={styles.formLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.formInput, { minHeight:80, textAlignVertical:'top' }]}
                  multiline
                  placeholder="Session notes or preparation…"
                  placeholderTextColor={TherapistColors.textLight}
                  value={bookForm.notes}
                  onChangeText={v => setBookForm(p=>({...p, notes:v}))}
                />
              </View>

              <TouchableOpacity
                style={[styles.bookBtn, { opacity: saving ? 0.7 : 1 }]}
                onPress={handleBook}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.bookBtnText}>Book Session</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex:1, justifyContent:'center', alignItems:'center' },

  calCard: { backgroundColor:'#fff', margin:16, borderRadius:18, padding:16, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:8, elevation:2 },
  calHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  calMonthLabel: { fontSize:16, fontWeight:'700', color: TherapistColors.text },
  calDayLabels: { flexDirection:'row', marginBottom:6 },
  calDayLabel: { flex:1, textAlign:'center', fontSize:11, fontWeight:'700', color: TherapistColors.textLight, textTransform:'uppercase' },
  calGrid: { flexDirection:'row', flexWrap:'wrap' },
  calCell: { width:'14.28%', aspectRatio:1, justifyContent:'center', alignItems:'center', borderRadius:100, marginVertical:2 },
  calCellToday: { backgroundColor: TherapistColors.primary },
  calCellSelected: { backgroundColor: TherapistColors.primaryLight, borderWidth:1.5, borderColor: TherapistColors.primary },
  calCellHasSession: { backgroundColor:'#f0f7ff' },
  calCellText: { fontSize:13, fontWeight:'600', color: TherapistColors.text },
  calDot: { width:4, height:4, borderRadius:2, backgroundColor: TherapistColors.primary, marginTop:1 },

  daySection: { margin:16, marginTop:0 },
  daySectionHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  daySectionTitle: { fontSize:15, fontWeight:'700', color: TherapistColors.text },
  daySectionCount: { fontSize:12, color: TherapistColors.textSecondary },

  emptyDay: { alignItems:'center', paddingVertical:28, gap:8 },
  emptyDayText: { fontSize:14, color: TherapistColors.textLight },

  sessionCard: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:8, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.04, shadowRadius:4, elevation:1 },
  sessionTimeCol: { minWidth:58, alignItems:'center' },
  sessionTime: { fontSize:14, fontWeight:'700', color: TherapistColors.primary },
  sessionDuration: { fontSize:11, color: TherapistColors.textLight, marginTop:2 },
  sessionClient: { fontSize:15, fontWeight:'700', color: TherapistColors.text },
  sessionType: { fontSize:12, color: TherapistColors.textSecondary, marginTop:2, textTransform:'capitalize' },
  sessionNotes: { fontSize:11, color: TherapistColors.textLight, marginTop:2 },
  sessionStatus: { paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  sessionStatusText: { fontSize:11, fontWeight:'700', textTransform:'capitalize' },

  fab: { position:'absolute', bottom:24, right:24, width:56, height:56, borderRadius:28, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center', shadowColor:TherapistColors.primary, shadowOffset:{width:0,height:6}, shadowOpacity:0.35, shadowRadius:10, elevation:8 },

  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modalSheet: { backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'85%' },
  modalHandle: { width:40, height:4, backgroundColor:'#e2e8f0', borderRadius:2, alignSelf:'center', marginTop:12, marginBottom:4 },
  modalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#f1f5f9' },
  modalTitle: { fontSize:17, fontWeight:'700', color: TherapistColors.text },

  formLabel: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary, marginBottom:4 },
  formInput: { backgroundColor:'#f8fafc', borderRadius:10, borderWidth:1.5, borderColor: TherapistColors.border, padding:12, fontSize:14, color: TherapistColors.text },

  clientChip: { paddingHorizontal:14, paddingVertical:8, borderRadius:20, borderWidth:1.5, borderColor: TherapistColors.border, backgroundColor:'#f8fafc', marginRight:8 },
  clientChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  clientChipText: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },

  typeChip: { flex:1, paddingVertical:7, borderRadius:8, borderWidth:1.5, borderColor: TherapistColors.border, backgroundColor:'#f8fafc', alignItems:'center' },
  typeChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  typeChipText: { fontSize:11, fontWeight:'600', color: TherapistColors.textSecondary, textTransform:'capitalize' },

  bookBtn: { backgroundColor: TherapistColors.primary, borderRadius:12, paddingVertical:15, alignItems:'center', marginTop:8 },
  bookBtnText: { color:'#fff', fontSize:15, fontWeight:'700' },
});

export default TherapistScheduleScreen;
