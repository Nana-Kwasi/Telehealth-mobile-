import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';

const ParentConsentScreen = ({ navigation }) => {
  const [consents, setConsents] = useState({
    treatmentConsent: false,
    privacyConsent: false,
    emergencyConsent: false,
    communicationConsent: false,
    billingConsent: false,
  });

  const [signature, setSignature] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const toggleConsent = (key) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allConsentsAccepted = Object.values(consents).every((value) => value === true);

  const handleSubmit = async () => {
    if (!allConsentsAccepted) {
      Alert.alert('Required', 'Please accept all consents to proceed.');
      return;
    }

    if (!signature.trim()) {
      Alert.alert('Required', 'Please provide your signature.');
      return;
    }

    try {
      // Save consent information
      const consentData = {
        ...consents,
        signature: signature.trim(),
        date: date,
        signedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem('th.parentConsent', JSON.stringify(consentData));

      // Combine all data and proceed to questionnaire
      const parentInfo = await AsyncStorage.getItem('th.parentInfo');
      const childInfo = await AsyncStorage.getItem('th.childInfo');

      // Save combined data for questionnaire
      const combinedData = {
        therapyType: 'teen',
        isParentRegistration: true,
        parentInfo: parentInfo ? JSON.parse(parentInfo) : {},
        childInfo: childInfo ? JSON.parse(childInfo) : {},
        consent: consentData,
        startedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem('th.onboard', JSON.stringify(combinedData));

      // Navigate to questionnaire for the child
      navigation.navigate('Questionnaire', { 
        therapyType: 'teen',
        isChildRegistration: true 
      });
    } catch (error) {
      console.error('Error saving consent:', error);
      Alert.alert('Error', 'Failed to save consent. Please try again.');
    }
  };

  const ConsentItem = ({ title, description, checked, onToggle }) => (
    <TouchableOpacity
      style={styles.consentItem}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.consentCheckbox}>
        {checked && <View style={styles.consentCheckmark} />}
      </View>
      <View style={styles.consentContent}>
        <Text style={styles.consentTitle}>{title}</Text>
        {description && (
          <Text style={styles.consentDescription}>{description}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Parent/Guardian Consent</Text>
          <Text style={styles.subtitle}>
            Please review and accept the following consents to register your child for therapy services.
          </Text>
        </View>

        <View style={styles.consentSection}>
          <ConsentItem
            title="Consent for Treatment"
            description="I consent to my child receiving therapy services from licensed mental health professionals through this platform. I understand that therapy sessions will be conducted online and that I may be involved in the treatment process as appropriate."
            checked={consents.treatmentConsent}
            onToggle={() => toggleConsent('treatmentConsent')}
          />

          <ConsentItem
            title="Privacy and Confidentiality"
            description="I understand that my child's therapy sessions are confidential, except as required by law (e.g., child abuse, harm to self or others). I consent to the collection and use of my child's health information as described in the Privacy Policy."
            checked={consents.privacyConsent}
            onToggle={() => toggleConsent('privacyConsent')}
          />

          <ConsentItem
            title="Emergency Contact Authorization"
            description="I authorize the therapy platform to contact emergency services or the emergency contact I provided if there is a concern about my child's safety or well-being."
            checked={consents.emergencyConsent}
            onToggle={() => toggleConsent('emergencyConsent')}
          />

          <ConsentItem
            title="Communication Consent"
            description="I consent to receiving communications via email, phone, or text message regarding my child's therapy appointments, treatment updates, and important information. I understand I can opt out of non-essential communications at any time."
            checked={consents.communicationConsent}
            onToggle={() => toggleConsent('communicationConsent')}
          />

          <ConsentItem
            title="Billing and Payment Authorization"
            description="I understand that I am responsible for payment of therapy services. I authorize charges to my payment method on file and agree to the billing terms and conditions."
            checked={consents.billingConsent}
            onToggle={() => toggleConsent('billingConsent')}
          />
        </View>

        <View style={styles.signatureSection}>
          <Text style={styles.signatureTitle}>Electronic Signature</Text>
          <Text style={styles.signatureLabel}>
            By typing your full name below, you are providing your electronic signature, which has the same legal effect as a handwritten signature.
          </Text>
          <View style={styles.signatureInputContainer}>
            <Text style={styles.signatureInputLabel}>Full Name (Parent/Guardian) <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={[styles.signatureInput, !signature && styles.signatureInputEmpty]}
              value={signature}
              onChangeText={setSignature}
              placeholder="Type your full name as your electronic signature"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="words"
            />
          </View>
          <Text style={styles.dateLabel}>Date: {date}</Text>
        </View>

        <View style={styles.importantNote}>
          <Text style={styles.importantNoteTitle}>Important Note</Text>
          <Text style={styles.importantNoteText}>
            By proceeding, you acknowledge that you are the legal parent or guardian of the child being registered, and you have the authority to consent to treatment on their behalf. You also agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!allConsentsAccepted || !signature.trim()) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!allConsentsAccepted || !signature.trim()}
        >
          <Text style={styles.submitButtonText}>
            I Agree and Continue to Questionnaire
          </Text>
        </TouchableOpacity>
      </ScrollView>

    </View>
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
  consentSection: {
    marginBottom: 32,
  },
  consentItem: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
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
  signatureSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  signatureTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  signatureLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  signatureInputContainer: {
    marginBottom: 12,
  },
  signatureInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  signatureInput: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    minHeight: 60,
    fontSize: 18,
    color: Colors.text,
    fontWeight: '600',
    backgroundColor: Colors.surface,
  },
  signatureInputEmpty: {
    borderColor: Colors.border,
  },
  required: {
    color: Colors.error,
  },
  dateLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  importantNote: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  importantNoteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 8,
  },
  importantNoteText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.border,
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.surface,
    fontSize: 18,
    fontWeight: '700',
  },
  signaturePrompt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  signaturePromptContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  signaturePromptTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  signaturePromptText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  signaturePromptButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  signaturePromptButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ParentConsentScreen;
