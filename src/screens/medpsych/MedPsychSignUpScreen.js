import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  REQUIRED_POLICIES, allPoliciesAccepted, getFlow, updateFlow,
} from '../../services/medpsychFlow';
import { ZC, zcStyles } from '../../constants/zencare';
import { policyUrlForKey } from '../../constants/nessaHubPolicies';

/**
 * MedPsych sign-up — the policy gate.
 *
 * Nothing here touches the database. Details and consent ticks go into the
 * cached flow; the account is created at the end, once a psychiatrist has been
 * chosen and the consultation paid for.
 *
 * There is deliberately no "accept all" control. Consent given by one tap on a
 * bundle is not consent to four separate documents — and one of these is the
 * acknowledgement that a second opinion does not replace the user's existing
 * care, which is exactly what a bundle would bury.
 */
export default function MedPsychSignUpScreen({ navigation, route }) {
  // Both services share this policy gate: the consents are the same, and so is
  // the rule that nothing is written until payment. Only the label and where
  // "continue" leads differ.
  const service = route?.params?.service === 'second_opinion' ? 'second_opinion' : 'medpsych';
  const isSecondOpinion = service === 'second_opinion';

  // The therapy type chosen in the modal. Carried into the cached flow so the
  // questionnaire, the matching step and the committed account all agree on it
  // — rather than each re-deriving it and drifting apart.
  const therapyType = route?.params?.therapyType || 'individual';
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', confirm: '',
  });
  const [accepted, setAccepted] = useState([]);
  const [error, setError] = useState('');

  // Restore anything cached, so backgrounding the app does not cost the user
  // everything they typed.
  useEffect(() => {
    (async () => {
      const cached = await getFlow();
      if (cached.details) {
        setForm((f) => ({
          ...f,
          fullName: cached.details.fullName || '',
          email: cached.details.email || '',
          phone: cached.details.phone || '',
        }));
      }
      if (cached.acceptedPolicies?.length) setAccepted(cached.acceptedPolicies);
    })();
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const toggle = (key) =>
    setAccepted((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const detailsComplete = form.fullName.trim() && form.email.trim() && form.password;
  const policiesDone = allPoliciesAccepted(accepted);
  const remaining = REQUIRED_POLICIES.filter((p) => !accepted.includes(p.key)).length;

  const submit = async () => {
    if (!detailsComplete) { setError('Please complete your details.'); return; }
    if (form.password.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setError('The two passwords do not match.'); return; }
    if (!policiesDone) { setError('Every policy must be accepted before you can continue.'); return; }

    setError('');
    await updateFlow({
      step: 'therapist',
      details: {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
      },
      acceptedPolicies: accepted,
    });
    // Second Opinion asks a SHORT case intake instead of the full programme
    // questionnaire: this client already has a clinician and wants a view on one
    // decision. The long questionnaire is asked only if they later convert.
    if (isSecondOpinion) {
      await updateFlow({ serviceType: 'second_opinion', step: 'intake' });
      navigation.navigate('SecondOpinionIntake');
      return;
    }
    await updateFlow({ serviceType: 'medpsych', step: 'intake' });
    navigation.navigate('Questionnaire', { flow: 'medpsych' });
  };

  return (
    <KeyboardAvoidingView
      style={zcStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* The mark, bleeding off the right edge. The ground behind it is the
            colour sampled from the artwork, so the seam does not show. */}

        <View style={zcStyles.badge}>
          <View style={styles.badgeDot} />
          <Text style={zcStyles.badgeText}>{isSecondOpinion ? 'Second Opinion' : 'Psychology & Counseling'}</Text>
        </View>

        {/* Two different services share this gate, so the copy has to say which
            one you are signing up for. This page carried the second-opinion
            pitch because that is what the module originally was; Psychology &
            Counseling is ongoing talking therapy and needed its own words. */}
        <Text style={[zcStyles.display, styles.title]}>
          {isSecondOpinion ? 'A second opinion,' : 'Therapy that'}
        </Text>
        <Text style={[zcStyles.display, styles.titleEm]}>
          {isSecondOpinion ? 'on your terms.' : 'fits your life.'}
        </Text>

        <Text style={[zcStyles.body, styles.lead]}>
          {isSecondOpinion
            ? 'Already seeing someone for your mental health? Have your diagnosis, '
              + 'treatment plan or medication reviewed independently. Tell us what you '
              + 'would like looked at, choose a specialist, and book one consultation — '
              + 'no programme to join.'
            : 'Ongoing talking therapy with a psychologist or counsellor. We start with '
              + 'a short questionnaire so we can match you well, then you choose your '
              + 'therapist and book your first session.'}
        </Text>

        <View style={[zcStyles.card, styles.card]}>
          <Text style={zcStyles.eyebrow}>Your details</Text>

          <View style={styles.field}>
            <Text style={zcStyles.label}>Full name</Text>
            <TextInput
              style={zcStyles.input} value={form.fullName} onChangeText={set('fullName')}
              placeholder="Your full name" placeholderTextColor={ZC.faint} autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={zcStyles.label}>Email</Text>
            <TextInput
              style={zcStyles.input} value={form.email} onChangeText={set('email')}
              placeholder="you@example.com" placeholderTextColor={ZC.faint}
              autoCapitalize="none" keyboardType="email-address"
            />
          </View>

          <View style={styles.field}>
            <Text style={zcStyles.label}>Phone (optional)</Text>
            <TextInput
              style={zcStyles.input} value={form.phone} onChangeText={set('phone')}
              placeholder="+233 …" placeholderTextColor={ZC.faint} keyboardType="phone-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={zcStyles.label}>Password</Text>
            <TextInput
              style={zcStyles.input} value={form.password} onChangeText={set('password')}
              placeholder="At least 8 characters" placeholderTextColor={ZC.faint} secureTextEntry
            />
          </View>

          <View style={styles.field}>
            <Text style={zcStyles.label}>Confirm password</Text>
            <TextInput
              style={zcStyles.input} value={form.confirm} onChangeText={set('confirm')}
              placeholder="Repeat your password" placeholderTextColor={ZC.faint} secureTextEntry
            />
          </View>

          <View style={zcStyles.rule} />

          <Text style={zcStyles.eyebrow}>Before you continue</Text>
          <Text style={[zcStyles.meta, styles.policyLead]}>
            Each of these must be accepted individually. Your acceptance is recorded with the
            date and time.
          </Text>

          {REQUIRED_POLICIES.map((p) => {
            const on = accepted.includes(p.key);
            return (
              <TouchableOpacity
                key={p.key}
                style={[zcStyles.check, on && zcStyles.checkOn, styles.checkRow]}
                onPress={() => toggle(p.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={on ? ZC.gold : ZC.faint}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.policyLabel}>{p.label}</Text>
                  <Text style={styles.policySummary}>{p.summary}</Text>
                  <Text
                    style={styles.policyLink}
                    onPress={() => Linking.openURL(policyUrlForKey(p.key))}
                  >
                    Read in full
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              zcStyles.btnPrimary,
              styles.submit,
              (!detailsComplete || !policiesDone) && styles.submitOff,
            ]}
            onPress={submit}
            disabled={!detailsComplete || !policiesDone}
            activeOpacity={0.85}
          >
            <Text style={zcStyles.btnPrimaryText}>Choose a psychiatrist</Text>
          </TouchableOpacity>

          {!policiesDone && (
            <Text style={[zcStyles.meta, styles.gateHint]}>
              {remaining} {remaining === 1 ? 'policy' : 'policies'} still to accept
            </Text>
          )}

          <Text style={[zcStyles.meta, styles.nodbNote]}>
            Nothing is saved to your record until you have booked and paid for a consultation.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ZC.gold },
  title: { marginTop: 20 },
  titleEm: { fontStyle: 'italic', color: ZC.goldBright, marginBottom: 14 },
  lead: { marginBottom: 24 },
  card: { padding: 18 },
  field: { marginBottom: 14,
  },
  policyLead: { marginBottom: 12 },
  checkRow: { marginBottom: 9 },
  policyLabel: { fontSize: 14, fontWeight: '700', color: ZC.cream },
  policySummary: { fontSize: 12.5, lineHeight: 18, color: ZC.muted, marginTop: 3 },
  policyLink: { fontSize: 12.5, color: ZC.gold, textDecorationLine: 'underline', marginTop: 5 },
  error: { marginTop: 14, fontSize: 13, fontWeight: '600', color: ZC.danger },
  submit: { marginTop: 20 },
  submitOff: { opacity: 0.45 },
  gateHint: { textAlign: 'center', marginTop: 10, color: ZC.gold },
  nodbNote: {
    textAlign: 'center', marginTop: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: ZC.navyLine,
  },
});
