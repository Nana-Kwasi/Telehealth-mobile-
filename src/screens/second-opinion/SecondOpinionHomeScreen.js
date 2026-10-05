import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api, getStoredUserId } from '../../services/apiClient';
import { describeReviewAreas } from '../../constants/secondOpinionIntake';

/**
 * Second Opinion — the case dashboard.
 *
 * One case, one consultation, one opinion. The whole screen answers "where is
 * my review up to?", which is the only question this client has. No mood
 * tracking, no goals, no homework: those belong to a programme they have not
 * bought, and showing them would misrepresent what they paid for.
 *
 * The membership card sits last and is plainly an offer, not a task.
 */
const STAGES = [
  { key: 'submitted', label: 'Case submitted',      icon: 'document-text-outline' },
  { key: 'assigned',  label: 'Specialist assigned', icon: 'checkmark-circle-outline' },
  { key: 'review',    label: 'Under review',        icon: 'time-outline' },
  { key: 'delivered', label: 'Opinion delivered',   icon: 'checkmark-done-outline' },
];

export default function SecondOpinionHomeScreen({ navigation }) {
  const [intake, setIntake] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const clientId = await getStoredUserId();
    if (!clientId) { setLoading(false); return; }
    const [prof, calls] = await Promise.all([
      api(`/api/v1/clients/${clientId}`).catch(() => null),
      api(`/api/v1/scheduled-calls?clientId=${clientId}`).catch(() => []),
    ]);
    try {
      setIntake(prof?.preferencesJson ? JSON.parse(prof.preferencesJson) : null);
    } catch { setIntake(null); }

    const upcoming = (Array.isArray(calls) ? calls : [])
      .map((c) => ({ ...c, when: new Date(c.scheduledTime || c.scheduledAt || NaN) }))
      .filter((c) => !Number.isNaN(c.when.getTime()) && c.when.getTime() > Date.now() - 3600000)
      .sort((a, b) => a.when - b.when)[0] || null;
    setSession(upcoming);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Derived from what exists rather than stored separately, so it cannot fall
  // out of step with reality.
  const stageIndex = session ? (session.status === 'completed' ? 3 : 2) : 1;

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ZCGround>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={[zcStyles.display, styles.title]}>Your case</Text>
        <Text style={zcStyles.body}>
          An independent review of the care you are already receiving.
        </Text>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>Progress</Text>
          <View style={styles.stages}>
            {STAGES.map((stage, i) => {
              const done = i <= stageIndex;
              return (
                <View key={stage.key} style={[styles.stage, done && styles.stageDone]}>
                  <Ionicons
                    name={stage.icon}
                    size={15}
                    color={done ? ZC.accentDeep : ZC.ink3}
                  />
                  <Text style={[styles.stageText, done && styles.stageTextDone]}>
                    {stage.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>Your consultation</Text>
          {loading ? (
            <Text style={zcStyles.meta}>Loading…</Text>
          ) : session ? (
            <>
              <Text style={zcStyles.body}>
                {session.when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {' at '}
                {session.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <TouchableOpacity
                style={zcStyles.btnPrimary}
                onPress={() => navigation.navigate('Video')}
              >
                <Text style={zcStyles.btnPrimaryText}>Go to consultation</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={zcStyles.meta}>No consultation scheduled yet.</Text>
          )}
        </View>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>What you asked us to review</Text>
          <Text style={zcStyles.body}>{describeReviewAreas(intake?.reviewAreas)}</Text>
          {[
            ['Your reason', intake?.reason],
            ['Current diagnosis', intake?.currentDiagnosis],
            ['Current treatment', intake?.currentTreatment],
          ].filter(([, v]) => v).map(([label, value]) => (
            <View key={label} style={styles.detail}>
              <Text style={zcStyles.label}>{label}</Text>
              <Text style={zcStyles.body}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>Continue your care here</Text>
          <Text style={zcStyles.body}>
            A second opinion is a one-off review. If you would like ongoing
            therapy with us, becoming a member sets up a full programme — with
            goals, session notes and progress you can follow.
          </Text>
          <TouchableOpacity
            style={zcStyles.btnGhost}
            onPress={() => navigation.navigate('BecomeMember')}
          >
            <Text style={zcStyles.btnGhostText}>Become a member</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ZCGround>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  title: { marginTop: 8 },
  card: { borderRadius: 20, padding: 18, gap: 10 },
  stages: { gap: 8, marginTop: 4 },
  stage: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(16,16,16,0.10)',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  stageDone: {
    backgroundColor: ZC.accentWash,
    borderColor: ZC.accent,
  },
  stageText: { fontSize: 13.5, fontWeight: '600', color: ZC.ink3 },
  stageTextDone: { color: ZC.accentDeep, fontWeight: '800' },
  detail: { marginTop: 8 },
});
