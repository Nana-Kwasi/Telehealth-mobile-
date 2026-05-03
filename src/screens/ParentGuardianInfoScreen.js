import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import useAddressAutofillMobile from '../hooks/useAddressAutofillMobile';

const ParentGuardianInfoScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    relationship: '',
    address: '',
    country: '',
    city: '',
    area: '',
    region: '',
    street: '',
    ghanaDigitalAddress: '',
    state: '',
    zipCode: '',
    latitude: null,
    longitude: null,
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
  });

  const [errors, setErrors] = useState({});
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofillMobile();

  const relationships = [
    'Parent',
    'Legal Guardian',
    'Foster Parent',
    'Grandparent',
    'Other',
  ];

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[\d\s\-\(\)]+$/.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    if (!formData.relationship) newErrors.relationship = 'Relationship is required';
    if (!formData.address.trim()) newErrors.address = 'Address is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.state.trim()) newErrors.state = 'State is required';
    if (!formData.zipCode.trim()) newErrors.zipCode = 'Zip code is required';
    if (!formData.emergencyContactName.trim()) {
      newErrors.emergencyContactName = 'Emergency contact name is required';
    }
    if (!formData.emergencyContactPhone.trim()) {
      newErrors.emergencyContactPhone = 'Emergency contact phone is required';
    }
    if (!formData.emergencyContactRelationship) {
      newErrors.emergencyContactRelationship = 'Emergency contact relationship is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

    try {
      // Save parent/guardian information
      await AsyncStorage.setItem('th.parentInfo', JSON.stringify(formData));
      
      // Navigate to child information screen
      navigation.navigate('ChildInfo');
    } catch (error) {
      console.error('Error saving parent info:', error);
      Alert.alert('Error', 'Failed to save information. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Parent/Guardian Information</Text>
          <Text style={styles.subtitle}>
            We need some information about you to register your child for therapy services.
          </Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>
                First Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, errors.firstName && styles.inputError]}
                value={formData.firstName}
                onChangeText={(value) => updateField('firstName', value)}
                placeholder="Enter first name"
                placeholderTextColor={Colors.textLight}
              />
              {errors.firstName && (
                <Text style={styles.errorText}>{errors.firstName}</Text>
              )}
            </View>

            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>
                Last Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, errors.lastName && styles.inputError]}
                value={formData.lastName}
                onChangeText={(value) => updateField('lastName', value)}
                placeholder="Enter last name"
                placeholderTextColor={Colors.textLight}
              />
              {errors.lastName && (
                <Text style={styles.errorText}>{errors.lastName}</Text>
              )}
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Email <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              value={formData.email}
              onChangeText={(value) => updateField('email', value)}
              placeholder="Enter email address"
              placeholderTextColor={Colors.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Phone Number <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.phone && styles.inputError]}
              value={formData.phone}
              onChangeText={(value) => updateField('phone', value)}
              placeholder="(555) 123-4567"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
            />
            {errors.phone && (
              <Text style={styles.errorText}>{errors.phone}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Relationship to Child <Text style={styles.required}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.optionsContainer}
              contentContainerStyle={styles.optionsContent}
            >
              {relationships.map((rel) => (
                <TouchableOpacity
                  key={rel}
                  style={[
                    styles.optionChip,
                    formData.relationship === rel && styles.optionChipSelected,
                  ]}
                  onPress={() => updateField('relationship', rel)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      formData.relationship === rel && styles.optionTextSelected,
                    ]}
                  >
                    {rel}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {errors.relationship && (
              <Text style={styles.errorText}>{errors.relationship}</Text>
            )}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Address</Text>
          <TouchableOpacity style={styles.locBtn} onPress={() => detectAddress((loc) => {
            setFormData(prev => ({
              ...prev,
              address: prev.address || loc.street || loc.address || '',
              country: prev.country || loc.countryCode || '',
              city: prev.city || loc.city || '',
              area: prev.area || loc.area || '',
              region: prev.region || loc.region || '',
              street: prev.street || loc.street || '',
              state: prev.state || loc.region || '',
              zipCode: prev.zipCode || '',
              ghanaDigitalAddress: prev.ghanaDigitalAddress || '',
              latitude: loc.latitude ?? prev.latitude ?? null,
              longitude: loc.longitude ?? prev.longitude ?? null,
            }));
          })} disabled={locating}>
            <Text style={styles.locBtnText}>{locating ? 'Detecting location…' : 'Use current location'}</Text>
          </TouchableOpacity>
          {!!locationMsg && <Text style={styles.locationMsg}>{locationMsg}</Text>}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Street Address <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.address && styles.inputError]}
              value={formData.address}
              onChangeText={(value) => updateField('address', value)}
              placeholder="Enter street address"
              placeholderTextColor={Colors.textLight}
            />
            {errors.address && (
              <Text style={styles.errorText}>{errors.address}</Text>
            )}
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>Country</Text>
              <TextInput
                style={styles.input}
                value={formData.country}
                onChangeText={(value) => updateField('country', value)}
                placeholder="e.g. GH"
                placeholderTextColor={Colors.textLight}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>Area / Locality</Text>
              <TextInput
                style={styles.input}
                value={formData.area}
                onChangeText={(value) => updateField('area', value)}
                placeholder="Enter area"
                placeholderTextColor={Colors.textLight}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>Region / State</Text>
              <TextInput
                style={styles.input}
                value={formData.region}
                onChangeText={(value) => updateField('region', value)}
                placeholder="Enter region"
                placeholderTextColor={Colors.textLight}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>Street</Text>
              <TextInput
                style={styles.input}
                value={formData.street}
                onChangeText={(value) => updateField('street', value)}
                placeholder="Enter street"
                placeholderTextColor={Colors.textLight}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Ghana Digital Address (optional)</Text>
            <TextInput
              style={styles.input}
              value={formData.ghanaDigitalAddress}
              onChangeText={(value) => updateField('ghanaDigitalAddress', value)}
              placeholder="e.g. GA-123-4567"
              placeholderTextColor={Colors.textLight}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>
                City <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, errors.city && styles.inputError]}
                value={formData.city}
                onChangeText={(value) => updateField('city', value)}
                placeholder="Enter city"
                placeholderTextColor={Colors.textLight}
              />
              {errors.city && (
                <Text style={styles.errorText}>{errors.city}</Text>
              )}
            </View>

            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.label}>
                State <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, errors.state && styles.inputError]}
                value={formData.state}
                onChangeText={(value) => updateField('state', value)}
                placeholder="Enter state"
                placeholderTextColor={Colors.textLight}
              />
              {errors.state && (
                <Text style={styles.errorText}>{errors.state}</Text>
              )}
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Zip Code <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.zipCode && styles.inputError]}
              value={formData.zipCode}
              onChangeText={(value) => updateField('zipCode', value)}
              placeholder="12345"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
              maxLength={5}
            />
            {errors.zipCode && (
              <Text style={styles.errorText}>{errors.zipCode}</Text>
            )}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Emergency Contact</Text>
          <Text style={styles.sectionDescription}>
            Please provide an emergency contact (other than yourself)
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Emergency Contact Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.emergencyContactName && styles.inputError]}
              value={formData.emergencyContactName}
              onChangeText={(value) => updateField('emergencyContactName', value)}
              placeholder="Enter full name"
              placeholderTextColor={Colors.textLight}
            />
            {errors.emergencyContactName && (
              <Text style={styles.errorText}>{errors.emergencyContactName}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Emergency Contact Phone <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.emergencyContactPhone && styles.inputError]}
              value={formData.emergencyContactPhone}
              onChangeText={(value) => updateField('emergencyContactPhone', value)}
              placeholder="(555) 123-4567"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
            />
            {errors.emergencyContactPhone && (
              <Text style={styles.errorText}>{errors.emergencyContactPhone}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Relationship <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.emergencyContactRelationship && styles.inputError]}
              value={formData.emergencyContactRelationship}
              onChangeText={(value) => updateField('emergencyContactRelationship', value)}
              placeholder="e.g., Spouse, Sibling, Friend"
              placeholderTextColor={Colors.textLight}
            />
            {errors.emergencyContactRelationship && (
              <Text style={styles.errorText}>{errors.emergencyContactRelationship}</Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Continue to Child Information</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  formSection: {
    marginBottom: 32,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputContainer: {
    marginBottom: 20,
  },
  halfWidth: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  required: {
    color: Colors.error,
  },
  input: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },
  optionsContainer: {
    marginTop: 8,
  },
  optionsContent: {
    paddingRight: 20,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 8,
  },
  optionChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: Colors.surface,
    fontWeight: '600',
  },
  locBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary + '40',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  locBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  locationMsg: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 10,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  nextButtonText: {
    color: Colors.surface,
    fontSize: 18,
    fontWeight: '700',
  },
});

export default ParentGuardianInfoScreen;
