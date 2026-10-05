import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import { steps, phq9Questions } from '../constants/questionnaireSteps';
import {
  buildIndividualConsentRecord,
  INDIVIDUAL_CONSENT_STEP,
  needsIndividualQuestionnaireConsent,
} from '../constants/individualTherapyConfig';
import { nessaHubPolicyUrl, NESSA_HUB_POLICY_LINKS } from '../constants/nessaHubPolicies';
import {
  getQuestionnaireAgeOptions,
  validateQuestionnaireAge,
} from '../constants/therapyAgeValidation';
import { updateFlow as updateMedPsychFlow } from '../services/medpsychFlow';

const STORAGE_KEY = 'th.onboard';

const QuestionnaireScreen = ({ route, navigation }) => {
  const { therapyType, flow: entryFlow } = route.params || {};
  // Psychology & Counseling reuses this questionnaire. In that mode nothing is
  // written: the answers are cached with the rest of the flow and committed
  // only after payment, so an abandoned sign-up leaves nothing behind. Sharing
  // the screen keeps the two intakes from drifting apart.
  const medpsychMode = entryFlow === 'medpsych';

  // The type was chosen before sign-up. Seeding it here stops the questionnaire
  // asking a second time, and stops a different answer overwriting the choice
  // the rest of the flow has already acted on.
  const presetTherapyType = route?.params?.therapyType || null;
  const [data, setData] = useState({ therapyType });

  // Applied once, after the initial state, so a preset choice wins over any
  // stale value restored from a previous attempt.
  useEffect(() => {
    if (presetTherapyType) setData((d) => ({ ...d, therapyType: presetTherapyType }));
  }, [presetTherapyType]);
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

  const activeSteps = useMemo(() => {
    // Psychology & Counseling already took consent at its policy gate — one
    // tick per document, timestamped, written to policy_acceptances_v2. Asking
    // again here reads as though the first set did not register, which is worse
    // than redundant on a consent screen. The standard sign-up has no earlier
    // gate, so it keeps this step.
    if (medpsychMode) return steps;

    if (needsIndividualQuestionnaireConsent(data.therapyType)) {
      return [...steps, INDIVIDUAL_CONSENT_STEP];
    }
    return steps;
  }, [data.therapyType, medpsychMode]);

  const isTeen = data.therapyType === 'teen';
  const currentStep = activeSteps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / activeSteps.length) * 100;

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
    } else if (field.type === 'consent_check') {
      return data[field.name] === true;
    } else if (field.type === 'signature') {
      return String(data[field.name] || '').trim() !== '';
    } else if (field.type === 'consent_footer') {
      return true;
    } else if (field.name === 'age') {
      if (!data.age) return false;
      return !validateQuestionnaireAge(data.therapyType, data.age);
    } else {
      return data[field.name] && data[field.name] !== '';
    }
  };

  const isCurrentStepComplete = () => {
    return currentStep.fields.every(isFieldComplete);
  };

  const handleNext = () => {
    if (!isCurrentStepComplete()) {
      const ageErr = data.age ? validateQuestionnaireAge(data.therapyType, data.age) : null;
      if (ageErr) {
        Alert.alert('Invalid age', ageErr);
        return;
      }
      Alert.alert('Incomplete', 'Please answer all questions before continuing');
      return;
    }

    if (currentStepIndex < activeSteps.length - 1) {
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

      // The questionnaire never collects firstName/lastName, so `a + ' ' + b` used to
      // build the literal string "undefined undefined" — truthy, so the 'Client'
      // fallback never fired and SignUp pre-filled the name field with it. The only
      // name the visitor actually types is the consent step's electronic signature
      // (full legal name), so use that; otherwise leave it blank for them to fill in.
      const signedName = String(data.consentSignature || '').trim();
      const resolvedName =
        data.name || [data.firstName, data.lastName].filter(Boolean).join(' ') || signedName || '';

      const clientData = {
        ...data,
        phq9: phq9Data,
        completedAt: new Date().toISOString(),
        status: 'pending',
        displayName: resolvedName,
        clientName: resolvedName,
      };

      if (needsIndividualQuestionnaireConsent(data.therapyType)) {
        clientData.individualConsent = buildIndividualConsentRecord(data);
        clientData.consentComplete = true;
      }

      // Pre-signup questionnaire: the visitor has no account/token yet, so there is
      // nothing to persist server-side here (POST /api/v1/clients requires auth and
      // a real clientId). Mirror the web flow — carry the answers forward to SignUp,
      // which creates the auth account and the patient/client profile after login.
      // Clear any stale clientId so SignUp writes under the freshly-created user id.
      await AsyncStorage.removeItem('th.clientId');

      if (medpsychMode) {
        const phq9 = {};
        for (let i = 1; i <= 9; i += 1) {
          if (data[`phq9_${i}`] !== undefined) phq9[`phq9_${i}`] = data[`phq9_${i}`];
        }
        // The teen path carries parent/guardian and consent details gathered
        // before this point. They travel with the intake so the committed
        // account has the consent on file — an under-18 account must never
        // exist without it.
        await updateMedPsychFlow({
          intake: { ...data, phq9 },
          therapyType: data.therapyType || presetTherapyType || 'individual',
          step: 'therapist',
        });
        navigation.navigate('MedPsychPsychiatrists');
        return;
      }

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
      const isAgeField = field.name === 'age';
      const selectOptions = isAgeField
        ? getQuestionnaireAgeOptions(data.therapyType)
        : field.options;
      const ageError =
        isAgeField && data.age ? validateQuestionnaireAge(data.therapyType, data.age) : null;
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {isFieldComplete(field) && <Text style={styles.checkmark}> ✓</Text>}
          </Text>
          <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.optionsContainer}
            contentContainerStyle={styles.optionsContent}
          >
            {selectOptions.map((option) => (
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
          {ageError ? <Text style={styles.fieldError}>{ageError}</Text> : null}
          {isAgeField && !ageError ? (
            <Text style={styles.hint}>
              {data.therapyType === 'teen'
                ? 'Teen therapy is for ages 13–17.'
                : 'You must be 18 or older for this program.'}
            </Text>
          ) : null}
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

    if (field.type === 'consent_check') {
      const checked = !!data[field.name];
      return (
        <View key={field.name} style={styles.consentItem}>
          <TouchableOpacity
            style={styles.consentMain}
            onPress={() => saveData({ [field.name]: !checked })}
            activeOpacity={0.7}
          >
            <View style={styles.consentCheckbox}>
              {checked ? <View style={styles.consentCheckmark} /> : null}
            </View>
            <View style={styles.consentContent}>
              <Text style={styles.consentTitle}>{field.label}</Text>
              {field.description ? (
                <Text style={styles.consentDescription}>{field.description}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
          {field.policySlug ? (
            <TouchableOpacity
              style={styles.consentLinkBtn}
              onPress={() => Linking.openURL(nessaHubPolicyUrl(field.policySlug))}
              accessibilityLabel={`Read full ${field.label} policy`}
            >
              <Ionicons name="open-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (field.type === 'signature') {
      const date = new Date().toISOString().split('T')[0];
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {isFieldComplete(field) ? <Text style={styles.checkmark}> ✓</Text> : null}
          </Text>
          <TextInput
            style={styles.input}
            value={data[field.name] || ''}
            onChangeText={(text) => saveData({ [field.name]: text })}
            placeholder="Type your full legal name"
            autoCapitalize="words"
          />
          <Text style={styles.hint}>Date: {date}</Text>
        </View>
      );
    }

    if (field.type === 'consent_footer') {
      return (
        <View key="consent_footer" style={styles.consentNote}>
          <Text style={styles.consentNoteTitle}>Important</Text>
          <Text style={styles.consentNoteText}>
            By proceeding, you agree to our{' '}
            <Text style={styles.consentNoteLink} onPress={() => Linking.openURL(NESSA_HUB_POLICY_LINKS.terms)}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={styles.consentNoteLink} onPress={() => Linking.openURL(NESSA_HUB_POLICY_LINKS.privacy)}>
              Privacy Policy
            </Text>
            .
          </Text>
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
          <Text style={styles.progressTitle}>
            {isTeen ? 'Getting to know your teen' : 'Getting to know you'}
          </Text>
          <Text style={styles.progressText}>
            {currentStepIndex + 1} of {activeSteps.length}
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
          {isTeen
            ? "Help us match your child to the right therapist.\nThese questions help us find a licensed therapist suited to your teen's needs."
            : currentStep.key === 'consent'
              ? 'Please review and accept the following before we create your account.\nTap the icon on each row to read the full policy.'
              : "Help us match you to the right therapist\nIt's important to have a therapist who you can establish a personal connection with. The following questions are designed to match you to a licensed therapist based on your therapy needs and personal preferences."}
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
              {currentStepIndex === activeSteps.length - 1 ? 'Done' : 'Next'}
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
  fieldError: {
    fontSize: 14,
    color: Colors.error,
    marginTop: 8,
    fontWeight: '500',
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
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  consentMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  consentLinkBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  consentCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  consentCheckmark: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  consentContent: {
    flex: 1,
  },
  consentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  consentDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  consentNote: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  consentNoteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  consentNoteText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  consentNoteLink: {
    color: Colors.primary,
    fontWeight: '600',
  },
});

export default QuestionnaireScreen;
