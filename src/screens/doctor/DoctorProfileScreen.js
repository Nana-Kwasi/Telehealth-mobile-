import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchDoctorProfile,
  fetchDoctorAvailability,
  fetchDoctorReviews,
} from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const { width } = Dimensions.get('window');

const DoctorProfileScreen = ({ route, navigation }) => {
  const { doctorId } = route.params;
  const [doctor, setDoctor] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('about');

  useEffect(() => {
    loadData();
  }, [doctorId]);

  const loadData = async () => {
    setIsLoading(true);
    const [doc, avail, revs] = await Promise.all([
      fetchDoctorProfile(doctorId),
      fetchDoctorAvailability(doctorId),
      fetchDoctorReviews(doctorId),
    ]);
    setDoctor(doc);
    setAvailability(avail);
    setReviews(revs);
    setIsLoading(false);
  };

  const renderStars = (rating, size = 16) => {
    const stars = [];
    const fullStars = Math.floor(rating || 0);
    const hasHalf = (rating || 0) - fullStars >= 0.5;
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Ionicons key={i} name="star" size={size} color={MedicalColors.rating} />);
      } else if (i === fullStars && hasHalf) {
        stars.push(<Ionicons key={i} name="star-half" size={size} color={MedicalColors.rating} />);
      } else {
        stars.push(<Ionicons key={i} name="star-outline" size={size} color={MedicalColors.rating} />);
      }
    }
    return stars;
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  if (!doctor) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={MedicalColors.error} />
        <Text style={styles.errorText}>Doctor profile not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.headerBg} />
          <View style={styles.headerContent}>
            {doctor.photoURL ? (
              <Image source={{ uri: doctor.photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{(doctor.name || 'D')[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.nameSection}>
              <View style={styles.nameRow}>
                <Text style={styles.doctorName}>Dr. {doctor.name}</Text>
                {doctor.verified && (
                  <Ionicons name="checkmark-circle" size={20} color={MedicalColors.verified} />
                )}
              </View>
              <Text style={styles.specialization}>
                {doctor.specialization || 'General Practitioner'}
              </Text>
            </View>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{doctor.experience || 0}</Text>
              <Text style={styles.statLabel}>Years Exp.</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.ratingInline}>
                <Ionicons name="star" size={16} color={MedicalColors.rating} />
                <Text style={styles.statValue}>{(doctor.averageRating || 0).toFixed(1)}</Text>
              </View>
              <Text style={styles.statLabel}>{doctor.totalReviews || 0} Reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>${doctor.consultationFee || 'N/A'}</Text>
              <Text style={styles.statLabel}>Consult Fee</Text>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabs}>
          {['about', 'availability', 'reviews'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'about' && (
            <View>
              {doctor.bio ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>About</Text>
                  <Text style={styles.bioText}>{doctor.bio}</Text>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Details</Text>
                <View style={styles.detailsList}>
                  {doctor.specialization && (
                    <View style={styles.detailRow}>
                      <Ionicons name="medical-outline" size={18} color={MedicalColors.primary} />
                      <Text style={styles.detailLabel}>Specialty</Text>
                      <Text style={styles.detailValue}>{doctor.specialization}</Text>
                    </View>
                  )}
                  {doctor.location && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location-outline" size={18} color={MedicalColors.primary} />
                      <Text style={styles.detailLabel}>Location</Text>
                      <Text style={styles.detailValue}>{doctor.location}</Text>
                    </View>
                  )}
                  {doctor.languages && (
                    <View style={styles.detailRow}>
                      <Ionicons name="globe-outline" size={18} color={MedicalColors.primary} />
                      <Text style={styles.detailLabel}>Languages</Text>
                      <Text style={styles.detailValue}>
                        {Array.isArray(doctor.languages) ? doctor.languages.join(', ') : doctor.languages}
                      </Text>
                    </View>
                  )}
                  {doctor.licenseNumber && (
                    <View style={styles.detailRow}>
                      <Ionicons name="document-text-outline" size={18} color={MedicalColors.primary} />
                      <Text style={styles.detailLabel}>License</Text>
                      <Text style={styles.detailValue}>{doctor.licenseNumber}</Text>
                    </View>
                  )}
                  {doctor.education && (
                    <View style={styles.detailRow}>
                      <Ionicons name="school-outline" size={18} color={MedicalColors.primary} />
                      <Text style={styles.detailLabel}>Education</Text>
                      <Text style={styles.detailValue}>{doctor.education}</Text>
                    </View>
                  )}
                </View>
              </View>

              {doctor.consultationTypes && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Consultation Types</Text>
                  <View style={styles.consultTypes}>
                    {(Array.isArray(doctor.consultationTypes) ? doctor.consultationTypes : ['video', 'chat']).map((type) => (
                      <View key={type} style={styles.consultChip}>
                        <Ionicons
                          name={type === 'video' ? 'videocam-outline' : type === 'chat' ? 'chatbubble-outline' : 'location-outline'}
                          size={16}
                          color={MedicalColors.primary}
                        />
                        <Text style={styles.consultChipText}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {activeTab === 'availability' && (
            <View>
              {availability.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={MedicalColors.textLight} />
                  <Text style={styles.emptyTitle}>No availability posted</Text>
                  <Text style={styles.emptySubtitle}>The doctor hasn't set up their schedule yet.</Text>
                </View>
              ) : (
                availability.map((slot) => (
                  <TouchableOpacity
                    key={slot.id}
                    style={[styles.slotCard, slot.isBooked && styles.slotBooked]}
                    disabled={slot.isBooked}
                    onPress={() =>
                      navigation.navigate('BookAppointment', {
                        doctorId: doctor.id,
                        doctorName: doctor.name,
                        specialization: doctor.specialization,
                        consultationFee: doctor.consultationFee,
                        slotId: slot.id,
                        date: slot.date,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                      })
                    }
                  >
                    <View style={styles.slotInfo}>
                      <Text style={styles.slotDate}>{formatDate(slot.date)}</Text>
                      <Text style={styles.slotTime}>
                        {slot.startTime} - {slot.endTime}
                      </Text>
                    </View>
                    <View style={[styles.slotStatus, slot.isBooked && styles.slotStatusBooked]}>
                      <Text style={[styles.slotStatusText, slot.isBooked && styles.slotStatusTextBooked]}>
                        {slot.isBooked ? 'Booked' : 'Available'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {activeTab === 'reviews' && (
            <View>
              {reviews.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={48} color={MedicalColors.textLight} />
                  <Text style={styles.emptyTitle}>No reviews yet</Text>
                  <Text style={styles.emptySubtitle}>Be the first to leave a review after your appointment.</Text>
                </View>
              ) : (
                reviews.map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.reviewStars}>{renderStars(review.rating, 14)}</View>
                      <Text style={styles.reviewDate}>
                        {review.date ? new Date(review.date).toLocaleDateString() : ''}
                      </Text>
                    </View>
                    {review.comment ? (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    ) : null}
                    <Text style={styles.reviewAuthor}>
                      {review.clientName || 'Anonymous Patient'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Book Button */}
      <View style={styles.bookButtonContainer}>
        <TouchableOpacity
          style={styles.bookButton}
          onPress={() =>
            navigation.navigate('BookAppointment', {
              doctorId: doctor.id,
              doctorName: doctor.name,
              specialization: doctor.specialization,
              consultationFee: doctor.consultationFee,
            })
          }
        >
          <Ionicons name="calendar" size={20} color="#FFFFFF" />
          <Text style={styles.bookButtonText}>Book Appointment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.background,
  },
  errorText: {
    fontSize: 16,
    color: MedicalColors.error,
    marginTop: 12,
  },
  profileHeader: {
    backgroundColor: MedicalColors.surface,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  headerBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: MedicalColors.primary,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    borderColor: MedicalColors.surface,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: MedicalColors.surface,
  },
  avatarText: {
    fontSize: 34,
    fontWeight: 'bold',
    color: MedicalColors.primary,
  },
  nameSection: {
    flex: 1,
    marginLeft: 16,
    paddingBottom: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 22,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  specialization: {
    fontSize: 14,
    color: MedicalColors.primary,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  statLabel: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: MedicalColors.border,
  },
  ratingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: MedicalColors.surface,
    borderRadius: 12,
    padding: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: MedicalColors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 10,
  },
  bioText: {
    fontSize: 14,
    color: MedicalColors.textSecondary,
    lineHeight: 22,
  },
  detailsList: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  detailLabel: {
    fontSize: 14,
    color: MedicalColors.textSecondary,
    marginLeft: 10,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: MedicalColors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  consultTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  consultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: MedicalColors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  consultChipText: {
    fontSize: 14,
    color: MedicalColors.primary,
    fontWeight: '600',
  },
  slotCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  slotBooked: {
    opacity: 0.5,
  },
  slotInfo: {},
  slotDate: {
    fontSize: 15,
    fontWeight: '600',
    color: MedicalColors.text,
    marginBottom: 2,
  },
  slotTime: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
  },
  slotStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
  },
  slotStatusBooked: {
    backgroundColor: '#fee2e2',
  },
  slotStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  slotStatusTextBooked: {
    color: '#dc2626',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: MedicalColors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  reviewCard: {
    backgroundColor: MedicalColors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: MedicalColors.textLight,
  },
  reviewComment: {
    fontSize: 14,
    color: MedicalColors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewAuthor: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    fontWeight: '500',
  },
  bookButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: MedicalColors.surface,
    borderTopWidth: 1,
    borderTopColor: MedicalColors.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
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
});

export default DoctorProfileScreen;
