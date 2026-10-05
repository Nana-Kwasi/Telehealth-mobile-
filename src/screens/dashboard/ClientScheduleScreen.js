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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callState, callTimeLabel, CALL_STATE_COLORS } from '../../utils/callState';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../services/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedClientData, getCachedTherapistData } from '../../services/clientDataService';
import { TherapyColors as Colors } from '../../constants/colors';
import { payForBooking } from '../../services/paystack';
import { therapistFee } from '../../utils/therapistFee';

const { width } = Dimensions.get('window');

const ClientScheduleScreen = ({ navigation }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [clientData, setClientData] = useState(null);
  const [therapistData, setTherapistData] = useState(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showTherapistCalendar, setShowTherapistCalendar] = useState(false);
  const [therapistBusyDates, setTherapistBusyDates] = useState([]);
  const [isLoadingTherapist, setIsLoadingTherapist] = useState(true);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Sessions for the day the user tapped, shown in a detail sheet.
  const [dayDetail, setDayDetail] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    duration: '30',
    notes: ''
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const appointmentTypes = {
    individual: { name: 'Individual', color: '#3B82F6' },
    couple: { name: 'Couple', color: '#2f7d5f' },
    teen: { name: 'Teen', color: '#734e12' },
    family: { name: 'Family', color: '#8B5CF6' }
  };

  const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  useEffect(() => {
    loadClientAndTherapistData();
  }, []);

  useEffect(() => {
    if (clientData) {
      loadAppointments();
    }
  }, [clientData]);

  const loadClientAndTherapistData = async () => {
    try {
      setIsLoadingTherapist(true);
      const clientId = await AsyncStorage.getItem('th.clientId') || await AsyncStorage.getItem('th.userId');

      let client = getCachedClientData();
      if (!client) client = await api(`/api/v1/patients/${clientId}`).catch(() => null);
      setClientData(client);

      let therapist = getCachedTherapistData();
      if (!therapist && client?.assignedTherapist) {
        const therapistId = client.assignedTherapist || client.assignedTherapistId;
        try {
          therapist = await api(`/api/v1/therapists/${therapistId}`);
          if (therapist) therapist = { id: therapistId, ...therapist };
        } catch {}
      }
      setTherapistData(therapist);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoadingTherapist(false);
    }
  };

  const loadAppointments = () => {
    const clientId = clientData?.id;
    if (!clientId) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await api(`/api/v1/scheduled-calls?clientId=${clientId}`);
        const sorted = (Array.isArray(data) ? data : []).sort((a, b) =>
          new Date(a.scheduledTime || a.scheduledAt || a.startsAt || 0) - new Date(b.scheduledTime || b.scheduledAt || b.startsAt || 0));
        if (!cancelled) setAppointments(sorted);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30_000);
    const unsubscribe = () => { cancelled = true; clearInterval(id); };
    return unsubscribe;
  };

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days = [];
    const currentDate = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  };

  const getAppointmentsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduledTime?.toDate?.() || apt.scheduledTime);
      return aptDate.toISOString().split('T')[0] === dateStr;
    });
  };

  const navigateMonth = (direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  // Tapping a day: show what's booked, or start booking that day if it's free.
  const handleDayPress = (day, dayAppointments) => {
    setSelectedDate(day);
    if (dayAppointments.length > 0) {
      setDayDetail({ date: day, appointments: dayAppointments });
      return;
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (day < startOfToday) return;            // past day with nothing on it
    if (!therapistData) return;                // no therapist → nothing to book
    setScheduleForm((prev) => ({
      ...prev,
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
    }));
    setShowScheduleForm(true);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp?.toDate?.() || timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const checkTherapistAvailability = async (therapistId, selectedDate) => {
    try {
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`);
      const startOfDay = new Date(`${selectedDate}T00:00:00`);
      const endOfDay = new Date(`${selectedDate}T23:59:59`);
      const list = Array.isArray(calls) ? calls : [];
      return !list.some(call => {
        const t = new Date(call.scheduledTime || call.scheduledAt || call.startsAt || 0);
        return t >= startOfDay && t <= endOfDay;
      });
    } catch {
      return false;
    }
  };

  const fetchTherapistBusyDates = async (therapistId) => {
    try {
      setIsLoadingAvailability(true);
      const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`);
      const dates = (Array.isArray(calls) ? calls : []).map(c => {
        const t = new Date(c.scheduledTime || c.scheduledAt || c.startsAt || 0);
        return t.toISOString().split('T')[0];
      }).filter(Boolean);
      setTherapistBusyDates([...new Set(dates)]);
    } catch {
      console.error('Error fetching therapist busy dates');
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const handleViewTherapistCalendar = async () => {
    if (therapistData?.id) {
      setShowScheduleForm(false);
      await fetchTherapistBusyDates(therapistData.id);
      setShowTherapistCalendar(true);
    }
  };

  const closeTherapistCalendar = () => {
    setShowTherapistCalendar(false);
    setShowScheduleForm(true);
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

      // ── Pay before the session exists ────────────────────────────────────
      // The booking used to be created outright, so therapy sessions were
      // never charged for. A zero/absent rate skips the step rather than
      // blocking the booking.
      const fee = therapistFee(therapistData) ?? 0;
      const paid = await payForBooking({
        email: clientData.email,
        amount: fee,
        purpose: 'therapy_session',
        metadata: { therapistId: therapistData.id, clientId: clientData.id },
      });

      if (!paid.ok) {
        setMessage({ type: 'error', text: paid.reason || 'Payment was not completed.' });
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
          paymentReference: paid.reference,
          amountPaid: paid.amount,
          currency: paid.currency,
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

  const calendarDays = generateCalendarDays();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.navigate('Home')}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={26} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.monthNavigation}>
          <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navButton}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthYear}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
        scrollEnabled={true}
        nestedScrollEnabled={false}
      >
        {/* Therapist Info */}
        {therapistData && (
          <View style={styles.therapistInfo}>
            <Ionicons name="person-circle" size={48} color={Colors.primary} />
            <View style={styles.therapistDetails}>
              <Text style={styles.therapistName}>Schedule with {therapistData.name}</Text>
              <Text style={styles.therapistType}>
                {therapistData.type || 'Therapist'} • {therapistData.specialties?.[0] || 'Mental Health'}
              </Text>
            </View>
          </View>
        )}

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {/* Weekday Headers */}
          <View style={styles.weekdayHeaders}>
            {weekDays.map(day => (
              <View key={day} style={styles.weekdayHeader}>
                <Text style={styles.weekdayText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Days */}
          <View style={styles.calendarDays}>
            {calendarDays.map((day, index) => {
              const dayAppointments = getAppointmentsForDate(day);
              const isCurrentMonthDay = isCurrentMonth(day);
              const isTodayDay = isToday(day);
              const isLastInRow = (index + 1) % 7 === 0;
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.calendarDay,
                    !isCurrentMonthDay && styles.otherMonthDay,
                    isTodayDay && styles.todayDay,
                    isLastInRow && styles.lastDayInRow
                  ]}
                  onPress={() => handleDayPress(day, dayAppointments)}
                >
                  <Text style={[
                    styles.dayNumber,
                    isTodayDay && styles.todayDayNumber
                  ]}>
                    {day.getDate()}
                  </Text>
                  <View style={styles.dayAppointments}>
                    {dayAppointments.slice(0, 2).map(appointment => {
                      const type = appointmentTypes[appointment.sessionType] || appointmentTypes.individual;
                      return (
                        <View
                          key={appointment.id}
                          style={[styles.appointmentCard, { borderLeftColor: type.color }]}
                        >
                          <Text style={styles.appointmentTime}>
                            {formatTime(appointment.scheduledTime)}
                          </Text>
                          <Text style={styles.appointmentTitle} numberOfLines={1}>
                            {appointment.therapistName || 'Therapist'}
                          </Text>
                        </View>
                      );
                    })}
                    {dayAppointments.length > 2 && (
                      <Text style={styles.moreAppointments}>+{dayAppointments.length - 2}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, !therapistData && styles.fabDisabled]}
        onPress={() => setShowScheduleForm(true)}
        disabled={!therapistData}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={40} color={Colors.surface} />
      </TouchableOpacity>

      {/* Day detail sheet — what is booked on the tapped day. */}
      <Modal
        visible={!!dayDetail}
        animationType="slide"
        transparent
        onRequestClose={() => setDayDetail(null)}
      >
        <View style={styles.detailBackdrop}>
          <TouchableOpacity
            style={styles.detailBackdropTap}
            activeOpacity={1}
            onPress={() => setDayDetail(null)}
          />
          <View style={styles.detailSheet}>
            <View style={styles.detailGrabber} />
            <Text style={styles.detailDate}>
              {dayDetail?.date?.toLocaleDateString(undefined, {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
            <Text style={styles.detailCount}>
              {dayDetail?.appointments?.length === 1
                ? '1 session'
                : `${dayDetail?.appointments?.length || 0} sessions`}
            </Text>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {(dayDetail?.appointments || []).map((appt) => {
                const type = appointmentTypes[appt.sessionType] || appointmentTypes.individual;
                return (
                  <View key={appt.id} style={[
                    styles.detailCard,
                    { borderLeftColor: type.color },
                    callState(appt.scheduledTime, appt.status).past && styles.detailCardPast,
                  ]}>
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.detailTime}>{formatTime(appt.scheduledTime)}</Text>
                      <View style={[styles.detailChip, { backgroundColor: `${type.color}1A` }]}>
                        <Text style={[styles.detailChipText, { color: type.color }]}>{type.name}</Text>
                      </View>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="person-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.detailPerson}>{appt.therapistName || 'Your therapist'}</Text>
                    </View>
                    {appt.durationMinutes ? (
                      <View style={styles.detailRow}>
                        <Ionicons name="hourglass-outline" size={18} color={Colors.textSecondary} />
                        <Text style={styles.detailMeta}>{appt.durationMinutes} minutes</Text>
                      </View>
                    ) : null}
                    {/* The raw `status` field said "scheduled" for a session
                        three weeks gone. This reflects the clock. */}
                    {(() => {
                      const st = callState(appt.scheduledTime, appt.status);
                      const tone = CALL_STATE_COLORS[st.tone];
                      return (
                        <View style={styles.detailRow}>
                          <Ionicons
                            name={st.past ? 'time-outline' : 'checkmark-circle-outline'}
                            size={18}
                            color={Colors.textSecondary}
                          />
                          <View style={[styles.detailChip, { backgroundColor: tone.bg }]}>
                            <Text style={[styles.detailChipText, { color: tone.fg }]}>{st.label}</Text>
                          </View>
                          <Text style={styles.detailMeta}>{callTimeLabel(appt.scheduledTime)}</Text>
                        </View>
                      );
                    })()}
                    {appt.notes ? (
                      <Text style={styles.detailNotes}>{appt.notes}</Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.detailClose}
              onPress={() => setDayDetail(null)}
            >
              <Text style={styles.detailCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Schedule Form Modal */}
      <Modal
        visible={showScheduleForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowScheduleForm(false)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Call</Text>
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

            {isLoadingTherapist ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading therapist information...</Text>
              </View>
            ) : therapistData ? (
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
                      onPress={handleViewTherapistCalendar}
                    >
                      <Ionicons name="calendar" size={16} color={Colors.surface} />
                      <Text style={styles.viewCalendarText}>View Calendar</Text>
                    </TouchableOpacity>
                  </View>
                  {showDatePicker && (
                    <DateTimePicker
        // Pinned, not left to the OS: the picker follows the SYSTEM appearance,
        // so on a device in dark mode it drew light text on this light sheet and
        // was invisible. The simulator was in light mode, which is why it only
        // showed up on real hardware.
        themeVariant="light"
        accentColor="#5046bd"
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
        // Pinned, not left to the OS: the picker follows the SYSTEM appearance,
        // so on a device in dark mode it drew light text on this light sheet and
        // was invisible. The simulator was in light mode, which is why it only
        // showed up on real hardware.
        themeVariant="light"
        accentColor="#5046bd"
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Therapist Calendar Modal */}
      <Modal
        visible={showTherapistCalendar}
        animationType="slide"
        transparent={true}
        onRequestClose={closeTherapistCalendar}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.calendarModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalTitle}>
                  {therapistData?.name ? `${therapistData.name}'s Availability` : 'Therapist Availability'}
                </Text>
                {therapistData && (
                  <Text style={styles.modalSubtitle}>
                    {therapistData.type || 'Therapist'} • {therapistData.specialties?.[0] || 'Mental Health'}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={closeTherapistCalendar}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.modalContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {isLoadingAvailability ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>Loading therapist availability...</Text>
                </View>
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
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // ── Day detail sheet ──────────────────────────────────────────────────────
  detailBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  detailBackdropTap: { flex: 1 },
  detailSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  detailGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 14,
  },
  detailDate: { fontSize: 19, fontWeight: '800', color: '#0d0d0d' },
  detailCount: { fontSize: 13, color: '#0d0d0d', marginTop: 2, marginBottom: 14 },
  detailCardPast: { opacity: 0.66 },
  detailCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailTime: { fontSize: 16, fontWeight: '800', color: '#0d0d0d' },
  detailChip: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  detailChipText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  detailPerson: { fontSize: 14, fontWeight: '600', color: '#0d0d0d' },
  detailMeta: { fontSize: 13, color: '#0d0d0d', textTransform: 'capitalize' },
  detailNotes: {
    marginTop: 6,
    fontSize: 13,
    color: '#0d0d0d',
    fontStyle: 'italic',
    lineHeight: 19,
  },
  detailClose: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  detailCloseText: { fontSize: 15, fontWeight: '700', color: '#0d0d0d' },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    borderRadius: 999,
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    justifyContent: 'center',
  },
  navButton: {
    padding: 8,
  },
  monthYear: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    minWidth: 200,
    textAlign: 'center',
  },
  todayButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  todayButtonText: {
    color: Colors.surface,
    fontWeight: '600',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  therapistInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  therapistDetails: {
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
  calendarGrid: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  weekdayHeaders: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  weekdayHeader: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRightWidth: 0,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  calendarDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  calendarDay: {
    width: width / 7,
    minHeight: 100,
    borderRightWidth: 0,
    borderBottomWidth: 0.5,
    borderColor: Colors.border,
    padding: 8,
    backgroundColor: Colors.surface,
  },
  lastDayInRow: {
    borderRightWidth: 0,
  },
  otherMonthDay: {
    backgroundColor: 'transparent',
    opacity: 0.5,
  },
  todayDay: {
    backgroundColor: 'rgba(207,169,97,0.12)',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  todayDayNumber: {
    backgroundColor: Colors.primary,
    color: Colors.surface,
    borderRadius: 16,
    width: 32,
    height: 32,
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: '600',
  },
  dayAppointments: {
    gap: 4,
  },
  appointmentCard: {
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 6,
    marginBottom: 4,
  },
  appointmentTime: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 2,
  },
  appointmentTitle: {
    fontSize: 10,
    color: Colors.text,
    fontWeight: '500',
  },
  moreAppointments: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    borderWidth: 4,
    borderColor: Colors.surface,
    zIndex: 1000,
  },
  fabDisabled: {
    backgroundColor: Colors.textSecondary,
    opacity: 0.6,
    shadowOpacity: 0.2,
    elevation: 8,
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
    margin: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  modalContent: {
    padding: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  viewCalendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 999,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(95,84,214,0.35)',
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  durationContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  durationButton: {
    flex: 1,
    padding: 12,
    borderRadius: 999,
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
    backgroundColor: '#ffffff',
  },
  submitButton: {
    backgroundColor: '#b794f6',
    padding: 16,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(95,84,214,0.35)',
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
    backgroundColor: 'transparent',
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
  calendarNote: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
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
    color: '#2f7d5f',
    fontWeight: '700',
  },
});

export default ClientScheduleScreen;
