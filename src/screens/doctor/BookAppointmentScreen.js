import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredUserId, getStoredEmail } from '../../services/apiClient';
import { payForBooking } from '../../services/paystack';
import { createAppointment } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';
import { chooseService } from '../../utils/careServices';

const EMPTY_VITALS = {
  bpSystolic: '',
  bpDiastolic: '',
  heartRate: '',
  respiratoryRate: '',
  spo2: '',
  temperature: '',
  tempUnit: 'C',
};

const consultationTypes = [
  { key: 'video', label: 'Video Call', icon: 'videocam-outline', description: 'Face-to-face via video' },
  { key: 'chat', label: 'Chat', icon: 'chatbubble-outline', description: 'Text-based consultation' },
  { key: 'in-person', label: 'In-Person', icon: 'location-outline', description: 'Visit the clinic' },
];

const BookAppointmentScreen = ({ route, navigation }) => {
  const {
    doctorId,
    doctorName,
    specialization,
    consultationFee,
    slotId,
    date: preselectedDate,
    startTime: preselectedStart,
    endTime: preselectedEnd,
  } = route.params;

  const [selectedType, setSelectedType] = useState('video');
  const [selectedDate, setSelectedDate] = useState(preselectedDate || '');
  const [selectedTime, setSelectedTime] = useState(preselectedStart || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vitals, setVitals] = useState({ ...EMPTY_VITALS });
  const [showVitals, setShowVitals] = useState(false);
  // Not signed in yet (new visitor): pay with the email they will sign up with,
  // then sign up; the paid booking becomes a real appointment after sign-up.
  const lastPaymentRef = useRef(null);
  const [isGuest, setIsGuest] = useState(false);
  const [bookingAs, setBookingAs] = useState('');
  useEffect(() => {
    getStoredUserId().then(async (id) => {
      setIsGuest(!id);
      if (id) setBookingAs((await AsyncStorage.getItem('userName')) || (await AsyncStorage.getItem('th.email')) || 'your account');
    }).catch(() => setIsGuest(true));
  }, []);
  const notYou = async () => {
    try { const { performLogout } = await import('../../services/authService'); await performLogout(); } catch { /* ignore */ }
    const root = navigation.getParent() || navigation;
    root.reset({ index: 0, routes: [{ name: 'Intent' }] });
  };
  // Shown after Paystack confirms the payment. An Alert raised while the payment
  // sheet is closing is silently dropped on iOS, which is why nothing appeared and
  // the visitor was never taken to sign-up.
  const [success, setSuccess] = useState(null); // { amount, reference, next: 'signup' | 'booked' }
  const goNext = (s = success) => {
    setSuccess(null);
    if (!s) return;
    if (s.next === 'signup') { navigation.navigate('SignUp'); return; }
    // Signed in (possibly a therapy client): the booking lives on the medical
    // dashboard, so open that one next time too.
    getStoredUserId().then((id) => chooseService(id, 'medical')).catch(() => {});
    navigation.navigate('MedicalMain');
  };
  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => goNext(success), success.next === 'signup' ? 3000 : 4000);
    return () => clearTimeout(t);
  }, [success]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate next 14 days for date selection if no preselected date
  const getDateOptions = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push({
        value: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
      });
    }
    return dates;
  };

  const timeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '12:00', '13:00', '13:30', '14:00',
    '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
  ];

  const dateOptions = getDateOptions();

  const handleBook = async () => {
    if (!selectedDate) {
      Alert.alert('Select Date', 'Please choose a date for your appointment.');
      return;
    }
    if (!selectedTime) {
      Alert.alert('Select Time', 'Please choose a time slot.');
      return;
    }

    // Is the slot still free? Checked BEFORE payment, so nobody pays for a time
    // the server then refuses (it happened: a taken 13:30 was charged twice).
    try {
      setIsSubmitting(true);
      await api('/api/v1/medical/appointments/check', {
        method: 'POST', authenticated: false,
        body: { doctorId, scheduledAt: `${selectedDate}T${selectedTime}:00` },
      });
    } catch (e) {
      setIsSubmitting(false);
      Alert.alert('Choose another time', e?.message || 'That time is not available.');
      return;
    } finally {
      setIsSubmitting(false);
    }

    const clientId = await getStoredUserId();
    if (!clientId) {
      // New visitor: pay first, then sign up (the appointment is created after sign-up).
      // Paystack needs an email to start a payment; a NessaHub booking address is
      // used until the account exists, then the payment is filed on the account.
      const email = `booking+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@nessahub.com`;
      setIsSubmitting(true);
      try {
        const paid = await payForBooking({
          email,
          amount: Number(consultationFee || 0),
          purpose: 'medical',
          metadata: { doctorId, providerId: doctorId, serviceType: 'consultation' },
        });
        if (!paid.ok) {
          Alert.alert('Payment not completed', paid.reason || 'Your appointment was not booked.');
          return;
        }
        await AsyncStorage.setItem('th.pendingBooking', JSON.stringify({
          doctorId, doctorName: doctorName || 'Doctor', doctorSpecialization: specialization || '',
          date: selectedDate, time: selectedTime, consultationType: selectedType, notes: notes.trim(),
          slotId: slotId || null, consultationFee: Number(consultationFee || 0),
          paymentReference: paid.reference || null, savedAt: new Date().toISOString(),
        }));
        await AsyncStorage.setItem('userIntent', 'medical');
        // Let the payment sheet finish closing before showing the confirmation.
        setTimeout(() => setSuccess({ amount: paid.amount, reference: paid.reference, next: 'signup', free: paid.free }), 600);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const clientName = (await AsyncStorage.getItem('userName')) || 'Patient';

      // Build vitals payload (only include non-empty values)
      const hasVitals = showVitals && Object.entries(vitals).some(([k, v]) => k !== 'tempUnit' && v.trim() !== '');
      const vitalsPayload = hasVitals ? {
        bpSystolic: vitals.bpSystolic.trim(),
        bpDiastolic: vitals.bpDiastolic.trim(),
        heartRate: vitals.heartRate.trim(),
        respiratoryRate: vitals.respiratoryRate.trim(),
        spo2: vitals.spo2.trim(),
        temperature: vitals.temperature.trim(),
        tempUnit: vitals.tempUnit,
        recordedAt: new Date().toISOString(),
      } : null;

      // ── Pay before the appointment exists (or use the free first consultation) ──
      // This screen used to book straight away without any payment.
      const fee = Number(consultationFee || 0);
      const paid = await payForBooking({
        email: await getStoredEmail(),
        amount: fee,
        purpose: 'medical',
        metadata: { doctorId, providerId: doctorId, patientId: clientId, serviceType: 'consultation' },
      });
      if (!paid.ok) {
        Alert.alert('Payment not completed', paid.reason || 'Your appointment was not booked.');
        setIsSubmitting(false);
        return;
      }
      lastPaymentRef.current = paid.reference || null;
      if (paid.reference) {
        api('/api/v1/payments/record', { method: 'POST', body: { reference: paid.reference, description: `Consultation with Dr. ${doctorName || ''}`.trim() } }).catch(() => {});
      }

      await createAppointment({
        paymentReference: paid.reference || null,
        doctorId,
        doctorName: doctorName || 'Doctor',
        doctorSpecialization: specialization || '',
        clientId,
        clientName,
        date: selectedDate,
        time: selectedTime,
        consultationType: selectedType,
        consultationFee: consultationFee || 0,
        notes: notes.trim(),
        slotId: slotId || null,
        vitals: vitalsPayload,
      });

      if (vitalsPayload) {
        api(`/api/v1/patients/${clientId}/vitals`, { method: 'POST', body: vitalsPayload }).catch(() => {});
      }

      setTimeout(() => setSuccess({ amount: paid.amount, reference: paid.reference, next: 'booked', free: paid.free }), 600);
    } catch (error) {
      // Say what the server said; if money was already taken, give the reference.
      Alert.alert('Could not book the appointment', `${error?.message || 'Please try again.'}${lastPaymentRef.current ? `\n\nYour payment reference: ${lastPaymentRef.current}. Contact support and quote it if you are not refunded or rebooked.` : ''}`);
      console.error('Booking error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Doctor Info Card */}
      <View style={styles.doctorCard}>
        <View style={styles.doctorCardLeft}>
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarSmallText}>{(doctorName || 'D')[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.doctorCardName}>Dr. {doctorName}</Text>
            <Text style={styles.doctorCardSpec}>{specialization || 'General Practitioner'}</Text>
          </View>
        </View>
        {consultationFee ? (
          <Text style={styles.feeText}>GHS {consultationFee}</Text>
        ) : null}
      </View>

      {/* Consultation Type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consultation Type</Text>
        <View style={styles.typeGrid}>
          {consultationTypes.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[styles.typeCard, selectedType === type.key && styles.typeCardActive]}
              onPress={() => setSelectedType(type.key)}
            >
              <Ionicons
                name={type.icon}
                size={26}
                color={selectedType === type.key ? '#FFFFFF' : MedicalColors.primary}
              />
              <Text style={[styles.typeLabel, selectedType === type.key && styles.typeLabelActive]}>
                {type.label}
              </Text>
              <Text style={[styles.typeDesc, selectedType === type.key && styles.typeDescActive]}>
                {type.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Date Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {preselectedDate ? 'Selected Date' : 'Select Date'}
        </Text>
        {preselectedDate ? (
          <View style={[styles.preselectedChip]}>
            <Ionicons name="calendar" size={18} color={MedicalColors.primary} />
            <Text style={styles.preselectedText}>
              {new Date(preselectedDate).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
            {dateOptions.map((d) => (
              <TouchableOpacity
                key={d.value}
                style={[styles.dateChip, selectedDate === d.value && styles.dateChipActive]}
                onPress={() => setSelectedDate(d.value)}
              >
                <Text style={[styles.dateDayName, selectedDate === d.value && styles.dateTextActive]}>
                  {d.dayName}
                </Text>
                <Text style={[styles.dateDayNum, selectedDate === d.value && styles.dateTextActive]}>
                  {d.dayNum}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Time Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {preselectedStart ? 'Selected Time' : 'Select Time'}
        </Text>
        {preselectedStart ? (
          <View style={styles.preselectedChip}>
            <Ionicons name="time" size={18} color={MedicalColors.primary} />
            <Text style={styles.preselectedText}>
              {preselectedStart} - {preselectedEnd}
            </Text>
          </View>
        ) : (
          <View style={styles.timeGrid}>
            {timeSlots.map((time) => (
              <TouchableOpacity
                key={time}
                style={[styles.timeChip, selectedTime === time && styles.timeChipActive]}
                onPress={() => setSelectedTime(time)}
              >
                <Text style={[styles.timeText, selectedTime === time && styles.timeTextActive]}>
                  {time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Vitals Section */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.vitalsToggleRow}
          onPress={() => setShowVitals(v => !v)}
          activeOpacity={0.75}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="pulse-outline" size={20} color="#dc2626" />
            <Text style={styles.sectionTitle}>Patient Vitals (optional)</Text>
          </View>
          <Switch
            value={showVitals}
            onValueChange={setShowVitals}
            trackColor={{ false: MedicalColors.border, true: '#fca5a5' }}
            thumbColor={showVitals ? '#dc2626' : '#f1f5f9'}
          />
        </TouchableOpacity>

        {showVitals && (
          <View style={styles.vitalsCard}>
            {/* Blood Pressure */}
            <Text style={styles.vitalsGroupLabel}>Blood Pressure</Text>
            <View style={styles.vitalsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vitalsFieldLabel}>Systolic (mmHg)</Text>
                <TextInput
                  style={styles.vitalsInput}
                  placeholder="e.g. 120"
                  placeholderTextColor={MedicalColors.textLight}
                  keyboardType="numeric"
                  value={vitals.bpSystolic}
                  onChangeText={v => setVitals(p => ({ ...p, bpSystolic: v }))}
                />
              </View>
              <View style={styles.vitalsDivider}>
                <Text style={styles.vitalsDividerText}>/</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vitalsFieldLabel}>Diastolic (mmHg)</Text>
                <TextInput
                  style={styles.vitalsInput}
                  placeholder="e.g. 80"
                  placeholderTextColor={MedicalColors.textLight}
                  keyboardType="numeric"
                  value={vitals.bpDiastolic}
                  onChangeText={v => setVitals(p => ({ ...p, bpDiastolic: v }))}
                />
              </View>
            </View>

            {/* Heart Rate */}
            <Text style={styles.vitalsFieldLabel}>Heart Rate (bpm)</Text>
            <TextInput
              style={styles.vitalsInput}
              placeholder="e.g. 72"
              placeholderTextColor={MedicalColors.textLight}
              keyboardType="numeric"
              value={vitals.heartRate}
              onChangeText={v => setVitals(p => ({ ...p, heartRate: v }))}
            />

            {/* Respiratory Rate */}
            <Text style={styles.vitalsFieldLabel}>Respiratory Rate (breaths/min)</Text>
            <TextInput
              style={styles.vitalsInput}
              placeholder="e.g. 16"
              placeholderTextColor={MedicalColors.textLight}
              keyboardType="numeric"
              value={vitals.respiratoryRate}
              onChangeText={v => setVitals(p => ({ ...p, respiratoryRate: v }))}
            />

            {/* SpO2 */}
            <Text style={styles.vitalsFieldLabel}>Oxygen Saturation (SpO2 %)</Text>
            <TextInput
              style={styles.vitalsInput}
              placeholder="e.g. 98"
              placeholderTextColor={MedicalColors.textLight}
              keyboardType="numeric"
              value={vitals.spo2}
              onChangeText={v => setVitals(p => ({ ...p, spo2: v }))}
            />

            {/* Temperature */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={styles.vitalsFieldLabel}>Temperature</Text>
              <View style={styles.tempToggle}>
                {['C', 'F'].map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.tempBtn, vitals.tempUnit === u && styles.tempBtnActive]}
                    onPress={() => setVitals(p => ({ ...p, tempUnit: u }))}
                  >
                    <Text style={[styles.tempBtnText, vitals.tempUnit === u && styles.tempBtnTextActive]}>°{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TextInput
              style={styles.vitalsInput}
              placeholder={vitals.tempUnit === 'C' ? 'e.g. 37.2' : 'e.g. 98.9'}
              placeholderTextColor={MedicalColors.textLight}
              keyboardType="decimal-pad"
              value={vitals.temperature}
              onChangeText={v => setVitals(p => ({ ...p, temperature: v }))}
            />
          </View>
        )}
      </View>

      {!isGuest && !!bookingAs && (
        <View style={[styles.section, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <Text style={{ color: MedicalColors.textLight, fontSize: 14, flex: 1 }}>Booking as <Text style={{ fontWeight: '800', color: MedicalColors.text || '#0f172a' }}>{bookingAs}</Text></Text>
          <TouchableOpacity onPress={notYou}><Text style={{ color: MedicalColors.primary, fontWeight: '700' }}>Not you?</Text></TouchableOpacity>
        </View>
      )}

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes for Doctor (optional)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Describe your symptoms or reason for visit..."
          placeholderTextColor={MedicalColors.textLight}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Summary & Book Button */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Appointment Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Doctor</Text>
          <Text style={styles.summaryValue}>Dr. {doctorName}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Type</Text>
          <Text style={styles.summaryValue}>
            {consultationTypes.find((t) => t.key === selectedType)?.label}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Date</Text>
          <Text style={styles.summaryValue}>{selectedDate || 'Not selected'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Time</Text>
          <Text style={styles.summaryValue}>{selectedTime || 'Not selected'}</Text>
        </View>
        {consultationFee ? (
          <View style={[styles.summaryRow, styles.summaryRowLast]}>
            <Text style={styles.summaryLabel}>Fee</Text>
            <Text style={[styles.summaryValue, { fontWeight: '700', color: MedicalColors.primary }]}>
              GHS {consultationFee}
            </Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.bookButton, isSubmitting && { opacity: 0.6 }]}
        onPress={handleBook}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
            <Text style={styles.bookButtonText}>Confirm Booking</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
      <Modal visible={!!success} transparent animationType="fade" onRequestClose={() => goNext()}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="checkmark" size={36} color="#16a34a" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 6 }}>
              {success?.free ? 'Your first consultation is free' : 'Payment successful'}
            </Text>
            {!success?.free && <Text style={{ fontSize: 15, color: '#334155', marginBottom: 4 }}>GHS {Number(success?.amount || 0).toFixed(2)} paid to NessaHub</Text>}
            {!!success?.reference && <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Reference {success.reference}</Text>}
            <Text style={{ fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 18 }}>
              {success?.next === 'signup'
                ? 'Confirmed with Paystack. Next, create your account to confirm your appointment with Dr. ' + (doctorName || '') + '.'
                : `Your appointment with Dr. ${doctorName || ''} on ${selectedDate} at ${selectedTime} is booked. You will be told when the doctor confirms.`}
            </Text>
            <TouchableOpacity onPress={() => goNext()} style={{ backgroundColor: MedicalColors.primary, borderRadius: 12, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{success?.next === 'signup' ? 'Continue to sign up' : 'View my appointments'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
    padding: 16,
  },
  doctorCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  doctorCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  doctorCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  doctorCardSpec: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
  },
  feeText: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: MedicalColors.surface,
    borderWidth: 1.5,
    borderColor: MedicalColors.border,
  },
  typeCardActive: {
    backgroundColor: MedicalColors.primary,
    borderColor: MedicalColors.primary,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.text,
    marginTop: 8,
  },
  typeLabelActive: {
    color: '#FFFFFF',
  },
  typeDesc: {
    fontSize: 10,
    color: MedicalColors.textLight,
    marginTop: 3,
    textAlign: 'center',
  },
  typeDescActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  dateScroll: {
    flexDirection: 'row',
  },
  dateChip: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    marginRight: 10,
    minWidth: 60,
  },
  dateChipActive: {
    backgroundColor: MedicalColors.primary,
    borderColor: MedicalColors.primary,
  },
  dateDayName: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  dateDayNum: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  dateTextActive: {
    color: '#FFFFFF',
  },
  preselectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: MedicalColors.primaryLight,
    padding: 14,
    borderRadius: 12,
  },
  preselectedText: {
    fontSize: 15,
    color: MedicalColors.primary,
    fontWeight: '600',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  timeChipActive: {
    backgroundColor: MedicalColors.primary,
    borderColor: MedicalColors.primary,
  },
  timeText: {
    fontSize: 14,
    color: MedicalColors.text,
    fontWeight: '500',
  },
  timeTextActive: {
    color: '#FFFFFF',
  },
  notesInput: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: MedicalColors.text,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    minHeight: 100,
  },
  summaryCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
  },
  summaryLabel: {
    fontSize: 14,
    color: MedicalColors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: MedicalColors.text,
    fontWeight: '500',
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MedicalColors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  // Vitals styles
  vitalsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  vitalsCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
  },
  vitalsGroupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
    marginBottom: 8,
    marginTop: 4,
  },
  vitalsFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  vitalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  vitalsDivider: {
    paddingHorizontal: 8,
    paddingTop: 20,
  },
  vitalsDividerText: {
    fontSize: 22,
    fontWeight: '300',
    color: MedicalColors.textLight,
  },
  vitalsInput: {
    backgroundColor: MedicalColors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    padding: 10,
    fontSize: 14,
    color: MedicalColors.text,
  },
  tempToggle: {
    flexDirection: 'row',
    backgroundColor: MedicalColors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    overflow: 'hidden',
  },
  tempBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  tempBtnActive: {
    backgroundColor: '#dc2626',
  },
  tempBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
  },
  tempBtnTextActive: {
    color: '#fff',
  },
});

export default BookAppointmentScreen;
