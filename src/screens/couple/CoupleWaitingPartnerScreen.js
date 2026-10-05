import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import { COUPLE_STATUSES } from '../../constants/coupleTherapyConfig';
import {
  fetchCoupleDashboard,
  sendPartnerBInvitation,
  navigateAfterCoupleIntake,
  ensureCouplePartnerLinked,
  buildLocalWaitingFallback,
  isCoupleIntakeDoneLocally,
} from '../../services/coupleTherapyService';
import { useCoupleSignOutHeader } from '../../hooks/useCoupleSignOutHeader';
import { api } from '../../services/apiClient';
import { updateFlow } from '../../services/medpsychFlow';
import { COUPLE_STORAGE_KEYS } from '../../constants/coupleTherapyConfig';

export default function CoupleWaitingPartnerScreen({ navigation, route }) {
  useCoupleSignOutHeader(navigation);
  const coupleId = route.params?.coupleId;
  // DRAFT MODE: the sign-up has not been paid for, so there is no couple record
  // to poll — only the draft, keyed by the invite token.
  const [draftToken, setDraftToken] = useState(route.params?.draftToken || null);
  const [draft, setDraft] = useState(null);
  const isDraft = Boolean(draftToken) && !coupleId;
  const [couple, setCouple] = useState(null);
  const [otherPartnerName, setOtherPartnerName] = useState('');
  const [inviteUrl, setInviteUrl] = useState(route.params?.inviteUrl || '');
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [syncWarning, setSyncWarning] = useState('');

  const refresh = useCallback(async () => {
    if (isDraft) {
      setLoading(true);
      setSyncWarning('');
      try {
        const d = await api(
          `/api/v1/couples/drafts?token=${encodeURIComponent(draftToken)}`,
          { authenticated: false },
        );
        setDraft(d);
        if (d?.partnerBName) setOtherPartnerName(d.partnerBName);
      } catch (e) {
        setSyncWarning(e.message || 'Could not check your partner\'s progress.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!coupleId) return;
    setLoading(true);
    setSyncWarning('');
    try {
      const link = await ensureCouplePartnerLinked(coupleId, 'partnerA');
      if (link && !link.ok) {
        const fallback = await buildLocalWaitingFallback(coupleId);
        if (fallback) {
          setCouple(fallback.couple);
          if (fallback.otherPartnerName) setOtherPartnerName(fallback.otherPartnerName);
          setSyncWarning(
            link.message || 'Showing saved progress while we finish linking your account.',
          );
        }
        return;
      }

      const dash = await fetchCoupleDashboard(coupleId);
      setCouple(dash?.couple || null);
      if (dash?.inviteUrl) setInviteUrl(dash.inviteUrl);

      if (dash?.otherPartnerName || dash?.couple?.partnerB?.name) {
        setOtherPartnerName(dash.otherPartnerName || dash.couple.partnerB.name);
      }

      if (dash?._localFallback || dash?._sessionFallback) {
        setSyncWarning('Showing saved progress — live sync will resume once your account is linked.');
      }

      if (!dash?.waitingForPartner && dash?.couple?.partnerA?.intakeComplete && dash?.couple?.partnerB?.intakeComplete && !dash?._localFallback) {
        await navigateAfterCoupleIntake(navigation, coupleId, 'partnerA');
      }
    } catch (e) {
      const fallback = await buildLocalWaitingFallback(coupleId);
      if (fallback) {
        setCouple(fallback.couple);
        if (fallback.otherPartnerName) setOtherPartnerName(fallback.otherPartnerName);
        setSyncWarning(
          (await isCoupleIntakeDoneLocally())
            ? 'Live sync pending. Your intake is complete — use Retry or share the invite below.'
            : e.message || 'Could not sync with the server.',
        );
      } else {
        setSyncWarning(e.message || 'Could not load couple status.');
      }
    } finally {
      setLoading(false);
    }
  }, [coupleId, navigation, isDraft, draftToken]);

  // Cold start (app reopened mid sign-up): the token is the only thing that
  // identifies this couple, and it lives in storage.
  React.useEffect(() => {
    if (draftToken || coupleId) return;
    (async () => {
      const t = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.inviteToken);
      if (t) setDraftToken(t);
    })();
  }, [draftToken, coupleId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const interval = setInterval(refresh, 15000);
      return () => clearInterval(interval);
    }, [refresh]),
  );

  const onResend = async () => {
    setResending(true);
    try {
      const res = await sendPartnerBInvitation(coupleId);
      if (res?.inviteUrl) setInviteUrl(res.inviteUrl);
      Alert.alert('Invitation sent', 'Your partner has been emailed again.');
    } catch (e) {
      Alert.alert('Could not send email', 'Share the link below with your partner.');
    } finally {
      setResending(false);
    }
  };

  const onShare = async () => {
    if (!inviteUrl) return;
    await Share.share({ message: `Join me for couple therapy on NessaHub: ${inviteUrl}` });
  };

  if (loading && !couple && !draft) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const bDone = isDraft ? Boolean(draft?.partnerBIntakeComplete) : couple?.partnerB?.intakeComplete;
  const partnerBName =
    otherPartnerName || (isDraft ? draft?.partnerBName : couple?.partnerB?.name) || 'your partner';
  const bAccepted = isDraft ? Boolean(draft?.partnerBAccepted) : true;
  const readyToPay = isDraft ? Boolean(draft?.readyToPay) : false;

  return (
    <View style={styles.container}>
      {syncWarning ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnText}>{syncWarning}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryBtnText}>Retry sync</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Waiting for {partnerBName}</Text>
        <Text style={styles.bannerText}>
          Your intake is complete. {bDone ? `${partnerBName} has finished too.` : `${partnerBName} still needs to create their account and complete their private intake.`}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.statusRow}>You: ✓ Intake complete</Text>
        {isDraft ? (
          <Text style={styles.statusRow}>
            {partnerBName}: {bAccepted ? (bDone ? '✓ Complete' : '⏳ Intake in progress') : '⏳ Has not accepted yet'}
          </Text>
        ) : (
          <Text style={styles.statusRow}>{partnerBName}: {bDone ? '✓ Complete' : '⏳ Pending'}</Text>
        )}
        <Text style={styles.hint}>
          {isDraft
            ? 'No accounts are created until you book and pay for your first session.'
            : `Couple status: ${couple?.status || COUPLE_STATUSES.AWAITING_PARTNER_B}`}
        </Text>
      </View>

      {inviteUrl ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Partner invitation</Text>
          <Text style={styles.link} selectable>{inviteUrl}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onShare}>
              <Text style={styles.secondaryBtnText}>Share link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onResend} disabled={resending}>
              <Text style={styles.secondaryBtnText}>{resending ? 'Sending…' : 'Resend email'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {isDraft ? (
        // Choosing a therapist leads straight to checkout, and the commit is
        // refused unless BOTH partners are done — so the button stays shut
        // until the server says it will go through. Otherwise the card gets
        // charged for a booking that cannot be created.
        <TouchableOpacity
          style={[styles.primaryBtn, !readyToPay && { opacity: 0.5 }]}
          disabled={!readyToPay}
          onPress={async () => {
            // Same handoff as the end of the intake: the booking funnel reads
            // the medpsych flow, and the password stays on the draft.
            await updateFlow({
              serviceType: 'medpsych',
              therapyType: 'couples',
              step: 'therapist',
              details: {
                fullName: (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myPartnerName)) || '',
                email: (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myRegistrationEmail)) || '',
              },
            });
            navigation.replace('MedPsychPsychiatrists', { draftToken });
          }}
        >
          <Text style={styles.primaryBtnText}>
            {readyToPay ? 'Choose your therapist' : `Waiting for ${partnerBName}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.replace('CoupleDashboard', { coupleId })}
        >
          <Text style={styles.primaryBtnText}>Open couple dashboard</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  warnBanner: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  warnText: { color: '#92400e', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d97706',
  },
  retryBtnText: { color: '#b45309', fontWeight: '600' },
  banner: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#065f46', marginBottom: 8 },
  bannerText: { color: '#047857', lineHeight: 22 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  statusRow: { fontSize: 15, marginBottom: 6, color: Colors.text },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
  link: { fontSize: 12, color: Colors.primary, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  secondaryBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  primaryBtn: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: Colors.surface, fontWeight: '700' },
});
