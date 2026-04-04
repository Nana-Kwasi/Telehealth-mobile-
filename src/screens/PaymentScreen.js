import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';

const PaymentScreen = ({ navigation }) => {
  const [plan, setPlan] = useState('standard');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  const prices = {
    basic: 70,
    standard: 85,
    premium: 100,
  };

  const handleSubmit = async () => {
    if (!cardNumber || !expiry || !cvc) {
      Alert.alert('Error', 'Please fill in all payment details');
      return;
    }

    // Mock activation - in real app, this would process payment (matching web version)
    await AsyncStorage.setItem(
      'th.subscription',
      JSON.stringify({
        plan,
        price: prices[plan],
        activatedAt: new Date().toISOString(),
      })
    );

    // Navigate to MatchTherapist after payment (matching web version)
    navigation.navigate('MatchTherapist');
  };

  const plans = [
    {
      key: 'basic',
      title: 'Basic',
      price: prices.basic,
      features: ['Messaging', 'Monthly live session'],
    },
    {
      key: 'standard',
      title: 'Standard',
      price: prices.standard,
      features: ['Messaging', 'Bi-weekly live sessions'],
    },
    {
      key: 'premium',
      title: 'Premium',
      price: prices.premium,
      features: ['Messaging', 'Weekly live sessions'],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Choose your plan</Text>
      <Text style={styles.subtitle}>Weekly subscription billed monthly. Cancel anytime.</Text>

      <View style={styles.plansContainer}>
        {plans.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.planCard, plan === p.key && styles.planCardSelected]}
            onPress={() => setPlan(p.key)}
          >
            <Text style={styles.planTitle}>{p.title}</Text>
            <Text style={styles.planPrice}>${p.price}</Text>
            <Text style={styles.planPeriod}>/week</Text>
            <View style={styles.featuresContainer}>
              {p.features.map((feature, index) => (
                <Text key={index} style={styles.feature}>
                  • {feature}
                </Text>
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.paymentForm}>
        <Text style={styles.formTitle}>Payment Details</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Card Number</Text>
          <TextInput
            style={styles.input}
            placeholder="4242 4242 4242 4242"
            value={cardNumber}
            onChangeText={setCardNumber}
            keyboardType="numeric"
            maxLength={19}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.label}>Expiry</Text>
            <TextInput
              style={styles.input}
              placeholder="MM/YY"
              value={expiry}
              onChangeText={setExpiry}
              maxLength={5}
            />
          </View>

          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.label}>CVC</Text>
            <TextInput
              style={styles.input}
              placeholder="123"
              value={cvc}
              onChangeText={setCvc}
              keyboardType="numeric"
              maxLength={3}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Activate Subscription</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
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
    marginBottom: 24,
  },
  plansContainer: {
    gap: 16,
    marginBottom: 32,
  },
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  planCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#f0f9f4',
  },
  planTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  planPeriod: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  featuresContainer: {
    gap: 8,
  },
  feature: {
    fontSize: 14,
    color: Colors.text,
  },
  paymentForm: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
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
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PaymentScreen;
