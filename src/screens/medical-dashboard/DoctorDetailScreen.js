import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { MedicalColors } from '../../constants/colors';

function getInitials(name) {
  if (!name) return 'D';
  const p = name.trim().split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function StarRating({ rating }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons
          key={i}
          name={i <= full ? 'star' : (i === full + 1 && half ? 'star-half' : 'star-outline')}
          size={16}
          color={MedicalColors.rating}
        />
      ))}
    </View>
  );
}

const InfoRow = ({ icon, label, value }) => (
  value ? (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={MedicalColors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  ) : null
);

const DoctorDetailScreen = ({ route, navigation }) => {
  const { doctorId } = route.params;
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDoctor();
  }, [doctorId]);

  const loadDoctor = async () => {
    try {
      const snap = await getDoc(doc(db, 'doctors', doctorId));
      if (snap.exists()) {
        setDoctor({ id: snap.id, ...snap.data() });
      }
    } catch (err) {
      console.error('Error loading doctor:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  if (!doctor) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={MedicalColors.textLight} />
        <Text style={styles.notFoundText}>Doctor profile not available</Text>
      </View>
    );
  }

  const rating = typeof doctor.rating === 'number' ? doctor.rating : parseFloat(doctor.rating) || 0;
  const reviewCount = doctor.reviewCount || doctor.totalReviews || 0;

  const availabilityDays = Array.isArray(doctor.availability)
    ? doctor.availability
    : typeof doctor.availability === 'string'
    ? [doctor.availability]
    : [];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.avatarWrap}>
          {doctor.photoURL ? (
            <Image source={{ uri: doctor.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>{getInitials(doctor.name)}</Text>
            </View>
          )}
          {doctor.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>

        <Text style={styles.doctorName}>Dr. {doctor.name}</Text>
        <Text style={styles.specialization}>{doctor.specialization || doctor.specialty || 'Medical Doctor'}</Text>

        {rating > 0 && (
          <View style={styles.ratingRow}>
            <StarRating rating={rating} />
            <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
            {reviewCount > 0 && (
              <Text style={styles.reviewCount}>({reviewCount} reviews)</Text>
            )}
          </View>
        )}

        {/* Quick action buttons */}
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={() => navigation.navigate('MedicalAppointments')}
          >
            <Ionicons name="calendar-outline" size={16} color="#fff" />
            <Text style={styles.heroBtnText}>Book Appointment</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroBtn, styles.heroBtnOutline]}
            onPress={() => navigation.navigate('MedicalMessages')}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={MedicalColors.primary} />
            <Text style={[styles.heroBtnText, { color: MedicalColors.primary }]}>Message</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* About */}
      {doctor.bio || doctor.about ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.bioText}>{doctor.bio || doctor.about}</Text>
        </View>
      ) : null}

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Professional Details</Text>
        <InfoRow icon="school-outline" label="Qualifications" value={
          Array.isArray(doctor.qualifications)
            ? doctor.qualifications.join(', ')
            : doctor.qualifications || doctor.education
        } />
        <InfoRow icon="briefcase-outline" label="Experience" value={
          doctor.yearsOfExperience
            ? `${doctor.yearsOfExperience} years of experience`
            : doctor.experience
        } />
        <InfoRow icon="business-outline" label="Hospital / Clinic" value={doctor.hospital || doctor.clinic || doctor.workplace} />
        <InfoRow icon="location-outline" label="Location" value={doctor.location || doctor.city} />
        <InfoRow icon="language-outline" label="Languages" value={
          Array.isArray(doctor.languages) ? doctor.languages.join(', ') : doctor.languages
        } />
        <InfoRow icon="card-outline" label="License Number" value={doctor.licenseNumber} />
      </View>

      {/* Availability */}
      {(availabilityDays.length > 0 || doctor.workingHours || doctor.consultationHours) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Availability</Text>
          {availabilityDays.length > 0 && (
            <View style={styles.daysWrap}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                const active = availabilityDays.some(d =>
                  d.toLowerCase().startsWith(day.toLowerCase())
                );
                return (
                  <View key={day} style={[styles.dayChip, active && styles.dayChipActive]}>
                    <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{day}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {(doctor.workingHours || doctor.consultationHours) && (
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="time-outline" size={16} color={MedicalColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Working Hours</Text>
                <Text style={styles.infoValue}>{doctor.workingHours || doctor.consultationHours}</Text>
              </View>
            </View>
          )}
          <InfoRow icon="videocam-outline" label="Consultation Type" value={
            Array.isArray(doctor.consultationTypes)
              ? doctor.consultationTypes.join(', ')
              : doctor.consultationType || doctor.consultationMode
          } />
        </View>
      )}

      {/* Consultation fee */}
      {(doctor.consultationFee || doctor.fee) && (
        <View style={styles.feeCard}>
          <Ionicons name="cash-outline" size={22} color={MedicalColors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.feeLabelText}>Consultation Fee</Text>
            <Text style={styles.feeValue}>{doctor.consultationFee || doctor.fee}</Text>
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MedicalColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: MedicalColors.background, padding: 32 },
  notFoundText: { fontSize: 15, color: MedicalColors.textSecondary, marginTop: 14, textAlign: 'center' },

  // Hero
  hero: {
    backgroundColor: MedicalColors.primary,
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarInitials: { fontSize: 36, fontWeight: '800', color: '#fff' },
  verifiedBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: MedicalColors.verified,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  doctorName: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  specialization: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  ratingNum: { fontSize: 15, fontWeight: '700', color: '#fff' },
  reviewCount: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  heroActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
  },
  heroBtnOutline: { backgroundColor: '#fff' },
  heroBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Cards
  card: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: MedicalColors.text, marginBottom: 12 },
  bioText: { fontSize: 14, color: MedicalColors.textSecondary, lineHeight: 22 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: MedicalColors.border },
  infoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: MedicalColors.primaryLight, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 2 },
  infoLabel: { fontSize: 11, color: MedicalColors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 14, color: MedicalColors.text, fontWeight: '500', marginTop: 2 },

  // Days
  daysWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dayChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: MedicalColors.border,
  },
  dayChipActive: { backgroundColor: MedicalColors.primary },
  dayChipText: { fontSize: 12, fontWeight: '600', color: MedicalColors.textSecondary },
  dayChipTextActive: { color: '#fff' },

  // Fee card
  feeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#f0fdf4', borderRadius: 14,
    padding: 16, marginHorizontal: 16, marginTop: 14,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  feeLabelText: { fontSize: 12, color: MedicalColors.textSecondary, fontWeight: '600' },
  feeValue: { fontSize: 18, fontWeight: '800', color: MedicalColors.success },
});

export default DoctorDetailScreen;
