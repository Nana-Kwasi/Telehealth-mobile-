import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createAppointment } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

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

    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Not Logged In', 'Please log in to book an appointment.');
      return;
    }

    setIsSubmitting(true);
    try {
      const clientId = currentUser.uid;
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

      await createAppointment({
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

      // Save latest vitals to patientProfiles
      if (vitalsPayload) {
        try {
          await setDoc(
            doc(db, 'patientProfiles', clientId),
            { vitals: { latest: { ...vitalsPayload, recordedAt: serverTimestamp() } }, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } catch (_) {}
      }

      Alert.alert(
        'Appointment Booked',
        `Your ${selectedType} appointment with Dr. ${doctorName} on ${selectedDate} at ${selectedTime} has been submitted. You will receive a confirmation once the doctor accepts.`,
        [
          {
            text: 'View Appointments',
            onPress: () => navigation.navigate('MedicalMain'),
          },
          { text: 'OK', onPress: () => navigation.goBack() },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to book appointment. Please try again.');
      console.error('Booking error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
          <Text style={styles.feeText}>${consultationFee}</Text>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
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
              ${consultationFee}
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
