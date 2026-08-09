import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../services/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedClientData, getCachedTherapistData } from '../../services/clientDataService';
import { Colors } from '../../constants/colors';

const ClientVideoScreen = ({ navigation }) => {
  const [clientData, setClientData] = useState(null);
  const [therapistData, setTherapistData] = useState(null);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showTherapistCalendar, setShowTherapistCalendar] = useState(false);
  const [therapistBusyDates, setTherapistBusyDates] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    duration: '30',
    notes: ''
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const clientId = await AsyncStorage.getItem('th.clientId') || await AsyncStorage.getItem('th.userId');
      let client = getCachedClientData();
      if (!client) client = await api(`/api/v1/patients/${clientId}`).catch(() => null);
      setClientData(client);

      let therapist = getCachedTherapistData();
      if (!therapist && client?.assignedTherapist) {
        const tid = client.assignedTherapist || client.assignedTherapistId;
        try { const d = await api(`/api/v1/therapists/${tid}`); if (d) therapist = { id: tid, ...d }; } catch {}
      }
      setTherapistData(therapist);
      loadScheduledCalls(clientId);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadScheduledCalls = (clientId) => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await api(`/api/v1/scheduled-calls?clientId=${clientId}`);
        const sorted = (Array.isArray(data) ? data : []).sort((a, b) =>
          new Date(b.scheduledTime || b.scheduledAt || b.startsAt || 0) - new Date(a.scheduledTime || a.scheduledAt || a.startsAt || 0));
        if (!cancelled) setScheduledCalls(sorted);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  };

  const checkTherapistAvailability = async (therapistId, selectedDate) => {
    try {
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`);
      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(`${selectedDate}T23:59:59`);
      return !(Array.isArray(calls) ? calls : []).some(c => {
        const t = new Date(c.scheduledTime || c.scheduledAt || c.startsAt || 0);
        return t >= start && t <= end;
      });
    } catch { return false; }
  };

  const fetchTherapistBusyDates = async (therapistId) => {
    try {
      setIsLoadingAvailability(true);
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`);
      const dates = (Array.isArray(calls) ? calls : []).map(c => new Date(c.scheduledTime || c.scheduledAt || c.startsAt || 0).toISOString().split('T')[0]).filter(Boolean);
      setTherapistBusyDates([...new Set(dates)]);
    } catch {} finally { setIsLoadingAvailability(false); }
  };

  const handleScheduleSubmit = async () => {
    if (!scheduleForm.date || !scheduleForm.time) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    if (!therapistData) {
      setMessage({ type: 'error', text: 'No therapist assigned. Please contact support.' });
      return;
    }

    setIsSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const dateTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      
      if (dateTime <= new Date()) {
        setMessage({ type: 'error', text: 'Please select a future date and time' });
        setIsSubmitting(false);
        return;
      }

      const isAvailable = await checkTherapistAvailability(therapistData.id, scheduleForm.date);
      if (!isAvailable) {
        setMessage({ 
          type: 'error', 
          text: 'Therapist is busy on the selected date. Please choose a different time.' 
        });
        setIsSubmitting(false);
        return;
      }

      await api('/api/v1/scheduled-calls', {
        method: 'POST',
        body: {
          therapistId: therapistData.id,
          clientId: clientData.id,
          scheduledTime: dateTime.toISOString(),
          durationMinutes: parseInt(scheduleForm.duration),
          notes: scheduleForm.notes || '',
          status: 'pending',
        },
      });
      
      setMessage({ type: 'success', text: 'Session request submitted successfully! Your therapist will review and confirm.' });
      setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
      setTimeout(() => {
        setShowScheduleForm(false);
        setMessage({ type: '', text: '' });
      }, 2000);
      
    } catch (error) {
      console.error('Error creating appointment:', error);
      setMessage({ type: 'error', text: 'Error creating appointment. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSessionTime = (scheduledTime) => {
    const date = scheduledTime?.toDate ? scheduledTime.toDate() : new Date(scheduledTime);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'scheduled': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'cancelled': return 'close-circle';
      case 'completed': return 'checkmark-circle';
      default: return 'alert-circle';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return '#10B981';
      case 'pending': return '#F59E0B';
      case 'cancelled': return '#EF4444';
      case 'completed': return '#3B82F6';
      default: return Colors.textSecondary;
    }
  };

  const canJoinCall = (session) => {
    if (session.status !== 'scheduled') return false;
    const sessionTime = session.scheduledTime?.toDate ? session.scheduledTime.toDate() : new Date(session.scheduledTime);
    const now = new Date();
    const diffMinutes = (sessionTime - now) / (1000 * 60);
    return diffMinutes <= 15 && diffMinutes >= -30; // Can join 15 min before to 30 min after
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading video calls...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video Calls</Text>
        <TouchableOpacity onPress={() => setShowScheduleForm(true)} style={{ padding: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle" size={36} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Therapist Info */}
        {therapistData ? (
          <View style={styles.therapistCard}>
            <Ionicons name="person-circle" size={48} color={Colors.primary} />
            <View style={styles.therapistInfo}>
              <Text style={styles.therapistName}>{therapistData.name}</Text>
              <Text style={styles.therapistType}>
                {therapistData.type || 'Therapist'} • {therapistData.specialties?.[0] || 'Mental Health'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noTherapistCard}>
            <Ionicons name="person-remove-outline" size={48} color={Colors.error} />
            <Text style={styles.noTherapistText}>No therapist assigned</Text>
            <Text style={styles.noTherapistSubtext}>
              Please contact support to get assigned to a therapist first.
            </Text>
          </View>
        )}

        {/* Scheduled Calls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Sessions</Text>
          {scheduledCalls.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="videocam-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No scheduled sessions</Text>
              <Text style={styles.emptySubtext}>
                Schedule a video call with your therapist
              </Text>
              <TouchableOpacity
                style={styles.scheduleButton}
                onPress={() => setShowScheduleForm(true)}
                disabled={!therapistData}
              >
                <Text style={styles.scheduleButtonText}>Schedule Session</Text>
              </TouchableOpacity>
            </View>
          ) : (
            scheduledCalls.map(session => {
              const sessionTime = formatSessionTime(session.scheduledTime);
              const canJoin = canJoinCall(session);
              
              return (
                <View key={session.id} style={styles.sessionCard}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionIconContainer}>
                      <Ionicons name="videocam" size={24} color={Colors.primary} />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionTherapist}>
                        {session.therapistName || 'Therapist'}
                      </Text>
                      <Text style={styles.sessionDate}>{sessionTime.date}</Text>
                      <Text style={styles.sessionTime}>{sessionTime.time}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(session.status)}20` }]}>
                      <Ionicons
                        name={getStatusIcon(session.status)}
                        size={16}
                        color={getStatusColor(session.status)}
                      />
                      <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
                        {session.status}
                      </Text>
                    </View>
                  </View>
                  
                  {session.notes && (
                    <Text style={styles.sessionNotes}>{session.notes}</Text>
                  )}
                  
                  <View style={styles.sessionFooter}>
                    <Text style={styles.sessionDuration}>
                      Duration: {session.duration || 30} minutes
                    </Text>
                    {canJoin && session.status === 'scheduled' && (
                      <TouchableOpacity
                        style={styles.joinButton}
                        onPress={() => {
                          Alert.alert('Join Call', 'Video call functionality will be implemented with Twilio integration.');
                        }}
                      >
                        <Ionicons name="videocam" size={16} color={Colors.surface} />
                        <Text style={styles.joinButtonText}>Join Call</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Schedule Form Modal */}
      <Modal
        visible={showScheduleForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowScheduleForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Video Call</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowScheduleForm(false);
                  setScheduleForm({ date: '', time: '', duration: '30', notes: '' });
                  setMessage({ type: '', text: '' });
                }}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {therapistData ? (
              <ScrollView style={styles.modalContent}>
                {message.text ? (
                  <View style={[
                    styles.messageContainer,
                    message.type === 'success' ? styles.successMessage : styles.errorMessage
                  ]}>
                    <Ionicons
                      name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                      size={16}
                      color={message.type === 'success' ? '#10B981' : Colors.error}
                    />
                    <Text style={styles.messageText}>{message.text}</Text>
                  </View>
                ) : null}

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Date *</Text>
                  <View style={styles.dateInputContainer}>
                    <TouchableOpacity
                      style={styles.dateInput}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={styles.dateInputText}>
                        {scheduleForm.date || 'Select date'}
                      </Text>
                      <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.viewCalendarButton}
                      onPress={async () => {
                        if (therapistData?.id) {
                          setShowScheduleForm(false);
                          await fetchTherapistBusyDates(therapistData.id);
                          setShowTherapistCalendar(true);
                        }
                      }}
                    >
                      <Ionicons name="calendar" size={16} color={Colors.surface} />
                      <Text style={styles.viewCalendarText}>View Calendar</Text>
                    </TouchableOpacity>
                  </View>
                  {showDatePicker && (
                    <DateTimePicker
                      value={scheduleForm.date ? new Date(scheduleForm.date) : new Date()}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={(event, selectedDate) => {
                        setShowDatePicker(false);
                        if (selectedDate) {
                          setScheduleForm({
                            ...scheduleForm,
                            date: selectedDate.toISOString().split('T')[0]
                          });
                        }
                      }}
                    />
                  )}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Time *</Text>
                  <TouchableOpacity
                    style={styles.timeInput}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Text style={styles.timeInputText}>
                      {scheduleForm.time || 'Select time'}
                    </Text>
                    <Ionicons name="time-outline" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                  {showTimePicker && (
                    <DateTimePicker
                      value={scheduleForm.time ? new Date(`2000-01-01T${scheduleForm.time}`) : new Date()}
                      mode="time"
                      display="default"
                      onChange={(event, selectedTime) => {
                        setShowTimePicker(false);
                        if (selectedTime) {
                          const hours = selectedTime.getHours().toString().padStart(2, '0');
                          const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
                          setScheduleForm({
                            ...scheduleForm,
                            time: `${hours}:${minutes}`
                          });
                        }
                      }}
                    />
                  )}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Duration (minutes)</Text>
                  <View style={styles.durationContainer}>
                    {['15', '30', '45', '60'].map(duration => (
                      <TouchableOpacity
                        key={duration}
                        style={[
                          styles.durationButton,
                          scheduleForm.duration === duration && styles.durationButtonActive
                        ]}
                        onPress={() => setScheduleForm({ ...scheduleForm, duration })}
                      >
                        <Text style={[
                          styles.durationButtonText,
                          scheduleForm.duration === duration && styles.durationButtonTextActive
                        ]}>
                          {duration}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Notes (optional)</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Add any notes for your therapist..."
                    placeholderTextColor={Colors.textSecondary}
                    value={scheduleForm.notes}
                    onChangeText={(text) => setScheduleForm({ ...scheduleForm, notes: text })}
                    multiline
                    numberOfLines={4}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                  onPress={handleScheduleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={Colors.surface} />
                  ) : (
                    <Text style={styles.submitButtonText}>Schedule Session</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={styles.noTherapistContainer}>
                <Ionicons name="person-remove-outline" size={48} color={Colors.error} />
                <Text style={styles.noTherapistText}>No therapist assigned</Text>
                <Text style={styles.noTherapistSubtext}>
                  Please contact support to get assigned to a therapist first.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Therapist Calendar Modal */}
      <Modal
        visible={showTherapistCalendar}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setShowTherapistCalendar(false); setShowScheduleForm(true); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Therapist Availability</Text>
              <TouchableOpacity onPress={() => { setShowTherapistCalendar(false); setShowScheduleForm(true); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {isLoadingAvailability ? (
                <ActivityIndicator size="large" color={Colors.primary} />
              ) : (
                <>
                  <View style={styles.legend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, styles.availableColor]} />
                      <Text style={styles.legendText}>Available</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, styles.busyColor]} />
                      <Text style={styles.legendText}>Busy</Text>
                    </View>
                  </View>
                  <Text style={styles.calendarNote}>
                    📅 Showing next 30 days of therapist availability
                  </Text>
                  <View style={styles.therapistCalendarGrid}>
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() + i);
                      const dateString = date.toISOString().split('T')[0];
                      const isBusy = therapistBusyDates.includes(dateString);
                      const isPast = date < new Date().setHours(0, 0, 0, 0);
                      const isToday = date.toDateString() === new Date().toDateString();
                      return (
                        <View
                          key={i}
                          style={[
                            styles.therapistCalendarDay,
                            isBusy && styles.busyDay,
                            !isBusy && !isPast && styles.availableDay,
                            isPast && styles.pastDay,
                            isToday && styles.todayDay
                          ]}
                        >
                          <Text style={[
                            styles.therapistDayNumber,
                            isToday && styles.todayDayNumber
                          ]}>
                            {date.getDate()}
                          </Text>
                          <Text style={styles.therapistDayName}>
                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </Text>
                          {isBusy && (
                            <View style={styles.busyBadge}>
                              <Text style={styles.busyIndicator}>BUSY</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.calendarGuide}>
                    <Text style={styles.guideTitle}>📅 Therapist Availability Guide:</Text>
                    <Text style={styles.guideText}>
                      • <Text style={styles.guideRed}>Red dates</Text> = Therapist is busy (not available)
                    </Text>
                    <Text style={styles.guideText}>
                      • <Text style={styles.guideGreen}>Green dates</Text> = Therapist is available
                    </Text>
                    <Text style={styles.guideText}>
                      • Choose a green date to schedule your session
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  therapistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  therapistInfo: {
    marginLeft: 16,
    flex: 1,
  },
  therapistName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  therapistType: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  noTherapistCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 32,
    marginBottom: 20,
  },
  noTherapistText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
  },
  noTherapistSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 24,
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
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sessionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTherapist: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  sessionDate: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  sessionTime: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  sessionNotes: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionDuration: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  joinButtonText: {
    color: Colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    width: '90%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  calendarModal: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    width: '95%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  modalContent: {
    padding: 20,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  successMessage: {
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  errorMessage: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  dateInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Colors.surface,
  },
  dateInputText: {
    fontSize: 16,
    color: Colors.text,
  },
  viewCalendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 8,
    gap: 6,
  },
  viewCalendarText: {
    color: Colors.surface,
    fontSize: 12,
    fontWeight: '600',
  },
  timeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Colors.surface,
  },
  timeInputText: {
    fontSize: 16,
    color: Colors.text,
  },
  durationContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  durationButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  durationButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  durationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  durationButtonTextActive: {
    color: Colors.surface,
  },
  notesInput: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#b794f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  noTherapistContainer: {
    padding: 40,
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
  },
  availableColor: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  busyColor: {
    backgroundColor: '#fee2e2',
    borderColor: Colors.error,
  },
  legendText: {
    fontSize: 14,
    color: Colors.text,
  },
  calendarNote: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  therapistCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  therapistCalendarDay: {
    width: (width - 80) / 7,
    minHeight: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  availableDay: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  busyDay: {
    backgroundColor: '#fee2e2',
    borderColor: Colors.error,
  },
  pastDay: {
    opacity: 0.5,
    backgroundColor: '#f3f4f6',
  },
  todayDay: {
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  therapistDayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  todayDayNumber: {
    color: Colors.primary,
  },
  therapistDayName: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  busyBadge: {
    backgroundColor: Colors.error,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginTop: 2,
  },
  busyIndicator: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.surface,
    textTransform: 'uppercase',
  },
  calendarGuide: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  guideTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  guideText: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  guideRed: {
    color: Colors.error,
    fontWeight: '700',
  },
  guideGreen: {
    color: '#10b981',
    fontWeight: '700',
  },
});

export default ClientVideoScreen;
