import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, DeviceEventEmitter,
} from 'react-native';
import { api, storeSession } from '../../services/apiClient';
import {
  getFlow, updateFlow, clearFlow, canCommit, canCommitCouple, toRegisterPayload,
} from '../../services/medpsychFlow';
import { ZC, zcStyles, ZC_SERIF } from '../../constants/zencare';
import { payForBooking } from '../../services/paystack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COUPLE_STORAGE_KEYS } from '../../constants/coupleTherapyConfig';

const SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

function nextDays(n = 7) {
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      ymd: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }),
    });
  }
  return out;
}

/**
 * Book and pay — and, on success, commit the whole cached sign-up.
 *
 * This is the only place in the mobile MedPsych flow that writes anything. Up to
 * the moment payment succeeds the person does not exist server-side; after it,
 * the account, consent records, assignment, session and receipt land together
 * inside one backend transaction.
 */
export default function MedPsychBookingScreen({ navigation }) {
  const days = useMemo(() => nextDays(7), []);
  const [flow, setFlow] = useState(null);
  const [day, setDay] = useState(days[0].ymd);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const f = await getFlow();
      if (!f.details?.email) { navigation.replace('MedPsychSignUp'); return; }
      if (!f.therapist?.id) { navigation.replace('MedPsychPsychiatrists'); return; }
      setFlow(f);
      if (f.booking?.reasonForVisit) setReason(f.booking.reasonForVisit);
    })();
  }, [navigation]);

  // Carried from the selection step, which read it through therapistFee.
  const rate = Number(flow?.therapist?.rate ?? 0);

  const payAndBook = async () => {
    if (!time) { Alert.alert('Pick a time', 'Choose a time for your consultation.'); return; }
    setBusy(true);
    try {
      // ── Couple sign-ups: check the draft BEFORE charging anything ────────
      // The commit refuses unless partner B has accepted and both intakes are
      // in. Finding that out after Paystack has taken the money leaves the
      // client charged with no accounts and no booking, so the check happens
      // first and the payment never starts.
      const preToken = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.inviteToken);
      if (preToken) {
        let draft = null;
        try {
          draft = await api(`/api/v1/couples/drafts?token=${encodeURIComponent(preToken)}`, {
            authenticated: false,
          });
        } catch (_) {
          draft = null; // not a draft token (legacy invite) — nothing to gate on
        }
        if (draft?.draftId && !draft.readyToPay) {
          Alert.alert(
            'Not ready yet',
            draft.partnerBAccepted
              ? 'Your partner still needs to finish their private intake. You have not been charged.'
              : 'Your partner has not accepted the invitation yet. You have not been charged.',
          );
          setBusy(false);
          return;
        }
      }

      // ── Pay, and wait for CONFIRMATION ──────────────────────────────────
      // This screen used to open the checkout and rely on the browser session
      // resolving to know what happened. It does not resolve when the user
      // leaves any way other than tapping Done, which is how a real payment
      // succeeded on Paystack while the app sat waiting and never booked.
      // payForBooking polls the verify endpoint instead — see services/paystack.
      const paid = await payForBooking({
        email: flow.details.email,
        amount: rate,
        purpose: 'medpsych',
        metadata: { therapistId: flow.therapist.id },
      });

      if (!paid.ok) {
        Alert.alert('Payment not completed', paid.reason || 'You have not been charged for an account.');
        setBusy(false);
        return;
      }

      const committed = await updateFlow({
        step: 'payment',
        booking: {
          scheduledAt: `${day}T${time}:00`,
          durationMinutes: 50,
          sessionType: 'video',
          reasonForVisit: reason.trim(),
        },
        payment: { reference: paid.reference, amount: paid.amount, currency: paid.currency },
      });

      // A couple sign-up commits its DRAFT instead: two accounts, one couple,
      // both intakes — created together, only now that payment is confirmed.
      // Everything up to this point existed as a draft that expires on its own.
      const draftToken = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.inviteToken);
      const isCouple = (committed.therapyType || '') === 'couples' && Boolean(draftToken);

      // Couples are checked against a different bar: no password and no
      // acceptedPolicies live in this flow, because both are on the draft.
      if (!(isCouple ? canCommitCouple(committed) : canCommit(committed))) {
        Alert.alert('Incomplete', 'Something is missing from your sign-up. Please start again.');
        setBusy(false);
        return;
      }

      const res = isCouple
        ? await api('/api/v1/couples/drafts/commit', {
            method: 'POST',
            authenticated: false,
            body: {
              token: draftToken,
              paymentReference: paid.reference,
              amountPaid: paid.amount,
              currency: paid.currency,
              therapistId: flow.therapist.id,
              scheduledAt: `${day}T${time}:00`,
              durationMinutes: 50,
              sessionType: 'video',
            },
          })
        : await api('/api/v1/medpsych/register', {
            method: 'POST',
            authenticated: false,
            body: toRegisterPayload(committed),
          });

      await storeSession({
        token: res.token,
        refreshToken: res.refreshToken,
        userId: res.userId,
        role: 'client',
        // Login stores this; this path did not, so nothing downstream had an
        // email — the Settings email field came up blank and any later payment
        // had no address for its receipt.
        email: committed.details.email,
      });

      // Login also writes `userProfile`, and the whole app reads it: the drawer
      // for the name, Settings for the details, the dashboard for the client id.
      // Registering here without it meant a brand-new client saw "Client" as
      // their own name and an empty profile — as if signing up had told the app
      // nothing about them.
      await AsyncStorage.setItem('userProfile', JSON.stringify({
        id: res.userId,
        uid: res.userId,
        email: committed.details.email,
        name: committed.details.fullName,
        fullName: committed.details.fullName,
        phone: committed.details.phone || '',
        role: 'client',
        status: 'active',
        membershipTier: committed.serviceType === 'second_opinion'
          ? 'second_opinion' : 'medpsych',
      }));
      await clearFlow(); // the password must not outlive the flow

      // AppNavigator holds `profile` in state and only re-reads it on this
      // event — LoginScreen emits it for exactly this reason. Without it the
      // dashboard mounts with a null profile straight after a paid sign-up.
      DeviceEventEmitter.emit('refreshProfile');

      // 'Main' is the therapy client dashboard — the same route LoginScreen
      // uses. 'TherapyMain' was never registered on the root stack, so this
      // threw "The action 'RESET' ... was not handled by any navigator" AFTER a
      // successful payment and account creation: the user was charged, the
      // booking existed, and the app simply never moved.
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      Alert.alert('Could not complete', e?.message || 'Please try again.');
      setBusy(false);
    }
  };

  if (!flow) return <View style={zcStyles.screen} />;

  return (
    <ScrollView style={zcStyles.screen} contentContainerStyle={styles.scroll}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
      <View style={zcStyles.badge}>
        <View style={styles.dot} />
        <Text style={zcStyles.badgeText}>Step 3 of 3</Text>
      </View>

      <Text style={[zcStyles.display, styles.title]}>Book your</Text>
      <Text style={[zcStyles.display, styles.titleEm]}>consultation.</Text>

      <View style={[zcStyles.card, styles.card]}>
        <Text style={zcStyles.eyebrow}>Pick a day</Text>
        <View style={styles.slotWrap}>
          {days.map((d) => (
            <TouchableOpacity
              key={d.ymd}
              style={[styles.slot, day === d.ymd && styles.slotOn]}
              onPress={() => setDay(d.ymd)}
            >
              <Text style={[styles.slotText, day === d.ymd && styles.slotTextOn]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[zcStyles.eyebrow, { marginTop: 18 }]}>Pick a time</Text>
        <View style={styles.slotWrap}>
          {SLOTS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.slot, time === t && styles.slotOn]}
              onPress={() => setTime(t)}
            >
              <Text style={[styles.slotText, time === t && styles.slotTextOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={zcStyles.rule} />

        <Text style={zcStyles.label}>What would you like reviewed?</Text>
        <TextInput
          style={[zcStyles.input, styles.textarea]}
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="e.g. I take sertraline 50mg and would like a second view on the dose."
          placeholderTextColor={ZC.faint}
        />
      </View>

      <View style={[zcStyles.card, styles.card]}>
        <Text style={zcStyles.eyebrow}>Summary</Text>
        <Row label="Psychiatrist" value={flow.therapist?.name} />
        <Row label="When" value={`${days.find((d) => d.ymd === day)?.label}${time ? `, ${time}` : ''}`} />
        <Row label="Length" value="50 minutes" />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${rate.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[zcStyles.btnPrimary, { marginTop: 18 }, (busy || !time) && { opacity: 0.5 }]}
          onPress={payAndBook}
          disabled={busy || !time}
        >
          <Text style={zcStyles.btnPrimaryText}>
            {busy ? 'Completing…' : `Pay $${rate.toFixed(0)} and book`}
          </Text>
        </TouchableOpacity>

        <Text style={[zcStyles.meta, styles.note]}>
          Your account is created at this point, once payment succeeds.
        </Text>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ZC.gold },
  title: { marginTop: 18 },
  titleEm: { fontStyle: 'italic', color: ZC.goldBright, marginBottom: 18 },
  card: { marginBottom: 14 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slot: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.14)',
    backgroundColor: '#ffffff',
  },
  slotOn: {
    borderColor: '#5046bd',
    borderWidth: 1.5,
    backgroundColor: 'rgba(80,70,189,0.10)',
  },
  slotText: {
    fontSize: 13.5,
    color: '#101010',
    fontWeight: '600',
  },
  slotTextOn: {
    color: '#3f3796',
    fontWeight: '800',
  },
  textarea: { minHeight: 90, textAlignVertical: 'top',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 },
  rowLabel: { fontSize: 13.5, color: ZC.muted },
  rowValue: { fontSize: 13.5, color: ZC.cream, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: ZC.navyLine,
  },
  totalLabel: { fontFamily: ZC_SERIF, fontSize: 18, color: ZC.cream },
  totalValue: { fontFamily: ZC_SERIF, fontSize: 22, color: ZC.goldBright },
  note: {
    textAlign: 'center', marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: ZC.navyLine,
  },
});
