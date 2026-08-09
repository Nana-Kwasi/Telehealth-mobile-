import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TherapistColors } from '../../constants/colors';
import {
  NOTE_TEMPLATES,
  FILTER_OPTIONS,
  emptyForm,
  subscribeTherapistNotes,
  groupNotesByAuthor,
  loadTherapistNoteClients,
  createTherapistNote,
  updateTherapistNote,
  deleteTherapistNote,
  noteFormFromRecord,
  matchesNoteSearch,
} from '../../services/therapistNotesService';
import { getNoteTitle, getNoteSections, getNotePreview, NOTE_TYPE_LABELS } from '../../utils/noteDisplayUtils';
import { api } from '../../services/apiClient';

const FIELD_LABELS = {
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  interventions: 'Interventions',
  clientResponse: 'Client response',
  moodRating: 'Mood rating',
  nextSteps: 'Next steps',
  sessionFocus: 'Session focus',
  riskAssessment: 'Risk assessment',
  safetyPlan: 'Safety plan',
  followUp: 'Follow-up',
  treatmentSummary: 'Treatment summary',
  goalsAchieved: 'Goals achieved',
  recommendations: 'Recommendations',
  bookTitle: 'Book title',
  author: 'Author',
  description: 'Description',
  targetAudience: 'Target audience',
  difficultyLevel: 'Difficulty level',
  estimatedReadingTime: 'Estimated reading time',
  tableOfContents: 'Table of contents',
  chapters: 'Chapters',
  keyTopics: 'Key topics',
  exercises: 'Exercises',
  resources: 'Resources',
  bibliography: 'Bibliography',
};

const TARGET_AUDIENCE = [
  { id: 'all', label: 'All clients' },
  { id: 'specific', label: 'Specific clients' },
];

const DIFFICULTY = ['beginner', 'intermediate', 'advanced'];

function fmtDate(ts) {
  if (!ts) return '';
  const dt = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(dt.getTime())) return String(ts);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function noteCardTitle(note) {
  const typeLabel = NOTE_TYPE_LABELS[note.noteType] || 'Note';
  if (note.noteType === 'therapyBook' && note.targetAudience === 'all') {
    return typeLabel;
  }
  const who = note.clientName || note.bookTitle || 'Unknown';
  return `${who} — ${typeLabel}`;
}

export default function TherapistNotesScreen({ profile, route, navigation }) {
  const [notes, setNotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [viewNote, setViewNote] = useState(null);
  const [noteForm, setNoteForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(
    profile?.role === 'admin' || profile?.isAdminTherapist === true
  );

  const [therapistUid, setTherapistUid] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then(uid => setTherapistUid(uid || null));
  }, []);

  useEffect(() => {
    setIsAdmin(profile?.role === 'admin' || profile?.isAdminTherapist === true);
  }, [profile?.role, profile?.isAdminTherapist]);

  useEffect(() => {
    if (!therapistUid) return;
    api(`/api/v1/therapists/${therapistUid}`).then((snap) => {
      if (snap && snap.role === 'admin') setIsAdmin(true);
    }).catch(() => {});
  }, [therapistUid]);

  useEffect(() => {
    if (!therapistUid) return undefined;
    setLoading(true);
    const unsub = subscribeTherapistNotes(
      therapistUid,
      (data) => {
        setNotes(data);
        setLoading(false);
        setRefreshing(false);
      },
      { isAdmin }
    );
    return unsub;
  }, [therapistUid, isAdmin]);

  const loadClients = useCallback(async () => {
    if (!therapistUid) return;
    const list = await loadTherapistNoteClients(therapistUid);
    setClients(list);
  }, [therapistUid]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((note) => {
      const matchesFilter = filterType === 'all' || note.noteType === filterType;
      return matchesFilter && matchesNoteSearch(note, q);
    });
  }, [notes, searchQuery, filterType]);

  const listSections = useMemo(() => {
    if (!filteredNotes.length) return [];
    if (!isAdmin) {
      return [{ key: 'all', title: null, data: filteredNotes }];
    }
    const { byYou, byOthers } = groupNotesByAuthor(filteredNotes, therapistUid);
    return [
      { key: 'yours', title: 'By You', data: byYou },
      { key: 'others', title: 'By Others', data: byOthers },
    ];
  }, [filteredNotes, isAdmin, therapistUid]);

  const canModifyNote = (note) => !isAdmin || note.therapistId === therapistUid;

  const resetForm = () => {
    setNoteForm(emptyForm());
    setEditingNote(null);
  };

  const openCreate = (templateKey = 'soap', preset = null) => {
    resetForm();
    setNoteForm((f) => ({
      ...f,
      noteType: templateKey,
      ...(preset?.clientId ? { clientId: preset.clientId, clientName: preset.clientName || '' } : {}),
    }));
    setShowFormModal(true);
  };

  // "Add Note" on the client detail screen opens this screen instead of a
  // cut-down modal, and arrives with the client already chosen.
  const composeForClientId = route?.params?.composeForClientId;
  const composeForClientName = route?.params?.composeForClientName;
  useEffect(() => {
    if (!composeForClientId) return;
    openCreate('soap', { clientId: composeForClientId, clientName: composeForClientName });
    // Clear the param so going back and returning doesn't reopen the composer.
    navigation?.setParams?.({ composeForClientId: undefined, composeForClientName: undefined });
  }, [composeForClientId]);

  const openEdit = (note) => {
    setEditingNote(note);
    setNoteForm(noteFormFromRecord(note));
    setShowViewModal(false);
    setShowFormModal(true);
  };

  const openView = (note) => {
    setViewNote(note);
    setShowViewModal(true);
  };

  const resolveClientName = (clientId) => {
    const c = clients.find((x) => x.id === clientId);
    return c?.name || c?.displayName || c?.email || 'Client';
  };

  const validateForm = () => {
    if (noteForm.noteType === 'therapyBook') {
      if (!noteForm.bookTitle?.trim()) {
        Alert.alert('Missing info', 'Book title is required.');
        return false;
      }
      return true;
    }
    if (!noteForm.clientId) {
      Alert.alert('Missing info', 'Please select a client.');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const form = { ...noteForm };
      if (form.noteType !== 'therapyBook') {
        form.clientName = resolveClientName(form.clientId);
      }
      if (editingNote) {
        await updateTherapistNote(editingNote, form, profile);
        Alert.alert('Saved', 'Note updated.');
      } else {
        await createTherapistNote(form, profile);
        Alert.alert('Saved', 'Note created.');
      }
      setShowFormModal(false);
      resetForm();
    } catch (e) {
      console.error('Save note error:', e);
      Alert.alert('Error', 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (note) => {
    Alert.alert('Delete note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTherapistNote(note);
            if (viewNote?.id === note.id) setShowViewModal(false);
          } catch (e) {
            Alert.alert('Error', 'Failed to delete note.');
          }
        },
      },
    ]);
  };

  const renderFormFields = () => {
    const template = NOTE_TEMPLATES[noteForm.noteType];
    if (!template) return null;

    if (noteForm.noteType === 'therapyBook') {
      return (
        <>
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Target audience</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {TARGET_AUDIENCE.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.chip, noteForm.targetAudience === opt.id && styles.chipActive]}
                  onPress={() => setNoteForm((p) => ({ ...p, targetAudience: opt.id }))}
                >
                  <Text style={[styles.chipText, noteForm.targetAudience === opt.id && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          {/* "Specific clients" had no way to actually pick anyone — the chip set
              the audience and nothing else appeared, so the book was saved with an
              empty assignment list. */}
          {noteForm.targetAudience === 'specific' ? (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Assign to clients *</Text>
              {clients.length === 0 ? (
                <Text style={styles.formEmptyHint}>
                  No clients available yet — pull down on the notes list to refresh.
                </Text>
              ) : (
                clients.map((c) => {
                  const selected = (noteForm.assignedClientIds || []).includes(c.id);
                  const label = c.name || c.displayName || c.email || 'Client';
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.checkRow}
                      onPress={() =>
                        setNoteForm((p) => {
                          const cur = p.assignedClientIds || [];
                          return {
                            ...p,
                            assignedClientIds: cur.includes(c.id)
                              ? cur.filter((x) => x !== c.id)
                              : [...cur, c.id],
                          };
                        })
                      }
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={selected ? TherapistColors.primary : TherapistColors.textLight}
                      />
                      <Text style={styles.checkLabel}>{label}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : null}

          {/* targetAudience and difficultyLevel already have chip pickers above and
              below; leaving them in the generic text loop rendered a second, plain
              text copy of each ("specific", "beginner") right under the chips. */}
          {template.fields
            .filter((f) => f !== 'targetAudience' && f !== 'difficultyLevel')
            .map((field) => (
            <View key={field} style={styles.formGroup}>
              <Text style={styles.formLabel}>{FIELD_LABELS[field] || field}</Text>
              <TextInput
                style={[styles.formInput, field !== 'bookTitle' && field !== 'author' && styles.formInputTall]}
                multiline={field !== 'bookTitle' && field !== 'author' && field !== 'estimatedReadingTime'}
                value={String(noteForm[field] || '')}
                onChangeText={(v) => setNoteForm((p) => ({ ...p, [field]: v }))}
                placeholder={`Enter ${FIELD_LABELS[field] || field}…`}
                placeholderTextColor={TherapistColors.textLight}
              />
            </View>
          ))}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Difficulty</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {DIFFICULTY.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, noteForm.difficultyLevel === d && styles.chipActive]}
                  onPress={() => setNoteForm((p) => ({ ...p, difficultyLevel: d }))}
                >
                  <Text style={[styles.chipText, noteForm.difficultyLevel === d && styles.chipTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </>
      );
    }

    return (
      <>
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Client *</Text>
          {/* Without this the row just collapsed to nothing when the list was
              empty, so a failed lookup was indistinguishable from a screen that
              had simply not finished loading. */}
          {clients.length === 0 ? (
            <Text style={styles.formEmptyHint}>
              No clients available yet — pull down on the notes list to refresh.
            </Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {clients.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, noteForm.clientId === c.id && styles.chipActive]}
                onPress={() =>
                  setNoteForm((p) => ({
                    ...p,
                    clientId: c.id,
                    clientName: c.name || c.displayName || c.email || 'Client',
                  }))
                }
              >
                <Text style={[styles.chipText, noteForm.clientId === c.id && styles.chipTextActive]}>
                  {c.name || c.displayName || c.email || 'Client'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Session date</Text>
          <TextInput
            style={styles.formInput}
            value={noteForm.sessionDate}
            onChangeText={(v) => setNoteForm((p) => ({ ...p, sessionDate: v }))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={TherapistColors.textLight}
          />
        </View>
        {template.fields.map((field) => (
          <View key={field} style={styles.formGroup}>
            <Text style={styles.formLabel}>{FIELD_LABELS[field] || field}</Text>
            <TextInput
              style={[styles.formInput, styles.formInputTall]}
              multiline
              value={String(noteForm[field] || '')}
              onChangeText={(v) => setNoteForm((p) => ({ ...p, [field]: v }))}
              placeholder={`Enter ${FIELD_LABELS[field] || field}…`}
              placeholderTextColor={TherapistColors.textLight}
            />
          </View>
        ))}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Digital signature</Text>
          <TextInput
            style={styles.formInput}
            value={noteForm.signature}
            onChangeText={(v) => setNoteForm((p) => ({ ...p, signature: v }))}
            placeholder="Your signature"
            placeholderTextColor={TherapistColors.textLight}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.formLabel}>Visible to client</Text>
          <Switch
            value={!!noteForm.visibleToClient}
            onValueChange={(v) => setNoteForm((p) => ({ ...p, visibleToClient: v }))}
            trackColor={{ false: '#e2e8f0', true: TherapistColors.primary }}
          />
        </View>
      </>
    );
  };

  const renderNoteCard = (note, showTherapist = false) => (
    <View style={styles.noteCard}>
      <TouchableOpacity onPress={() => openView(note)} activeOpacity={0.85}>
        <View style={styles.noteCardTop}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{NOTE_TYPE_LABELS[note.noteType] || 'Note'}</Text>
          </View>
          {note.isDraft ? (
            <Text style={styles.draftBadge}>Draft</Text>
          ) : (
            <Text style={styles.doneBadge}>Completed</Text>
          )}
        </View>
        {showTherapist && (note.therapistName || note.therapistId) ? (
          <Text style={styles.therapistMeta} numberOfLines={1}>
            {note.therapistName || 'Therapist'}
          </Text>
        ) : null}
        <Text style={styles.noteTitle} numberOfLines={2}>
          {noteCardTitle(note)}
        </Text>
        <Text style={styles.noteDate}>
          {note.sessionDate ? fmtDate(note.sessionDate) : fmtDate(note.createdAt)}
        </Text>
        <Text style={styles.notePreview} numberOfLines={3}>
          {getNotePreview(note)}
        </Text>
      </TouchableOpacity>
      <View style={styles.noteActions}>
        {canModifyNote(note) ? (
          <>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(note)}>
              <Ionicons name="create-outline" size={20} color={TherapistColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(note)}>
              <Ionicons name="trash-outline" size={20} color={TherapistColors.error} />
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity style={styles.actionBtn} onPress={() => openView(note)}>
          <Ionicons name="eye-outline" size={20} color={TherapistColors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const listHeader = (
    <>
      {isAdmin ? (
        <View style={styles.adminBanner}>
          <Text style={styles.adminBannerText}>Admin view — all clinical notes and therapy books on the platform</Text>
        </View>
      ) : null}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Notes</Text>
          <Text style={styles.pageSubtitle}>
            {isAdmin ? 'Grouped by author' : 'Clinical notes, templates & therapy books'}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowTemplates((v) => !v)}>
          <Ionicons name="library-outline" size={18} color={TherapistColors.primary} />
          <Text style={styles.headerBtnText}>Templates</Text>
        </TouchableOpacity>
      </View>

      {showTemplates && (
        <View style={styles.templatesBox}>
          <Text style={styles.templatesTitle}>Note templates</Text>
          {Object.entries(NOTE_TEMPLATES).map(([key, tpl]) => (
            <TouchableOpacity
              key={key}
              style={styles.templateCard}
              onPress={() => {
                setShowTemplates(false);
                openCreate(key);
              }}
            >
              <Text style={styles.templateName}>{tpl.name}</Text>
              <Text style={styles.templateFields} numberOfLines={1}>
                {tpl.fields.join(', ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={TherapistColors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder={isAdmin ? 'Search client, therapist, or content…' : 'Search by client or content…'}
          placeholderTextColor={TherapistColors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {FILTER_OPTIONS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, filterType === f.id && styles.filterChipActive]}
            onPress={() => setFilterType(f.id)}
          >
            <Text style={[styles.filterChipText, filterType === f.id && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SectionList
        sections={listSections}
        keyExtractor={(item) => `${item.collection || 'clinical'}-${item.id}`}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadClients().finally(() => setRefreshing(false));
            }}
            colors={[TherapistColors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={TherapistColors.textLight} />
            <Text style={styles.emptyTitle}>No notes yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to create a SOAP note, progress note, or therapy book</Text>
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          ) : null
        }
        renderSectionFooter={({ section }) =>
          section.title && section.data.length === 0 ? (
            <Text style={styles.sectionEmpty}>No notes in this section</Text>
          ) : null
        }
        renderItem={({ item: note, section }) =>
          renderNoteCard(note, isAdmin && section.key === 'others')
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => openCreate('soap')} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Create / Edit */}
      <Modal visible={showFormModal} transparent animationType="slide" onRequestClose={() => { setShowFormModal(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingNote ? 'Edit' : 'Create'} {NOTE_TEMPLATES[noteForm.noteType]?.name || 'Note'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowFormModal(false);
                  resetForm();
                }}
              >
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>Note type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipRow, { marginBottom: 12 }]}>
                {Object.entries(NOTE_TEMPLATES).map(([key, tpl]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, noteForm.noteType === key && styles.chipActive]}
                    onPress={() => setNoteForm((p) => ({ ...p, noteType: key }))}
                  >
                    <Text style={[styles.chipText, noteForm.noteType === key && styles.chipTextActive]}>{tpl.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {renderFormFields()}
              <View style={styles.switchRow}>
                <Text style={styles.formLabel}>Save as draft</Text>
                <Switch
                  value={!!noteForm.isDraft}
                  onValueChange={(v) => setNoteForm((p) => ({ ...p, isDraft: v }))}
                  trackColor={{ false: '#e2e8f0', true: TherapistColors.primary }}
                />
              </View>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>{editingNote ? 'Update note' : 'Save note'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* View */}
      <Modal visible={showViewModal} transparent animationType="slide" onRequestClose={() => setShowViewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {viewNote ? getNoteTitle(viewNote) : 'Note'}
              </Text>
              <TouchableOpacity onPress={() => setShowViewModal(false)}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            {viewNote && (
              <ScrollView contentContainerStyle={styles.modalBody}>
                <View style={styles.viewMetaRow}>
                  <Text style={styles.viewMeta}>
                    {viewNote.clientName || viewNote.bookTitle || '—'} ·{' '}
                    {viewNote.sessionDate ? fmtDate(viewNote.sessionDate) : fmtDate(viewNote.createdAt)}
                  </Text>
                  {/* Draft state used to print as a raw "DRAFT / false" row. A badge
                      says it once, and only when it is actually true. */}
                  {viewNote.draft || viewNote.isDraft ? (
                    <View style={styles.viewDraftBadge}>
                      <Text style={styles.viewDraftText}>Draft</Text>
                    </View>
                  ) : null}
                </View>
                {getNoteSections(viewNote).map((s) => (
                  <View key={s.key} style={styles.viewRow}>
                    <Text style={styles.viewLabel}>{s.label}</Text>
                    <Text style={styles.viewValue}>{s.value}</Text>
                  </View>
                ))}
                {viewNote.therapistName && viewNote.therapistId !== therapistUid ? (
                  <Text style={styles.viewTherapist}>By {viewNote.therapistName}</Text>
                ) : null}
                <View style={styles.viewActions}>
                  {canModifyNote(viewNote) ? (
                    <>
                      <TouchableOpacity style={styles.viewActionBtn} onPress={() => openEdit(viewNote)}>
                        <Ionicons name="create-outline" size={18} color={TherapistColors.primary} />
                        <Text style={styles.viewActionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.viewActionBtn, styles.viewActionDanger]} onPress={() => handleDelete(viewNote)}>
                        <Ionicons name="trash-outline" size={18} color={TherapistColors.error} />
                        <Text style={[styles.viewActionText, { color: TherapistColors.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  adminBanner: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  adminBannerText: { fontSize: 13, color: '#4338ca', fontWeight: '600', lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: TherapistColors.primary,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: TherapistColors.text },
  sectionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: TherapistColors.primary,
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  sectionEmpty: { fontSize: 13, color: TherapistColors.textLight, fontStyle: 'italic', marginBottom: 16 },
  therapistMeta: { fontSize: 12, fontWeight: '600', color: TherapistColors.secondary, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: TherapistColors.text },
  pageSubtitle: { fontSize: 13, color: TherapistColors.textLight, marginTop: 4 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    backgroundColor: '#fff',
  },
  headerBtnText: { fontSize: 13, fontWeight: '600', color: TherapistColors.primary },
  templatesBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: TherapistColors.border },
  templatesTitle: { fontSize: 14, fontWeight: '700', color: TherapistColors.text, marginBottom: 8 },
  templateCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  templateName: { fontSize: 14, fontWeight: '600', color: TherapistColors.text },
  templateFields: { fontSize: 12, color: TherapistColors.textLight, marginTop: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: TherapistColors.text },
  filterRow: { marginBottom: 12 },
  filterContent: { gap: 8, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  emptySubtitle: { fontSize: 13, color: TherapistColors.textLight, textAlign: 'center', paddingHorizontal: 24 },
  noteCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: TherapistColors.border,
  },
  noteCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadge: { backgroundColor: '#f0f7ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: TherapistColors.primary },
  draftBadge: { fontSize: 11, fontWeight: '600', color: '#d97706' },
  doneBadge: { fontSize: 11, fontWeight: '600', color: TherapistColors.success },
  noteTitle: { fontSize: 15, fontWeight: '700', color: TherapistColors.text, marginBottom: 4 },
  noteDate: { fontSize: 12, color: TherapistColors.textLight, marginBottom: 6 },
  notePreview: { fontSize: 13, color: TherapistColors.textSecondary, lineHeight: 19 },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  actionBtn: { padding: 8 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: TherapistColors.text, flex: 1, marginRight: 8 },
  modalBody: { padding: 16, paddingBottom: 32 },
  formGroup: { marginBottom: 14 },
  formLabel: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 4 },
  formEmptyHint: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkLabel: { fontSize: 14, color: TherapistColors.text },
  formInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    padding: 12,
    fontSize: 14,
    color: TherapistColors.text,
  },
  formInputTall: { minHeight: 88, textAlignVertical: 'top' },
  chipRow: { marginTop: 4 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    backgroundColor: '#f8fafc',
    marginRight: 8,
    marginBottom: 4,
  },
  chipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  saveBtn: { backgroundColor: TherapistColors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  viewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  viewMeta: { fontSize: 13, color: TherapistColors.textLight, flexShrink: 1 },
  viewDraftBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  viewDraftText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  viewTherapist: { fontSize: 13, fontWeight: '600', color: TherapistColors.secondary, marginBottom: 12 },
  viewRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  viewLabel: { fontSize: 12, fontWeight: '600', color: TherapistColors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  viewValue: { fontSize: 14, color: TherapistColors.text, lineHeight: 21 },
  viewActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  viewActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
  },
  viewActionDanger: { borderColor: '#fecaca' },
  viewActionText: { fontSize: 14, fontWeight: '600', color: TherapistColors.primary },
});
