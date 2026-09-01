import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Switch,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TherapistColors } from '../../constants/colors';
import ResourceMedia from '../../components/common/ResourceMedia';
import {
  pickResourceImage,
  pickResourceVideo,
  pickResourceFile,
  MAX_AUDIO_BYTES,
  RESOURCE_CATEGORIES,
  RESOURCE_TYPES,
  DIFFICULTY_LEVELS,
  TARGET_AUDIENCES,
  WORKSHEET_CATEGORIES,
  WORKSHEET_FIELD_TYPES,
  getWorksheetFieldTypeLabel,
  worksheetFieldTypeNeedsOptions,
  normalizeWorksheetFieldType,
  minWorksheetOptions,
  DEFAULT_RATING_MAX,
  RATING_MAX_CHOICES,
  emptyResourceForm,
  emptyWorksheetForm,
  subscribeTherapistResources,
  subscribeWorksheets,
  groupByAuthor,
  loadResourceClients,
  fetchTherapistNames,
  createTherapistResource,
  updateTherapistResource,
  deleteTherapistResource,
  resourceFormFromRecord,
  createWorksheet,
  updateWorksheet,
  deleteWorksheet,
  worksheetFormFromRecord,
  matchesResourceSearch,
  matchesWorksheetSearch,
  getCategoryLabel,
  getCategoryIcon,
  getResourceDetailFields,
  countWorksheetResponses,
  worksheetAnswerFor,
} from '../../services/therapistResourcesService';
import { api } from '../../services/apiClient';

function fmtDate(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FIELD_LABEL = (key) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export default function TherapistResourcesScreen({ profile }) {
  const [activeTab, setActiveTab] = useState('resources');
  const [resources, setResources] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [clients, setClients] = useState([]);
  const [therapistNames, setTherapistNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isAdmin, setIsAdmin] = useState(
    profile?.role === 'admin' || profile?.isAdminTherapist === true
  );

  const [showResourceForm, setShowResourceForm] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [viewResource, setViewResource] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [resourceForm, setResourceForm] = useState(emptyResourceForm());
  const [savingResource, setSavingResource] = useState(false);

  const [showWorksheetForm, setShowWorksheetForm] = useState(false);
  const [editingWorksheet, setEditingWorksheet] = useState(null);
  const [viewWorksheet, setViewWorksheet] = useState(null);
  const [worksheetForm, setWorksheetForm] = useState(emptyWorksheetForm());
  const [savingWorksheet, setSavingWorksheet] = useState(false);
  const [fieldTypePickerIndex, setFieldTypePickerIndex] = useState(null);

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
      if (snap && (snap.role === 'admin' || snap.isAdmin === true)) setIsAdmin(true);
    }).catch(() => {});
  }, [therapistUid]);

  useEffect(() => {
    if (!therapistUid) return undefined;
    setLoading(true);
    const unsubR = subscribeTherapistResources(
      therapistUid,
      (data) => {
        setResources(data);
        setLoading(false);
        setRefreshing(false);
      },
      { isAdmin }
    );
    const unsubW = subscribeWorksheets(therapistUid, setWorksheets, { isAdmin });
    return () => {
      unsubR();
      unsubW();
    };
  }, [therapistUid, isAdmin]);

  const loadClients = useCallback(async () => {
    if (!therapistUid) return;
    setClients(await loadResourceClients(therapistUid));
  }, [therapistUid]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    const ids = [
      ...resources.map((r) => r.therapistId),
      ...worksheets.map((w) => w.createdBy || w.therapistId),
    ];
    if (!ids.length) return;
    fetchTherapistNames(ids).then(setTherapistNames);
  }, [resources, worksheets]);

  const q = search.trim().toLowerCase();

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchCat = filterCategory === 'all' || r.category === filterCategory;
      return matchCat && matchesResourceSearch(r, q);
    });
  }, [resources, filterCategory, q]);

  const filteredWorksheets = useMemo(() => {
    return worksheets.filter((w) => {
      const matchCat = filterCategory === 'all' || w.category === filterCategory;
      return matchCat && matchesWorksheetSearch(w, q);
    });
  }, [worksheets, filterCategory, q]);

  const resourceSections = useMemo(() => {
    if (!filteredResources.length) return [];
    if (!isAdmin) return [{ key: 'all', title: null, data: filteredResources }];
    const { byYou, byOthers } = groupByAuthor(filteredResources, therapistUid, 'therapistId');
    return [
      { key: 'yours', title: 'By You', data: byYou },
      { key: 'others', title: 'By Others', data: byOthers },
    ];
  }, [filteredResources, isAdmin, therapistUid]);

  const worksheetSections = useMemo(() => {
    if (!filteredWorksheets.length) return [];
    if (!isAdmin) return [{ key: 'all', title: null, data: filteredWorksheets }];
    // Worksheets carry the author as `therapistId` — `createdBy` is a
    // Firestore-era name the API never returns, so every worksheet resolved to an
    // undefined author and landed in "by others", leaving the creator's own count
    // at 0. groupByAuthor still falls back to createdBy for legacy rows.
    const { byYou, byOthers } = groupByAuthor(filteredWorksheets, therapistUid, 'therapistId');
    return [
      { key: 'yours', title: 'By You', data: byYou },
      { key: 'others', title: 'By Others', data: byOthers },
    ];
  }, [filteredWorksheets, isAdmin, therapistUid]);

  const canEditResource = (r) => r.therapistId === therapistUid || isAdmin;
  const canEditWorksheet = (w) => (w.createdBy || w.therapistId) === therapistUid || isAdmin;

  const openCreateResource = () => {
    setEditingResource(null);
    setResourceForm(emptyResourceForm());
    setShowResourceForm(true);
  };

  // Which picker each type uses, and how the button reads before/after a file.
  const UPLOAD_LABELS = {
    image:    { label: 'Image',    cta: 'Choose an image',    icon: 'image-outline' },
    document: { label: 'File',     cta: 'Choose a file',      icon: 'document-outline' },
    audio:    { label: 'Audio',    cta: 'Choose an audio file', icon: 'musical-notes-outline' },
    video:    { label: 'Video',    cta: 'Upload a video',     icon: 'videocam-outline' },
  };

  const handlePickAttachment = async (type) => {
    setUploadingAttachment(true);
    try {
      let picked = null;
      if (type === 'image') picked = await pickResourceImage();
      else if (type === 'video') picked = await pickResourceVideo();
      else picked = await pickResourceFile(type);
      if (picked) setResourceForm((p) => ({ ...p, ...picked }));
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'Could not attach that file.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const openEditResource = (r) => {
    setEditingResource(r);
    setResourceForm(resourceFormFromRecord(r));
    setViewResource(null);
    setShowResourceForm(true);
  };

  const saveResource = async () => {
    if (!resourceForm.title?.trim()) {
      Alert.alert('Required', 'Title is required.');
      return;
    }
    if (resourceForm.type === 'link' && !resourceForm.linkUrl?.trim()) {
      Alert.alert('Required', 'Link URL is required for link resources.');
      return;
    }
    setSavingResource(true);
    try {
      if (editingResource) {
        await updateTherapistResource(editingResource.id, resourceForm, profile);
      } else {
        await createTherapistResource(resourceForm, profile);
      }
      setShowResourceForm(false);
      setEditingResource(null);
      setResourceForm(emptyResourceForm());
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save resource.');
    } finally {
      setSavingResource(false);
    }
  };

  const confirmDeleteResource = (r) => {
    Alert.alert('Delete resource', 'Remove this resource?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTherapistResource(r.id);
            setViewResource(null);
            // Drop it locally so the list updates immediately rather than waiting
            // for the next 30s poll.
            setResources((prev) => prev.filter((x) => x.id !== r.id));
          } catch (e) {
            // Surface the real reason — a bare "Failed to delete." gave no way to
            // tell a permission problem from a stale route.
            console.error('Delete resource failed:', r.id, e?.message || e);
            Alert.alert('Error', e?.message || 'Failed to delete.');
          }
        },
      },
    ]);
  };

  const openCreateWorksheet = () => {
    setEditingWorksheet(null);
    setWorksheetForm(emptyWorksheetForm());
    setFieldTypePickerIndex(null);
    setShowWorksheetForm(true);
  };

  const openEditWorksheet = (w) => {
    setEditingWorksheet(w);
    setWorksheetForm(worksheetFormFromRecord(w));
    setFieldTypePickerIndex(null);
    setViewWorksheet(null);
    setShowWorksheetForm(true);
  };

  const saveWorksheet = async () => {
    const f = worksheetForm;
    const isEdit = !!editingWorksheet;

    // Creating a worksheet requires the full brief. EDITING one does not: an
    // existing worksheet may predate some of these fields, and demanding them
    // again blocked a therapist from reopening a completed worksheet for their
    // client. Only the title — the thing that identifies it — stays mandatory.
    if (!f.title?.trim()) {
      Alert.alert('Required', 'Give the worksheet a title.');
      return;
    }
    if (!isEdit && (!f.description?.trim() || !f.goal?.trim() || !f.instructions?.trim())) {
      Alert.alert('Required', 'Title, description, goal, and instructions are required.');
      return;
    }
    const validFields = (f.fields || []).filter((field) => field.name?.trim() && field.type);
    if (!validFields.length) {
      Alert.alert(
        'Required',
        'Every worksheet needs at least one field, and each field needs a name. '
          + 'Fill in the field name under "Form fields" before saving.',
      );
      return;
    }
    setSavingWorksheet(true);
    try {
      const payload = { ...f, fields: validFields };
      if (editingWorksheet) {
        await updateWorksheet(editingWorksheet.id, payload);
      } else {
        await createWorksheet(payload);
      }
      setShowWorksheetForm(false);
      setEditingWorksheet(null);
      setWorksheetForm(emptyWorksheetForm());
    } catch (e) {
      // Was a bare `catch {}` — the real reason (a rejected therapistId, a
      // validation failure) never reached the therapist, who just saw
      // "Failed to save worksheet" with nothing to act on.
      Alert.alert('Could not save worksheet', e?.message || 'Please try again.');
    } finally {
      setSavingWorksheet(false);
    }
  };

  const confirmDeleteWorksheet = (w) => {
    Alert.alert('Delete worksheet', 'Remove this worksheet?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWorksheet(w.id);
            setViewWorksheet(null);
            setWorksheets((prev) => prev.filter((x) => x.id !== w.id));
          } catch (e) {
            console.error('Delete worksheet failed:', w.id, e?.message || e);
            Alert.alert('Error', e?.message || 'Failed to delete.');
          }
        },
      },
    ]);
  };

  const toggleClientAssignment = (clientId) => {
    setWorksheetForm((prev) => {
      const assigned = prev.assignedTo || [];
      const next = assigned.includes(clientId)
        ? assigned.filter((id) => id !== clientId)
        : [...assigned, clientId];
      return { ...prev, assignedTo: next };
    });
  };

  const updateWorksheetField = (index, patch) => {
    setWorksheetForm((prev) => {
      const fields = [...(prev.fields || [])];
      fields[index] = { ...fields[index], ...patch };
      return { ...prev, fields };
    });
  };

  const setWorksheetFieldType = (index, nextType) => {
    setWorksheetForm((prev) => {
      const fields = [...(prev.fields || [])];
      fields[index] = normalizeWorksheetFieldType(fields[index], nextType);
      return { ...prev, fields };
    });
    setFieldTypePickerIndex(null);
  };

  const addFieldOption = (fieldIndex) => {
    setWorksheetForm((prev) => {
      const fields = [...(prev.fields || [])];
      const f = fields[fieldIndex];
      fields[fieldIndex] = { ...f, options: [...(f.options || []), ''] };
      return { ...prev, fields };
    });
  };

  const updateFieldOption = (fieldIndex, optionIndex, value) => {
    setWorksheetForm((prev) => {
      const fields = [...(prev.fields || [])];
      const f = fields[fieldIndex];
      const options = (f.options || []).map((opt, idx) => (idx === optionIndex ? value : opt));
      fields[fieldIndex] = { ...f, options };
      return { ...prev, fields };
    });
  };

  const removeFieldOption = (fieldIndex, optionIndex) => {
    setWorksheetForm((prev) => {
      const fields = [...(prev.fields || [])];
      const f = fields[fieldIndex];
      const options = (f.options || []).filter((_, idx) => idx !== optionIndex);
      fields[fieldIndex] = { ...f, options: options.length ? options : [''] };
      return { ...prev, fields };
    });
  };

  const removeWorksheetField = (index) => {
    setWorksheetForm((prev) => {
      const next = (prev.fields || []).filter((_, i) => i !== index);
      // A worksheet with no fields cannot be saved, and an empty list gives the
      // therapist nothing to edit — removing the last field used to leave the
      // form stuck, refusing to save with nothing on screen to fix.
      return {
        ...prev,
        fields: next.length ? next : [{ name: '', type: 'text', required: true, options: [] }],
      };
    });
  };

  const categoryOptions =
    activeTab === 'worksheets'
      ? [{ key: 'all', label: 'All' }, ...Object.entries(WORKSHEET_CATEGORIES).map(([k, v]) => ({ key: k, label: v }))]
      : [{ key: 'all', label: 'All' }, ...Object.entries(RESOURCE_CATEGORIES).map(([k, v]) => ({ key: k, label: v.name }))];

  const extraCategoryFields = RESOURCE_CATEGORIES[resourceForm.category]?.fields || [];

  const renderResourceCard = (r, showAuthor = false) => (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setViewResource(r)} activeOpacity={0.85}>
        <View style={styles.cardTop}>
          <View style={styles.iconWrap}>
            <Ionicons name={getCategoryIcon(r.category)} size={22} color={TherapistColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {r.title}
            </Text>
            <Text style={styles.cardMeta}>
              {getCategoryLabel(r.category)} · {RESOURCE_TYPES[r.type] || r.type || 'Document'}
            </Text>
            {showAuthor ? (
              <Text style={styles.authorMeta} numberOfLines={1}>
                {therapistNames[r.therapistId] || r.therapistName || 'Therapist'}
              </Text>
            ) : null}
          </View>
        </View>
        {r.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {r.description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaChip}>{DIFFICULTY_LEVELS[r.difficulty] || 'Beginner'}</Text>
          <Text style={styles.metaChip}>{TARGET_AUDIENCES[r.targetAudience] || 'All Clients'}</Text>
          <Text style={styles.metaDate}>{fmtDate(r.createdAt)}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.cardActions}>
        {canEditResource(r) ? (
          <>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openEditResource(r)}>
              <Ionicons name="create-outline" size={20} color={TherapistColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDeleteResource(r)}>
              <Ionicons name="trash-outline" size={20} color={TherapistColors.error} />
            </TouchableOpacity>
          </>
        ) : null}
        <TouchableOpacity style={styles.actionBtn} onPress={() => setViewResource(r)}>
          <Ionicons name="eye-outline" size={20} color={TherapistColors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderWorksheetCard = (w, showAuthor = false) => {
    const responses = countWorksheetResponses(w);
    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => setViewWorksheet(w)} activeOpacity={0.85}>
          <View style={styles.cardTop}>
            <View style={[styles.iconWrap, { backgroundColor: '#f3e8ff' }]}>
              <Ionicons name="clipboard-outline" size={22} color="#8b5cf6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {w.title}
              </Text>
              <Text style={styles.cardMeta}>
                {WORKSHEET_CATEGORIES[w.category] || w.category} · {w.status || 'active'}
              </Text>
              {showAuthor ? (
                <Text style={styles.authorMeta} numberOfLines={1}>
                  {therapistNames[w.createdBy || w.therapistId] || 'Therapist'}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: w.status === 'active' ? '#10B981' : '#9CA3AF' },
              ]}
            />
          </View>
          {w.goal ? (
            <Text style={styles.cardDesc} numberOfLines={1}>
              Goal: {w.goal}
            </Text>
          ) : null}
          <Text style={styles.metaDate}>
            {fmtDate(w.dateCreated || w.createdAt)}
            {responses > 0 ? ` · ${responses} response${responses !== 1 ? 's' : ''}` : ''}
          </Text>
        </TouchableOpacity>
        <View style={styles.cardActions}>
          {canEditWorksheet(w) ? (
            <>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openEditWorksheet(w)}>
                <Ionicons name="create-outline" size={20} color={TherapistColors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDeleteWorksheet(w)}>
                <Ionicons name="trash-outline" size={20} color={TherapistColors.error} />
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity style={styles.actionBtn} onPress={() => setViewWorksheet(w)}>
            <Ionicons name="eye-outline" size={20} color={TherapistColors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = (
    <>
      {isAdmin ? (
        <View style={styles.adminBanner}>
          <Text style={styles.adminBannerText}>
            Admin view — all platform resources and worksheets
          </Text>
        </View>
      ) : null}
      <Text style={styles.pageTitle}>Resources & Training</Text>
      <Text style={styles.pageSubtitle}>Clinical resources, worksheets & professional materials</Text>

      <View style={styles.mainTabBar}>
        {[
          { key: 'resources', label: 'Resources', count: filteredResources.length },
          { key: 'worksheets', label: 'Worksheets', count: filteredWorksheets.length },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.mainTab, activeTab === t.key && styles.mainTabActive]}
            onPress={() => {
              setActiveTab(t.key);
              setFilterCategory('all');
            }}
          >
            <Text style={[styles.mainTabText, activeTab === t.key && styles.mainTabTextActive]}>
              {t.label} ({t.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.topBar}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={TherapistColors.textLight} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={
              activeTab === 'worksheets'
                ? 'Search worksheets…'
                : 'Search resources, tags…'
            }
            placeholderTextColor={TherapistColors.textLight}
          />
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={activeTab === 'worksheets' ? openCreateWorksheet : openCreateResource}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {categoryOptions.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.filterChip, filterCategory === c.key && styles.filterChipActive]}
            onPress={() => setFilterCategory(c.key)}
          >
            <Text
              style={[styles.filterChipText, filterCategory === c.key && styles.filterChipTextActive]}
              numberOfLines={1}
            >
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  const sections = activeTab === 'resources' ? resourceSections : worksheetSections;
  const emptyList = activeTab === 'resources' ? !filteredResources.length : !filteredWorksheets.length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
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
          emptyList ? (
            <View style={styles.emptyCenter}>
              <Ionicons
                name={activeTab === 'worksheets' ? 'clipboard-outline' : 'book-outline'}
                size={48}
                color={TherapistColors.textLight}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'worksheets' ? 'No worksheets' : 'No resources'}
              </Text>
              <Text style={styles.emptySub}>Tap + to add</Text>
            </View>
          ) : null
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
          section.title && !section.data.length ? (
            <Text style={styles.sectionEmpty}>No items in this section</Text>
          ) : null
        }
        renderItem={({ item, section }) =>
          activeTab === 'resources'
            ? renderResourceCard(item, isAdmin && section.key === 'others')
            : renderWorksheetCard(item, isAdmin && section.key === 'others')
        }
      />

      {/* Resource form */}
      <Modal visible={showResourceForm} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowResourceForm(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingResource ? 'Edit' : 'Add'} Resource</Text>
              <TouchableOpacity onPress={saveResource} disabled={savingResource}>
                {savingResource ? (
                  <ActivityIndicator size="small" color={TherapistColors.primary} />
                ) : (
                  <Text style={styles.modalSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={resourceForm.title}
                onChangeText={(t) => setResourceForm((p) => ({ ...p, title: t }))}
                placeholder="Resource title"
                placeholderTextColor={TherapistColors.textLight}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                multiline
                value={resourceForm.description}
                onChangeText={(t) => setResourceForm((p) => ({ ...p, description: t }))}
                placeholder="Description"
                placeholderTextColor={TherapistColors.textLight}
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {Object.entries(RESOURCE_CATEGORIES).map(([key, cat]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, resourceForm.category === key && styles.chipActive]}
                    onPress={() => setResourceForm((p) => ({ ...p, category: key }))}
                  >
                    <Text style={[styles.chipText, resourceForm.category === key && styles.chipTextActive]}>
                      {cat.name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.chipRow}>
                {Object.entries(RESOURCE_TYPES).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, resourceForm.type === key && styles.chipActive]}
                    onPress={() => setResourceForm((p) => ({ ...p, type: key }))}
                  >
                    <Text style={[styles.chipText, resourceForm.type === key && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Each type needs its own attachment field. Without these, picking
                  "Image" or "Audio" only changed a label — no file was ever
                  attached, so the client had nothing to open. */}
              {resourceForm.type === 'link' ? (
                <>
                  <Text style={styles.fieldLabel}>Link URL *</Text>
                  <TextInput
                    style={styles.input}
                    value={resourceForm.linkUrl}
                    onChangeText={(t) => setResourceForm((p) => ({ ...p, linkUrl: t }))}
                    placeholder="https://…"
                    placeholderTextColor={TherapistColors.textLight}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </>
              ) : null}

              {resourceForm.type === 'video' ? (
                <>
                  <Text style={styles.fieldLabel}>Video link</Text>
                  <TextInput
                    style={styles.input}
                    value={resourceForm.linkUrl}
                    onChangeText={(t) => setResourceForm((p) => ({ ...p, linkUrl: t }))}
                    placeholder="YouTube / Vimeo URL (or upload below)"
                    placeholderTextColor={TherapistColors.textLight}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </>
              ) : null}

              {['image', 'document', 'audio', 'video'].includes(resourceForm.type) ? (
                <>
                  <Text style={styles.fieldLabel}>{UPLOAD_LABELS[resourceForm.type].label}</Text>
                  <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={() => handlePickAttachment(resourceForm.type)}
                    disabled={uploadingAttachment}
                  >
                    {uploadingAttachment ? (
                      <ActivityIndicator size="small" color={TherapistColors.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name={UPLOAD_LABELS[resourceForm.type].icon}
                          size={20}
                          color={TherapistColors.primary}
                        />
                        <Text style={styles.uploadText}>
                          {resourceForm.fileName || UPLOAD_LABELS[resourceForm.type].cta}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {resourceForm.fileUrl ? (
                    <View style={styles.uploadedRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#059669" />
                      <Text style={styles.uploadedText} numberOfLines={1}>
                        {resourceForm.fileName || 'Attached'}
                        {resourceForm.fileSize
                          ? ` · ${(resourceForm.fileSize / 1024 / 1024).toFixed(1)} MB`
                          : ''}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setResourceForm((p) => ({
                          ...p, fileUrl: '', fileName: '', fileSize: null, mimeType: '',
                        }))}
                      >
                        <Ionicons name="close-circle" size={18} color={TherapistColors.error} />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {resourceForm.type === 'audio' ? (
                    <Text style={styles.fieldHint}>
                      Audio must be under {MAX_AUDIO_BYTES / 1024 / 1024} MB.
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Difficulty</Text>
              <View style={styles.chipRow}>
                {Object.keys(DIFFICULTY_LEVELS).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, resourceForm.difficulty === d && styles.chipActive]}
                    onPress={() => setResourceForm((p) => ({ ...p, difficulty: d }))}
                  >
                    <Text style={[styles.chipText, resourceForm.difficulty === d && styles.chipTextActive]}>
                      {DIFFICULTY_LEVELS[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Target audience</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {Object.entries(TARGET_AUDIENCES).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, resourceForm.targetAudience === key && styles.chipActive]}
                    onPress={() => setResourceForm((p) => ({ ...p, targetAudience: key }))}
                  >
                    <Text
                      style={[styles.chipText, resourceForm.targetAudience === key && styles.chipTextActive]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* "Specific Clients" set the audience and showed no list, so the
                  resource saved with nobody assigned and reached no one. */}
              {resourceForm.targetAudience === 'specific' ? (
                <>
                  <Text style={styles.fieldLabel}>Assign to clients *</Text>
                  {clients.length === 0 ? (
                    <Text style={styles.fieldHint}>
                      No clients assigned to you yet — pull down on the library to refresh.
                    </Text>
                  ) : (
                    clients.map((c) => {
                      const selected = (resourceForm.assignedClients || []).includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={styles.checkRow}
                          onPress={() =>
                            setResourceForm((p) => {
                              const cur = p.assignedClients || [];
                              return {
                                ...p,
                                assignedClients: cur.includes(c.id)
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
                          <Text style={styles.checkLabel}>
                            {c.name || c.displayName || c.email || 'Client'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Duration</Text>
              <TextInput
                style={styles.input}
                value={resourceForm.duration}
                onChangeText={(t) => setResourceForm((p) => ({ ...p, duration: t }))}
                placeholder="e.g. 30 min"
                placeholderTextColor={TherapistColors.textLight}
              />

              <Text style={styles.fieldLabel}>Content</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                multiline
                value={resourceForm.content}
                onChangeText={(t) => setResourceForm((p) => ({ ...p, content: t }))}
                placeholder="Main content"
                placeholderTextColor={TherapistColors.textLight}
              />

              {extraCategoryFields.map((field) => (
                <View key={field}>
                  <Text style={styles.fieldLabel}>{FIELD_LABEL(field)}</Text>
                  <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    value={String(resourceForm[field] || '')}
                    onChangeText={(t) => setResourceForm((p) => ({ ...p, [field]: t }))}
                    placeholder={FIELD_LABEL(field)}
                    placeholderTextColor={TherapistColors.textLight}
                  />
                </View>
              ))}

              <Text style={styles.fieldLabel}>Tags (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={resourceForm.tags}
                onChangeText={(t) => setResourceForm((p) => ({ ...p, tags: t }))}
                placeholder="anxiety, cbt"
                placeholderTextColor={TherapistColors.textLight}
              />

              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Public resource</Text>
                <Switch
                  value={resourceForm.isPublic !== false}
                  onValueChange={(v) => setResourceForm((p) => ({ ...p, isPublic: v }))}
                  trackColor={{ false: '#e2e8f0', true: TherapistColors.primary }}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Resource view */}
      <Modal visible={!!viewResource} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setViewResource(null)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {viewResource?.title}
            </Text>
            {viewResource && canEditResource(viewResource) ? (
              <TouchableOpacity onPress={() => confirmDeleteResource(viewResource)}>
                <Ionicons name="trash-outline" size={22} color={TherapistColors.error} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>
          {viewResource ? (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.viewBadge}>{getCategoryLabel(viewResource.category)}</Text>
              {viewResource.therapistId !== therapistUid ? (
                <Text style={styles.authorMeta}>
                  By {therapistNames[viewResource.therapistId] || viewResource.therapistName}
                </Text>
              ) : null}
              {viewResource.description ? (
                <Text style={styles.viewBody}>{viewResource.description}</Text>
              ) : null}
              {/* Show the actual attachment — image, audio player, video or file —
                  not just a link line. */}
              <View style={styles.viewMedia}>
                <ResourceMedia resource={viewResource} />
              </View>
              {getResourceDetailFields(viewResource).map((row) => (
                <View key={row.label} style={styles.viewRow}>
                  <Text style={styles.viewLabel}>{row.label}</Text>
                  <Text style={styles.viewValue}>{row.value}</Text>
                </View>
              ))}
              {viewResource.linkUrl ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(viewResource.linkUrl).catch(() => {})}
                >
                  <Text style={styles.linkText}>{viewResource.linkUrl}</Text>
                </TouchableOpacity>
              ) : null}
              {viewResource.fileUrl ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(viewResource.fileUrl).catch(() => {})}
                >
                  <Text style={styles.linkText}>Open file</Text>
                </TouchableOpacity>
              ) : null}
              {canEditResource(viewResource) ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => openEditResource(viewResource)}>
                  <Text style={styles.primaryBtnText}>Edit resource</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Worksheet form */}
      <Modal visible={showWorksheetForm} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setFieldTypePickerIndex(null);
                  setShowWorksheetForm(false);
                }}
              >
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingWorksheet ? 'Edit' : 'Create'} Worksheet</Text>
              <TouchableOpacity onPress={saveWorksheet} disabled={savingWorksheet}>
                {savingWorksheet ? (
                  <ActivityIndicator size="small" color={TherapistColors.primary} />
                ) : (
                  <Text style={styles.modalSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={worksheetForm.title}
                onChangeText={(t) => setWorksheetForm((p) => ({ ...p, title: t }))}
                placeholder="Worksheet title"
                placeholderTextColor={TherapistColors.textLight}
              />
              <Text style={styles.fieldLabel}>Goal *</Text>
              <TextInput
                style={styles.input}
                value={worksheetForm.goal}
                onChangeText={(t) => setWorksheetForm((p) => ({ ...p, goal: t }))}
                placeholder="Client goal"
                placeholderTextColor={TherapistColors.textLight}
              />
              <Text style={styles.fieldLabel}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                multiline
                value={worksheetForm.description}
                onChangeText={(t) => setWorksheetForm((p) => ({ ...p, description: t }))}
                placeholder="Description"
                placeholderTextColor={TherapistColors.textLight}
              />
              <Text style={styles.fieldLabel}>Instructions *</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                multiline
                value={worksheetForm.instructions}
                onChangeText={(t) => setWorksheetForm((p) => ({ ...p, instructions: t }))}
                placeholder="Instructions for client"
                placeholderTextColor={TherapistColors.textLight}
              />
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {Object.entries(WORKSHEET_CATEGORIES).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, worksheetForm.category === key && styles.chipPurple]}
                    onPress={() => setWorksheetForm((p) => ({ ...p, category: key }))}
                  >
                    <Text
                      style={[styles.chipText, worksheetForm.category === key && { color: '#fff' }]}
                    >
                      {label.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.chipRow}>
                {['active', 'archived'].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, worksheetForm.status === s && styles.chipActive]}
                    onPress={() => setWorksheetForm((p) => ({ ...p, status: s }))}
                  >
                    <Text style={[styles.chipText, worksheetForm.status === s && styles.chipTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Assign to clients</Text>
              {clients.length === 0 ? (
                <Text style={styles.fieldHint}>
                  No clients assigned to you yet — pull down on the library to refresh.
                </Text>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {clients.map((c) => {
                  const selected = (worksheetForm.assignedTo || []).includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => toggleClientAssignment(c.id)}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {c.name || c.displayName || 'Client'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={styles.fieldLabel}>Form fields *</Text>
              {(worksheetForm.fields || []).map((field, index) => (
                <View key={index} style={styles.fieldBlock}>
                  <View style={styles.fieldBlockHeader}>
                    <Text style={styles.fieldBlockTitle}>Field {index + 1}</Text>
                    <TouchableOpacity onPress={() => removeWorksheetField(index)}>
                      <Text style={styles.removeField}>Remove</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.fieldLabel}>Field name *</Text>
                  <TextInput
                    style={styles.input}
                    value={field.name}
                    onChangeText={(t) => updateWorksheetField(index, { name: t })}
                    placeholder="e.g., situation, automaticThoughts"
                    placeholderTextColor={TherapistColors.textLight}
                  />

                  <Text style={styles.fieldLabel}>Field type *</Text>
                  <TouchableOpacity
                    style={styles.dropdown}
                    onPress={() => setFieldTypePickerIndex(fieldTypePickerIndex === index ? null : index)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.dropdownText}>{getWorksheetFieldTypeLabel(field.type)}</Text>
                    <Ionicons
                      name={fieldTypePickerIndex === index ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={TherapistColors.textSecondary}
                    />
                  </TouchableOpacity>
                  {fieldTypePickerIndex === index ? (
                    <View style={styles.dropdownMenu}>
                      {WORKSHEET_FIELD_TYPES.map((ft) => (
                        <TouchableOpacity
                          key={ft.id}
                          style={[styles.dropdownItem, field.type === ft.id && styles.dropdownItemActive]}
                          onPress={() => setWorksheetFieldType(index, ft.id)}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              field.type === ft.id && styles.dropdownItemTextActive,
                            ]}
                          >
                            {ft.label}
                          </Text>
                          {field.type === ft.id ? (
                            <Ionicons name="checkmark" size={18} color={TherapistColors.primary} />
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.switchRow}>
                    <Text style={styles.fieldLabel}>Required field</Text>
                    <Switch
                      value={field.required !== false}
                      onValueChange={(v) => updateWorksheetField(index, { required: v })}
                      trackColor={{ false: '#e2e8f0', true: TherapistColors.primary }}
                    />
                  </View>

                  {worksheetFieldTypeNeedsOptions(field.type) ? (
                    <View style={styles.optionsBox}>
                      <Text style={styles.fieldLabel}>
                        {field.type === 'checkbox'
                          ? 'Tick boxes the client will see'
                          : field.type === 'multiple-choice'
                            ? 'Options the client can pick several of'
                            : 'Options'}
                      </Text>
                      {(field.options || ['']).map((option, optIndex) => (
                        <View key={optIndex} style={styles.optionRow}>
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            value={option}
                            onChangeText={(t) => updateFieldOption(index, optIndex, t)}
                            placeholder={`Option ${optIndex + 1}`}
                            placeholderTextColor={TherapistColors.textLight}
                          />
                          <TouchableOpacity
                            onPress={() => removeFieldOption(index, optIndex)}
                            disabled={(field.options || []).length <= minWorksheetOptions(field.type)}
                            style={{ opacity: (field.options || []).length <= minWorksheetOptions(field.type) ? 0.4 : 1 }}
                          >
                            <Ionicons name="close-circle" size={24} color={TherapistColors.error} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity style={styles.addOptionBtn} onPress={() => addFieldOption(index)}>
                        <Text style={styles.addOptionText}>+ Add option</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {field.type === 'rating' ? (
                    <View style={styles.ratingPreview}>
                      <Text style={styles.fieldLabel}>Highest score on the scale</Text>
                      <View style={styles.scaleChoiceRow}>
                        {RATING_MAX_CHOICES.map((n) => {
                          const active = (Number(field.max) || DEFAULT_RATING_MAX) === n;
                          return (
                            <TouchableOpacity
                              key={n}
                              style={[styles.scaleChoice, active && styles.scaleChoiceActive]}
                              onPress={() => updateWorksheetField(index, { max: n })}
                            >
                              <Text style={[styles.scaleChoiceText, active && styles.scaleChoiceTextActive]}>
                                1–{n}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.ratingRow}>
                        <Text style={styles.ratingEnd}>1</Text>
                        <View style={styles.ratingDots}>
                          {Array.from(
                            { length: Number(field.max) || DEFAULT_RATING_MAX },
                            (_, i) => i + 1,
                          ).map((num) => (
                            <View key={num} style={styles.ratingDot}>
                              <Text style={styles.ratingDotText}>{num}</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.ratingEnd}>{Number(field.max) || DEFAULT_RATING_MAX}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ))}
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() =>
                  setWorksheetForm((p) => ({
                    ...p,
                    fields: [...(p.fields || []), { name: '', type: 'text', required: true, options: [] }],
                  }))
                }
              >
                <Text style={styles.outlineBtnText}>+ Add field</Text>
              </TouchableOpacity>
              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Allow multiple responses</Text>
                <Switch
                  value={worksheetForm.allowMultipleResponses !== false}
                  onValueChange={(v) => setWorksheetForm((p) => ({ ...p, allowMultipleResponses: v }))}
                  trackColor={{ false: '#e2e8f0', true: TherapistColors.primary }}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Worksheet view */}
      <Modal visible={!!viewWorksheet} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setViewWorksheet(null)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {viewWorksheet?.title}
            </Text>
            {viewWorksheet && canEditWorksheet(viewWorksheet) ? (
              <TouchableOpacity onPress={() => confirmDeleteWorksheet(viewWorksheet)}>
                <Ionicons name="trash-outline" size={22} color={TherapistColors.error} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>
          {viewWorksheet ? (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={[styles.viewBadge, { color: '#8b5cf6' }]}>
                {WORKSHEET_CATEGORIES[viewWorksheet.category] || viewWorksheet.category}
              </Text>
              {viewWorksheet.goal ? (
                <>
                  <Text style={styles.viewLabel}>Goal</Text>
                  <Text style={styles.viewBody}>{viewWorksheet.goal}</Text>
                </>
              ) : null}
              {viewWorksheet.description ? (
                <>
                  <Text style={styles.viewLabel}>Description</Text>
                  <Text style={styles.viewBody}>{viewWorksheet.description}</Text>
                </>
              ) : null}
              {viewWorksheet.instructions ? (
                <>
                  <Text style={styles.viewLabel}>Instructions</Text>
                  <Text style={styles.viewBody}>{viewWorksheet.instructions}</Text>
                </>
              ) : null}
              {(viewWorksheet.fields || []).map((f, i) => (
                <View key={i} style={styles.fieldViewBlock}>
                  <Text style={styles.viewLabel}>
                    {f.name} · {getWorksheetFieldTypeLabel(f.type)}
                  </Text>
                  <Text style={styles.viewValue}>{f.required !== false ? 'Required' : 'Optional'}</Text>
                  {worksheetFieldTypeNeedsOptions(f.type) && f.options?.length ? (
                    <Text style={styles.viewOptions}>
                      Options: {f.options.filter(Boolean).join(', ') || '—'}
                    </Text>
                  ) : null}
                  {f.type === 'rating' ? (
                    <Text style={styles.viewOptions}>Scale: 1 – 10</Text>
                  ) : null}
                  {/* The client's actual answer. The view previously showed only
                      the field DEFINITION, so a completed worksheet gave the
                      therapist no way to read what their client wrote. */}
                  {worksheetAnswerFor(viewWorksheet, i) ? (
                    <View style={styles.answerBox}>
                      <Text style={styles.answerLabel}>Client answered</Text>
                      <Text style={styles.answerText}>{worksheetAnswerFor(viewWorksheet, i)}</Text>
                    </View>
                  ) : viewWorksheet.isCompleted ? (
                    <Text style={styles.answerEmpty}>No answer given</Text>
                  ) : null}
                </View>
              ))}
              {countWorksheetResponses(viewWorksheet) > 0 ? (
                <Text style={styles.responseHint}>
                  {countWorksheetResponses(viewWorksheet)} answer(s) submitted
                  {viewWorksheet.lastSubmittedAt
                    ? ` · ${new Date(viewWorksheet.lastSubmittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : ''}
                </Text>
              ) : viewWorksheet.isCompleted ? (
                <Text style={styles.responseHint}>Completed — no answers recorded</Text>
              ) : (
                <Text style={styles.responseHint}>Waiting for the client to respond</Text>
              )}
              {canEditWorksheet(viewWorksheet) ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => openEditWorksheet(viewWorksheet)}>
                  <Text style={styles.primaryBtnText}>Edit worksheet</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  adminBanner: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  adminBannerText: { fontSize: 13, color: '#4338ca', fontWeight: '600' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: TherapistColors.text },
  pageSubtitle: { fontSize: 13, color: TherapistColors.textLight, marginTop: 4, marginBottom: 12 },
  mainTabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TherapistColors.border,
    overflow: 'hidden',
  },
  mainTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  mainTabActive: { backgroundColor: `${TherapistColors.primary}12` },
  mainTabText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  mainTabTextActive: { color: TherapistColors.primary },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: TherapistColors.text },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterScroll: { maxHeight: 44, marginBottom: 8 },
  filterContent: { gap: 8, paddingRight: 16 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    maxWidth: 160,
  },
  filterChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: TherapistColors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  sectionEmpty: { fontSize: 13, color: TherapistColors.textLight, fontStyle: 'italic', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: TherapistColors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${TherapistColors.primary}14`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  cardMeta: { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 2 },
  authorMeta: { fontSize: 12, fontWeight: '600', color: TherapistColors.secondary, marginTop: 2 },
  cardDesc: { fontSize: 13, color: TherapistColors.textLight, marginTop: 8, lineHeight: 19 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
  metaChip: {
    fontSize: 11,
    fontWeight: '600',
    color: TherapistColors.primary,
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaDate: { fontSize: 11, color: TherapistColors.textLight },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtn: { padding: 8 },
  emptyCenter: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  emptySub: { fontSize: 13, color: TherapistColors.textLight },
  modalSafe: { flex: 1, backgroundColor: TherapistColors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: TherapistColors.border,
  },
  modalCancel: { fontSize: 15, color: TherapistColors.textSecondary, minWidth: 56 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: TherapistColors.text, flex: 1, textAlign: 'center' },
  modalSave: { fontSize: 15, fontWeight: '700', color: TherapistColors.primary, minWidth: 56, textAlign: 'right' },
  modalBody: { padding: 16, paddingBottom: 40 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 6, marginTop: 14 },
  viewMedia: { marginVertical: 12 },
  fieldHint: { fontSize: 12, color: TherapistColors.textLight, fontStyle: 'italic', marginTop: 6 },
  uploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: TherapistColors.primary,
    backgroundColor: '#f5f3ff',
  },
  uploadText: { fontSize: 14, fontWeight: '600', color: TherapistColors.primary },
  uploadedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  uploadedText: { flex: 1, fontSize: 12, color: TherapistColors.textSecondary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkLabel: { fontSize: 14, color: TherapistColors.text },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TherapistColors.text,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  chipScroll: { marginVertical: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    backgroundColor: '#fff',
    marginRight: 8,
    marginBottom: 4,
  },
  chipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  chipPurple: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  chipText: { fontSize: 12, fontWeight: '600', color: TherapistColors.textSecondary },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  fieldBlock: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
  },
  fieldBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  fieldBlockTitle: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  removeField: { fontSize: 13, color: TherapistColors.error, fontWeight: '600' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: { fontSize: 15, color: TherapistColors.text, fontWeight: '500' },
  dropdownMenu: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemActive: { backgroundColor: '#f0f7ff' },
  dropdownItemText: { fontSize: 15, color: TherapistColors.text },
  dropdownItemTextActive: { color: TherapistColors.primary, fontWeight: '600' },
  optionsBox: { marginTop: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  addOptionBtn: { paddingVertical: 8 },
  addOptionText: { fontSize: 14, fontWeight: '600', color: TherapistColors.primary },
  ratingPreview: { marginTop: 8 },
  scaleChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 10 },
  scaleChoice: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  scaleChoiceActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  scaleChoiceText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  scaleChoiceTextActive: { color: '#fff' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingEnd: { fontSize: 12, fontWeight: '600', color: TherapistColors.textSecondary },
  ratingDots: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  ratingDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f0f7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingDotText: { fontSize: 9, fontWeight: '700', color: TherapistColors.primary },
  fieldViewBlock: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  viewOptions: { fontSize: 13, color: TherapistColors.textSecondary, marginTop: 4 },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: TherapistColors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  outlineBtnText: { color: TherapistColors.primary, fontWeight: '700' },
  viewBadge: { fontSize: 13, fontWeight: '700', color: TherapistColors.primary, marginBottom: 8 },
  viewBody: { fontSize: 14, color: TherapistColors.text, lineHeight: 22, marginBottom: 12 },
  viewRow: { marginBottom: 10 },
  viewLabel: { fontSize: 12, fontWeight: '600', color: TherapistColors.textLight, marginBottom: 4 },
  viewValue: { fontSize: 14, color: TherapistColors.text },
  linkText: { fontSize: 14, color: TherapistColors.primary, marginVertical: 8 },
  primaryBtn: {
    backgroundColor: TherapistColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  answerBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    borderLeftWidth: 3,
    borderLeftColor: TherapistColors.primary,
  },
  answerLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: TherapistColors.primary,
    marginBottom: 3,
  },
  answerText: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  answerEmpty: { marginTop: 8, fontSize: 13, fontStyle: 'italic', color: '#94a3b8' },
  responseHint: { fontSize: 13, color: TherapistColors.success, fontWeight: '600', marginTop: 8 },
});
