import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api, getStoredUserId, getStoredEmail } from '../../services/apiClient';
import { payForBooking } from '../../services/paystack';

/**
 * Converting a limited account (Second Opinion or Psychology & Counseling)
 * into full membership.
 *
 * Three decisions, in the order they matter:
 *
 *   1. WHICH SERVICE — psychiatry (a prescriber) or counselling. Different
 *      clinicians doing different work, so it is asked outright rather than
 *      inferred from whoever reviewed the original case.
 *   2. WHO — keep the specialist who handled the consultation, or pick someone
 *      new. Most people want to continue with whoever already knows their case;
 *      assuming either way would be wrong.
 *   3. PAY — the account converts only once payment is confirmed, the same rule
 *      the rest of the platform follows.
 *
 * The membership questionnaire comes AFTER this, since it differs by track.
 */
const TRACKS = [
  {
    key: 'counselling',
    title: 'Psychology & Counseling',
    body: 'Talking therapy with a psychologist or counsellor. No medication.',
  },
  {
    key: 'psychiatry',
    title: 'Psychiatry',
    body: 'Care with a psychiatrist, who can review and prescribe medication.',
  },
];

export default function BecomeMemberScreen({ navigation }) {
  const [track, setTrack] = useState('');
  const [keepTherapist, setKeepTherapist] = useState(true);
  const [currentTherapist, setCurrentTherapist] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const clientId = await getStoredUserId();
      if (!clientId) return;
      const assignments = await api(
        `/api/v1/therapy-management/assignments?clientId=${clientId}`,
      ).catch(() => []);
      const first = Array.isArray(assignments) ? assignments[0] : null;
      if (first) setCurrentTherapist(first);
    })();
  }, []);

  const submit = async () => {
    if (!track) {
      Alert.alert('Choose a service', 'Let us know which kind of care you would like.');
      return;
    }
    setBusy(true);
    try {
      const clientId = await getStoredUserId();
      const email = await getStoredEmail();

      const paid = await payForBooking({
        email,
        amount: 0,          // membership fee; 0 skips the charge
        purpose: 'membership',
        metadata: { clientId, careTrack: track },
      });

      if (!paid.ok) {
        Alert.alert('Payment not completed', paid.reason || 'You have not been charged.');
        setBusy(false);
        return;
      }

      await api(`/api/v1/medpsych/${clientId}/upgrade`, {
        method: 'POST',
        body: {
          paymentReference: paid.reference,
          amountPaid: paid.amount,
          currency: paid.currency,
          careTrack: track,
          // null means "keep whoever handled my case".
          therapistId: keepTherapist ? null : undefined,
        },
      });

      // The questionnaire builds the programme, and differs by track — so it
      // is asked after the choice, not before.
      navigation.navigate('Questionnaire', { therapyType: track });
    } catch (e) {
      Alert.alert('Could not complete', e?.message || 'Please try again.');
      setBusy(false);
    }
  };

  return (
    <ZCGround>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[zcStyles.display, styles.title]}>Continue your care with us</Text>
        <Text style={zcStyles.body}>
          Membership turns a one-off review into ongoing therapy — with a
          programme, session notes and progress you can follow.
        </Text>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>Which kind of care?</Text>
          {TRACKS.map((t) => {
            const on = track === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => setTrack(t.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <View style={styles.optionHead}>
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={on ? ZC.accent : ZC.ink3}
                  />
                  <Text style={[styles.optionTitle, on && styles.optionTitleOn]}>{t.title}</Text>
                </View>
                <Text style={zcStyles.meta}>{t.body}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>Who would you like to see?</Text>
          <TouchableOpacity
            style={[styles.option, keepTherapist && styles.optionOn]}
            onPress={() => setKeepTherapist(true)}
          >
            <View style={styles.optionHead}>
              <Ionicons
                name={keepTherapist ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={keepTherapist ? ZC.accent : ZC.ink3}
              />
              <Text style={[styles.optionTitle, keepTherapist && styles.optionTitleOn]}>
                Stay with {currentTherapist?.therapistName || 'my specialist'}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.option, !keepTherapist && styles.optionOn]}
            onPress={() => setKeepTherapist(false)}
          >
            <View style={styles.optionHead}>
              <Ionicons
                name={!keepTherapist ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={!keepTherapist ? ZC.accent : ZC.ink3}
              />
              <Text style={[styles.optionTitle, !keepTherapist && styles.optionTitleOn]}>
                Choose someone new
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[zcStyles.btnPrimary, busy && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy}
        >
          <Text style={zcStyles.btnPrimaryText}>{busy ? 'Completing…' : 'Continue'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ZCGround>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  title: { marginTop: 8 },
  card: { borderRadius: 20, padding: 18, gap: 10 },
  option: {
    padding: 14, borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.12)', backgroundColor: '#ffffff', gap: 6,
  },
  optionOn: { borderColor: ZC.accent, backgroundColor: ZC.accentWash, borderWidth: 1.5 },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: ZC.ink },
  optionTitleOn: { color: ZC.accentDeep, fontWeight: '800' },
});
