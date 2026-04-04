import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../services/firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';
import { Colors } from '../constants/colors';
import { steps, phq9Questions } from '../constants/questionnaireSteps';

const STORAGE_KEY = 'th.onboard';

const QuestionnaireScreen = ({ route, navigation }) => {
  const { therapyType } = route.params || {};
  const [data, setData] = useState({ therapyType });
  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    // If therapy type picked on welcome, start at step 1 (skip country if therapyType exists)
    return therapyType ? 1 : 0;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSavedData();
    autoDetectCountry();
  }, []);

  const loadSavedData = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData(parsed);
        // If we have therapyType but no country, start at step 1
        if (parsed.therapyType && !parsed.country) {
          setCurrentStepIndex(1);
        }
      }
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  };

  const saveData = async (partial) => {
    const updated = { ...data, ...partial };
    setData(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const autoDetectCountry = async () => {
    if (data.country) return;
    try {
      const resp = await fetch('https://ipapi.co/json/');
      const json = await resp.json();
      if (json && json.country_name) {
        await saveData({ country: json.country_name });
      }
    } catch (error) {
      console.log('Could not auto-detect country:', error);
    }
  };

  const currentStep = steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const isFieldComplete = (field) => {
    if (field.showIf) {
      const { field: conditionField, value: conditionValue } = field.showIf;
      if (data[conditionField] !== conditionValue) {
        return true;
      }
    }

    if (field.type === 'multiselect') {
      const value = data[field.name] || [];
      return value.length > 0;
    } else if (field.type === 'phq9_single') {
      return data[field.name] !== undefined && data[field.name] !== '';
    } else {
      return data[field.name] && data[field.name] !== '';
    }
  };

  const isCurrentStepComplete = () => {
    return currentStep.fields.every(isFieldComplete);
  };

  const handleNext = () => {
    if (!isCurrentStepComplete()) {
      Alert.alert('Incomplete', 'Please answer all questions before continuing');
      return;
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Note: navigator.onLine is not available in React Native, but Firebase will handle offline errors

      const phq9Data = {};
      for (let i = 1; i <= 9; i++) {
        const fieldName = `phq9_${i}`;
        if (data[fieldName] !== undefined) {
          const questionIndex = i - 1;
          phq9Data[phq9Questions[questionIndex]] = data[fieldName];
        }
      }

      const clientData = {
        ...data,
        phq9: phq9Data,
        completedAt: new Date().toISOString(),
        status: 'active',
        displayName: data.name || data.firstName + ' ' + data.lastName || 'Client',
        clientName: data.name || data.firstName + ' ' + data.lastName || 'Client'
      };

      const docRef = await addDoc(collection(db, 'clients'), clientData);
      await AsyncStorage.setItem('th.clientId', docRef.id);

      navigation.navigate('SignUp', { clientData });
    } catch (error) {
      console.error('Error submitting questionnaire:', error);
      Alert.alert('Error', 'Failed to submit questionnaire. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field) => {
    if (field.showIf) {
      const { field: conditionField, value: conditionValue } = field.showIf;
      if (data[conditionField] !== conditionValue) {
        return null;
      }
    }

    if (field.type === 'text' || field.type === 'email' || field.type === 'number') {
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {isFieldComplete(field) && <Text style={styles.checkmark}> ✓</Text>}
          </Text>
          <TextInput
            style={styles.input}
            value={data[field.name] || ''}
            onChangeText={(text) => saveData({ [field.name]: field.type === 'number' ? Number(text) : text })}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            keyboardType={field.type === 'number' ? 'numeric' : field.type === 'email' ? 'email-address' : 'default'}
            autoCapitalize={field.type === 'email' ? 'none' : 'words'}
          />
        </View>
      );
    }

    if (field.type === 'select') {
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {isFieldComplete(field) && <Text style={styles.checkmark}> ✓</Text>}
          </Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.optionsContainer}
            contentContainerStyle={styles.optionsContent}
          >
            {field.options.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionChip,
                  data[field.name] === option && styles.optionChipSelected,
                ]}
                onPress={() => saveData({ [field.name]: option })}
              >
                <Text
                  style={[
                    styles.optionText,
                    data[field.name] === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }

    if (field.type === 'multiselect') {
      const selectedValues = data[field.name] || [];
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {isFieldComplete(field) && <Text style={styles.checkmark}> ✓</Text>}
          </Text>
          <View style={styles.multiselectContainer}>
            {field.options.map((option) => {
              const isSelected = selectedValues.includes(option);
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionChip,
                    isSelected && styles.optionChipSelected,
                  ]}
                  onPress={() => {
                    const newValues = isSelected
                      ? selectedValues.filter((v) => v !== option)
                      : [...selectedValues, option];
                    saveData({ [field.name]: newValues });
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    if (field.type === 'country') {
      const countries = [
        'United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France',
        'South Africa', 'Nigeria', 'Ghana', 'Kenya', 'India', 'China', 'Japan',
        'Brazil', 'Mexico', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela',
        'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Guyana', 'Suriname',
        'French Guiana', 'Falkland Islands', 'South Georgia', 'Other'
      ];
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {isFieldComplete(field) && <Text style={styles.checkmark}> ✓</Text>}
          </Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.optionsContainer}
            contentContainerStyle={styles.optionsContent}
          >
            {countries.map((country) => (
              <TouchableOpacity
                key={country}
                style={[
                  styles.optionChip,
                  data.country === country && styles.optionChipSelected,
                ]}
                onPress={() => saveData({ country })}
              >
                <Text
                  style={[
                    styles.optionText,
                    data.country === country && styles.optionTextSelected,
                  ]}
                >
                  {country}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.hint}>Auto-detected from your network. You can change if incorrect.</Text>
        </View>
      );
    }

    if (field.type === 'phq9_single') {
      const phq9Options = [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' }
      ];
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.question}
            {isFieldComplete(field) && <Text style={styles.checkmark}> ✓</Text>}
          </Text>
          <Text style={styles.hint}>Over the last 2 weeks, how often have you been bothered by this problem?</Text>
          <View style={styles.phq9Container}>
            {phq9Options.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.phq9Option,
                  data[field.name] === option.value && styles.phq9OptionSelected,
                ]}
                onPress={() => saveData({ [field.name]: option.value })}
              >
                <Text
                  style={[
                    styles.phq9OptionText,
                    data[field.name] === option.value && styles.phq9OptionTextSelected,
                  ]}
                >
                  {option.value} - {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Getting to know you</Text>
          <Text style={styles.progressText}>
            {currentStepIndex + 1} of {steps.length}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.title}>{currentStep.title}</Text>
        <Text style={styles.subtitle}>
          Help us match you to the right therapist{'\n'}
          It's important to have a therapist who you can establish a personal connection with. The following questions are designed to match you to a licensed therapist based on your therapy needs and personal preferences.
        </Text>

        {currentStep.fields.map((field) => renderField(field))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.backButton, currentStepIndex === 0 && styles.buttonDisabled]}
          onPress={handleBack}
          disabled={currentStepIndex === 0}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.nextButton,
            (!isCurrentStepComplete() || loading) && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={!isCurrentStepComplete() || loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <Text style={styles.nextButtonText}>
              {currentStepIndex === steps.length - 1 ? 'Done' : 'Next'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  progressContainer: {
    padding: 20,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  progressText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 32,
    lineHeight: 24,
  },
  fieldContainer: {
    marginBottom: 32,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  checkmark: {
    color: Colors.primary,
    fontSize: 18,
  },
  hint: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 12,
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
  optionsContainer: {
    marginTop: 8,
  },
  optionsContent: {
    paddingRight: 20,
  },
  multiselectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 8,
    marginBottom: 8,
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
  phq9Container: {
    marginTop: 12,
    gap: 12,
  },
  phq9Option: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  phq9OptionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  phq9OptionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  phq9OptionTextSelected: {
    color: Colors.surface,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  backButton: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  backButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: Colors.primary,
  },
  nextButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default QuestionnaireScreen;
