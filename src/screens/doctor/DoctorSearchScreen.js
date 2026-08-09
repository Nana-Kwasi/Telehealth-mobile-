import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDoctors, getSpecializations } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const SORT_OPTIONS = [
  { key: 'rating', label: 'Highest Rated' },
  { key: 'fee_low', label: 'Lowest Fee' },
  { key: 'fee_high', label: 'Highest Fee' },
  { key: 'experience', label: 'Most Experienced' },
  { key: 'name', label: 'Name (A-Z)' },
];

const DoctorSearchScreen = ({ navigation, route }) => {
  // Params passed from MedicalIntakeScreen
  const intakeSpecialty = route?.params?.intakeSpecialty || null;
  const intakeQuery    = route?.params?.intakeQuery    || '';

  const [doctors, setDoctors] = useState([]);
  const [filteredDoctors, setFilteredDoctors] = useState([]);
  const [searchQuery, setSearchQuery] = useState(intakeQuery);
  const [selectedSpecialty, setSelectedSpecialty] = useState(intakeSpecialty);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('rating');
  const [favorites, setFavorites] = useState([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [genderFilter, setGenderFilter] = useState(null);
  const [maxFeeFilter, setMaxFeeFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');

  const specializations = getSpecializations();

  useEffect(() => {
    loadDoctors();
    loadFavorites();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, selectedSpecialty, doctors, sortBy, showFavoritesOnly, favorites, genderFilter, maxFeeFilter, languageFilter]);

  const loadDoctors = async () => {
    setIsLoading(true);
    const result = await fetchDoctors();
    setDoctors(result);
    setIsLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDoctors();
    setRefreshing(false);
  };

  const loadFavorites = async () => {
    try {
      const stored = await AsyncStorage.getItem('doctorFavorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch (e) { /* ignore */ }
  };

  const toggleFavorite = useCallback(async (doctorId) => {
    setFavorites(prev => {
      const updated = prev.includes(doctorId)
        ? prev.filter(id => id !== doctorId)
        : [...prev, doctorId];
      AsyncStorage.setItem('doctorFavorites', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isGeneralDoctor = (d) =>
    ['general practice', 'family medicine', 'internal medicine'].includes(
      (d.specialization || '').toLowerCase()
    );

  const applyFilters = () => {
    let results = [...doctors];

    if (showFavoritesOnly) {
      results = results.filter(d => favorites.includes(d.id));
    }

    if (genderFilter) {
      results = results.filter(d => d.gender === genderFilter);
    }

    if (maxFeeFilter && !isNaN(Number(maxFeeFilter))) {
      results = results.filter(d => (d.consultationFee || 0) <= Number(maxFeeFilter));
    }

    if (languageFilter.trim()) {
      const lang = languageFilter.toLowerCase();
      results = results.filter(d =>
        Array.isArray(d.languages) && d.languages.some(l => l.toLowerCase().includes(lang))
      );
    }

    // Apply specialty + search but always keep General Doctors
    if (searchQuery.trim() || selectedSpecialty) {
      const q = (searchQuery || '').toLowerCase();
      results = results.filter(d => {
        // Always include general doctors
        if (isGeneralDoctor(d)) return true;
        // Specialty match
        if (selectedSpecialty && d.specialization !== selectedSpecialty) return false;
        // Text search
        if (q) {
          return (
            (d.name && d.name.toLowerCase().includes(q)) ||
            (d.specialization && d.specialization.toLowerCase().includes(q)) ||
            (d.location && d.location.toLowerCase().includes(q))
          );
        }
        return true;
      });
    }

    // Sort
    switch (sortBy) {
      case 'rating':
        results.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
        break;
      case 'fee_low':
        results.sort((a, b) => (a.consultationFee || 0) - (b.consultationFee || 0));
        break;
      case 'fee_high':
        results.sort((a, b) => (b.consultationFee || 0) - (a.consultationFee || 0));
        break;
      case 'experience':
        results.sort((a, b) => (b.experience || 0) - (a.experience || 0));
        break;
      case 'name':
        results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
    }

    setFilteredDoctors(results);
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating || 0);
    const hasHalf = (rating || 0) - fullStars >= 0.5;
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Ionicons key={i} name="star" size={14} color={MedicalColors.rating} />);
      } else if (i === fullStars && hasHalf) {
        stars.push(<Ionicons key={i} name="star-half" size={14} color={MedicalColors.rating} />);
      } else {
        stars.push(<Ionicons key={i} name="star-outline" size={14} color={MedicalColors.rating} />);
      }
    }
    return stars;
  };

  const clearAdvancedFilters = () => {
    setGenderFilter(null);
    setMaxFeeFilter('');
    setLanguageFilter('');
    setShowAdvancedFilters(false);
  };

  const activeFilterCount = [genderFilter, maxFeeFilter, languageFilter].filter(Boolean).length;

  const renderDoctorCard = ({ item }) => {
    const isFav = favorites.includes(item.id);
    return (
    <TouchableOpacity
      style={styles.doctorCard}
      onPress={() => navigation.navigate('DoctorProfile', { doctorId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {(item.name || 'D')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.doctorName}>Dr. {item.name || 'Unknown'}</Text>
            {item.verified && (
              <Ionicons name="checkmark-circle" size={18} color={MedicalColors.verified} />
            )}
            <TouchableOpacity
              onPress={() => toggleFavorite(item.id)}
              style={{ marginLeft: 'auto', padding: 4 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? '#ef4444' : MedicalColors.textLight} />
            </TouchableOpacity>
          </View>
          <Text style={styles.specialization}>{item.specialization || 'General Practitioner'}</Text>
          <View style={styles.ratingRow}>
            <View style={styles.stars}>{renderStars(item.averageRating)}</View>
            <Text style={styles.ratingText}>
              {(item.averageRating || 0).toFixed(1)} ({item.totalReviews || 0})
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardDetails}>
        {item.experience ? (
          <View style={styles.detailChip}>
            <Ionicons name="briefcase-outline" size={14} color={MedicalColors.textSecondary} />
            <Text style={styles.detailText}>{item.experience} yrs exp</Text>
          </View>
        ) : null}
        {item.location ? (
          <View style={styles.detailChip}>
            <Ionicons name="location-outline" size={14} color={MedicalColors.textSecondary} />
            <Text style={styles.detailText}>{item.location}</Text>
          </View>
        ) : null}
        {item.consultationFee ? (
          <View style={styles.detailChip}>
            <Ionicons name="cash-outline" size={14} color={MedicalColors.textSecondary} />
            <Text style={styles.detailText}>${item.consultationFee}</Text>
          </View>
        ) : null}
      </View>

      {/* Language tags */}
      {Array.isArray(item.languages) && item.languages.length > 0 && (
        <View style={[styles.cardDetails, { marginBottom: 8 }]}>
          <Ionicons name="language-outline" size={14} color={MedicalColors.textLight} />
          <Text style={{ fontSize: 12, color: MedicalColors.textSecondary }}>{item.languages.join(', ')}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => navigation.navigate('DoctorProfile', { doctorId: item.id })}
      >
        <Text style={styles.bookButtonText}>View Profile & Book</Text>
        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={MedicalColors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search doctors, specialties, locations..."
            placeholderTextColor={MedicalColors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={MedicalColors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, showFilters && styles.filterButtonActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons
            name="options-outline"
            size={22}
            color={showFilters ? '#FFFFFF' : MedicalColors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Specialty Filter Chips */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          <Text style={styles.filterLabel}>Specialty</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
            <TouchableOpacity
              style={[styles.chip, !selectedSpecialty && styles.chipActive]}
              onPress={() => setSelectedSpecialty(null)}
            >
              <Text style={[styles.chipText, !selectedSpecialty && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {specializations.map((spec) => (
              <TouchableOpacity
                key={spec}
                style={[styles.chip, selectedSpecialty === spec && styles.chipActive]}
                onPress={() => setSelectedSpecialty(selectedSpecialty === spec ? null : spec)}
              >
                <Text style={[styles.chipText, selectedSpecialty === spec && styles.chipTextActive]}>
                  {spec}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Sort & Favorites Bar */}
      <View style={styles.sortBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortChip, sortBy === opt.key && styles.sortChipActive]}
              onPress={() => setSortBy(opt.key)}
            >
              <Text style={[styles.sortChipText, sortBy === opt.key && styles.sortChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={[styles.favToggle, showFavoritesOnly && styles.favToggleActive]}
          onPress={() => setShowFavoritesOnly(!showFavoritesOnly)}
        >
          <Ionicons name={showFavoritesOnly ? 'heart' : 'heart-outline'} size={18}
            color={showFavoritesOnly ? '#FFFFFF' : '#ef4444'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.advFilterBtn, activeFilterCount > 0 && styles.advFilterBtnActive]}
          onPress={() => setShowAdvancedFilters(true)}
        >
          <Ionicons name="filter" size={16} color={activeFilterCount > 0 ? '#FFFFFF' : MedicalColors.primary} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Advanced Filters Modal */}
      <Modal visible={showAdvancedFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Advanced Filters</Text>
              <TouchableOpacity onPress={() => setShowAdvancedFilters(false)}>
                <Ionicons name="close" size={24} color={MedicalColors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Gender</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[null, 'male', 'female'].map(g => (
                <TouchableOpacity key={g || 'all'}
                  style={[styles.chip, genderFilter === g && styles.chipActive]}
                  onPress={() => setGenderFilter(g)}>
                  <Text style={[styles.chipText, genderFilter === g && styles.chipTextActive]}>
                    {g ? g.charAt(0).toUpperCase() + g.slice(1) : 'All'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Max Consultation Fee ($)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., 100"
              placeholderTextColor={MedicalColors.textLight}
              keyboardType="numeric"
              value={maxFeeFilter}
              onChangeText={setMaxFeeFilter}
            />

            <Text style={styles.modalLabel}>Language</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Spanish"
              placeholderTextColor={MedicalColors.textLight}
              value={languageFilter}
              onChangeText={setLanguageFilter}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.bookButton, { flex: 1 }]}
                onPress={() => setShowAdvancedFilters(false)}
              >
                <Text style={styles.bookButtonText}>Apply Filters</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookButton, { flex: 1, backgroundColor: MedicalColors.border }]}
                onPress={clearAdvancedFilters}
              >
                <Text style={[styles.bookButtonText, { color: MedicalColors.text }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Results */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={MedicalColors.primary} />
          <Text style={styles.loadingText}>Finding doctors...</Text>
        </View>
      ) : filteredDoctors.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="medical-outline" size={64} color={MedicalColors.textLight} />
          <Text style={styles.emptyTitle}>No doctors found</Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery || selectedSpecialty
              ? 'Try adjusting your filters'
              : 'Doctors will appear here once they are registered'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredDoctors}
          renderItem={renderDoctorCard}
          keyExtractor={(item, index) => String(item.id ?? item.userId ?? index)}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MedicalColors.primary} />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
  },
  searchSection: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: MedicalColors.text,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: MedicalColors.primary,
  },
  filterButtonActive: {
    backgroundColor: MedicalColors.primary,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: MedicalColors.primary,
    borderColor: MedicalColors.primary,
  },
  chipText: {
    fontSize: 13,
    color: MedicalColors.text,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
  },
  doctorCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: MedicalColors.primary,
  },
  cardInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  doctorName: {
    fontSize: 17,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  specialization: {
    fontSize: 13,
    color: MedicalColors.primary,
    fontWeight: '500',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  ratingText: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
  },
  cardDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: MedicalColors.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  detailText: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    fontWeight: '500',
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MedicalColors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: MedicalColors.textSecondary,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: MedicalColors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MedicalColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    marginRight: 6,
  },
  sortChipActive: {
    backgroundColor: MedicalColors.primaryLight,
    borderColor: MedicalColors.primary,
  },
  sortChipText: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    fontWeight: '500',
  },
  sortChipTextActive: {
    color: MedicalColors.primary,
    fontWeight: '600',
  },
  favToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  favToggleActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  advFilterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderWidth: 1,
    borderColor: MedicalColors.primary,
  },
  advFilterBtnActive: {
    backgroundColor: MedicalColors.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: MedicalColors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: MedicalColors.text,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    marginBottom: 16,
  },
});

export default DoctorSearchScreen;
