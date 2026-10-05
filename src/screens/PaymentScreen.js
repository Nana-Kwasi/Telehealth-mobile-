import React, { useEffect, useState } from 'react';
import PriceTag from '../components/PriceTag';
import { quotePrice } from '../services/pricing';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredUserId } from '../services/apiClient';
import { Colors } from '../constants/colors';
import { COUPLE_STORAGE_KEYS } from '../constants/coupleTherapyConfig';
import {
  loadCouple,
  isPaymentAllowed,
  markCouplePaymentComplete,
} from '../services/coupleTherapyService';

const PaymentScreen = ({ navigation, route }) => {
  const coupleIdParam = route.params?.coupleId;
  const isCouple = route.params?.therapyType === 'couples';
  // Individual therapy picks a therapist before paying, so the amount due is that
  // therapist's own session rate rather than a fixed subscription tier.
  const selectedTherapist = route.params?.therapist || null;
  const therapistFee = Number(selectedTherapist?.sessionRate) || null;
  const [plan, setPlan] = useState('standard');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [checking, setChecking] = useState(isCouple);
  const [blocked, setBlocked] = useState(false);

  // The server's answer to "what does this cost this person right now". Null
  // until it lands; the card shows the full fee meanwhile, which is the safe
  // direction — nobody is charged more than they were shown.
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    if (!therapistFee) { setQuote(null); return undefined; }
    let live = true;
    quotePrice({
      serviceType: 'therapy',
      baseAmount: therapistFee,
      providerId: selectedTherapist?.id || null,
    }).then((q) => { if (live) setQuote(q); });
    return () => { live = false; };
  }, [therapistFee, selectedTherapist]);

  // What is actually charged. Reads the SERVER's final amount, never a number
  // this screen worked out.
  const amountDue = quote?.discounted ? Number(quote.finalAmount) : therapistFee;

  const prices = { basic: 70, standard: 85, premium: 100 };

  useEffect(() => {
    if (!isCouple) return;
    (async () => {
      const id = coupleIdParam || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
      if (!id) {
        setChecking(false);
        return;
      }
      const couple = await loadCouple(id);
      if (!isPaymentAllowed(couple)) {
        setBlocked(true);
        Alert.alert(
          'Not ready yet',
          'Both partners must complete intake and consent before couple payment.',
          [{ text: 'OK', onPress: () => navigation.replace('CoupleDashboard', { coupleId: id }) }],
        );
      }
      if (couple?.paymentComplete) {
        navigation.replace('MatchTherapist', { coupleId: id, therapyType: 'couples' });
      }
      setChecking(false);
    })();
  }, [isCouple, coupleIdParam, navigation]);

  const handleSubmit = async () => {
    if (!cardNumber || !expiry || !cvc) {
      Alert.alert('Error', 'Please fill in all payment details');
      return;
    }

    await AsyncStorage.setItem(
      'th.subscription',
      JSON.stringify({
        plan: selectedTherapist ? 'per-session' : plan,
        price: amountDue ?? prices[plan],
        // Kept so a refund can find which offer applied.
        promotionId: quote?.discounted ? quote.promotionId : null,
        listPrice: therapistFee ?? prices[plan],
        therapistId: selectedTherapist?.id || null,
        therapistName: selectedTherapist?.name || null,
        activatedAt: new Date().toISOString(),
      }),
    );

    if (isCouple) {
      const coupleId = coupleIdParam || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
      try {
        await markCouplePaymentComplete(coupleId, plan);
        navigation.replace('MatchTherapist', { coupleId, therapyType: 'couples' });
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not record payment.');
      }
      return;
    }

    // Therapist already chosen → record the assignment now that payment is done,
    // then go to the dashboard. (Previously this bounced back to MatchTherapist,
    // which is now the screen that sent us here.)
    //
    // Endpoint is /client-select-therapist, NOT /assignments: the latter is
    // @PreAuthorize THERAPIST/ADMIN *and* guards requireSelfOrAdmin(therapistId),
    // so a client calling it always got 403 Forbidden. The self-select endpoint is
    // the client-side counterpart — CLIENT role, guarded on clientId instead.
    //
    // clientId must be the authenticated user's id for that guard to pass.
    // `th.clientId` is a therapy-clients row id from a different namespace, so
    // sending it 403s just the same even on the right endpoint.
    if (selectedTherapist?.id) {
      try {
        const clientId = (await getStoredUserId()) || route.params?.clientId;
        if (clientId) {
          await api('/api/v1/therapy-management/client-select-therapist', {
            method: 'POST',
            body: {
              clientId,
              therapistId: selectedTherapist.id,
            },
          });
        }
        navigation.replace('Main');
      } catch (e) {
        Alert.alert('Almost there', e.message || 'Payment recorded, but we could not assign your therapist.');
      }
      return;
    }

    navigation.navigate('MatchTherapist');
  };

  const plans = [
    { key: 'basic', title: 'Basic', price: prices.basic, features: ['Messaging', 'Monthly live session'] },
    { key: 'standard', title: 'Standard', price: prices.standard, features: ['Messaging', 'Bi-weekly live sessions'] },
    { key: 'premium', title: 'Premium', price: prices.premium, features: ['Messaging', 'Weekly live sessions'] },
  ];

  if (checking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (blocked) return null;

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>
        {selectedTherapist ? 'Confirm and pay' : isCouple ? 'Couple plan' : 'Choose your plan'}
      </Text>
      <Text style={styles.subtitle}>
        {selectedTherapist
          ? `You are booking ${selectedTherapist.name}. This is their session rate.`
          : isCouple
            ? 'One subscription covers both partners. Billed monthly — cancel anytime.'
            : 'Weekly subscription billed monthly. Cancel anytime.'}
      </Text>

      {/* Therapist-first flow: charge the therapist's own published rate. Showing
          the generic $70/$85/$100 tiers here billed an amount unrelated to the
          therapist the client just picked. */}
      {selectedTherapist ? (
        <View style={[styles.planCard, styles.planCardSelected, styles.therapistCard]}>
          <Text style={styles.planTitle}>{selectedTherapist.name}</Text>
          {selectedTherapist.specialization ? (
            <Text style={styles.feature}>{selectedTherapist.specialization}</Text>
          ) : null}
          <View style={styles.planPriceRow}>
            <PriceTag quote={quote} baseAmount={therapistFee} size="lg" />
          </View>
          {quote?.discounted ? (
            <Text style={styles.savings}>
              {quote.promotionName} — you save GHS {Number(quote.discountAmount).toFixed(2)}
            </Text>
          ) : null}
          <Text style={styles.planPeriod}>
            {therapistFee != null
              ? 'per session'
              : 'This therapist has not published a rate yet.'}
          </Text>
        </View>
      ) : (
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
      )}

      <View style={styles.paymentForm}>
        <Text style={styles.formTitle}>Payment Details</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Card Number</Text>
          <TextInput style={styles.input} placeholder="4242 4242 4242 4242" value={cardNumber} onChangeText={setCardNumber} keyboardType="numeric" />
        </View>
        <View style={styles.row}>
          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.label}>Expiry</Text>
            <TextInput style={styles.input} placeholder="MM/YY" value={expiry} onChangeText={setExpiry} maxLength={5} />
          </View>
          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.label}>CVC</Text>
            <TextInput style={styles.input} placeholder="123" value={cvc} onChangeText={setCvc} keyboardType="numeric" maxLength={3} />
          </View>
        </View>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>
            {selectedTherapist
              ? amountDue != null
                ? `Pay GHS ${amountDue.toFixed(2)}`
                : 'Confirm therapist'
              : isCouple
                ? 'Activate couple subscription'
                : 'Activate Subscription'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  contentContainer: { padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, marginBottom: 24 },
  plansContainer: { gap: 16, marginBottom: 32 },
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  planCardSelected: { borderColor: Colors.primary, backgroundColor: '#f0f9f4' },
  therapistCard: { marginBottom: 32 },
  planTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.text, marginBottom: 8 },
  planPrice: { fontSize: 32, fontWeight: 'bold', color: Colors.primary },
  planPriceRow: { marginVertical: 4 },
  savings: { fontSize: 12.5, fontWeight: '700', color: '#166534', marginTop: 2 },
  planPeriod: { fontSize: 14, color: Colors.textSecondary, marginBottom: 16 },
  featuresContainer: { gap: 8 },
  feature: { fontSize: 14, color: Colors.text },
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
  formTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.text, marginBottom: 20 },
  inputContainer: { marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12 },
  halfWidth: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  submitButton: { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: Colors.surface, fontSize: 16, fontWeight: '600' },
});

export default PaymentScreen;
