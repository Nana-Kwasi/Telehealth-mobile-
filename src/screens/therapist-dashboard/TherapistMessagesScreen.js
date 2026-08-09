import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/apiClient';
import { TherapistColors } from '../../constants/colors';
import ChatThreadView from '../../components/chat/ChatThreadView';
import { setPresenceOnline, setPresenceOffline, formatLastSeen, findOrCreateThread, sendThreadMessage, threadHasParticipant } from '../../utils/chatUtils';
import TherapistStaffProfileModal from '../../components/therapist/TherapistStaffProfileModal';

export default function TherapistMessagesScreen({ profile }) {
  const [therapists, setTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [listTab, setListTab] = useState('general');
  const [menuTherapistId, setMenuTherapistId] = useState(null);
  const [profileModal, setProfileModal] = useState({ visible: false, user: null, mode: 'view' });
  const [loadingList, setLoadingList] = useState(true);

  const listRef = useRef(null);
  const [myId, setMyId] = React.useState('');
  const [otherPresence, setOtherPresence] = useState({ online: false, lastSeen: null });
  const threadIdRef = useRef(null);

  const isAdmin = profile?.role === 'admin' || profile?.type === 'Administrator' || profile?.isAdminTherapist === true;

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const uid = await AsyncStorage.getItem('th.userId');
      if (!uid || cancelled) return;
      setMyId(uid);
      setLoadingList(true);
      try {
        // /admin/users is ADMIN-only — a therapist got 403 here, so the staff list
        // was always empty ("No staff found") while web, which reads /therapists,
        // showed everyone. That endpoint is readable by any signed-in user and is
        // the same source the web staff screen uses.
        const data = await api('/api/v1/therapists');
        const list = (Array.isArray(data) ? data : [])
          .filter((t) => String(t.id) !== String(uid))
          .map((t) => ({
            ...t,
            id: t.id,
            uid: t.id,
            name: t.name || t.fullName || t.displayName || 'Therapist',
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setTherapists(list);
      } catch (e) {
        console.error('Staff list failed:', e?.message || e);
        if (!cancelled) setTherapists([]);
      }
      setLoadingList(false);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedTherapist || !myId) { setMessages([]); return; }
    let cancelled = false;
    let pollId;

    const initThread = async () => {
      const threads = await api(`/api/v1/care/chats/threads?userId=${myId}`).catch(() => []);
      // participantA/participantB — a participantIds array is never returned.
      const thread = (Array.isArray(threads) ? threads : []).find(t => threadHasParticipant(t, selectedTherapist.uid));
      threadIdRef.current = thread?.id;

      const poll = async () => {
        if (cancelled || !threadIdRef.current) return;
        try {
          const msgs = await api(`/api/v1/care/chats/threads/${threadIdRef.current}/messages`);
          if (!cancelled) { setMessages(Array.isArray(msgs) ? msgs : []); setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80); }
          // Mark the other party's messages read → blue ticks on their side.
          api(`/api/v1/care/chats/threads/${threadIdRef.current}/read`, { method: 'POST', body: {} }).catch(() => {});
        } catch {}
      };
      poll();
      pollId = setInterval(poll, 15_000);
    };
    initThread();
    // Presence: announce online + watch the other party's status.
    setPresenceOnline(myId);
    const fetchPresence = () => api(`/api/v1/realtime/presence/${selectedTherapist.uid}`)
      .then(p => setOtherPresence(p || { online: false, lastSeen: null })).catch(() => {});
    fetchPresence();
    const presId = setInterval(fetchPresence, 10_000);
    return () => { cancelled = true; clearInterval(pollId); clearInterval(presId); };
  }, [selectedTherapist?.uid, myId]);

  // Upload path for staff-chat attachments. This was called as `staffChatPrefix()`
  // but never defined or imported anywhere, so opening a staff conversation threw
  // "Property 'staffChatPrefix' doesn't exist" before it could render.
  //
  // The leading segment becomes the upload `domain` (a varchar(64) category), so
  // keep it short and stable — the pair id goes in the rest of the path.
  const staffChatPrefix = () => {
    const peerId = selectedTherapist?.uid || selectedTherapist?.id || 'peer';
    const pair = [myId, peerId].filter(Boolean).sort().join('_');
    return `staff-chats/${pair}`;
  };

  const handleStaffSend = async (payload) => {
    if (!selectedTherapist || !myId) return;
    if (!threadIdRef.current) {
      // Therapist-to-therapist conversation → the 'staff' channel.
      const thread = await findOrCreateThread(myId, selectedTherapist.uid, 'staff');
      if (thread?.id) threadIdRef.current = thread.id;
    }
    if (!threadIdRef.current) throw new Error('Could not open the conversation.');
    await sendThreadMessage(threadIdRef.current, myId, payload);
  };

  const filteredTherapists = therapists.filter((t) =>
    (t.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openProfile = (therapist, mode) => {
    setProfileModal({ visible: true, user: therapist, mode });
    setMenuTherapistId(null);
  };

  // ── Chat view ─────────────────────────────────────────────────────────────
  if (selectedTherapist) {
    const chatHeader = (
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setSelectedTherapist(null)} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        {selectedTherapist.photoURL ? (
          <Image source={{ uri: selectedTherapist.photoURL }} style={styles.chatAvatarImg} />
        ) : (
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{(selectedTherapist.name || '?')[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName} numberOfLines={1}>{selectedTherapist.name}</Text>
          <Text style={[styles.chatRole, otherPresence.online && { color: '#22c55e' }]}>
            {otherPresence.online ? '● Online' : (formatLastSeen(otherPresence.lastSeen) || selectedTherapist.type || 'Staff')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => openProfile(selectedTherapist, isAdmin ? 'manage' : 'view')}
          hitSlop={8}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#64748b" />
        </TouchableOpacity>
      </View>
    );

    return (
      <>
        <ChatThreadView
          messages={messages}
          myUid={myId}
          onSend={handleStaffSend}
          storagePrefix={staffChatPrefix()}
          accentColor={TherapistColors.primary}
          lightBg={TherapistColors.primaryLight || '#eef2ff'}
          header={chatHeader}
          emptyHint={`Send the first message to ${selectedTherapist.name}`}
          listRef={listRef}
          keyboardVerticalOffset={90}
        />
        <TherapistStaffProfileModal
          visible={profileModal.visible}
          user={profileModal.user}
          mode={profileModal.mode}
          isAdmin={isAdmin}
          onClose={() => setProfileModal({ visible: false, user: null, mode: 'view' })}
        />
      </>
    );
  }

  // ── Staff list ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.listTop}>
        <Text style={styles.listTitle}>Staff messages</Text>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, listTab === 'general' && styles.tabActive]}
            onPress={() => setListTab('general')}
          >
            <Text style={[styles.tabText, listTab === 'general' && styles.tabTextActive]}>
              General {therapists.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, listTab === 'archive' && styles.tabActive]}
            onPress={() => setListTab('archive')}
          >
            <Text style={[styles.tabText, listTab === 'archive' && styles.tabTextActive]}>Archive 0</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search staff members…"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {loadingList ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={TherapistColors.primary} />
        </View>
      ) : listTab === 'archive' ? (
        <View style={styles.emptyState}>
          <Ionicons name="archive-outline" size={44} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No archived chats</Text>
        </View>
      ) : filteredTherapists.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={44} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No staff found</Text>
          <Text style={styles.emptySub}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTherapists}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.staffList}
          renderItem={({ item: therapist }) => (
            <TouchableOpacity
              style={styles.staffRow}
              onPress={() => { setSelectedTherapist(therapist); setMenuTherapistId(null); }}
              activeOpacity={0.85}
            >
              {therapist.photoURL ? (
                <Image source={{ uri: therapist.photoURL }} style={styles.staffAvatar} />
              ) : (
                <View style={styles.staffAvatarPlaceholder}>
                  <Text style={styles.staffAvatarText}>{(therapist.name || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName} numberOfLines={1}>{therapist.name}</Text>
                <Text style={styles.staffPreview}>Tap to start chatting</Text>
              </View>
              <TouchableOpacity
                style={styles.moreBtn}
                onPress={() => setMenuTherapistId(menuTherapistId === therapist.id ? null : therapist.id)}
                hitSlop={8}
              >
                <Ionicons name="ellipsis-vertical" size={18} color="#94a3b8" />
              </TouchableOpacity>
              {menuTherapistId === therapist.id ? (
                <View style={styles.dropdown}>
                  {isAdmin ? (
                    <TouchableOpacity style={styles.dropdownItem} onPress={() => openProfile(therapist, 'manage')}>
                      <Text style={styles.dropdownText}>Manage user</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.dropdownItem} onPress={() => openProfile(therapist, 'view')}>
                      <Text style={styles.dropdownText}>View profile</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}

      <TherapistStaffProfileModal
        visible={profileModal.visible}
        user={profileModal.user}
        mode={profileModal.mode}
        isAdmin={isAdmin}
        onClose={() => setProfileModal({ visible: false, user: null, mode: 'view' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  listTop: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  listTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 4, marginBottom: 12 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9' },
  tabActive: { backgroundColor: '#eef2ff' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: TherapistColors.primary, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 0 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  staffList: { padding: 16, paddingBottom: 28 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
  },
  staffAvatar: { width: 48, height: 48, borderRadius: 14 },
  staffAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  staffName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  staffPreview: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  moreBtn: { padding: 4 },
  dropdown: {
    position: 'absolute',
    right: 12,
    top: 48,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    zIndex: 10,
    minWidth: 140,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropdownText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748b' },
  emptySub: { fontSize: 13, color: '#94a3b8' },

  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: { padding: 4 },
  chatAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAvatarImg: { width: 42, height: 42, borderRadius: 12 },
  chatAvatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  chatName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  chatRole: { fontSize: 12, color: '#64748b', marginTop: 1 },
  chatMessages: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  emptyChat: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyChatEmoji: { fontSize: 40 },
  emptyChatTitle: { fontSize: 16, fontWeight: '700', color: '#64748b' },
  emptyChatSub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 24 },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', gap: 8, maxWidth: '88%' },
  msgRowMine: { alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  msgBubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, maxWidth: '100%' },
  msgBubbleMine: { backgroundColor: TherapistColors.primary },
  msgBubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8ecf2' },
  msgText: { fontSize: 15, lineHeight: 21, color: '#1e293b' },
  msgTextMine: { color: '#fff' },
  msgTime: { fontSize: 10, color: '#94a3b8', marginTop: 4 },
  msgTimeMine: { color: 'rgba(255,255,255,0.7)' },
  msgImage: { width: 200, height: 150, borderRadius: 10 },
  emojiBar: { maxHeight: 48, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  emojiBarContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  emojiBtn: { paddingHorizontal: 6 },
  emojiChar: { fontSize: 24 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  inputIconBtn: { padding: 8, justifyContent: 'center' },
  recordingBtn: { backgroundColor: '#fef2f2', borderRadius: 8 },
  msgInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: '#0f172a',
    maxHeight: 96,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
});
