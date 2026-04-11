import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, RefreshControl, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, getDoc,
  addDoc, serverTimestamp, orderBy, limit
} from 'firebase/firestore';
import { TherapistColors } from '../../constants/colors';

const MOOD_OPTIONS = ['Anxious','Calm','Sad','Hopeful','Angry','Excited','Neutral','Depressed','Optimistic','Stressed'];
const PROGRESS_OPTIONS = ['Significantly Improved','Improved','Slight Improvement','No Change','Slight Decline','Worsened'];
const INTERVENTION_OPTIONS = ['CBT','Mindfulness','Role Play','Supportive Listening','Psychoeducation','Exposure Therapy','Solution-Focused','Other'];

const TherapistNotesScreen = ({ navigation }) => {
  const [notes, setNotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteForm, setNoteForm] = useState({
    clientId: '', clientName: '',
    sessionDate: new Date().toISOString().split('T')[0],
    sessionFocus: '', mood: '', progressAssessment: '',
    interventionsUsed: '', clientResponse: '', moodRating: 5,
    homework: '', nextSessionFocus: '',
  });

  const currentUser = auth.currentUser;

  useEffect(() => { if (currentUser) loadData(); }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadNotes(), loadClients()]);
    } catch (e) { console.error('Notes load error:', e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  const loadNotes = async () => {
    try {
      const q = query(
        collection(db, 'clinicalNotes'),
        where('therapistId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      setNotes(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch (e) { console.error('Load notes error:', e); }
  };

  const loadClients = async () => {
    try {
      const ref = collection(db, 'therapists', currentUser.uid, 'clients');
      const snap = await getDocs(ref);
      const ids = snap.docs.map(d => d.data().clientId).filter(Boolean);
      const list = [];
      for (const id of ids) {
        try {
          const cSnap = await getDoc(doc(db, 'clients', id));
          if (cSnap.exists()) {
            const cd = cSnap.data();
            list.push({ id, name: cd.name||cd.displayName||cd.email||'Client' });
          }
        } catch (_) {}
      }
      setClients(list);
    } catch (e) {}
  };

  const handleSaveNote = async () => {
    if (!noteForm.clientId || !noteForm.sessionFocus.trim()) {
      Alert.alert('Missing Info', 'Please select a client and add session focus.');
      return;
    }
    setSaving(true);
    try {
      const data = { ...noteForm, therapistId: currentUser.uid, isDraft: false, createdAt: serverTimestamp() };
      await addDoc(collection(db, 'clinicalNotes'), data);
      await addDoc(collection(db, 'clients', noteForm.clientId, 'therapyNotes'), data);
      setShowNewNoteModal(false);
      setNoteForm({ clientId:'', clientName:'', sessionDate: new Date().toISOString().split('T')[0], sessionFocus:'', mood:'', progressAssessment:'', interventionsUsed:'', clientResponse:'', moodRating:5, homework:'', nextSessionFocus:'' });
      await loadNotes();
      Alert.alert('Saved', 'Session note saved.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save note.');
    } finally { setSaving(false); }
  };

  const filteredNotes = notes.filter(n => {
    const q = searchQuery.toLowerCase();
    return !q || (n.clientName||'').toLowerCase().includes(q) || (n.sessionFocus||'').toLowerCase().includes(q);
  });

  const fmtDate = (ts) => {
    if (!ts) return '';
    const dt = ts.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  };

  const progressColor = (p) => {
    if (!p) return TherapistColors.textLight;
    if (['Significantly Improved','Improved'].includes(p)) return TherapistColors.success;
    if (['Slight Improvement'].includes(p)) return TherapistColors.secondary;
    if (['No Change'].includes(p)) return TherapistColors.textSecondary;
    return TherapistColors.error;
  };

  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={TherapistColors.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={TherapistColors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes…"
          placeholderTextColor={TherapistColors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredNotes}
        keyExtractor={n => n.id}
        contentContainerStyle={{ padding:16, paddingTop:8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);loadData();}} colors={[TherapistColors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={TherapistColors.textLight} />
            <Text style={styles.emptyTitle}>No session notes yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to create your first note</Text>
          </View>
        }
        renderItem={({ item: note }) => (
          <TouchableOpacity
            style={styles.noteCard}
            onPress={() => { setSelectedNote(note); setShowViewModal(true); }}
            activeOpacity={0.8}
          >
            <View style={styles.noteCardHeader}>
              <View style={styles.noteAvatar}>
                <Text style={styles.noteAvatarText}>{(note.clientName||'?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={styles.noteClient} numberOfLines={1}>{note.clientName||'Client'}</Text>
                <Text style={styles.noteDate}>{note.sessionDate || fmtDate(note.createdAt)}</Text>
              </View>
              {note.progressAssessment && (
                <Text style={[styles.progressBadge, { color: progressColor(note.progressAssessment) }]}>
                  {note.progressAssessment.replace('Significantly ','').replace('Slight ','')}
                </Text>
              )}
            </View>
            <Text style={styles.noteFocus} numberOfLines={2}>{note.sessionFocus || 'No focus recorded'}</Text>
            {note.mood && (
              <View style={styles.noteTagRow}>
                <View style={styles.noteTag}><Text style={styles.noteTagText}>Mood: {note.mood}</Text></View>
                {note.moodRating && <View style={styles.noteTag}><Text style={styles.noteTagText}>Rating: {note.moodRating}/10</Text></View>}
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowNewNoteModal(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── New Note Modal ── */}
      <Modal visible={showNewNoteModal} transparent animationType="slide" onRequestClose={() => setShowNewNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Session Note</Text>
              <TouchableOpacity onPress={() => setShowNewNoteModal(false)}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding:16, gap:14 }}>
              {/* Client */}
              <View>
                <Text style={styles.formLabel}>Client *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:6 }}>
                  {clients.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, noteForm.clientId===c.id && styles.chipActive]}
                      onPress={() => setNoteForm(p=>({...p, clientId:c.id, clientName:c.name}))}
                    >
                      <Text style={[styles.chipText, noteForm.clientId===c.id && { color:'#fff' }]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View>
                <Text style={styles.formLabel}>Session Date</Text>
                <TextInput style={styles.formInput} value={noteForm.sessionDate} onChangeText={v=>setNoteForm(p=>({...p,sessionDate:v}))} placeholder="YYYY-MM-DD" placeholderTextColor={TherapistColors.textLight} />
              </View>

              <View>
                <Text style={styles.formLabel}>Session Focus *</Text>
                <TextInput style={[styles.formInput,{minHeight:80,textAlignVertical:'top'}]} multiline value={noteForm.sessionFocus} onChangeText={v=>setNoteForm(p=>({...p,sessionFocus:v}))} placeholder="Main topics and issues discussed…" placeholderTextColor={TherapistColors.textLight} />
              </View>

              <View>
                <Text style={styles.formLabel}>Mood</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:6}}>
                  {MOOD_OPTIONS.map(m => (
                    <TouchableOpacity key={m} style={[styles.chip, noteForm.mood===m && styles.chipActive]} onPress={() => setNoteForm(p=>({...p,mood:m}))}>
                      <Text style={[styles.chipText, noteForm.mood===m && {color:'#fff'}]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View>
                <Text style={styles.formLabel}>Progress: <Text style={{color:TherapistColors.primary}}>{noteForm.moodRating}/10</Text></Text>
                <View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:4}}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <TouchableOpacity key={n} onPress={()=>setNoteForm(p=>({...p,moodRating:n}))} style={{flex:1,height:32,borderRadius:6,backgroundColor:noteForm.moodRating>=n?TherapistColors.primary:'#f1f5f9',justifyContent:'center',alignItems:'center'}}>
                      <Text style={{fontSize:11,fontWeight:'700',color:noteForm.moodRating>=n?'#fff':TherapistColors.textLight}}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={styles.formLabel}>Progress Assessment</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:6}}>
                  {PROGRESS_OPTIONS.map(p => (
                    <TouchableOpacity key={p} style={[styles.chip, noteForm.progressAssessment===p && styles.chipActive]} onPress={() => setNoteForm(prev=>({...prev,progressAssessment:p}))}>
                      <Text style={[styles.chipText, noteForm.progressAssessment===p && {color:'#fff'}]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View>
                <Text style={styles.formLabel}>Client Response</Text>
                <TextInput style={[styles.formInput,{minHeight:60,textAlignVertical:'top'}]} multiline value={noteForm.clientResponse} onChangeText={v=>setNoteForm(p=>({...p,clientResponse:v}))} placeholder="How client responded…" placeholderTextColor={TherapistColors.textLight} />
              </View>

              <View>
                <Text style={styles.formLabel}>Homework / Next Steps</Text>
                <TextInput style={styles.formInput} value={noteForm.homework} onChangeText={v=>setNoteForm(p=>({...p,homework:v}))} placeholder="Between-session tasks…" placeholderTextColor={TherapistColors.textLight} />
              </View>

              <TouchableOpacity style={[styles.saveBtn, {opacity:saving?0.7:1}]} onPress={handleSaveNote} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── View Note Modal ── */}
      <Modal visible={showViewModal} transparent animationType="slide" onRequestClose={() => setShowViewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedNote?.clientName} — Note</Text>
              <TouchableOpacity onPress={() => setShowViewModal(false)}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            {selectedNote && (
              <ScrollView contentContainerStyle={{ padding:16 }}>
                {[
                  ['Date', selectedNote.sessionDate || fmtDate(selectedNote.createdAt)],
                  ['Mood', selectedNote.mood],
                  ['Mood Rating', selectedNote.moodRating ? `${selectedNote.moodRating}/10` : null],
                  ['Session Focus', selectedNote.sessionFocus],
                  ['Interventions', selectedNote.interventionsUsed],
                  ['Client Response', selectedNote.clientResponse],
                  ['Progress', selectedNote.progressAssessment],
                  ['Homework', selectedNote.homework],
                  ['Next Session Focus', selectedNote.nextSessionFocus],
                ].filter(([,v]) => v).map(([label, value]) => (
                  <View key={label} style={styles.viewRow}>
                    <Text style={styles.viewLabel}>{label}</Text>
                    <Text style={styles.viewValue}>{value}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex:1, justifyContent:'center', alignItems:'center' },
  searchBar: { flexDirection:'row', alignItems:'center', gap:10, margin:16, marginBottom:8, backgroundColor:'#fff', borderRadius:12, paddingHorizontal:14, paddingVertical:10, borderWidth:1.5, borderColor:TherapistColors.border },
  searchInput: { flex:1, fontSize:14, color: TherapistColors.text },
  emptyState: { alignItems:'center', paddingVertical:48, gap:10 },
  emptyTitle: { fontSize:16, fontWeight:'700', color: TherapistColors.text },
  emptySubtitle: { fontSize:13, color: TherapistColors.textLight },
  noteCard: { backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:10, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.04, shadowRadius:4, elevation:1 },
  noteCardHeader: { flexDirection:'row', alignItems:'center', gap:10, marginBottom:8 },
  noteAvatar: { width:38, height:38, borderRadius:19, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center' },
  noteAvatarText: { fontSize:15, fontWeight:'700', color:'#fff' },
  noteClient: { fontSize:14, fontWeight:'700', color: TherapistColors.text },
  noteDate: { fontSize:12, color: TherapistColors.textLight },
  progressBadge: { fontSize:11, fontWeight:'700' },
  noteFocus: { fontSize:13, color: TherapistColors.textSecondary, lineHeight:19, marginBottom:8 },
  noteTagRow: { flexDirection:'row', gap:6 },
  noteTag: { backgroundColor:'#f0f7ff', paddingHorizontal:8, paddingVertical:3, borderRadius:20 },
  noteTagText: { fontSize:11, color: TherapistColors.primary, fontWeight:'600' },
  fab: { position:'absolute', bottom:24, right:24, width:56, height:56, borderRadius:28, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center', shadowColor:TherapistColors.primary, shadowOffset:{width:0,height:6}, shadowOpacity:0.35, shadowRadius:10, elevation:8 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modalSheet: { backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'90%' },
  modalHandle: { width:40, height:4, backgroundColor:'#e2e8f0', borderRadius:2, alignSelf:'center', marginTop:12, marginBottom:4 },
  modalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#f1f5f9' },
  modalTitle: { fontSize:17, fontWeight:'700', color: TherapistColors.text },
  formLabel: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },
  formInput: { backgroundColor:'#f8fafc', borderRadius:10, borderWidth:1.5, borderColor:TherapistColors.border, padding:12, fontSize:14, color: TherapistColors.text, marginTop:4 },
  chip: { paddingHorizontal:13, paddingVertical:7, borderRadius:20, borderWidth:1.5, borderColor:TherapistColors.border, backgroundColor:'#f8fafc', marginRight:8 },
  chipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  chipText: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },
  saveBtn: { backgroundColor: TherapistColors.primary, borderRadius:12, paddingVertical:15, alignItems:'center' },
  saveBtnText: { color:'#fff', fontSize:15, fontWeight:'700' },
  viewRow: { paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#f8fafc' },
  viewLabel: { fontSize:12, fontWeight:'600', color: TherapistColors.textLight, textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 },
  viewValue: { fontSize:14, color: TherapistColors.text, lineHeight:21 },
});

export default TherapistNotesScreen;
