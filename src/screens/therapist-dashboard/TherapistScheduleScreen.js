import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TherapistColors } from '../../constants/colors';
import {
  loadTherapistCalendarClients,
  loadTherapistScheduledCalls,
  loadTherapistTherapyNotes,
  scheduleTherapistCalendarCall,
  getCalendarMonthDays,
  getCallsForDate,
  getMoodEmoji,
  getInterventionColor,
  isPendingRequest,
  acceptScheduledCall,
  declineScheduledCall,
} from '../../services/therapistCalendarService';
import { generateCalendarReport } from '../../services/therapistCalendarReportsService';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DURATIONS = [15, 30, 45, 60, 90];

const REPORT_TYPES = [
  { id: 'client-progress', label: 'My client progress' },
  { id: 'therapy-notes', label: 'My therapy notes' },
  { id: 'scheduled-calls', label: 'My scheduled calls' },
  { id: 'system-overview', label: 'System overview (admin)', adminOnly: true },
];

function fmt12(ts) {
  if (!ts) return '';
  const dt = ts.toDate ? ts.toDate() : new Date(ts);
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function TherapistScheduleScreen({ profile }) {
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [respondingCallId, setRespondingCallId] = useState(null);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [dayDetail, setDayDetail] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleClient, setScheduleClient] = useState(null);
  const [scheduleDateTime, setScheduleDateTime] = useState(new Date(Date.now() + 3600000));
  const [scheduleDuration, setScheduleDuration] = useState('30');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [schedulePicker, setSchedulePicker] = useState(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [reportType, setReportType] = useState('client-progress');
  const [reportStart, setReportStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [reportEnd, setReportEnd] = useState(new Date());
  const [reportData, setReportData] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportPicker, setReportPicker] = useState(null);
  const [therapistUid, setTherapistUid] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then(uid => setTherapistUid(uid || null));
  }, []);

  const calendarDays = useMemo(() => getCalendarMonthDays(currentDate), [currentDate]);

  // Requests awaiting an answer, and the confirmed agenda the grid should show.
  // Declined calls stay in the data (so the client can see the outcome) but must
  // not draw a marker on the therapist's calendar. Declared before the memos that
  // consume them — a `const` used above its declaration is a TDZ crash, not a hoist.
  const pendingRequests = useMemo(() => scheduledCalls.filter(isPendingRequest), [scheduledCalls]);
  const confirmedCalls = useMemo(
    () => scheduledCalls.filter(
      (c) => !isPendingRequest(c) && String(c.status || '').toLowerCase() !== 'declined',
    ),
    [scheduledCalls],
  );

  const selectedDateCalls = useMemo(
    () => getCallsForDate(confirmedCalls, selectedDate),
    [confirmedCalls, selectedDate]
  );

  const loadAll = useCallback(async () => {
    if (!therapistUid) return;
    try {
      const clientList = await loadTherapistCalendarClients(therapistUid, { lite: true });
      const [calls, notes] = await Promise.all([
        loadTherapistScheduledCalls(therapistUid),
        loadTherapistTherapyNotes(therapistUid, clientList),
      ]);
      setClients(clientList);
      setScheduledCalls(calls);
      setTherapyNotes(notes);
    } catch (e) {
      console.error('Calendar load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [therapistUid]);

  useEffect(() => {
    const admin =
      profile?.role === 'admin' ||
      profile?.type === 'Administrator' ||
      profile?.isAdminTherapist === true;
    setIsAdmin(admin);
    if (!admin && reportType === 'system-overview') {
      setReportType('client-progress');
    }
  }, [profile]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  const formatCallDateTime = (scheduledTime) => {
    const d = scheduledTime?.toDate?.() ? scheduledTime.toDate() : new Date(scheduledTime);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  const respondToRequest = async (call, accept) => {
    setRespondingCallId(call.id);
    try {
      if (accept) await acceptScheduledCall(call.id, therapistUid);
      else await declineScheduledCall(call.id, therapistUid);
      // Re-read so the accepted session drops straight into the grid below.
      await loadAll();
      Alert.alert(
        accept ? 'Session confirmed' : 'Request declined',
        accept
          ? `The session with ${call.clientName || 'your client'} is now on your calendar.`
          : `${call.clientName || 'Your client'} will see that this request was declined.`,
      );
    } catch (e) {
      Alert.alert('Could not update request', e.message || 'Please try again.');
    } finally {
      setRespondingCallId(null);
    }
  };

  const isToday = (date) => date.toDateString() === new Date().toDateString();
  const isSelected = (date) => selectedDate && date.toDateString() === selectedDate.toDateString();
  const isCurrentMonth = (date) => date.getMonth() === currentDate.getMonth();

  // No assigned clients → nothing legitimate to schedule. Without this the modal
  // opened with an empty client picker and every save failed on "Select client",
  // which reads as a broken screen rather than "you have no clients yet".
  const canSchedule = clients.length > 0;

  // Tapping a day: show what's booked, or start scheduling on a free future day.
  const handleDayPress = (date, calls) => {
    setSelectedDate(date);
    if (calls.length > 0) { setDayDetail({ date, calls }); return; }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (date < startOfToday) return;
    if (!canSchedule) {
      Alert.alert(
        'No clients assigned',
        'You can schedule sessions once a client has been assigned to you.',
      );
      return;
    }
    const base = new Date(date);
    base.setHours(9, 0, 0, 0);
    setScheduleDateTime(base <= new Date() ? new Date(Date.now() + 3600000) : base);
    setScheduleClient(clients[0] || null);
    setScheduleDuration('30');
    setScheduleNotes('');
    setShowScheduleModal(true);
  };

  const openScheduleModal = () => {
    if (!canSchedule) {
      Alert.alert(
        'No clients assigned',
        'You can schedule sessions once a client has been assigned to you.',
      );
      return;
    }
    const base = new Date(selectedDate);
    base.setHours(base.getHours() + 1, 0, 0, 0);
    if (base <= new Date()) {
      const next = new Date(Date.now() + 3600000);
      setScheduleDateTime(next);
    } else {
      setScheduleDateTime(base);
    }
    setScheduleClient(clients[0] || null);
    setScheduleDuration('30');
    setScheduleNotes('');
    setShowScheduleModal(true);
  };

  const submitSchedule = async () => {
    if (!scheduleClient) {
      Alert.alert('Select client', 'Choose a client for this session.');
      return;
    }
    setSavingSchedule(true);
    try {
      const dateStr = scheduleDateTime.toISOString().split('T')[0];
      const timeStr = scheduleDateTime.toTimeString().slice(0, 5);
      await scheduleTherapistCalendarCall({
        client: scheduleClient,
        date: dateStr,
        time: timeStr,
        duration: scheduleDuration,
        notes: scheduleNotes,
      });
      setShowScheduleModal(false);
      Alert.alert('Scheduled', 'Call scheduled successfully.');
      loadAll();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to schedule call.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const runReport = async () => {
    setGeneratingReport(true);
    setReportData(null);
    try {
      const start = new Date(reportStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(reportEnd);
      end.setHours(23, 59, 59, 999);
      const data = await generateCalendarReport(reportType, start, end, isAdmin);
      setReportData(data);
    } catch (e) {
      Alert.alert('Report failed', e.message || 'Could not generate report.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const renderCalendarTab = () => (
    <>
      {/* Client requests sit above the grid: they are not appointments yet, and
          burying them in a day cell hides the fact that they need an answer. */}
      {pendingRequests.length > 0 ? (
        <View style={styles.requestsCard}>
          <Text style={styles.requestsTitle}>
            Session requests ({pendingRequests.length})
          </Text>
          {pendingRequests.map((call) => (
            <View key={call.id} style={styles.requestRow}>
              <Text style={styles.requestWho}>{call.clientName || 'Client'}</Text>
              <Text style={styles.requestWhen}>
                {formatCallDateTime(call.scheduledTime)} · {call.durationMinutes || 30} min
              </Text>
              {call.notes ? <Text style={styles.requestNotes}>{call.notes}</Text> : null}
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={[styles.declineBtn, respondingCallId === call.id && styles.btnBusy]}
                  disabled={respondingCallId === call.id}
                  onPress={() => respondToRequest(call, false)}
                >
                  {respondingCallId === call.id
                    ? <ActivityIndicator size="small" color="#dc2626" />
                    : <Text style={styles.declineText}>Decline</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.acceptBtn, respondingCallId === call.id && styles.btnBusy]}
                  disabled={respondingCallId === call.id}
                  onPress={() => respondToRequest(call, true)}
                >
                  {respondingCallId === call.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.acceptText}>Accept</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.calCard}>
        <View style={styles.calHeader}>
          <TouchableOpacity onPress={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
            <Ionicons name="chevron-back" size={22} color="#64748b" />
          </TouchableOpacity>
          <Text style={styles.calMonth}>
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
            <Ionicons name="chevron-forward" size={22} color="#64748b" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.todayBtn}
          onPress={() => {
            const t = new Date();
            setCurrentDate(t);
            setSelectedDate(t);
          }}
        >
          <Text style={styles.todayBtnText}>Today</Text>
        </TouchableOpacity>

        <View style={styles.dayLabelRow}>
          {DAY_LABELS.map((d) => (
            <Text key={d} style={styles.dayLabel}>{d}</Text>
          ))}
        </View>

        <View style={styles.calGrid}>
          {calendarDays.map((date, index) => {
            const calls = getCallsForDate(confirmedCalls, date);
            const hasCalls = calls.length > 0;
            const otherMonth = !isCurrentMonth(date);
            return (
              <TouchableOpacity
                key={`${date.toISOString()}-${index}`}
                style={[
                  styles.calDay,
                  isToday(date) && styles.calDayToday,
                  isSelected(date) && !isToday(date) && styles.calDaySelected,
                  otherMonth && styles.calDayOther,
                ]}
                onPress={() => handleDayPress(date, calls)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.calDayNum,
                    (isToday(date) || isSelected(date)) && styles.calDayNumActive,
                    otherMonth && styles.calDayNumMuted,
                  ]}
                >
                  {date.getDate()}
                </Text>
                {hasCalls ? (
                  <View style={styles.calDayCalls}>
                    {/* Appointment chip, matching the web calendar: accent bar,
                        time, then who it is with. A phone's day cell is ~45pt
                        wide, so the name is the client's first name only —
                        anything longer just truncates to an ellipsis. */}
                    {calls.slice(0, 2).map((c) => (
                      <View key={c.id} style={styles.calDayChip}>
                        <Text
                          style={[styles.calDayCallText, (isToday(date) || isSelected(date)) && styles.calDayCallTextActive]}
                          numberOfLines={1}
                        >
                          {fmt12(c.scheduledTime)}
                        </Text>
                        <Text style={styles.calDayChipWho} numberOfLines={1}>
                          {String(c.clientName || 'Client').split(' ')[0]}
                        </Text>
                      </View>
                    ))}
                    {calls.length > 2 ? (
                      <Text style={[styles.calDayMore, (isToday(date) || isSelected(date)) && styles.calDayCallTextActive]}>
                        +{calls.length - 2}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.daySection}>
        <Text style={styles.dayTitle}>
          {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
        <Text style={styles.dayCount}>{selectedDateCalls.length} appointment(s)</Text>
        {selectedDateCalls.length === 0 ? (
          <View style={styles.emptyDay}>
            <Ionicons name="calendar-outline" size={32} color="#cbd5e1" />
            <Text style={styles.emptyDayText}>No appointments this day</Text>
          </View>
        ) : (
          selectedDateCalls.map((s) => (
            <View key={s.id} style={styles.apptCard}>
              <View style={styles.apptTimeCol}>
                <Text style={styles.apptTime}>{fmt12(s.scheduledTime)}</Text>
                <Text style={styles.apptDur}>{s.duration || 30} min</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.apptClient}>{s.clientName || 'Client'}</Text>
                {s.notes ? <Text style={styles.apptNotes} numberOfLines={2}>{s.notes}</Text> : null}
              </View>
              <View style={[styles.statusPill, statusStyle(s.status)]}>
                <Text style={[styles.statusText, { color: statusStyle(s.status).color }]}>
                  {s.status || 'scheduled'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.notesSection}>
        <Text style={styles.notesSectionTitle}>Therapy notes & progress</Text>
        {therapyNotes.length === 0 ? (
          <Text style={styles.notesEmpty}>No therapy notes yet. Add notes from client sessions.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.notesScroll}>
            {therapyNotes.slice(0, 6).map((note) => (
              <View
                key={note.id}
                style={[styles.noteCard, { borderLeftColor: getInterventionColor(note.interventionsUsed) }]}
              >
                <Text style={styles.noteClient}>{note.clientName}</Text>
                <Text style={styles.noteDate}>
                  {note.sessionDate ? new Date(note.sessionDate).toLocaleDateString() : '—'}
                </Text>
                <Text style={styles.noteMood}>
                  {getMoodEmoji(note.moodRating)} {note.moodRating || '—'}/10 · {note.mood || '—'}
                </Text>
                {note.sessionFocus ? (
                  <Text style={styles.noteFocus} numberOfLines={2}>{note.sessionFocus}</Text>
                ) : null}
                {note.interventionsUsed ? (
                  <View style={[styles.interventionBadge, { backgroundColor: getInterventionColor(note.interventionsUsed) }]}>
                    <Text style={styles.interventionText}>{note.interventionsUsed}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );

  const renderReportsTab = () => (
    <View style={styles.reportsWrap}>
      <Text style={styles.reportsHeading}>Generate reports</Text>
      <Text style={styles.fieldLabel}>Report type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {REPORT_TYPES.filter((r) => !r.adminOnly || isAdmin).map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[styles.reportChip, reportType === r.id && styles.reportChipActive]}
            onPress={() => setReportType(r.id)}
          >
            <Text style={[styles.reportChipText, reportType === r.id && styles.reportChipTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.dateRow} onPress={() => setReportPicker('start')}>
        <View style={styles.dateRowLeft}>
          <Ionicons name="calendar-outline" size={18} color={TherapistColors.primary} />
          <Text style={styles.dateRowLabel}>Start date</Text>
        </View>
        <Text style={styles.dateRowValue}>{reportStart.toLocaleDateString()}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dateRow} onPress={() => setReportPicker('end')}>
        <View style={styles.dateRowLeft}>
          <Ionicons name="calendar-outline" size={18} color={TherapistColors.primary} />
          <Text style={styles.dateRowLabel}>End date</Text>
        </View>
        <Text style={styles.dateRowValue}>{reportEnd.toLocaleDateString()}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.generateBtn, generatingReport && styles.btnDisabled]}
        onPress={runReport}
        disabled={generatingReport}
      >
        {generatingReport ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateBtnText}>Generate report</Text>
        )}
      </TouchableOpacity>

      {reportData ? (
        <View style={styles.reportResult}>
          <Text style={styles.reportTypeTitle}>{reportData.type}</Text>
          <View style={styles.summaryGrid}>
            {reportData.assignedClients !== undefined && (
              <SummaryCard label="Clients" value={String(reportData.assignedClients)} />
            )}
            {reportData.totalSessions !== undefined && (
              <SummaryCard label="Sessions" value={String(reportData.totalSessions)} />
            )}
            {reportData.averageProgress !== undefined && (
              /* null = no client has enough readings yet. Showing 0% there reads
                 as "everyone is failing" rather than "nothing measured". */
              <SummaryCard
                label="Avg progress"
                value={reportData.averageProgress === null ? '—' : `${reportData.averageProgress}%`}
              />
            )}
            {reportData.totalNotes !== undefined && (
              <SummaryCard label="Notes" value={String(reportData.totalNotes)} />
            )}
            {reportData.averageMoodRating !== undefined && (
              <SummaryCard label="Avg mood" value={`${reportData.averageMoodRating}/10`} />
            )}
            {reportData.totalCalls !== undefined && (
              <SummaryCard label="Calls" value={String(reportData.totalCalls)} />
            )}
            {reportData.totalTherapists !== undefined && (
              <SummaryCard label="Therapists" value={String(reportData.totalTherapists)} />
            )}
            {reportData.totalClients !== undefined && reportData.assignedClients === undefined && (
              <SummaryCard label="Clients" value={String(reportData.totalClients)} />
            )}
          </View>

          {reportData.clientProgress?.map((c) => (
            <View key={c.id} style={styles.reportRow}>
              <Text style={styles.reportRowTitle}>{c.name}</Text>
              <Text style={styles.reportRowMeta}>{c.totalSessions} sessions · {c.progress}% · Last {c.lastSession}</Text>
            </View>
          ))}

          {reportData.notes?.slice(0, 10).map((n) => (
            <View key={n.id} style={styles.reportRow}>
              <Text style={styles.reportRowTitle}>{n.clientName}</Text>
              <Text style={styles.reportRowMeta}>{n.sessionDate} · Mood {n.moodRating}/10</Text>
            </View>
          ))}

          {reportData.calls?.slice(0, 10).map((c) => (
            <View key={c.id} style={styles.reportRow}>
              <Text style={styles.reportRowTitle}>{c.clientName}</Text>
              <Text style={styles.reportRowMeta}>{c.scheduledTime} · {c.status}</Text>
            </View>
          ))}

          <Text style={styles.pdfHint}>Full PDF export is available on the web calendar.</Text>
        </View>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Calendar & reports</Text>
      </View>

      <View style={styles.tabRow}>
        {[
          { id: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
          { id: 'reports', label: 'Reports', icon: 'document-text-outline' },
        ].map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, activeTab === t.id && styles.tabActive]}
            onPress={() => setActiveTab(t.id)}
          >
            <Ionicons name={t.icon} size={18} color={activeTab === t.id ? TherapistColors.primary : '#64748b'} />
            <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TherapistColors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'calendar' ? renderCalendarTab() : renderReportsTab()}
      </ScrollView>

      {activeTab === 'calendar' ? (
        <TouchableOpacity
          style={[styles.fab, !canSchedule && styles.fabDisabled]}
          onPress={openScheduleModal}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* Day detail sheet — the sessions booked on the tapped day. */}
      <Modal visible={!!dayDetail} animationType="slide" transparent onRequestClose={() => setDayDetail(null)}>
        <View style={styles.detailBackdrop}>
          <TouchableOpacity style={styles.detailBackdropTap} activeOpacity={1} onPress={() => setDayDetail(null)} />
          <View style={styles.detailSheet}>
            <View style={styles.detailGrabber} />
            <Text style={styles.detailDate}>
              {dayDetail?.date?.toLocaleDateString(undefined, {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
            <Text style={styles.detailCount}>
              {dayDetail?.calls?.length === 1 ? '1 session' : `${dayDetail?.calls?.length || 0} sessions`}
            </Text>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {(dayDetail?.calls || []).map((c) => (
                <View key={c.id} style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={18} color="#64748b" />
                    <Text style={styles.detailTime}>{fmt12(c.scheduledTime)}</Text>
                    {c.channel ? (
                      <View style={styles.detailChip}>
                        <Text style={styles.detailChipText}>{c.channel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={18} color="#64748b" />
                    <Text style={styles.detailPerson}>{c.clientName || 'Client'}</Text>
                  </View>
                  {c.durationMinutes ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="hourglass-outline" size={18} color="#64748b" />
                      <Text style={styles.detailMeta}>{c.durationMinutes} minutes</Text>
                    </View>
                  ) : null}
                  {c.status ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#64748b" />
                      <Text style={styles.detailMeta}>{c.status}</Text>
                    </View>
                  ) : null}
                  {c.notes ? <Text style={styles.detailNotes}>{c.notes}</Text> : null}
                </View>
              ))}
            </ScrollView>

            <View style={styles.detailActions}>
              <TouchableOpacity
                style={styles.detailSecondary}
                onPress={() => setDayDetail(null)}
              >
                <Text style={styles.detailSecondaryText}>Close</Text>
              </TouchableOpacity>
              {canSchedule ? (
                <TouchableOpacity
                  style={styles.detailPrimary}
                  onPress={() => {
                    const d = dayDetail?.date;
                    setDayDetail(null);
                    if (d) handleDayPress(d, []);
                  }}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.detailPrimaryText}>Add session</Text>
                </TouchableOpacity>
              ) : null}
            </View>

          </View>
        </View>
      </Modal>

      <Modal visible={showScheduleModal} animationType="slide" transparent onRequestClose={() => setShowScheduleModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Schedule call</Text>
            <Text style={styles.fieldLabel}>Client</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {clients.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.clientChip, scheduleClient?.id === c.id && styles.clientChipActive]}
                  onPress={() => setScheduleClient(c)}
                >
                  <Text style={[styles.clientChipText, scheduleClient?.id === c.id && styles.clientChipTextActive]}>
                    {c.displayName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.dateRow} onPress={() => setSchedulePicker('date')}>
              <View style={styles.dateRowLeft}>
                <Ionicons name="calendar-outline" size={18} color={TherapistColors.primary} />
                <Text style={styles.dateRowLabel}>Date</Text>
              </View>
              <Text style={styles.dateRowValue}>{scheduleDateTime.toLocaleDateString()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dateRow} onPress={() => setSchedulePicker('time')}>
              <View style={styles.dateRowLeft}>
                <Ionicons name="time-outline" size={18} color={TherapistColors.primary} />
                <Text style={styles.dateRowLabel}>Time</Text>
              </View>
              <Text style={styles.dateRowValue}>
                {scheduleDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Duration (minutes)</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, scheduleDuration === String(d) && styles.durationChipActive]}
                  onPress={() => setScheduleDuration(String(d))}
                >
                  <Text style={[styles.durationChipText, scheduleDuration === String(d) && styles.durationChipTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={scheduleNotes}
              onChangeText={setScheduleNotes}
              placeholder="Optional notes…"
              placeholderTextColor="#94a3b8"
              multiline
            />


            {/* Declared inside this modal — see DatePickerSheet's `nested` note. */}
            <DatePickerSheet
              nested
              visible={schedulePicker === 'date'}
              title="Session date"
              value={scheduleDateTime}
              mode="date"
              minimumDate={new Date()}
              onConfirm={(d) => { setScheduleDateTime(d); setSchedulePicker(null); }}
              onCancel={() => setSchedulePicker(null)}
            />
            <DatePickerSheet
              nested
              visible={schedulePicker === 'time'}
              title="Session time"
              value={scheduleDateTime}
              mode="time"
              onConfirm={(d) => { setScheduleDateTime(d); setSchedulePicker(null); }}
              onCancel={() => setSchedulePicker(null)}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowScheduleModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingSchedule && styles.btnDisabled]}
                onPress={submitSchedule}
                disabled={savingSchedule}
              >
                <Text style={styles.saveBtnText}>{savingSchedule ? 'Saving…' : 'Schedule'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DatePickerSheet
        visible={reportPicker === 'start'}
        title="Report start date"
        value={reportStart}
        mode="date"
        onConfirm={(d) => {
          setReportStart(d);
          setReportPicker(null);
        }}
        onCancel={() => setReportPicker(null)}
      />
      <DatePickerSheet
        visible={reportPicker === 'end'}
        title="Report end date"
        value={reportEnd}
        mode="date"
        onConfirm={(d) => {
          setReportEnd(d);
          setReportPicker(null);
        }}
        onCancel={() => setReportPicker(null)}
      />
    </SafeAreaView>
  );
}

/**
 * `nested` — render the sheet as a plain overlay instead of its own <Modal>.
 * iOS will not present a second Modal while one is already showing, so a picker
 * declared as a SIBLING of an open modal silently never appeared. Inside that
 * modal it has to be an ordinary absolutely-positioned view.
 */
function DatePickerSheet({ visible, title, value, mode, minimumDate, maximumDate, onConfirm, onCancel, nested = false }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  if (!visible) return null;

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="default"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event, date) => {
          onCancel();
          if (event.type !== 'dismissed' && date) onConfirm(date);
        }}
      />
    );
  }

  const sheet = (
      <View style={[pickerStyles.overlay, nested && pickerStyles.overlayNested]}>
        <TouchableOpacity style={pickerStyles.backdrop} activeOpacity={1} onPress={onCancel} />
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.handle} />
          <View style={pickerStyles.header}>
            <TouchableOpacity onPress={onCancel} hitSlop={8}>
              <Text style={pickerStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={pickerStyles.title}>{title}</Text>
            <TouchableOpacity onPress={() => onConfirm(draft)} hitSlop={8}>
              <Text style={pickerStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={draft}
            mode={mode}
            display="spinner"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(_, date) => {
              if (date) setDraft(date);
            }}
            style={pickerStyles.picker}
          />
        </View>
      </View>
  );

  // Nested inside an already-presented modal → plain overlay. Standalone → Modal.
  if (nested) return sheet;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      {sheet}
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlayNested: {
    position: 'absolute',
    // Negative insets cancel the parent sheet's 20pt padding so the picker
    // covers the whole sheet rather than sitting inside its content box.
    top: -20, left: -20, right: -20, bottom: -20,
    justifyContent: 'flex-end',
    zIndex: 50,
    elevation: 50,   // Android draws by elevation, not zIndex
  },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cancelText: { fontSize: 16, color: '#64748b', fontWeight: '600' },
  doneText: { fontSize: 16, color: TherapistColors.primary, fontWeight: '700' },
  picker: { height: 216 },
});

function SummaryCard({ label, value }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function statusStyle(status) {
  if (status === 'completed') return { bg: '#dcfce7', color: '#16a34a' };
  if (status === 'cancelled') return { bg: '#fee2e2', color: '#dc2626' };
  if (status === 'in_progress') return { bg: '#eff6ff', color: '#1d4ed8' };
  return { bg: '#eef2ff', color: TherapistColors.primary };
}

const styles = StyleSheet.create({
  // ── Day detail sheet ──────────────────────────────────────────────────────
  detailBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  detailBackdropTap: { flex: 1 },
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  detailGrabber: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#cbd5e1', marginBottom: 14,
  },
  detailDate: { fontSize: 19, fontWeight: '800', color: '#0f172a' },
  detailCount: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 14 },
  detailCard: {
    borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4,
    borderLeftColor: TherapistColors.primary, borderRadius: 14,
    padding: 14, marginBottom: 10, backgroundColor: '#f8fafc',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailTime: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  detailChip: {
    marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20, backgroundColor: '#eef2ff',
  },
  detailChipText: { fontSize: 11, fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase' },
  detailPerson: { fontSize: 14, fontWeight: '600', color: '#334155' },
  detailMeta: { fontSize: 13, color: '#64748b', textTransform: 'capitalize' },
  detailNotes: { marginTop: 6, fontSize: 13, color: '#475569', fontStyle: 'italic', lineHeight: 19 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  detailSecondary: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', backgroundColor: '#f1f5f9',
  },
  detailSecondaryText: { fontSize: 15, fontWeight: '700', color: '#334155' },
  detailPrimary: {
    flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TherapistColors.primary,
  },
  detailPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  pageHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabActive: { backgroundColor: '#eef2ff', borderColor: TherapistColors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: TherapistColors.primary, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 100 },
  calCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  // Pending client requests — amber, so they don't read as confirmed bookings.
  requestsCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginBottom: 16,
  },
  requestsTitle: { fontSize: 15, fontWeight: '700', color: '#92400e', marginBottom: 10 },
  requestRow: { borderTopWidth: 1, borderTopColor: '#fde68a', paddingTop: 10, marginTop: 10 },
  requestWho: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  requestWhen: { fontSize: 12, color: '#64748b', marginTop: 2 },
  requestNotes: { fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 4 },
  requestActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, backgroundColor: '#059669',
  },
  acceptText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  declineBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#fca5a5',
  },
  declineText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
  btnBusy: { opacity: 0.7 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calMonth: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  todayBtn: { alignSelf: 'center', marginTop: 10, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#eef2ff' },
  todayBtnText: { color: TherapistColors.primary, fontWeight: '700', fontSize: 13 },
  dayLabelRow: { flexDirection: 'row', marginTop: 14, marginBottom: 6 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: {
    width: `${100 / 7}%`,
    minHeight: 72,
    padding: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  calDayToday: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  calDaySelected: { backgroundColor: '#eef2ff', borderColor: TherapistColors.primary },
  calDayOther: { opacity: 0.45 },
  calDayNum: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  calDayNumActive: { color: '#fff' },
  calDayNumMuted: { color: '#94a3b8' },
  calDayCalls: { marginTop: 2, width: '100%' },
  // Appointment chip — same language as the web calendar: tinted block with a
  // coloured left edge, time on top, who it's with underneath.
  calDayChip: {
    backgroundColor: '#e0f2fe',
    borderLeftWidth: 2,
    borderLeftColor: '#0ea5e9',
    borderRadius: 3,
    paddingHorizontal: 2,
    paddingVertical: 1,
    marginBottom: 2,
  },
  calDayChipWho: { fontSize: 7, color: '#334155', fontWeight: '500' },
  calDayCallText: { fontSize: 8, color: TherapistColors.primary, fontWeight: '600' },
  calDayCallTextActive: { color: '#fff' },
  calDayMore: { fontSize: 8, color: '#64748b' },
  daySection: { marginBottom: 20 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  dayCount: { fontSize: 12, color: '#64748b', marginTop: 2, marginBottom: 10 },
  emptyDay: { alignItems: 'center', padding: 24, gap: 8 },
  emptyDayText: { color: '#94a3b8' },
  apptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  apptTimeCol: { minWidth: 56, alignItems: 'center' },
  apptTime: { fontSize: 13, fontWeight: '700', color: TherapistColors.primary },
  apptDur: { fontSize: 10, color: '#94a3b8' },
  apptClient: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  apptNotes: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  notesSection: { marginBottom: 24 },
  notesSectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  notesEmpty: { fontSize: 13, color: '#94a3b8' },
  notesScroll: { gap: 10, paddingRight: 8 },
  noteCard: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noteClient: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  noteDate: { fontSize: 11, color: '#64748b', marginTop: 2 },
  noteMood: { fontSize: 12, color: '#475569', marginTop: 6 },
  noteFocus: { fontSize: 12, color: '#64748b', marginTop: 6 },
  interventionBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 8 },
  interventionText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabDisabled: { backgroundColor: '#cbd5e1', elevation: 0 },
  reportsWrap: { paddingBottom: 24 },
  reportsHeading: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' },
  reportChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  reportChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  reportChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  reportChipTextActive: { color: '#fff' },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateRowLabel: { color: '#64748b', fontSize: 14, fontWeight: '500' },
  dateRowValue: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  generateBtn: {
    backgroundColor: TherapistColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  reportResult: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  reportTypeTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  summaryCard: { width: '47%', backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  summaryLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: TherapistColors.primary, marginTop: 4 },
  reportRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  reportRowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  reportRowMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  pdfHint: { fontSize: 12, color: '#94a3b8', marginTop: 12, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  clientChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
    backgroundColor: '#f8fafc',
  },
  clientChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  clientChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  clientChipTextActive: { color: '#fff' },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  durationChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  durationChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  durationChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  durationChipTextActive: { color: '#fff' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    fontSize: 14,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  cancelBtnText: { fontWeight: '700', color: '#64748b' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: TherapistColors.primary, alignItems: 'center' },
  saveBtnText: { fontWeight: '700', color: '#fff' },
});
