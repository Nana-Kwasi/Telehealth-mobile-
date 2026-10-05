import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId, getStoredEmail } from '../../services/apiClient';
import { payForBooking } from '../../services/paystack';
import { listenToAppointments } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';
import { getCallWindow } from '../../utils/callWindow';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getStatusColor(status) {
  switch (status) {
    case 'confirmed': return '#16a34a';
    case 'pending':   return '#d97706';
    case 'cancelled': return '#dc2626';
    case 'completed': return '#44474f';
    default:          return '#94a3b8';
  }
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fmtDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return 'D';
  const p = name.trim().split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const MedicalAppointmentsScreen = ({ navigation }) => {
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('list');
  const [activeFilter, setActiveFilter] = useState('upcoming');

  // Calendar nav
  const today = new Date();
  const TODAY = today.toISOString().split('T')[0];
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Modal: view appointments on a date
  const [modalDateAppts, setModalDateAppts] = useState(null);
  const [modalDateStr, setModalDateStr] = useState('');

  // Modal: schedule new appointment
  const [scheduleDay, setScheduleDay] = useState(null);
  const [myDoctors, setMyDoctors] = useState([]);
  const [sForm, setSForm] = useState({ doctorId: '', doctorName: '', doctorSpec: '', time: '09:00', type: 'video', reason: '' });
  const [sSaving, setSSaving] = useState(false);
  const [sError, setSError] = useState('');

  // Conflict detection
  const [conflict, setConflict] = useState(null);

  // Reschedule modal
  const [rescheduleAppt, setRescheduleAppt] = useState(null); // appointment being rescheduled
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  // Doctor calendar overlay
  const [showDocCal, setShowDocCal] = useState(false);
  const [docCalAppts, setDocCalAppts] = useState([]);
  const [docCalLoading, setDocCalLoading] = useState(false);
  const [docCalYear, setDocCalYear] = useState(today.getFullYear());
  const [docCalMonth, setDocCalMonth] = useState(today.getMonth());

  // ── Data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let unsubscribe = null;
    const setup = async () => {
      const uid = await getStoredUserId();
      if (!uid) { setIsLoading(false); return; }
      // Doctors the patient was prescribed by — so a patient who has a prescription
      // (but no appointment yet) can still book with their existing doctor.
      const rxDocs = [];
      try {
        const rxs = await api(`/api/v1/medical/prescriptions/patient/${uid}`).catch(() => []);
        const seenRx = new Set();
        for (const r of (rxs || [])) {
          if (r.doctorId && !seenRx.has(r.doctorId)) {
            seenRx.add(r.doctorId);
            rxDocs.push({ id: r.doctorId, name: r.doctorName || 'Doctor', spec: r.doctorSpecialization || '' });
          }
        }
      } catch { /* ignore */ }
      unsubscribe = listenToAppointments(uid, (appts) => {
        setAppointments(appts);
        // Build unique doctor list from appointments, then merge in prescription docs.
        const seen = new Set();
        const docs = [];
        for (const a of appts) {
          if (a.doctorId && !seen.has(a.doctorId)) {
            seen.add(a.doctorId);
            docs.push({ id: a.doctorId, name: a.doctorName || 'Doctor', spec: a.doctorSpecialization || '' });
          }
        }
        for (const rd of rxDocs) {
          if (!seen.has(rd.id)) { seen.add(rd.id); docs.push(rd); }
        }
        setMyDoctors(docs);
        setIsLoading(false);
      });
    };
    setup();
    return () => unsubscribe && unsubscribe();
  }, []);

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const daysInMonth = useCallback((y, m) => new Date(y, m + 1, 0).getDate(), []);
  const firstDayOfMonth = useCallback((y, m) => new Date(y, m, 1).getDay(), []);

  const apptsByDate = appointments.reduce((acc, a) => {
    if (!a.date) return acc;
    if (!acc[a.date]) acc[a.date] = [];
    acc[a.date].push(a);
    return acc;
  }, {});

  const buildCalCells = (y, m) => {
    const total = daysInMonth(y, m);
    const pad = firstDayOfMonth(y, m);
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const onDayPress = (day) => {
    const dateStr = toDateStr(calYear, calMonth, day);
    const isPast = dateStr < TODAY;
    const dayAppts = apptsByDate[dateStr] || [];
    if (isPast && dayAppts.length === 0) return;
    if (dayAppts.length > 0) {
      setModalDateStr(dateStr);
      setModalDateAppts(dayAppts);
    } else if (!isPast) {
      // A patient can only book with a doctor they already have. With no doctor,
      // the schedule modal had an empty picker and could never be submitted, so
      // send them to find one instead of opening a dead form.
      if (myDoctors.length === 0) {
        Alert.alert(
          'No doctor yet',
          'You need a doctor before you can schedule an appointment. Find a doctor first.',
        );
        return;
      }
      // Empty future date — open schedule modal
      setScheduleDay(dateStr);
      setConflict(null);
      setSError('');
      setSForm({ doctorId: '', doctorName: '', doctorSpec: '', time: '09:00', type: 'video', reason: '' });
    }
  };

  // ── Conflict detection ────────────────────────────────────────────────────
  const checkConflict = async (doctorId, date) => {
    if (!doctorId || !date) { setConflict(null); return; }
    try {
      const appts = await api(`/api/v1/medical/appointments/doctor/${doctorId}`);
      const results = (appts || []).filter(a => a.date === date && a.status !== 'cancelled');
      setConflict(results.length > 0 ? results : null);
    } catch {
      setConflict(null);
    }
  };

  const loadDoctorCalendar = async (doctorId) => {
    if (!doctorId) return;
    setDocCalLoading(true);
    try {
      const appts = await api(`/api/v1/medical/appointments/doctor/${doctorId}`);
      setDocCalAppts((appts || []).filter(a => a.status !== 'cancelled'));
    } catch (err) { console.error(err); }
    finally { setDocCalLoading(false); }
  };

  // ── Book new appointment ──────────────────────────────────────────────────
  const handleScheduleNew = async () => {
    if (!sForm.doctorId) { setSError('Please select a doctor.'); return; }
    if (!sForm.time)     { setSError('Please enter a time.'); return; }
    setSSaving(true); setSError('');
    try {
      const uid = await getStoredUserId();
      // The backend expects { doctorId, patientId, scheduledAt (LocalDateTime), notes }.
      // Combine the picked day + time into an ISO local datetime, and fold the
      // consultation type into the notes (the appointment row has no type column).
      const scheduledAt = `${scheduleDay}T${(sForm.time || '09:00')}:00`;
      const notes = [sForm.type ? `[${sForm.type}]` : '', sForm.reason || ''].filter(Boolean).join(' ').trim();
      // ── Pay before the appointment exists ────────────────────────────────
      // Medical consultations were booked without ever touching a gateway. The
      // fee comes from the selected doctor; a doctor with no fee set skips the
      // charge rather than blocking the booking.
      const chosen = myDoctors.find((d) => d.id === sForm.doctorId);
      const fee = Number(chosen?.consultationFee ?? 0);
      const payerEmail = await getStoredEmail();
      const paid = await payForBooking({
        email: payerEmail,
        amount: fee,
        purpose: 'medical',
        metadata: { doctorId: sForm.doctorId, patientId: uid },
      });

      if (!paid.ok) {
        setSError(paid.reason || 'Payment was not completed.');
        setSSaving(false);
        return;
      }

      await api('/api/v1/medical/appointments', {
        method: 'POST',
        body: {
          doctorId: sForm.doctorId,
          patientId: uid,
          scheduledAt,
          notes,
          paymentReference: paid.reference,
          consultationFee: paid.amount,
        },
      });
      setScheduleDay(null);
      setConflict(null);
      setSForm({ doctorId: '', doctorName: '', doctorSpec: '', time: '09:00', type: 'video', reason: '' });
    } catch (err) {
      console.error(err);
      setSError('Failed to book. Please try again.');
    } finally { setSSaving(false); }
  };

  // ── Reschedule appointment ────────────────────────────────────────────────
  const openReschedule = (appt) => {
    setRescheduleAppt(appt);
    setRescheduleDate(appt.date || '');
    setRescheduleTime(appt.time || '');
    setRescheduleError('');
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) { setRescheduleError('Please enter a new date.'); return; }
    if (!rescheduleTime) { setRescheduleError('Please enter a new time.'); return; }
    if (rescheduleDate < TODAY) { setRescheduleError('Please choose a future date.'); return; }
    setRescheduleSaving(true);
    setRescheduleError('');
    try {
      await api(`/api/v1/care/appointments/${rescheduleAppt.id}/reschedule`, {
        method: 'PATCH',
        body: { newDate: rescheduleDate, newTime: rescheduleTime },
      });
      setRescheduleAppt(null);
    } catch (err) {
      console.error('Reschedule error:', err);
      setRescheduleError('Failed to reschedule. Please try again.');
    } finally {
      setRescheduleSaving(false);
    }
  };

  // Doctor calendar busy map
  const docBusyDates = docCalAppts.reduce((acc, a) => {
    if (a.date) acc[a.date] = (acc[a.date] || 0) + 1;
    return acc;
  }, {});

  // ── List helpers ──────────────────────────────────────────────────────────
  const filteredAppointments = appointments.filter((a) => {
    if (activeFilter === 'upcoming')  return a.date >= TODAY && a.status !== 'cancelled' && a.status !== 'completed';
    if (activeFilter === 'completed') return a.status === 'completed';
    if (activeFilter === 'cancelled') return a.status === 'cancelled';
    return true;
  });

  const renderAppointment = ({ item }) => (
    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: getStatusColor(item.status) }]}>
      <View style={styles.doctorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.doctorName)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.doctorName}>Dr. {item.doctorName || 'Doctor'}</Text>
          <Text style={styles.specialty}>{item.doctorSpecialization || 'General'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {(item.status || 'pending').charAt(0).toUpperCase() + (item.status || 'pending').slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={MedicalColors.textSecondary} />
          <Text style={styles.detailText}>{item.date || 'TBD'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={14} color={MedicalColors.textSecondary} />
          <Text style={styles.detailText}>{item.time || 'TBD'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons
            name={item.consultationType === 'video' ? 'videocam-outline' : item.consultationType === 'chat' ? 'chatbubble-outline' : 'medical-outline'}
            size={14}
            color={MedicalColors.textSecondary}
          />
          <Text style={styles.detailText}>
            {item.consultationType ? item.consultationType.charAt(0).toUpperCase() + item.consultationType.slice(1) : 'Video'}
          </Text>
        </View>
      </View>

      <View style={styles.apptBtnRow}>
        {/* Joinable only inside the scheduled window. Offering "Join" on an
            appointment days away gives the patient nothing to join. */}
        {item.status === 'confirmed' && !getCallWindow(item).canStart && (
          <View style={[styles.joinBtn, { backgroundColor: '#f1f5f9' }]}>
            <Ionicons name="time-outline" size={14} color="#64748b" />
            <Text style={[styles.joinBtnText, { color: '#64748b' }]}>
              {getCallWindow(item).state === 'ended' ? 'Window closed' : `Opens ${getCallWindow(item).waitLabel}`}
            </Text>
          </View>
        )}
        {item.status === 'confirmed' && getCallWindow(item).canStart && (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => navigation.navigate('MedicalVideo')}
          >
            <Ionicons name="videocam" size={14} color="#FFFFFF" />
            <Text style={styles.joinBtnText}>Join Video Call</Text>
          </TouchableOpacity>
        )}
        {(item.status === 'pending' || item.status === 'confirmed') && (
          <TouchableOpacity
            style={styles.rescheduleBtn}
            onPress={() => openReschedule(item)}
          >
            <Ionicons name="calendar-outline" size={14} color={MedicalColors.primary} />
            <Text style={styles.rescheduleBtnText}>Reschedule</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ── Calendar renderer ─────────────────────────────────────────────────────
  const renderCalendar = () => {
    const cells = buildCalCells(calYear, calMonth);
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Gradient header */}
        <View style={styles.calGradientHeader}>
          <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
            <Ionicons name="chevron-back" size={20} color="white" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.calMonthTitle}>{MONTHS[calMonth]}</Text>
            <Text style={styles.calYearSub}>{calYear}</Text>
          </View>
          <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.calBody}>
          {/* Day labels */}
          <View style={styles.calDayLabels}>
            {DAYS.map((d, i) => (
              <Text key={d} style={[styles.calDayLabel, (i === 0 || i === 6) && { color: '#f87171' }]}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.calGrid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`pad-${idx}`} style={styles.calCell} />;
              const dateStr = toDateStr(calYear, calMonth, day);
              const isPast = dateStr < TODAY;
              const isToday = dateStr === TODAY;
              const dayAppts = apptsByDate[dateStr] || [];
              const isWeekend = (idx % 7 === 0) || (idx % 7 === 6);
              const hasConfirmed = dayAppts.some(a => a.status === 'confirmed');
              const hasPending   = dayAppts.some(a => a.status === 'pending');

              let cellBg = 'transparent';
              let cellBorder = 'transparent';
              if (isToday) { cellBg = '#eff6ff'; cellBorder = '#2563eb'; }
              else if (hasConfirmed) { cellBg = '#f0fdf4'; cellBorder = '#86efac'; }
              else if (hasPending)   { cellBg = '#fffbeb'; cellBorder = '#fde68a'; }

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    styles.calCell,
                    { backgroundColor: cellBg, borderColor: cellBorder, borderWidth: isToday ? 2 : 1.5 },
                    isPast && dayAppts.length === 0 && { opacity: 0.3 },
                  ]}
                  onPress={() => onDayPress(day)}
                  disabled={isPast && dayAppts.length === 0}
                  activeOpacity={0.75}
                >
                  <View style={[styles.calDayCircle, isToday && styles.calDayCircleToday]}>
                    <Text style={[
                      styles.calDayNum,
                      isToday && styles.calDayNumToday,
                      isPast && { color: '#94a3b8' },
                      isWeekend && !isPast && !isToday && { color: '#ef4444' },
                    ]}>
                      {day}
                    </Text>
                  </View>
                  {dayAppts.length > 0 && (
                    <View style={styles.calChipsCol}>
                      {dayAppts.slice(0, 2).map((a, i) => (
                        <View
                          key={i}
                          style={[styles.calChipPill, { backgroundColor: getStatusColor(a.status) + '22', borderColor: getStatusColor(a.status) + '66' }]}
                        >
                          <Text style={[styles.calChipText, { color: getStatusColor(a.status) }]} numberOfLines={1}>
                            {a.time ? a.time.slice(0, 5) : ''}
                          </Text>
                        </View>
                      ))}
                      {dayAppts.length > 2 && (
                        <Text style={styles.calChipMore}>+{dayAppts.length - 2}</Text>
                      )}
                    </View>
                  )}
                  {dayAppts.length === 0 && !isPast && (
                    <Ionicons name="add" size={11} color="#cbd5e1" style={{ marginTop: 2 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.calLegend}>
            {[['#16a34a','#f0fdf4','Confirmed'],['#d97706','#fffbeb','Pending'],['#44474f','#f8fafc','Completed']].map(([c, bg, l]) => (
              <View key={l} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: bg, borderColor: c + '66' }]} />
                <Text style={styles.legendText}>{l}</Text>
              </View>
            ))}
            <Text style={styles.legendHint}>Tap + to schedule</Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  // ── Doctor calendar overlay renderer ─────────────────────────────────────
  const renderDocCalendar = () => {
    const cells = buildCalCells(docCalYear, docCalMonth);
    const TODAY_STR = new Date().toISOString().split('T')[0];
    return (
      <View>
        {/* Month nav */}
        <View style={styles.docCalHeader}>
          <TouchableOpacity
            style={styles.docCalNavBtn}
            onPress={() => { if (docCalMonth === 0) { setDocCalYear(y => y - 1); setDocCalMonth(11); } else setDocCalMonth(m => m - 1); }}
          >
            <Ionicons name="chevron-back" size={18} color="white" />
          </TouchableOpacity>
          <Text style={styles.docCalTitle}>{MONTHS_SHORT[docCalMonth]} {docCalYear}</Text>
          <TouchableOpacity
            style={styles.docCalNavBtn}
            onPress={() => { if (docCalMonth === 11) { setDocCalYear(y => y + 1); setDocCalMonth(0); } else setDocCalMonth(m => m + 1); }}
          >
            <Ionicons name="chevron-forward" size={18} color="white" />
          </TouchableOpacity>
        </View>

        {docCalLoading ? (
          <ActivityIndicator size="small" color={MedicalColors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <>
            <View style={styles.docCalDayLabels}>
              {DAYS.map(d => <Text key={d} style={styles.docCalDayLabel}>{d}</Text>)}
            </View>
            <View style={styles.docCalGrid}>
              {cells.map((day, idx) => {
                if (!day) return <View key={`dcp-${idx}`} style={styles.docCalCell} />;
                const dateStr = `${docCalYear}-${String(docCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isPast = dateStr < TODAY_STR;
                const busyCount = docBusyDates[dateStr] || 0;
                const isBusy = busyCount > 0;

                let cellBg = isPast ? '#f8fafc' : '#f0fdf4'; // default green = free
                let textColor = isPast ? '#94a3b8' : '#0f5628';
                if (isBusy) { cellBg = '#fff7ed'; textColor = '#c2410c'; }
                if (isPast) { cellBg = '#f8fafc'; textColor = '#94a3b8'; }

                return (
                  <View key={dateStr} style={[styles.docCalCell, { backgroundColor: cellBg }]}>
                    <Text style={[styles.docCalDayNum, { color: textColor }]}>{day}</Text>
                    {isBusy && !isPast && (
                      <Text style={styles.docCalBusyCount}>{busyCount}</Text>
                    )}
                    {!isBusy && !isPast && (
                      <Ionicons name="checkmark" size={9} color="#16a34a" />
                    )}
                  </View>
                );
              })}
            </View>
            {/* Legend */}
            <View style={styles.docCalLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]} />
                <Text style={styles.legendText}>Free</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]} />
                <Text style={styles.legendText}>Busy</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]} />
                <Text style={styles.legendText}>Past</Text>
              </View>
            </View>
          </>
        )}
      </View>
    );
  };

  // ── Schedule modal ────────────────────────────────────────────────────────
  const TYPE_OPTIONS = [
    { key: 'video', label: 'Video', icon: 'videocam-outline' },
    { key: 'audio', label: 'Audio', icon: 'call-outline' },
    { key: 'chat',  label: 'Chat',  icon: 'chatbubble-outline' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* View toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'list' && styles.toggleBtnActive]}
          onPress={() => setView('list')}
        >
          <Ionicons name="list-outline" size={16} color={view === 'list' ? '#FFFFFF' : MedicalColors.textSecondary} />
          <Text style={[styles.toggleText, view === 'list' && styles.toggleTextActive]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, view === 'calendar' && styles.toggleBtnActive]}
          onPress={() => setView('calendar')}
        >
          <Ionicons name="calendar-outline" size={16} color={view === 'calendar' ? '#FFFFFF' : MedicalColors.textSecondary} />
          <Text style={[styles.toggleText, view === 'calendar' && styles.toggleTextActive]}>Calendar</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={MedicalColors.primary} />
        </View>
      ) : view === 'calendar' ? (
        renderCalendar()
      ) : (
        <>
          <View style={styles.filterRow}>
            {['upcoming', 'completed', 'cancelled', 'all'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {filteredAppointments.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="calendar-outline" size={56} color={MedicalColors.textLight} />
              <Text style={styles.emptyTitle}>No {activeFilter} appointments</Text>
              {activeFilter === 'upcoming' && (
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => {
                    // Already assigned to a doctor → open the booking modal directly
                    // (same as tapping a free day on the calendar). Only send brand-new
                    // patients with no doctor to the doctor search.
                    if (myDoctors.length > 0) {
                      setConflict(null);
                      setSError('');
                      setSForm({ doctorId: '', doctorName: '', doctorSpec: '', time: '09:00', type: 'video', reason: '' });
                      setScheduleDay(TODAY);
                    } else {
                      navigation.getParent()?.navigate('DoctorSearch');
                    }
                  }}
                >
                  <Text style={styles.bookBtnText}>Book an Appointment</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={filteredAppointments}
              renderItem={renderAppointment}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* ══ VIEW APPOINTMENTS MODAL ══ */}
      <Modal
        visible={!!modalDateAppts}
        transparent
        animationType="slide"
        onRequestClose={() => setModalDateAppts(null)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modal}>
            {/* Header */}
            <View style={styles.modalHeaderGrad}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>{fmtDateLabel(modalDateStr)}</Text>
                <Text style={styles.modalHeaderSub}>{(modalDateAppts || []).length} appointment{(modalDateAppts || []).length !== 1 ? 's' : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalDateAppts(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(modalDateAppts || []).map((a) => (
                <View key={a.id} style={[styles.modalCard, { borderLeftColor: getStatusColor(a.status) }]}>
                  <View style={styles.modalCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalDocName}>Dr. {a.doctorName || 'Doctor'}</Text>
                      <Text style={styles.modalDocSpec}>
                        {a.time || 'TBD'} · {a.consultationType || 'Video'}
                        {a.doctorSpecialization ? ` · ${a.doctorSpecialization}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(a.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(a.status) }]}>
                        {(a.status || 'pending').charAt(0).toUpperCase() + (a.status || 'pending').slice(1)}
                      </Text>
                    </View>
                  </View>
                  {a.reason ? <Text style={styles.modalReason}>"{a.reason}"</Text> : null}
                  <View style={styles.modalCardActions}>
                    {a.status === 'confirmed' && !getCallWindow(a).canStart && (
                      <View style={[styles.joinBtnFull, { backgroundColor: '#f1f5f9' }]}>
                        <Ionicons name="time-outline" size={15} color="#64748b" />
                        <Text style={[styles.joinBtnText, { color: '#64748b' }]}>
                          {getCallWindow(a).state === 'ended' ? 'Window closed' : `Opens ${getCallWindow(a).waitLabel}`}
                        </Text>
                      </View>
                    )}
                    {a.status === 'confirmed' && getCallWindow(a).canStart && (
                      <TouchableOpacity
                        style={styles.joinBtnFull}
                        onPress={() => { setModalDateAppts(null); navigation.navigate('MedicalVideo'); }}
                      >
                        <Ionicons name="videocam" size={15} color="#FFFFFF" />
                        <Text style={styles.joinBtnText}>Join Video Call</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.outlineBtn, a.status === 'confirmed' && { flex: 0 }]}
                      onPress={() => { setModalDateAppts(null); navigation.navigate('MedicalMessages'); }}
                    >
                      <Ionicons name="chatbubbles-outline" size={15} color={MedicalColors.primary} />
                      <Text style={styles.outlineBtnText}>Message</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Footer: book another slot */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.footerBookBtn}
                onPress={() => {
                  setModalDateAppts(null);
                  setScheduleDay(modalDateStr);
                  setConflict(null);
                  setSError('');
                  setSForm({ doctorId: '', doctorName: '', doctorSpec: '', time: '09:00', type: 'video', reason: '' });
                }}
              >
                <Ionicons name="add-circle-outline" size={17} color={MedicalColors.primary} />
                <Text style={styles.footerBookBtnText}>Book Another Slot</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ SCHEDULE NEW APPOINTMENT MODAL ══ */}
      <Modal
        visible={!!scheduleDay}
        transparent
        animationType="slide"
        onRequestClose={() => { setScheduleDay(null); setSError(''); setConflict(null); }}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={[styles.modal, { maxHeight: '90%' }]}>
            {/* Header */}
            <View style={styles.modalHeaderGrad}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>Book Appointment</Text>
                <Text style={styles.modalHeaderSub}>{fmtDateLabel(scheduleDay || '')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { setScheduleDay(null); setSError(''); setConflict(null); }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>

              {/* Doctor selector */}
              <Text style={styles.formLabel}>Select Doctor</Text>
              {myDoctors.length === 0 ? (
                <View style={styles.noDoctorBox}>
                  <Ionicons name="person-outline" size={20} color={MedicalColors.textSecondary} />
                  <Text style={styles.noDoctorText}>No doctors yet.</Text>
                  <TouchableOpacity
                    style={styles.findDocSmallBtn}
                    onPress={() => { setScheduleDay(null); navigation.getParent()?.navigate('DoctorSearch'); }}
                  >
                    <Text style={styles.findDocSmallBtnText}>Find a Doctor</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.doctorSelectList}>
                  {myDoctors.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.doctorSelectRow, sForm.doctorId === d.id && styles.doctorSelectRowActive]}
                      onPress={async () => {
                        setSForm(f => ({ ...f, doctorId: d.id, doctorName: d.name, doctorSpec: d.spec }));
                        await checkConflict(d.id, scheduleDay);
                      }}
                    >
                      <View style={styles.doctorSelectAvatar}>
                        <Text style={styles.doctorSelectAvatarText}>{getInitials(d.name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.doctorSelectName, sForm.doctorId === d.id && { color: MedicalColors.primary }]}>
                          Dr. {d.name}
                        </Text>
                        {d.spec ? <Text style={styles.doctorSelectSpec}>{d.spec}</Text> : null}
                      </View>
                      {sForm.doctorId === d.id && (
                        <Ionicons name="checkmark-circle" size={20} color={MedicalColors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Conflict warning */}
              {conflict && (
                <View style={styles.conflictBox}>
                  <View style={styles.conflictTop}>
                    <Ionicons name="alert-circle" size={18} color="#ea580c" style={{ flexShrink: 0 }} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.conflictTitle}>
                        Dr. {sForm.doctorName} is busy on this date
                      </Text>
                      <Text style={styles.conflictSub}>
                        {conflict.length} appointment{conflict.length > 1 ? 's' : ''} already scheduled. You can still book — doctor will confirm if available.
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.viewDocCalBtn}
                    onPress={async () => {
                      setDocCalYear(today.getFullYear());
                      setDocCalMonth(today.getMonth());
                      await loadDoctorCalendar(sForm.doctorId);
                      setShowDocCal(true);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={15} color="#ea580c" />
                    <Text style={styles.viewDocCalBtnText}>View Doctor's Calendar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Time */}
              <Text style={styles.formLabel}>Preferred Time</Text>
              <TextInput
                style={styles.formInput}
                value={sForm.time}
                onChangeText={(v) => setSForm(f => ({ ...f, time: v }))}
                placeholder="e.g. 09:00"
                placeholderTextColor={MedicalColors.textLight}
              />

              {/* Consultation type */}
              <Text style={styles.formLabel}>Consultation Type</Text>
              <View style={styles.typeRow}>
                {TYPE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.typeBtn, sForm.type === opt.key && styles.typeBtnActive]}
                    onPress={() => setSForm(f => ({ ...f, type: opt.key }))}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={sForm.type === opt.key ? MedicalColors.primary : MedicalColors.textSecondary}
                    />
                    <Text style={[styles.typeBtnText, sForm.type === opt.key && { color: MedicalColors.primary, fontWeight: '700' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Reason */}
              <Text style={styles.formLabel}>Reason <Text style={styles.formLabelOpt}>(optional)</Text></Text>
              <TextInput
                style={[styles.formInput, styles.formTextarea]}
                value={sForm.reason}
                onChangeText={(v) => setSForm(f => ({ ...f, reason: v }))}
                placeholder="Describe your symptoms or reason…"
                placeholderTextColor={MedicalColors.textLight}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {sError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{sError}</Text>
                </View>
              ) : null}
            </ScrollView>

            {/* Footer actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setScheduleDay(null); setSError(''); setConflict(null); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookNowBtn, (sSaving || myDoctors.length === 0) && { opacity: 0.6 }]}
                onPress={handleScheduleNew}
                disabled={sSaving || myDoctors.length === 0}
              >
                <Ionicons name="videocam" size={16} color="white" />
                <Text style={styles.bookNowBtnText}>{sSaving ? 'Booking…' : 'Request Appointment'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ DOCTOR CALENDAR OVERLAY MODAL ══ */}
      <Modal
        visible={showDocCal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDocCal(false)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={[styles.modal, { maxHeight: '80%' }]}>
            <View style={[styles.modalHeaderGrad, { backgroundColor: '#1e40af' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>Dr. {sForm.doctorName}'s Calendar</Text>
                <Text style={styles.modalHeaderSub}>Green = free · Orange = busy</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDocCal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {renderDocCalendar()}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.bookNowBtn}
                onPress={() => setShowDocCal(false)}
              >
                <Text style={styles.bookNowBtnText}>Got it — Back to Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ RESCHEDULE MODAL ══ */}
      <Modal
        visible={!!rescheduleAppt}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleAppt(null)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={[styles.modal, { maxHeight: '60%' }]}>
            <View style={[styles.modalHeaderGrad, { backgroundColor: '#7c3aed' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTitle}>Reschedule Appointment</Text>
                <Text style={styles.modalHeaderSub}>
                  Dr. {rescheduleAppt?.doctorName || 'Doctor'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRescheduleAppt(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.formLabel}>New Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.formInput}
                value={rescheduleDate}
                onChangeText={setRescheduleDate}
                placeholder="e.g., 2026-04-15"
                placeholderTextColor={MedicalColors.textLight}
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.formLabel}>New Time (HH:MM)</Text>
              <TextInput
                style={styles.formInput}
                value={rescheduleTime}
                onChangeText={setRescheduleTime}
                placeholder="e.g., 14:00"
                placeholderTextColor={MedicalColors.textLight}
                keyboardType="numbers-and-punctuation"
              />

              {rescheduleError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{rescheduleError}</Text>
                </View>
              ) : null}

              <Text style={{ fontSize: 12, color: MedicalColors.textSecondary, marginTop: 8, lineHeight: 18 }}>
                The appointment status will change to Pending and your doctor will be notified of the change.
              </Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRescheduleAppt(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookNowBtn, { backgroundColor: '#7c3aed' }, rescheduleSaving && { opacity: 0.6 }]}
                onPress={handleReschedule}
                disabled={rescheduleSaving}
              >
                <Ionicons name="calendar-outline" size={16} color="white" />
                <Text style={styles.bookNowBtnText}>{rescheduleSaving ? 'Saving…' : 'Confirm Reschedule'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MedicalColors.background },

  /* Toggle */
  toggleRow: {
    flexDirection: 'row',
    margin: 16, marginBottom: 8,
    backgroundColor: MedicalColors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: MedicalColors.border,
    overflow: 'hidden',
  },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  toggleBtnActive: { backgroundColor: MedicalColors.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: MedicalColors.textSecondary },
  toggleTextActive: { color: '#FFFFFF' },

  /* Filters */
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  filterChip: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, backgroundColor: MedicalColors.surface, borderWidth: 1, borderColor: MedicalColors.border },
  filterChipActive: { backgroundColor: MedicalColors.primary, borderColor: MedicalColors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: MedicalColors.textSecondary },
  filterTextActive: { color: '#FFFFFF' },

  /* Card */
  card: { backgroundColor: MedicalColors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: MedicalColors.border },
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: MedicalColors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700', color: MedicalColors.primary },
  doctorName: { fontSize: 15, fontWeight: '700', color: MedicalColors.text },
  specialty: { fontSize: 12, color: MedicalColors.textSecondary },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: MedicalColors.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 13, color: MedicalColors.textSecondary },
  apptBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  joinBtn: { flex: 1, backgroundColor: MedicalColors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  joinBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  rescheduleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: MedicalColors.primary, backgroundColor: MedicalColors.primaryLight },
  rescheduleBtnText: { color: MedicalColors.primary, fontWeight: '600', fontSize: 13 },

  /* Empty / Center */
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: MedicalColors.text, marginTop: 14 },
  bookBtn: { marginTop: 16, backgroundColor: MedicalColors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  bookBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  /* ── Beautiful Calendar ── */
  calGradientHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: MedicalColors.primary,
    paddingHorizontal: 20, paddingVertical: 18,
  },
  calNavBtn: {
    width: 36, height: 36, borderRadius: 9,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  calMonthTitle: { fontSize: 18, fontWeight: '800', color: 'white' },
  calYearSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 1 },

  calBody: { paddingHorizontal: 10, paddingTop: 12 },
  calDayLabels: { flexDirection: 'row', marginBottom: 6 },
  calDayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94a3b8' },

  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  calCell: {
    width: (SCREEN_WIDTH - 20 - 6 * 4) / 7,
    minHeight: 72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 5,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  calDayCircle: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  calDayCircleToday: { backgroundColor: MedicalColors.primary },
  calDayNum: { fontSize: 13, fontWeight: '400', color: '#0f172a' },
  calDayNumToday: { color: 'white', fontWeight: '800' },

  calChipsCol: { gap: 2, width: '92%' },
  calChipPill: {
    borderRadius: 4, borderWidth: 1, paddingHorizontal: 3, paddingVertical: 1,
  },
  calChipText: { fontSize: 9, fontWeight: '600' },
  calChipMore: { fontSize: 9, color: '#64748b', fontWeight: '600', textAlign: 'center' },

  calLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12, paddingBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 20, height: 12, borderRadius: 3, borderWidth: 1.5 },
  legendText: { fontSize: 11, color: MedicalColors.textSecondary },
  legendHint: { fontSize: 10, color: '#94a3b8', marginLeft: 'auto' },

  /* ── Doctor Calendar Overlay ── */
  docCalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e40af', borderRadius: 10, padding: 10, marginBottom: 10,
  },
  docCalNavBtn: {
    width: 30, height: 30, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  docCalTitle: { fontSize: 15, fontWeight: '700', color: 'white' },
  docCalDayLabels: { flexDirection: 'row', marginBottom: 4 },
  docCalDayLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: '#94a3b8' },
  docCalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  docCalCell: {
    width: (SCREEN_WIDTH - 64 - 6 * 4) / 7,
    aspectRatio: 0.85,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  docCalDayNum: { fontSize: 12, fontWeight: '600' },
  docCalBusyCount: { fontSize: 9, fontWeight: '700', color: '#c2410c' },
  docCalLegend: { flexDirection: 'row', gap: 12, paddingTop: 10, flexWrap: 'wrap' },

  /* ── Modals ── */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' },

  modalHeaderGrad: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MedicalColors.primary,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 18,
  },
  modalHeaderTitle: { fontSize: 16, fontWeight: '700', color: 'white' },
  modalHeaderSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginLeft: 10,
  },

  modalCard: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4,
  },
  modalCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  modalDocName: { fontSize: 15, fontWeight: '700', color: MedicalColors.text, marginBottom: 2 },
  modalDocSpec: { fontSize: 12, color: MedicalColors.textSecondary },
  modalReason: { fontSize: 13, color: '#475569', fontStyle: 'italic', marginTop: 6, marginBottom: 2 },
  modalCardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  joinBtnFull: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: MedicalColors.primary, paddingVertical: 9, borderRadius: 9,
  },
  outlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: MedicalColors.primary, paddingVertical: 9, borderRadius: 9,
  },
  outlineBtnText: { color: MedicalColors.primary, fontSize: 13, fontWeight: '600' },

  modalFooter: {
    flexDirection: 'row', gap: 10, padding: 14,
    borderTopWidth: 1, borderTopColor: MedicalColors.border,
  },
  footerBookBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: MedicalColors.primary, paddingVertical: 11, borderRadius: 10,
  },
  footerBookBtnText: { color: MedicalColors.primary, fontSize: 14, fontWeight: '600' },

  /* Schedule modal form */
  formLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 7, marginTop: 14 },
  formLabelOpt: { fontWeight: '400', color: '#94a3b8' },
  formInput: {
    borderWidth: 1.5, borderColor: MedicalColors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: MedicalColors.text, backgroundColor: 'white',
  },
  formTextarea: { minHeight: 80, textAlignVertical: 'top' },

  doctorSelectList: { gap: 8 },
  doctorSelectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: MedicalColors.border,
    backgroundColor: MedicalColors.surface,
  },
  doctorSelectRowActive: { borderColor: MedicalColors.primary, backgroundColor: '#eff6ff' },
  doctorSelectAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: MedicalColors.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  doctorSelectAvatarText: { fontSize: 15, fontWeight: '700', color: MedicalColors.primary },
  doctorSelectName: { fontSize: 14, fontWeight: '600', color: MedicalColors.text },
  doctorSelectSpec: { fontSize: 12, color: MedicalColors.textSecondary, marginTop: 1 },

  noDoctorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: MedicalColors.border,
  },
  noDoctorText: { flex: 1, fontSize: 13, color: MedicalColors.textSecondary },
  findDocSmallBtn: { backgroundColor: MedicalColors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  findDocSmallBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },

  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: MedicalColors.border,
    backgroundColor: MedicalColors.surface,
  },
  typeBtnActive: { borderColor: MedicalColors.primary, backgroundColor: '#eff6ff' },
  typeBtnText: { fontSize: 12, fontWeight: '600', color: MedicalColors.textSecondary },

  /* Conflict */
  conflictBox: {
    backgroundColor: '#fff7ed', borderWidth: 1.5, borderColor: '#fed7aa',
    borderRadius: 12, padding: 12, marginTop: 10,
  },
  conflictTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  conflictTitle: { fontSize: 13, fontWeight: '700', color: '#9a3412', marginBottom: 3 },
  conflictSub: { fontSize: 12, color: '#c2410c', lineHeight: 17 },
  viewDocCalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#fed7aa', borderRadius: 9, paddingVertical: 9,
  },
  viewDocCalBtnText: { color: '#ea580c', fontSize: 13, fontWeight: '600' },

  errorBox: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginTop: 6 },
  errorText: { color: '#dc2626', fontSize: 13 },

  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: MedicalColors.border, alignItems: 'center',
  },
  cancelBtnText: { color: MedicalColors.textSecondary, fontSize: 14, fontWeight: '600' },
  bookNowBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: MedicalColors.primary, paddingVertical: 12, borderRadius: 10,
  },
  bookNowBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
});

export default MedicalAppointmentsScreen;
