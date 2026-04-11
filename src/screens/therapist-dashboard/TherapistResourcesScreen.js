import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
  Platform, KeyboardAvoidingView, SafeAreaView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, getDoc, addDoc, serverTimestamp,
  orderBy, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { TherapistColors } from '../../constants/colors';

const { width } = Dimensions.get('window');

const RESOURCE_CATEGORIES = ['All', 'Homework', 'Psychoeducation', 'Community', 'Crisis', 'Assessment', 'Article', 'Video', 'Audio', 'Other'];
const CAT_ICON = {
  Homework: 'book-outline',
  Psychoeducation: 'brain-outline',
  Community: 'people-outline',
  Crisis: 'warning-outline',
  Assessment: 'checkmark-circle-outline',
  Article: 'document-text-outline',
  Video: 'videocam-outline',
  Audio: 'mic-outline',
  Other: 'folder-outline',
};

const WORKSHEET_CATEGORIES = ['CBT', 'Mindfulness', 'DBT', 'ACT', 'Anxiety', 'Depression', 'Trauma', 'Other'];

const TherapistResourcesScreen = ({ navigation }) => {
  // Tabs
  const [activeMainTab, setActiveMainTab] = useState('resources'); // 'resources' | 'worksheets'

  // Resources
  const [resources, setResources] = useState([]);
  const [filteredResources, setFilteredResources] = useState([]);
  const [resourceLoading, setResourceLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [showNewResource, setShowNewResource] = useState(false);
  const [showResourceDetail, setShowResourceDetail] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);
  const [submittingResource, setSubmittingResource] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    title: '', description: '', category: 'Article', url: '', content: '',
    difficulty: 'beginner', tags: '',
  });

  // Worksheets
  const [worksheets, setWorksheets] = useState([]);
  const [worksheetLoading, setWorksheetLoading] = useState(false);
  const [showNewWorksheet, setShowNewWorksheet] = useState(false);
  const [showWorksheetDetail, setShowWorksheetDetail] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [submittingWorksheet, setSubmittingWorksheet] = useState(false);
  const [worksheetForm, setWorksheetForm] = useState({
    title: '', description: '', goal: '', instructions: '',
    category: 'CBT', status: 'active',
  });

  // Clients (for assigning worksheets)
  const [clients, setClients] = useState([]);

  useEffect(() => {
    if (auth.currentUser) {
      loadResources();
      loadWorksheets();
      loadClients();
    }
  }, []);

  useEffect(() => {
    let r = resources;
    if (activeCategory !== 'All') r = r.filter(x => x.category === activeCategory);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(x => x.title?.toLowerCase().includes(s) || x.description?.toLowerCase().includes(s));
    }
    setFilteredResources(r);
  }, [resources, activeCategory, search]);

  const loadResources = async () => {
    setResourceLoading(true);
    try {
      // Web uses 'therapistResources' collection
      const q = query(
        collection(db, 'therapistResources'),
        where('therapistId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setResources(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      try {
        const q2 = query(collection(db, 'therapistResources'), where('therapistId', '==', auth.currentUser.uid));
        const snap = await getDocs(q2);
        setResources(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (_) {}
    } finally {
      setResourceLoading(false);
      setRefreshing(false);
    }
  };

  const loadWorksheets = async () => {
    setWorksheetLoading(true);
    try {
      // Web filters by createdBy OR therapistId
      const snap = await getDocs(query(collection(db, 'worksheets'), orderBy('dateCreated', 'desc')));
      const uid = auth.currentUser.uid;
      setWorksheets(snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(w => w.therapistId === uid || w.createdBy === uid));
    } catch (e) {
      try {
        const snap2 = await getDocs(collection(db, 'worksheets'));
        const uid = auth.currentUser.uid;
        setWorksheets(snap2.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(w => w.therapistId === uid || w.createdBy === uid));
      } catch (_) {}
    } finally {
      setWorksheetLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const ref = collection(db, 'therapists', auth.currentUser.uid, 'clients');
      const snap = await getDocs(ref);
      const ids = snap.docs.map(d => d.data().clientId).filter(Boolean);
      const list = [];
      for (const id of ids) {
        try {
          const cSnap = await getDoc(doc(db, 'clients', id));
          if (cSnap.exists()) {
            const cd = cSnap.data();
            list.push({ id, name: cd.name || cd.displayName || cd.email || 'Client' });
          }
        } catch (_) {}
      }
      setClients(list);
    } catch (_) {}
  };

  const submitResource = async () => {
    if (!resourceForm.title.trim()) { Alert.alert('Required', 'Title is required.'); return; }
    setSubmittingResource(true);
    try {
      await addDoc(collection(db, 'therapistResources'), {
        ...resourceForm,
        therapistId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      setShowNewResource(false);
      setResourceForm({ title: '', description: '', category: 'Article', url: '', content: '', difficulty: 'beginner', tags: '' });
      await loadResources();
      Alert.alert('Success', 'Resource added.');
    } catch (e) {
      Alert.alert('Error', 'Failed to add resource.');
    } finally {
      setSubmittingResource(false);
    }
  };

  const deleteResource = async (id) => {
    Alert.alert('Delete', 'Remove this resource?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'therapistResources', id));
          setResources(prev => prev.filter(r => r.id !== id));
          setShowResourceDetail(false);
        } catch (_) { Alert.alert('Error', 'Failed to delete.'); }
      }},
    ]);
  };

  const submitWorksheet = async () => {
    if (!worksheetForm.title.trim()) { Alert.alert('Required', 'Title is required.'); return; }
    setSubmittingWorksheet(true);
    try {
      await addDoc(collection(db, 'worksheets'), {
        ...worksheetForm,
        therapistId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      setShowNewWorksheet(false);
      setWorksheetForm({ title: '', description: '', goal: '', instructions: '', category: 'CBT', status: 'active' });
      await loadWorksheets();
      Alert.alert('Success', 'Worksheet created.');
    } catch (e) {
      Alert.alert('Error', 'Failed to create worksheet.');
    } finally {
      setSubmittingWorksheet(false);
    }
  };

  const deleteWorksheet = async (id) => {
    Alert.alert('Delete', 'Remove this worksheet?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'worksheets', id));
          setWorksheets(prev => prev.filter(w => w.id !== id));
          setShowWorksheetDetail(false);
        } catch (_) { Alert.alert('Error', 'Failed to delete.'); }
      }},
    ]);
  };

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      {/* ── Main Tab Bar ── */}
      <View style={styles.mainTabBar}>
        {[
          { key: 'resources',  label: 'Resources',  count: resources.length },
          { key: 'worksheets', label: 'Worksheets', count: worksheets.length },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.mainTab, activeMainTab === t.key && styles.mainTabActive]}
            onPress={() => setActiveMainTab(t.key)}
          >
            <Text style={[styles.mainTabText, activeMainTab === t.key && styles.mainTabTextActive]}>
              {t.label} {t.count > 0 ? `(${t.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ════════════ RESOURCES TAB ════════════ */}
      {activeMainTab === 'resources' && (
        <View style={{ flex: 1 }}>
          {/* Search + Add */}
          <View style={styles.topBar}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={TherapistColors.textLight} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search resources…"
                placeholderTextColor={TherapistColors.textLight}
              />
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowNewResource(true)}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Category Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
            {RESOURCE_CATEGORIES.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.catChip, activeCategory === c && styles.catChipActive]}
                onPress={() => setActiveCategory(c)}
              >
                <Text style={[styles.catChipText, activeCategory === c && styles.catChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {resourceLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={TherapistColors.primary} /></View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadResources(); }} colors={[TherapistColors.primary]} />}
            >
              {filteredResources.length === 0 ? (
                <View style={styles.emptyCenter}>
                  <Ionicons name="book-outline" size={48} color={TherapistColors.textLight} />
                  <Text style={styles.emptyTitle}>{resources.length === 0 ? 'No resources yet' : 'No results'}</Text>
                  <Text style={styles.emptySub}>Tap + to add a resource</Text>
                </View>
              ) : filteredResources.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.resourceCard}
                  onPress={() => { setSelectedResource(r); setShowResourceDetail(true); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.resourceIconWrap}>
                    <Ionicons name={CAT_ICON[r.category] || 'document-outline'} size={22} color={TherapistColors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resourceTitle}>{r.title}</Text>
                    <Text style={styles.resourceMeta}>{r.category} · {fmtDate(r.createdAt)}</Text>
                    {r.description ? <Text style={styles.resourceDesc} numberOfLines={2}>{r.description}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={TherapistColors.textLight} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ════════════ WORKSHEETS TAB ════════════ */}
      {activeMainTab === 'worksheets' && (
        <View style={{ flex: 1 }}>
          <View style={styles.topBar}>
            <Text style={styles.sectionLabel}>{worksheets.length} worksheet{worksheets.length !== 1 ? 's' : ''}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowNewWorksheet(true)}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {worksheetLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={TherapistColors.primary} /></View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={false} onRefresh={loadWorksheets} colors={[TherapistColors.primary]} />}
            >
              {worksheets.length === 0 ? (
                <View style={styles.emptyCenter}>
                  <Ionicons name="clipboard-outline" size={48} color={TherapistColors.textLight} />
                  <Text style={styles.emptyTitle}>No worksheets yet</Text>
                  <Text style={styles.emptySub}>Tap + to create a worksheet for your clients</Text>
                </View>
              ) : worksheets.map(w => (
                <TouchableOpacity
                  key={w.id}
                  style={styles.worksheetCard}
                  onPress={() => { setSelectedWorksheet(w); setShowWorksheetDetail(true); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.worksheetIconWrap}>
                    <Ionicons name="clipboard-outline" size={22} color="#8b5cf6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resourceTitle}>{w.title}</Text>
                    <Text style={styles.resourceMeta}>{w.category} · {fmtDate(w.createdAt)}</Text>
                    {w.goal ? <Text style={styles.resourceDesc} numberOfLines={1}>Goal: {w.goal}</Text> : null}
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: w.status === 'active' ? '#10B981' : '#9CA3AF' }]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ═══════ NEW RESOURCE MODAL ═══════ */}
      <Modal visible={showNewResource} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNewResource(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowNewResource(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Resource</Text>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { opacity: submittingResource ? 0.6 : 1 }]}
                onPress={submitResource}
                disabled={submittingResource}
              >
                {submittingResource
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalSaveText}>Add</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={resourceForm.title}
                onChangeText={t => setResourceForm({ ...resourceForm, title: t })}
                placeholder="Resource title"
                placeholderTextColor={TherapistColors.textLight}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={resourceForm.description}
                onChangeText={t => setResourceForm({ ...resourceForm, description: t })}
                placeholder="Brief description…"
                placeholderTextColor={TherapistColors.textLight}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chipRow}>
                {RESOURCE_CATEGORIES.filter(c => c !== 'All').map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.selectChip, resourceForm.category === c && styles.selectChipActive]}
                    onPress={() => setResourceForm({ ...resourceForm, category: c })}
                  >
                    <Text style={[styles.selectChipText, resourceForm.category === c && styles.selectChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Difficulty</Text>
              <View style={styles.chipRow}>
                {['beginner', 'intermediate', 'advanced'].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.selectChip, resourceForm.difficulty === d && styles.selectChipActive]}
                    onPress={() => setResourceForm({ ...resourceForm, difficulty: d })}
                  >
                    <Text style={[styles.selectChipText, resourceForm.difficulty === d && styles.selectChipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>URL / Link (optional)</Text>
              <TextInput
                style={styles.input}
                value={resourceForm.url}
                onChangeText={t => setResourceForm({ ...resourceForm, url: t })}
                placeholder="https://…"
                placeholderTextColor={TherapistColors.textLight}
                keyboardType="url"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Content / Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={resourceForm.content}
                onChangeText={t => setResourceForm({ ...resourceForm, content: t })}
                placeholder="Any additional content or notes…"
                placeholderTextColor={TherapistColors.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Tags (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={resourceForm.tags}
                onChangeText={t => setResourceForm({ ...resourceForm, tags: t })}
                placeholder="e.g. anxiety, cbt, self-care"
                placeholderTextColor={TherapistColors.textLight}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ═══════ RESOURCE DETAIL MODAL ═══════ */}
      <Modal visible={showResourceDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowResourceDetail(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowResourceDetail(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>{selectedResource?.title || 'Resource'}</Text>
            <TouchableOpacity onPress={() => selectedResource && deleteResource(selectedResource.id)} style={styles.modalCancelBtn}>
              <Ionicons name="trash-outline" size={20} color={TherapistColors.error} />
            </TouchableOpacity>
          </View>
          {selectedResource && (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={[styles.detailCategoryBadge, { backgroundColor: `${TherapistColors.primary}18` }]}>
                <Ionicons name={CAT_ICON[selectedResource.category] || 'document-outline'} size={14} color={TherapistColors.primary} />
                <Text style={styles.detailCategoryText}>{selectedResource.category}</Text>
              </View>
              <Text style={styles.detailTitle}>{selectedResource.title}</Text>
              {selectedResource.description ? (
                <>
                  <Text style={styles.fieldLabel}>Description</Text>
                  <Text style={styles.detailBody}>{selectedResource.description}</Text>
                </>
              ) : null}
              {selectedResource.content ? (
                <>
                  <Text style={styles.fieldLabel}>Content</Text>
                  <Text style={styles.detailBody}>{selectedResource.content}</Text>
                </>
              ) : null}
              {selectedResource.url ? (
                <>
                  <Text style={styles.fieldLabel}>URL</Text>
                  <Text style={[styles.detailBody, { color: TherapistColors.primary }]}>{selectedResource.url}</Text>
                </>
              ) : null}
              {selectedResource.difficulty ? (
                <>
                  <Text style={styles.fieldLabel}>Difficulty</Text>
                  <Text style={styles.detailBody}>{selectedResource.difficulty}</Text>
                </>
              ) : null}
              <Text style={styles.detailDate}>Added: {fmtDate(selectedResource.createdAt)}</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ═══════ NEW WORKSHEET MODAL ═══════ */}
      <Modal visible={showNewWorksheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNewWorksheet(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowNewWorksheet(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Worksheet</Text>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { opacity: submittingWorksheet ? 0.6 : 1 }]}
                onPress={submitWorksheet}
                disabled={submittingWorksheet}
              >
                {submittingWorksheet
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalSaveText}>Create</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={worksheetForm.title}
                onChangeText={t => setWorksheetForm({ ...worksheetForm, title: t })}
                placeholder="Worksheet title"
                placeholderTextColor={TherapistColors.textLight}
              />

              <Text style={styles.fieldLabel}>Goal / Objective</Text>
              <TextInput
                style={styles.input}
                value={worksheetForm.goal}
                onChangeText={t => setWorksheetForm({ ...worksheetForm, goal: t })}
                placeholder="What will the client achieve?"
                placeholderTextColor={TherapistColors.textLight}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={worksheetForm.description}
                onChangeText={t => setWorksheetForm({ ...worksheetForm, description: t })}
                placeholder="Brief description…"
                placeholderTextColor={TherapistColors.textLight}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Instructions for Client</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={worksheetForm.instructions}
                onChangeText={t => setWorksheetForm({ ...worksheetForm, instructions: t })}
                placeholder="Step-by-step instructions…"
                placeholderTextColor={TherapistColors.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chipRow}>
                {WORKSHEET_CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.selectChip, worksheetForm.category === c && styles.selectChipPurple]}
                    onPress={() => setWorksheetForm({ ...worksheetForm, category: c })}
                  >
                    <Text style={[styles.selectChipText, worksheetForm.category === c && { color: '#fff' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.chipRow}>
                {['active', 'draft', 'archived'].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.selectChip, worksheetForm.status === s && styles.selectChipActive]}
                    onPress={() => setWorksheetForm({ ...worksheetForm, status: s })}
                  >
                    <Text style={[styles.selectChipText, worksheetForm.status === s && styles.selectChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ═══════ WORKSHEET DETAIL MODAL ═══════ */}
      <Modal visible={showWorksheetDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowWorksheetDetail(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowWorksheetDetail(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>{selectedWorksheet?.title || 'Worksheet'}</Text>
            <TouchableOpacity onPress={() => selectedWorksheet && deleteWorksheet(selectedWorksheet.id)} style={styles.modalCancelBtn}>
              <Ionicons name="trash-outline" size={20} color={TherapistColors.error} />
            </TouchableOpacity>
          </View>
          {selectedWorksheet && (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={[styles.detailCategoryBadge, { backgroundColor: '#f3e8ff' }]}>
                <Ionicons name="clipboard-outline" size={14} color="#8b5cf6" />
                <Text style={[styles.detailCategoryText, { color: '#8b5cf6' }]}>{selectedWorksheet.category}</Text>
              </View>
              <Text style={styles.detailTitle}>{selectedWorksheet.title}</Text>
              {selectedWorksheet.goal ? (
                <>
                  <Text style={styles.fieldLabel}>Goal</Text>
                  <Text style={styles.detailBody}>{selectedWorksheet.goal}</Text>
                </>
              ) : null}
              {selectedWorksheet.description ? (
                <>
                  <Text style={styles.fieldLabel}>Description</Text>
                  <Text style={styles.detailBody}>{selectedWorksheet.description}</Text>
                </>
              ) : null}
              {selectedWorksheet.instructions ? (
                <>
                  <Text style={styles.fieldLabel}>Instructions</Text>
                  <Text style={styles.detailBody}>{selectedWorksheet.instructions}</Text>
                </>
              ) : null}
              <View style={styles.chipRow}>
                <View style={[styles.selectChip, selectedWorksheet.status === 'active' ? { backgroundColor: '#d1fae5', borderColor: '#10B981' } : {}]}>
                  <Text style={[styles.selectChipText, selectedWorksheet.status === 'active' ? { color: '#059669' } : {}]}>
                    {selectedWorksheet.status || 'active'}
                  </Text>
                </View>
              </View>
              <Text style={styles.detailDate}>Created: {fmtDate(selectedWorksheet.createdAt)}</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },

  mainTabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: TherapistColors.border,
  },
  mainTab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: TherapistColors.primary },
  mainTabText:   { fontSize: 14, fontWeight: '600', color: TherapistColors.textSecondary },
  mainTabTextActive: { color: TherapistColors.primary },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1.5, borderColor: TherapistColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: TherapistColors.text },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: TherapistColors.textSecondary },

  catScroll:   { maxHeight: 46 },
  catContent:  { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  catChip:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: TherapistColors.border },
  catChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  catChipText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  catChipTextActive: { color: '#fff' },

  listContent: { padding: 16 },
  emptyCenter: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  emptySub:    { fontSize: 13, color: TherapistColors.textLight, textAlign: 'center' },

  resourceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  resourceIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: `${TherapistColors.primary}14`,
    justifyContent: 'center', alignItems: 'center',
  },
  resourceTitle: { fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  resourceMeta:  { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 2 },
  resourceDesc:  { fontSize: 13, color: TherapistColors.textLight, marginTop: 3 },

  worksheetCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  worksheetIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#f3e8ff',
    justifyContent: 'center', alignItems: 'center',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },

  // Modals
  modalSafe:       { flex: 1, backgroundColor: TherapistColors.background },
  modalHeader:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: TherapistColors.border,
  },
  modalCancelBtn:  { minWidth: 60 },
  modalCancelText: { fontSize: 15, color: TherapistColors.textSecondary, fontWeight: '500' },
  modalTitle:      { fontSize: 17, fontWeight: '700', color: TherapistColors.text, flex: 1, textAlign: 'center' },
  modalSaveBtn:    {
    backgroundColor: TherapistColors.primary, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 7, minWidth: 60, alignItems: 'center',
  },
  modalSaveText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBody:       { padding: 20 },

  fieldLabel:  { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: TherapistColors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: TherapistColors.text,
  },
  textarea: { height: 100, textAlignVertical: 'top' },

  chipRow:          { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  selectChip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: TherapistColors.border, backgroundColor: '#fff' },
  selectChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  selectChipPurple: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  selectChipText:   { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, textTransform: 'capitalize' },
  selectChipTextActive: { color: '#fff' },

  detailCategoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 8 },
  detailCategoryText:  { fontSize: 12, fontWeight: '700', color: TherapistColors.primary, textTransform: 'capitalize' },
  detailTitle:  { fontSize: 20, fontWeight: '800', color: TherapistColors.text, marginBottom: 4 },
  detailBody:   { fontSize: 14, color: TherapistColors.textSecondary, lineHeight: 22, marginBottom: 4 },
  detailDate:   { fontSize: 12, color: TherapistColors.textLight, marginTop: 16 },
});

export default TherapistResourcesScreen;
