import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import { MedicalColors } from '../../constants/colors';
import { api } from '../../services/apiClient';

/**
 * Wellness content this person has RECEIVED.
 *
 * The counterpart to ProviderWellnessScreen. Wellness campaigns existed only
 * as outbound email, so anyone with wellness email switched off — or who
 * simply wanted to re-read last week's note — had no way back to any of it.
 * There was no such screen on either platform.
 *
 * Pull, not push: nothing here notifies, which is why a message skipped by an
 * email opt-out is still listed. Opening this screen is a deliberate act.
 */
export default function MyWellnessScreen({ peopleNoun = 'therapist' }) {
  const [items, setItems]         = useState([]);
  const [openId, setOpenId]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const list = await api('/api/v1/campaigns/mine');
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Could not load your wellness messages.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <ZCGround>
        <View style={styles.centered}><ActivityIndicator color={MedicalColors.primary} size="large" /></View>
      </ZCGround>
    );
  }

  return (
    <ZCGround>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={MedicalColors.primary}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopLine}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Wellness</Text>
            </View>
            <View style={styles.smallBadge}>
              <Ionicons name="shield-checkmark" size={12} color={MedicalColors.primary} />
              <Text style={styles.smallBadgeText}>Care notes</Text>
            </View>
          </View>

          <View style={styles.heroBody}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>From your {peopleNoun}</Text>
              <Text style={styles.heroSubtitle}>
                Encouragement and wellness guidance sent to you, all in one place.
              </Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Ionicons name="leaf" size={28} color={MedicalColors.primary} />
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color={MedicalColors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {items.length === 0 && !error ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="leaf-outline" size={28} color={MedicalColors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No wellness messages yet</Text>
            <Text style={styles.emptyText}>
              When your {peopleNoun} shares a note, it will appear here so you can read it anytime.
            </Text>
          </View>
        ) : null}

        {!error && items.length > 0 ? (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{items.length}</Text>
              <Text style={styles.summaryLabel}>Saved updates</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{items.filter(item => item.delivery_status === 'skipped').length}</Text>
              <Text style={styles.summaryLabel}>Skipped</Text>
            </View>
          </View>
        ) : null}

        {items.map((m) => {
          const open = openId === m.id;
          const body = toPlainText(m.body_html);
          return (
            <View key={m.id} style={styles.messageCard}>
              <TouchableOpacity
                style={styles.itemTop}
                onPress={() => setOpenId(open ? null : m.id)}
                activeOpacity={0.8}
              >
                <View style={styles.itemIcon}>
                  <Ionicons
                    name={open ? 'mail-open-outline' : 'mail-outline'}
                    size={17}
                    color={MedicalColors.primary}
                  />
                </View>

                <View style={styles.itemText}>
                  <Text style={styles.itemSubject} numberOfLines={open ? undefined : 2}>
                    {m.subject || m.title || 'Wellness note'}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {m.author_name || 'Your care team'}
                    {m.received_at ? ` • ${fmtDate(m.received_at)}` : ''}
                  </Text>
                </View>

                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={MedicalColors.textSecondary}
                />
              </TouchableOpacity>

              {open ? (
                <View style={styles.itemBody}>
                  {body
                    ? body.split(/\n{2,}/).map((para, i) => (
                        <Text key={i} style={styles.para}>{para}</Text>
                      ))
                    : <Text style={styles.para}>This message has no content.</Text>}

                  {m.delivery_status === 'skipped' ? (
                    <Text style={styles.skipNote}>
                      This was not emailed because wellness email is currently turned off in your notification settings.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </ZCGround>
  );
}

/**
 * Providers type into a plain multiline field, so the stored "html" is almost
 * always plain text — but it is free text written by another account. Render
 * the words only.
 */
function toPlainText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 18, paddingBottom: 40, gap: 14 },

  heroCard: {
    backgroundColor: MedicalColors.primary,
    borderRadius: 22,
    padding: 18,
    shadowColor: MedicalColors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  heroTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  smallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eaf5ff',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  smallBadgeText: {
    color: MedicalColors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTextWrap: { flex: 1, minWidth: 0 },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 30,
  },
  heroSubtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 20,
  },
  heroIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: MedicalColors.primary,
    lineHeight: 28,
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: MedicalColors.textSecondary,
    fontWeight: '600',
  },

  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: MedicalColors.text,
  },
  emptyText: {
    textAlign: 'center',
    color: MedicalColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13.5,
    color: '#991b1b',
    lineHeight: 20,
  },

  messageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MedicalColors.primaryLight,
  },
  itemText: { flex: 1, minWidth: 0, gap: 3 },
  itemSubject: { fontSize: 15, fontWeight: '700', color: MedicalColors.text, lineHeight: 21 },
  itemMeta: { fontSize: 12, color: MedicalColors.textSecondary },

  itemBody: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: MedicalColors.border,
    backgroundColor: '#fbfdff',
  },
  para: { fontSize: 14, lineHeight: 22, color: MedicalColors.text, marginTop: 12 },
  skipNote: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    fontSize: 12.5,
    lineHeight: 19,
    color: '#9a5b11',
  },
});
