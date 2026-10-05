import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, StyleSheet,
} from 'react-native';
import { api } from '../../services/apiClient';
import { getFlow, updateFlow } from '../../services/medpsychFlow';
import { ZC, zcStyles, ZC_SERIF } from '../../constants/zencare';
import { therapistFee, formatFee } from '../../utils/therapistFee';
import { resolveFileUrl } from '../../utils/mediaUrl';

/**
 * Choose a psychiatrist for the second-opinion consultation.
 *
 * Reads the same public therapist list the therapy matching flow uses, so a
 * clinician added for one is bookable in the other with no extra admin. The
 * choice goes into the cached flow — the user does not exist server-side yet.
 */
export default function MedPsychPsychiatristsScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  // Both services pick a clinician here, but not the same kind. Second Opinion
  // is reviewed by a specialist; Psychology & Counseling is ongoing therapy
  // with a therapist. "psychiatrist" everywhere was left over from when this
  // module was only the second-opinion product.
  // A photo that fails to load must fall back to the initial rather than
  // leaving a blank circle — which is what a stale host produced.
  const [badPhotos, setBadPhotos] = useState({});
  const [isSecondOpinion, setIsSecondOpinion] = useState(false);
  useEffect(() => {
    (async () => {
      const flow = await getFlow();
      setIsSecondOpinion((flow?.serviceType || 'medpsych') === 'second_opinion');
    })();
  }, []);
  const noun = isSecondOpinion ? 'specialist.' : 'therapist.';
  const nounPlural = isSecondOpinion ? 'specialists' : 'therapists';
  const [chosen, setChosen] = useState(null);

  useEffect(() => {
    (async () => {
      const flow = await getFlow();
      // Reaching here without the consent gate would skip it entirely.
      if (!flow.details?.email) { navigation.replace('MedPsychSignUp'); return; }
      setChosen(flow.therapist?.id || null);
      const data = await api('/api/v1/therapists', { authenticated: false }).catch(() => []);
      setList(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
  }, [navigation]);

  const choose = async (t) => {
    await updateFlow({
      step: 'booking',
      therapist: {
        id: t.id || t.uid,
        name: t.name || t.fullName || 'Psychiatrist',
        specialization: t.specialization || t.specialty || 'Psychiatry',
        photoURL: resolveFileUrl(t.photoURL) || null,
        // No invented default — 80 was a made-up price being charged for real.
        rate: therapistFee(t),
      },
    });
    navigation.navigate('MedPsychBooking');
  };

  return (
    <ScrollView style={zcStyles.screen} contentContainerStyle={styles.scroll}>
      <View style={zcStyles.badge}>
        <View style={styles.dot} />
        <Text style={zcStyles.badgeText}>Step 2 of 3</Text>
      </View>

      <Text style={[zcStyles.display, styles.title]}>Choose your</Text>
      <Text style={[zcStyles.display, styles.titleEm]}>{noun}</Text>
      <Text style={[zcStyles.body, styles.lead]}>
        {isSecondOpinion
          ? 'Each of these clinicians can review the diagnosis, treatment or medication '
            + 'you are already receiving, and give you an independent opinion.'
          : 'Each of these clinicians offers ongoing talking therapy. Pick whoever feels '
            + 'like the right fit — you can change later.'}
      </Text>

      {loading ? (
        <ActivityIndicator color={ZC.gold} style={{ marginTop: 40 }} />
      ) : list.length === 0 ? (
        <View style={zcStyles.card}>
          <Text style={zcStyles.body}>No {nounPlural} are available to book right now.</Text>
          <Text style={[zcStyles.meta, { marginTop: 6 }]}>
            Nothing you have entered has been lost — please try again shortly.
          </Text>
        </View>
      ) : (
        list.map((t) => {
          const id = t.id || t.uid;
          const name = t.name || t.fullName || 'Psychiatrist';
          const on = chosen === id;
          return (
            <TouchableOpacity
              key={id}
              style={[zcStyles.card, styles.doc, on && zcStyles.cardSelected]}
              onPress={() => choose(t)}
              activeOpacity={0.85}
            >
              <View style={styles.docTop}>
                {t.photoURL && !badPhotos[t.id] ? (
                  <Image
                    source={{ uri: resolveFileUrl(t.photoURL) }}
                    style={styles.avatar}
                    onError={() => setBadPhotos((p) => ({ ...p, [t.id]: true }))}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName}>{name}</Text>
                  <Text style={styles.docSpec}>{t.specialization || t.specialty || 'Psychiatry'}</Text>
                </View>
              </View>
              <Text style={styles.docBody} numberOfLines={3}>
                {t.bio || t.about
                  || 'Reviews medication and diagnoses for people already under treatment elsewhere.'}
              </Text>
              <View style={styles.docFoot}>
                <Text style={styles.rate}>{formatFee(t)}</Text>
                <Text style={styles.pick}>{on ? 'Selected' : 'Select'}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ZC.gold },
  title: { marginTop: 18 },
  titleEm: { fontStyle: 'italic', color: ZC.goldBright, marginBottom: 12 },
  lead: { marginBottom: 22 },
  doc: { marginBottom: 12 },
  docTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1, borderColor: ZC.goldDeep, backgroundColor: ZC.navyDeep,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: ZC_SERIF, fontSize: 20, color: ZC.gold },
  docName: { fontFamily: ZC_SERIF, fontSize: 19, color: ZC.cream },
  docSpec: { fontSize: 12, color: ZC.faint, marginTop: 2 },
  docBody: { fontSize: 13.5, lineHeight: 20, color: ZC.muted, marginTop: 12 },
  docFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: ZC.navyLine,
  },
  rate: { fontFamily: ZC_SERIF, fontSize: 18, color: ZC.goldBright },
  pick: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: ZC.gold },
});
