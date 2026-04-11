import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Alert, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, serverTimestamp, setDoc, getDoc,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';

const TODAY = new Date().toISOString().split('T')[0];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STATUS_CONFIG = {
  pending:   { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', label: 'Pending',   dot: '#f59e0b' },
  confirmed: { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Confirmed', dot: '#22c55e' },
  completed: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Completed', dot: '#6366f1' },
  cancelled: { bg: '#fff1f2', border: '#fecdd3', text: '#be123c', label: 'Cancelled', dot: '#ef4444' },
};

const LIST_TABS = ['All', 'Pending', 'Confirmed', 'Completed'];
const CONSULT_TYPES = ['video', 'audio', 'chat'];

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DoctorAppointmentsScreen() {
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(null);

  // Tab state
  const [mainTab, setMainTab] = useState('Calendar');
  const [listTab, setListTab] = useState('All');

  // Calendar state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(null); // view appts for a day
  const [scheduleDay, setScheduleDay] = useState(null); // schedule modal

  // Detail modal
  const [selectedAppt, setSelectedAppt] = useState(null);

  // Book appointment modal
  const [showBook, setShowBook] = useState(false);
  const [bookDate, setBookDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [bookForm, setBookForm] = useState({
    patientId: '', patientName: '', time: '09:00',
    type: 'video', reason: '',
  });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const dSnap = await getDoc(doc(db, 'doctors', cu.uid));
      const profile = dSnap.exists() ? { id: cu.uid, ...dSnap.data() } : { id: cu.uid, name: 'Doctor' };
      setDoctorProfile(profile);

      const snap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );
      const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAppointments(appts.sort((a, b) => (b.date || '').localeCompare(a.date || '')));

      const patMap = new Map();
      appts.forEach(a => {
        if (a.clientId && !patMap.has(a.clientId)) {
          patMap.set(a.clientId, { id: a.clientId, name: a.clientName || '' });
        }
      });
      const enrichedPats = await enrichPatientNames(patMap);

      // Back-fill real names onto loaded appointments
      const nameMap = {};
      for (const [id, p] of enrichedPats.entries()) nameMap[id] = p.name;
      const enrichedAppts = appts.map(a => ({
        ...a,
        clientName: (a.clientId && nameMap[a.clientId]) ? nameMap[a.clientId] : (a.clientName || 'Patient'),
      }));

      setAppointments(enrichedAppts.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      setPatients(Array.from(enrichedPats.values()));
    } catch (err) {
      console.error('DoctorAppointments load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Calendar helpers ──
  const apptsByDate = {};
  appointments.forEach(a => {
    if (!a.date) return;
    if (!apptsByDate[a.date]) apptsByDate[a.date] = [];
    apptsByDate[a.date].push(a);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => calMonth === 0 ? (setCalMonth(11), setCalYear(y => y - 1)) : setCalMonth(m => m - 1);
  const nextMonth = () => calMonth === 11 ? (setCalMonth(0), setCalYear(y => y + 1)) : setCalMonth(m => m + 1);

  // ── Status change ──
  const updateStatus = async (apptId, newStatus, appt) => {
    setUpdating(apptId);
    try {
      const cu = auth.currentUser;
      await updateDoc(doc(db, 'doctorAppointments', apptId), { status: newStatus, updatedAt: serverTimestamp() });
      if (newStatus === 'confirmed' && appt?.clientId) {
        await setDoc(doc(db, 'doctors', cu.uid, 'patients', appt.clientId), {
          patientId: appt.clientId, name: appt.clientName || 'Patient', addedAt: serverTimestamp(),
        }, { merge: true });
      }
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: newStatus } : a));
      setSelectedAppt(null);
    } catch {
      Alert.alert('Error', 'Could not update appointment.');
    } finally {
      setUpdating(null);
    }
  };

  // ── Book appointment ──
  const openBook = (dateStr) => {
    setBookDate(dateStr || TODAY);
    setBookForm({ patientId: '', patientName: '', time: '09:00', type: 'video', reason: '' });
    setScheduleDay(null);
    setSelectedDay(null);
    setShowBook(true);
  };

  const handleBook = async () => {
    if (!bookForm.patientId) { Alert.alert('Required', 'Please select a patient.'); return; }
    if (!bookDate) { Alert.alert('Required', 'Please enter a date.'); return; }
    setSaving(true);
    try {
      const cu = auth.currentUser;
      await addDoc(collection(db, 'doctorAppointments'), {
        doctorId: cu.uid,
        doctorName: doctorProfile?.name || '',
        doctorSpecialization: doctorProfile?.specialty || doctorProfile?.specialization || '',
        clientId: bookForm.patientId,
        clientName: bookForm.patientName,
        date: bookDate,
        time: bookForm.time,
        consultationType: bookForm.type,
        reason: bookForm.reason.trim(),
        status: 'confirmed',
        scheduledByDoctor: true,
        createdAt: serverTimestamp(),
      });
      // Add patient to doctor's subcollection
      await setDoc(doc(db, 'doctors', cu.uid, 'patients', bookForm.patientId), {
        patientId: bookForm.patientId, name: bookForm.patientName, addedAt: serverTimestamp(),
      }, { merge: true });
      setShowBook(false);
      await loadAll();
      Alert.alert('Booked', `Appointment booked with ${bookForm.patientName} on ${bookDate}.`);
    } catch (err) {
      Alert.alert('Error', 'Could not book appointment.');
    } finally {
      setSaving(false);
    }
  };

  // ── Mini stats ──
  const miniStats = [
    { label: 'Upcoming', count: appointments.filter(a => a.date >= TODAY && a.status !== 'cancelled').length, color: '#6366f1' },
    { label: 'Pending',  count: appointments.filter(a => a.status === 'pending').length,   color: '#f59e0b' },
    { label: 'Confirmed',count: appointments.filter(a => a.status === 'confirmed').length, color: '#22c55e' },
    { label: 'Completed',count: appointments.filter(a => a.status === 'completed').length, color: '#475569' },
  ];

  // ── List filtered ──
  const listFiltered = appointments.filter(a => {
    if (listTab === 'All') return true;
    return a.status === listTab.toLowerCase();
  });

  const renderApptCard = (appt) => {
    const sc = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending;
    return (
      <TouchableOpacity
        key={appt.id}
        style={styles.apptCard}
        onPress={() => setSelectedAppt(appt)}
      >
        <View style={styles.apptLeft}>
          <View style={[styles.dateBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.dateBadgeMonth, { color: sc.text }]}>
              {MONTHS[(appt.date || '').split('-')[1] - 1]?.slice(0, 3) || '---'}
            </Text>
            <Text style={[styles.dateBadgeDay, { color: sc.text }]}>
              {(appt.date || '').split('-')[2] || '--'}
            </Text>
          </View>
        </View>
        <View style={styles.apptMid}>
          <Text style={styles.apptPatient}>{appt.clientName || 'Patient'}</Text>
          <View style={styles.apptMetaRow}>
            <Ionicons name="time-outline" size={12} color="#94a3b8" />
            <Text style={styles.apptMeta}>{appt.time || '—'}</Text>
            <Ionicons name="videocam-outline" size={12} color="#94a3b8" />
            <Text style={styles.apptMeta}>{appt.consultationType || 'Consult'}</Text>
          </View>
          {appt.reason ? <Text style={styles.apptReason} numberOfLines={1}>{appt.reason}</Text> : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>;

  return (
    <View style={styles.container}>
      {/* Main Tabs */}
      <View style={styles.mainTabBar}>
        {['Calendar', 'List'].map(t => (
          <TouchableOpacity key={t} style={[styles.mainTab, mainTab === t && styles.mainTabActive]} onPress={() => setMainTab(t)}>
            <Ionicons
              name={t === 'Calendar' ? 'calendar-outline' : 'list-outline'}
              size={15}
              color={mainTab === t ? DoctorColors.primary : '#94a3b8'}
            />
            <Text style={[styles.mainTabText, mainTab === t && styles.mainTabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Mini stats row */}
      <View style={styles.miniStatsRow}>
        {miniStats.map((s, i) => (
          <View key={i} style={styles.miniStat}>
            <Text style={[styles.miniStatValue, { color: s.color }]}>{s.count}</Text>
            <Text style={styles.miniStatLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ──────── CALENDAR TAB ──────── */}
      {mainTab === 'Calendar' && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
        >
          <View style={styles.calCard}>
            {/* Month nav */}
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={prevMonth} style={styles.calNav}>
                <Ionicons name="chevron-back" size={18} color={DoctorColors.text} />
              </TouchableOpacity>
              <Text style={styles.calTitle}>{MONTHS[calMonth]} {calYear}</Text>
              <TouchableOpacity onPress={nextMonth} style={styles.calNav}>
                <Ionicons name="chevron-forward" size={18} color={DoctorColors.text} />
              </TouchableOpacity>
            </View>

            {/* Day headers */}
            <View style={styles.calDayRow}>
              {DAYS_SHORT.map(d => <Text key={d} style={styles.calDayHeader}>{d}</Text>)}
            </View>

            {/* Calendar grid */}
            <View style={styles.calGrid}>
              {cells.map((day, idx) => {
                if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;

                const dateStr = toDateStr(calYear, calMonth, day);
                const dayAppts = apptsByDate[dateStr] || [];
                const isToday = dateStr === TODAY;
                const isPast = dateStr < TODAY;
                const hasPending = dayAppts.some(a => a.status === 'pending');
                const hasConfirmed = dayAppts.some(a => a.status === 'confirmed');

                let cellBg = 'transparent';
                let cellBorderColor = 'transparent';
                if (isToday) { cellBg = '#eff6ff'; cellBorderColor = '#2563eb'; }
                else if (hasConfirmed) { cellBg = '#f0fdf4'; cellBorderColor = '#86efac'; }
                else if (hasPending) { cellBg = '#fffbeb'; cellBorderColor = '#fde68a'; }
                else if (dayAppts.length > 0) { cellBg = '#f8fafc'; cellBorderColor = '#e2e8f0'; }

                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[
                      styles.calCell,
                      { backgroundColor: cellBg, borderColor: cellBorderColor, borderWidth: cellBorderColor !== 'transparent' ? 1.5 : 0 },
                      isPast && !dayAppts.length && { opacity: 0.4 },
                    ]}
                    onPress={() => {
                      if (dayAppts.length > 0) setSelectedDay(dateStr);
                      else if (!isPast) openBook(dateStr);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.dayNumWrap, isToday && styles.dayNumWrapToday]}>
                      <Text style={[styles.calDayNum, isToday && styles.calDayNumToday]}>{day}</Text>
                    </View>
                    {dayAppts.slice(0, 2).map((a, i) => {
                      const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
                      return (
                        <View key={i} style={[styles.calPill, { backgroundColor: sc.dot + '20' }]}>
                          <Text style={[styles.calPillText, { color: sc.dot }]} numberOfLines={1}>
                            {(a.time || '').slice(0, 5)} {(a.clientName || '').slice(0, 6)}
                          </Text>
                        </View>
                      );
                    })}
                    {dayAppts.length > 2 && <Text style={styles.calMore}>+{dayAppts.length - 2} more</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Day appointments modal (shown inline) */}
          {selectedDay && apptsByDate[selectedDay] && (
            <View style={styles.dayModal}>
              <View style={styles.dayModalHeader}>
                <Text style={styles.dayModalTitle}>
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={() => setSelectedDay(null)}>
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
              {(apptsByDate[selectedDay] || []).map(appt => renderApptCard(appt))}
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* ──────── LIST TAB ──────── */}
      {mainTab === 'List' && (
        <View style={styles.listTabContainer}>
          {/* Sub-tabs */}
          <View style={styles.subTabRow}>
            {LIST_TABS.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.subTab, listTab === t && styles.subTabActive]}
                onPress={() => setListTab(t)}
              >
                <Text style={[styles.subTabText, listTab === t && styles.subTabTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            style={styles.listFlatList}
            data={listFiltered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => renderApptCard(item)}
            contentContainerStyle={{ padding: 14, paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={44} color="#cbd5e1" />
                <Text style={styles.emptyText}>No {listTab !== 'All' ? listTab.toLowerCase() : ''} appointments</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Floating + Button */}
      <TouchableOpacity style={styles.fab} onPress={() => openBook('')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Day Appts Modal (Calendar) ── */}
      <Modal
        visible={!!scheduleDay}
        transparent
        animationType="slide"
        onRequestClose={() => setScheduleDay(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {scheduleDay ? new Date(scheduleDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
            </Text>
            <TouchableOpacity style={styles.bookFromDayBtn} onPress={() => openBook(scheduleDay)}>
              <Ionicons name="add-circle-outline" size={18} color={DoctorColors.primary} />
              <Text style={styles.bookFromDayBtnText}>Schedule Appointment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setScheduleDay(null)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Appointment Detail Modal ── */}
      <Modal visible={!!selectedAppt} transparent animationType="slide" onRequestClose={() => setSelectedAppt(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedAppt && (() => {
              const sc = STATUS_CONFIG[selectedAppt.status] || STATUS_CONFIG.pending;
              return (
                <>
                  <View style={styles.modalTopRow}>
                    <Text style={styles.modalTitle}>{selectedAppt.clientName || 'Patient'}</Text>
                    <TouchableOpacity onPress={() => setSelectedAppt(null)}>
                      <Ionicons name="close" size={22} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.detailRows}>
                    <Text style={styles.detailRow}>📅 {selectedAppt.date}   🕐 {selectedAppt.time || '—'}</Text>
                    <Text style={styles.detailRow}>🎥 {selectedAppt.consultationType || 'Consultation'}</Text>
                    {selectedAppt.reason ? <Text style={styles.detailRow}>📝 {selectedAppt.reason}</Text> : null}
                    {selectedAppt.consultationFee ? <Text style={styles.detailRow}>💰 GHS {selectedAppt.consultationFee}</Text> : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border, alignSelf: 'flex-start', marginBottom: 16 }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                  </View>

                  {updating === selectedAppt.id ? (
                    <ActivityIndicator color={DoctorColors.primary} />
                  ) : (
                    <View style={styles.actionBtns}>
                      {selectedAppt.status === 'pending' && (
                        <>
                          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}
                            onPress={() => updateStatus(selectedAppt.id, 'confirmed', selectedAppt)}>
                            <Text style={{ color: '#15803d', fontWeight: '700' }}>Confirm</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}
                            onPress={() => updateStatus(selectedAppt.id, 'cancelled', selectedAppt)}>
                            <Text style={{ color: '#be123c', fontWeight: '700' }}>Cancel</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {selectedAppt.status === 'confirmed' && (
                        <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]}
                          onPress={() => updateStatus(selectedAppt.id, 'completed', selectedAppt)}>
                          <Text style={{ color: '#475569', fontWeight: '700' }}>Mark Completed</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Book Appointment Modal ── */}
      <Modal visible={showBook} animationType="slide" onRequestClose={() => setShowBook(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.bookModal}>
            <View style={styles.bookHeader}>
              <Text style={styles.bookTitle}>Schedule Appointment</Text>
              <TouchableOpacity onPress={() => setShowBook(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Patient selector */}
              <Text style={styles.fieldLabel}>Patient *</Text>
              {patients.length === 0 ? (
                <Text style={styles.noPatients}>No patients yet. Patients appear after they book with you.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
                  {patients.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, bookForm.patientId === p.id && styles.chipActive]}
                      onPress={() => setBookForm(prev => ({ ...prev, patientId: p.id, patientName: p.name }))}
                    >
                      <Text style={[styles.chipText, bookForm.patientId === p.id && styles.chipTextActive]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Date */}
              <Text style={styles.fieldLabel}>Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 2025-04-20"
                placeholderTextColor="#94a3b8"
                value={bookDate}
                onChangeText={setBookDate}
              />

              {/* Time */}
              <Text style={styles.fieldLabel}>Time (HH:MM) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 09:30"
                placeholderTextColor="#94a3b8"
                value={bookForm.time}
                onChangeText={v => setBookForm(p => ({ ...p, time: v }))}
              />

              {/* Type */}
              <Text style={styles.fieldLabel}>Consultation Type</Text>
              <View style={styles.typeRow}>
                {CONSULT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, bookForm.type === t && styles.typeChipActive]}
                    onPress={() => setBookForm(p => ({ ...p, type: t }))}
                  >
                    <Ionicons
                      name={t === 'video' ? 'videocam-outline' : t === 'audio' ? 'call-outline' : 'chatbubble-outline'}
                      size={14}
                      color={bookForm.type === t ? '#fff' : DoctorColors.textSecondary}
                    />
                    <Text style={[styles.typeChipText, bookForm.type === t && styles.typeChipTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Reason */}
              <Text style={styles.fieldLabel}>Reason / Notes (optional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Reason for appointment..."
                placeholderTextColor="#94a3b8"
                value={bookForm.reason}
                onChangeText={v => setBookForm(p => ({ ...p, reason: v }))}
                multiline
              />
            </ScrollView>

            <View style={styles.bookFooter}>
              <TouchableOpacity style={styles.cancelBtn2} onPress={() => setShowBook(false)}>
                <Text style={styles.cancelBtnText2}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
                onPress={handleBook}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmBtnText}>Book Appointment</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Main tabs
  mainTabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  mainTabActive: { borderBottomWidth: 2, borderBottomColor: DoctorColors.primary },
  mainTabText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  mainTabTextActive: { color: DoctorColors.primary },

  // Mini stats
  miniStatsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    flexShrink: 0,
  },
  miniStat: { alignItems: 'center', marginRight: 24 },
  miniStatValue: { fontSize: 18, fontWeight: '800' },
  miniStatLabel: { fontSize: 10, color: '#94a3b8', marginTop: 1 },

  // Calendar
  calCard: { backgroundColor: '#fff', margin: 14, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calNav: { padding: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  calTitle: { fontSize: 15, fontWeight: '700', color: DoctorColors.text },
  calDayRow: { flexDirection: 'row', marginBottom: 4 },
  calDayHeader: { flex: 1, textAlign: 'center', fontSize: 10, color: '#94a3b8', fontWeight: '700', letterSpacing: 0.5 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, minHeight: 62, padding: 3, borderRadius: 8 },
  dayNumWrap: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 3 },
  dayNumWrapToday: { backgroundColor: '#2563eb' },
  calDayNum: { fontSize: 12, fontWeight: '600', color: DoctorColors.text, textAlign: 'center' },
  calDayNumToday: { color: '#fff' },
  calPill: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginBottom: 2, width: '100%' },
  calPillText: { fontSize: 8, fontWeight: '600' },
  calMore: { fontSize: 8, color: '#94a3b8', paddingLeft: 2 },

  // Day modal (inline)
  dayModal: { margin: 14, backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  dayModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dayModalTitle: { fontSize: 14, fontWeight: '700', color: DoctorColors.text },

  // List tab
  listTabContainer: { flex: 1 },
  listFlatList: { flex: 1 },

  // Sub-tabs (List)
  subTabRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    flexShrink: 0,
  },
  subTab: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, marginRight: 8,
    backgroundColor: '#f1f5f9',
  },
  subTabActive: { backgroundColor: DoctorColors.primary },
  subTabText: { fontSize: 13, fontWeight: '600', color: DoctorColors.textSecondary },
  subTabTextActive: { color: '#fff' },

  // Appointment card
  apptCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  apptLeft: {},
  dateBadge: { width: 44, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dateBadgeMonth: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  dateBadgeDay: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  apptMid: { flex: 1 },
  apptPatient: { fontSize: 14, fontWeight: '700', color: DoctorColors.text, marginBottom: 3 },
  apptMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  apptMeta: { fontSize: 11, color: DoctorColors.textSecondary, marginRight: 4 },
  apptReason: { fontSize: 11, color: DoctorColors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: '#94a3b8' },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: DoctorColors.primary, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: DoctorColors.text, marginBottom: 10 },
  detailRows: { gap: 6, marginBottom: 14 },
  detailRow: { fontSize: 14, color: DoctorColors.textSecondary },
  actionBtns: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  bookFromDayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DoctorColors.primaryLight, borderRadius: 10, padding: 12, marginBottom: 12,
  },
  bookFromDayBtnText: { fontSize: 14, color: DoctorColors.primary, fontWeight: '700' },
  cancelBtn: { padding: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: '#64748b', fontWeight: '600' },

  // Book modal
  bookModal: { flex: 1, backgroundColor: '#fff' },
  bookHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
  },
  bookTitle: { fontSize: 18, fontWeight: '800', color: DoctorColors.text },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: DoctorColors.text, marginBottom: 8 },
  input: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 13,
    fontSize: 15, color: DoctorColors.text,
    borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 18,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: DoctorColors.primaryLight, borderColor: DoctorColors.primary },
  chipText: { fontSize: 13, color: DoctorColors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: DoctorColors.primary, fontWeight: '700' },
  noPatients: { fontSize: 13, color: '#94a3b8', marginBottom: 18, fontStyle: 'italic' },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  typeChipActive: { backgroundColor: DoctorColors.primary, borderColor: DoctorColors.primary },
  typeChipText: { fontSize: 12, fontWeight: '600', color: DoctorColors.textSecondary },
  typeChipTextActive: { color: '#fff' },
  bookFooter: {
    flexDirection: 'row', gap: 12, padding: 20,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  cancelBtn2: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText2: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  confirmBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: DoctorColors.primary,
  },
  confirmBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
