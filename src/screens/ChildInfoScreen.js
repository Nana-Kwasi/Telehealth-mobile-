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
import { validateTeenDateOfBirth } from '../constants/therapyAgeValidation';

const ChildInfoScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    age: '',
    gender: '',
    schoolName: '',
    grade: '',
    primaryLanguage: '',
    insuranceProvider: '',
    insuranceMemberId: '',
    medicalConditions: '',
    currentMedications: '',
    allergies: '',
    previousTherapy: '',
    reasonForTherapy: '',
  });

  const [errors, setErrors] = useState({});

  const genders = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
  const grades = [
    'Pre-K',
    'Kindergarten',
    '1st Grade',
    '2nd Grade',
    '3rd Grade',
    '4th Grade',
    '5th Grade',
    '6th Grade',
    '7th Grade',
    '8th Grade',
    '9th Grade',
    '10th Grade',
    '11th Grade',
    '12th Grade',
    'College',
    'Not in school',
  ];
  const previousTherapyOptions = ['Yes', 'No', 'Not sure'];

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const calculateAge = (dob) => {
    if (!dob) return '';
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age.toString();
  };

  const handleDateChange = (value) => {
    updateField('dateOfBirth', value);
    if (value) {
      const age = calculateAge(value);
      updateField('age', age);
      
      const dobErr = validateTeenDateOfBirth(value, calculateAge);
      if (dobErr) {
        setErrors((prev) => ({ ...prev, dateOfBirth: dobErr }));
      } else {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.dateOfBirth;
          return newErrors;
        });
      }
    } else {
      // Clear age and error if date is cleared
      updateField('age', '');
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.dateOfBirth;
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    const dobErr = validateTeenDateOfBirth(formData.dateOfBirth, calculateAge);
    if (dobErr) newErrors.dateOfBirth = dobErr;
    if (!formData.gender) newErrors.gender = 'Gender is required';
    if (!formData.schoolName.trim()) newErrors.schoolName = 'School name is required';
    if (!formData.grade) newErrors.grade = 'Grade is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

    try {
      // Save child information
      await AsyncStorage.setItem('th.childInfo', JSON.stringify(formData));
      
      // Navigate to parent consent screen
      navigation.navigate('ParentConsent');
    } catch (error) {
      console.error('Error saving child info:', error);
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
          <Text style={styles.title}>Child/Teen Information</Text>
          <Text style={styles.subtitle}>
            Please provide information about your child who will be receiving therapy services.
          </Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

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
              Date of Birth <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.dateOfBirth && styles.inputError]}
              value={formData.dateOfBirth}
              onChangeText={handleDateChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textLight}
            />
            <Text style={styles.hint}>
              Format: YYYY-MM-DD (e.g., 2010-05-15). Child must be 13-18 years old.
            </Text>
            {formData.age && (
              <Text style={styles.ageText}>Age: {formData.age} years old</Text>
            )}
            {errors.dateOfBirth && (
              <Text style={styles.errorText}>{errors.dateOfBirth}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Gender <Text style={styles.required}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.optionsContainer}
              contentContainerStyle={styles.optionsContent}
            >
              {genders.map((gender) => (
                <TouchableOpacity
                  key={gender}
                  style={[
                    styles.optionChip,
                    formData.gender === gender && styles.optionChipSelected,
                  ]}
                  onPress={() => updateField('gender', gender)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      formData.gender === gender && styles.optionTextSelected,
                    ]}
                  >
                    {gender}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {errors.gender && (
              <Text style={styles.errorText}>{errors.gender}</Text>
            )}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>School Information</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              School Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.schoolName && styles.inputError]}
              value={formData.schoolName}
              onChangeText={(value) => updateField('schoolName', value)}
              placeholder="Enter school name"
              placeholderTextColor={Colors.textLight}
            />
            {errors.schoolName && (
              <Text style={styles.errorText}>{errors.schoolName}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Grade <Text style={styles.required}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.optionsContainer}
              contentContainerStyle={styles.optionsContent}
            >
              {grades.map((grade) => (
                <TouchableOpacity
                  key={grade}
                  style={[
                    styles.optionChip,
                    formData.grade === grade && styles.optionChipSelected,
                  ]}
                  onPress={() => updateField('grade', grade)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      formData.grade === grade && styles.optionTextSelected,
                    ]}
                  >
                    {grade}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {errors.grade && (
              <Text style={styles.errorText}>{errors.grade}</Text>
            )}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Health Information</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Primary Language</Text>
            <TextInput
              style={styles.input}
              value={formData.primaryLanguage}
              onChangeText={(value) => updateField('primaryLanguage', value)}
              placeholder="e.g., English, Spanish"
              placeholderTextColor={Colors.textLight}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Insurance Provider</Text>
            <TextInput
              style={styles.input}
              value={formData.insuranceProvider}
              onChangeText={(value) => updateField('insuranceProvider', value)}
              placeholder="Enter insurance provider name"
              placeholderTextColor={Colors.textLight}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Insurance Member ID</Text>
            <TextInput
              style={styles.input}
              value={formData.insuranceMemberId}
              onChangeText={(value) => updateField('insuranceMemberId', value)}
              placeholder="Enter member ID"
              placeholderTextColor={Colors.textLight}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Medical Conditions</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.medicalConditions}
              onChangeText={(value) => updateField('medicalConditions', value)}
              placeholder="List any medical conditions (optional)"
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Current Medications</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.currentMedications}
              onChangeText={(value) => updateField('currentMedications', value)}
              placeholder="List current medications (optional)"
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Allergies</Text>
            <TextInput
              style={styles.input}
              value={formData.allergies}
              onChangeText={(value) => updateField('allergies', value)}
              placeholder="List any allergies (optional)"
              placeholderTextColor={Colors.textLight}
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Therapy Information</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Has your child received therapy before?</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.optionsContainer}
              contentContainerStyle={styles.optionsContent}
            >
              {previousTherapyOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionChip,
                    formData.previousTherapy === option && styles.optionChipSelected,
                  ]}
                  onPress={() => updateField('previousTherapy', option)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      formData.previousTherapy === option && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Reason for Seeking Therapy</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.reasonForTherapy}
              onChangeText={(value) => updateField('reasonForTherapy', value)}
              placeholder="Briefly describe why you're seeking therapy for your child (optional)"
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Continue to Consent</Text>
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
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  ageText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
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

export default ChildInfoScreen;
