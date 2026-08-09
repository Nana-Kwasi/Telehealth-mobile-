import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { getNoteTitle, getNotePreview } from '../../utils/noteDisplayUtils';
import { hydrateResource } from '../../services/therapistResourcesService';
import ResourceMedia from '../../components/common/ResourceMedia';
import { downloadNotePdf, downloadResourcePdf } from '../../utils/brandedPdf';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedClientData } from '../../services/clientDataService';
import { Colors } from '../../constants/colors';

const ClientResourcesScreen = ({ navigation }) => {
  const [resources, setResources] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('resources');
  const [viewMode, setViewMode] = useState('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [showWorksheetModal, setShowWorksheetModal] = useState(false);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [worksheetResponses, setWorksheetResponses] = useState({});
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isSubmittingWorksheet, setIsSubmittingWorksheet] = useState(false);

  const categories = [
    { id: 'resources', name: 'Resources', icon: 'book-outline' },
    { id: 'notes', name: 'Notes', icon: 'document-text-outline' },
    { id: 'worksheets', name: 'Worksheets', icon: 'clipboard-outline' }
  ];

  useEffect(() => {
    loadFavorites();
    fetchAssignedResources();
  }, []);

  useEffect(() => {
    filterItems();
  }, [resources, worksheets, notes, searchTerm, selectedCategory]);

  const loadFavorites = async () => {
    try {
      const savedFavorites = await AsyncStorage.getItem('th.resourceFavorites');
      if (savedFavorites) {
        setFavorites(JSON.parse(savedFavorites));
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const fetchAssignedResources = async () => {
    try {
      setIsLoading(true);
      const assignedClientId = await AsyncStorage.getItem('th.clientId') || await AsyncStorage.getItem('th.userId');
      if (!assignedClientId) return;

      try {
        // Two different stores feed this tab: the therapist's resource library
        // (/resources — documents, images, audio, video, links) and therapy books.
        // Only books were ever fetched, so nothing a therapist created on the
        // Resources screen reached the client at all. Both are scoped by clientId,
        // which returns shared-with-all plus assigned-to-me.
        const [libraryData, bookData] = await Promise.all([
          api(`/api/v1/resources?clientId=${assignedClientId}`).catch(() => []),
          api(`/api/v1/therapy-books?clientId=${assignedClientId}`).catch(() => []),
        ]);
        const library = (Array.isArray(libraryData) ? libraryData : []).map(hydrateResource);
        const books = (Array.isArray(bookData) ? bookData : []).map(b => ({ ...b, type: 'resource' }));
        setResources([...library.map(r => ({ ...r, type: 'resource' })), ...books]);
      } catch { console.log('Resources query failed'); }

      try {
        const wsData = await api(`/api/v1/therapy-engagement/worksheets?clientId=${assignedClientId}`);
        // Worksheets are saved as 'assigned'; nothing ever writes 'active', so
        // this filter hid every worksheet the therapist assigned. Exclude only
        // what genuinely shouldn't reach a client.
        const ws = (Array.isArray(wsData) ? wsData : []).filter(
          w => !['template', 'archived', 'deleted'].includes(String(w.status || 'assigned').toLowerCase()),
        );
        // The builder's fields/description/instructions round-trip through
        // metadataJson (the table has no columns for them). Without unpacking it
        // `worksheet.fields` was always undefined, so the response modal rendered
        // nothing but a Submit button and the client had no way to answer.
        setWorksheets(ws.map((w) => {
          let meta = {};
          try { meta = w.metadataJson ? JSON.parse(w.metadataJson) : {}; } catch { /* ignore */ }
          return {
            ...meta,
            ...w,
            type: 'worksheet',
            goal: meta.goal || w.title || 'Worksheet',
            description: meta.description || w.prompt || '',
            instructions: meta.instructions || w.prompt || '',
            fields: Array.isArray(meta.fields) ? meta.fields : [],
            // Answers already submitted, and whether the sheet is closed.
            savedResponses: (() => {
              try { return w.latestResponse ? JSON.parse(w.latestResponse) : {}; } catch { return {}; }
            })(),
            // `submitted` and `completed` both mean the client has answered.
            isCompleted: ['completed', 'submitted'].includes(String(w.status || '').toLowerCase()),
          };
        }));
      } catch { console.log('Worksheets query failed'); }

      try {
        const notesData = await api(`/api/v1/clinical-notes?clientId=${assignedClientId}&visibleOnly=true`);
        const booksData = await api(`/api/v1/therapy-books?clientId=${assignedClientId}`);
        const notes = (Array.isArray(notesData) ? notesData : []).map(n => ({ ...n, type: 'note', noteType: 'clinical' }));
        const books = (Array.isArray(booksData) ? booksData : []).map(b => ({ ...b, type: 'note', noteType: 'therapyBook' }));
        setNotes([...notes, ...books]);
      } catch { console.log('Notes query failed'); }

    } catch (error) {
      console.error('Error fetching resources:', error);
      Alert.alert('Error', 'Failed to load resources. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = [...resources, ...worksheets, ...notes];

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.goal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.noteContent?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory === 'resources') {
      filtered = filtered.filter(item => item.type === 'resource' || item.type === 'assigned' || item.type === 'public');
    } else if (selectedCategory === 'notes') {
      filtered = filtered.filter(item => item.type === 'note');
    } else if (selectedCategory === 'worksheets') {
      filtered = filtered.filter(item => item.type === 'worksheet');
    }

    setFilteredItems(filtered);
  };

  const toggleFavorite = async (resourceId) => {
    const newFavorites = favorites.includes(resourceId)
      ? favorites.filter(id => id !== resourceId)
      : [...favorites, resourceId];
    
    setFavorites(newFavorites);
    await AsyncStorage.setItem('th.resourceFavorites', JSON.stringify(newFavorites));
  };

  const handleWorksheetView = (worksheet) => {
    const clientId = getCachedClientData()?.id || '';
    const clientResponse = worksheet.clientResponses?.[clientId];
    
    if (clientResponse && clientResponse.responses) {
      setWorksheetResponses(clientResponse.responses || {});
    } else {
      setWorksheetResponses({});
    }
    
    setSelectedWorksheet(worksheet);
    setShowWorksheetModal(true);
  };

  const [downloadingId, setDownloadingId] = useState(null);

  // Export to a branded PDF and hand it to the system share sheet — that is what
  // "download" means on iOS/Android.
  const handleDownload = async (item) => {
    setDownloadingId(item.id);
    try {
      if (item.type === 'note') await downloadNotePdf(item);
      else await downloadResourcePdf(item);
    } catch (e) {
      Alert.alert('Download failed', e?.message || 'Could not create the PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleNoteView = (note) => {
    setSelectedNote(note);
    setShowNoteModal(true);
  };

  const isWorksheetCompleted = (worksheet) => {
    const clientId = getCachedClientData()?.id || '';
    const clientResponse = worksheet.clientResponses?.[clientId];
    return clientResponse?.status === 'completed' && !clientResponse?.needsToCompleteNewFields;
  };

  const hasNewFields = (worksheet) => {
    const clientId = getCachedClientData()?.id || '';
    const clientResponse = worksheet.clientResponses?.[clientId];
    return clientResponse?.needsToCompleteNewFields === true;
  };

  const handleSubmitWorksheet = async () => {
    try {
      setIsSubmittingWorksheet(true);
      const clientId = await AsyncStorage.getItem('th.clientId') || await AsyncStorage.getItem('th.userId');
      const clientResponse = selectedWorksheet.clientResponses?.[clientId];
      const hasNewFieldsFlag = clientResponse?.needsToCompleteNewFields === true;
      
      const existingResponses = clientResponse?.responses || {};
      const mergedResponses = { ...existingResponses, ...worksheetResponses };
      
      const allFieldsAnswered = selectedWorksheet.fields.every((_, index) => 
        mergedResponses[index] !== undefined && mergedResponses[index] !== ''
      );
      
      await api(`/api/v1/therapy-engagement/worksheets/${selectedWorksheet.id}/submissions`, {
        method: 'POST',
        body: { clientId, response: JSON.stringify(mergedResponses) },
      });
      
      Alert.alert(
        'Success',
        hasNewFieldsFlag ? 'New fields submitted successfully!' : 'Worksheet submitted successfully!'
      );
      setShowWorksheetModal(false);
      setSelectedWorksheet(null);
      setWorksheetResponses({});
      
      fetchAssignedResources();
    } catch (error) {
      console.error('Error submitting worksheet:', error);
      Alert.alert('Error', 'Failed to submit worksheet. Please try again.');
    } finally {
      setIsSubmittingWorksheet(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getResourceIcon = (item) => {
    if (item.type === 'worksheet') return 'clipboard-outline';
    if (item.type === 'note') {
      if (item.noteType === 'therapyBook') return 'book-outline';
      return 'document-text-outline';
    }
    return 'book-outline';
  };

  const getResourceTypeColor = (item) => {
    if (item.type === 'note') {
      if (item.noteType === 'therapyBook') return '#8B5CF6';
      return '#F59E0B';
    }
    switch (item.type) {
      case 'assigned': return '#3B82F6';
      case 'public': return '#10B981';
      case 'worksheet': return '#8B5CF6';
      case 'resource': return '#6366F1';
      default: return Colors.textSecondary;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAssignedResources();
    setRefreshing(false);
  };

  const renderItem = (item) => {
    const isFavorite = favorites.includes(item.id);
    const iconName = getResourceIcon(item);
    const color = getResourceTypeColor(item);
    const isCompleted = item.type === 'worksheet' && isWorksheetCompleted(item);
    const hasNew = item.type === 'worksheet' && hasNewFields(item);

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.itemCard}
        onPress={() => {
          if (item.type === 'worksheet') {
            handleWorksheetView(item);
          } else if (item.type === 'note') {
            handleNoteView(item);
          } else {
            // An Alert can't show an image, play audio or open a file — the whole
            // point of a typed resource. Open the detail sheet instead.
            setSelectedResource(item);
            setShowResourceModal(true);
          }
        }}
      >
        <View style={[styles.itemIconContainer, { backgroundColor: `${color}20` }]}>
          <Ionicons name={iconName} size={24} color={color} />
        </View>
        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {/* A clinical note has no `title` column — every one of them showed
                  as "Untitled" until you opened it. Fall back to the note's own
                  label (e.g. "SOAP note"). */}
              {item.bookTitle || item.title || item.goal
                || (item.type === 'note' ? getNoteTitle(item) : 'Untitled')}
            </Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                toggleFavorite(item.id);
              }}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={20}
                color={isFavorite ? '#EF4444' : Colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {/* Same for the preview: notes keep their text in structuredData, so
              `description` alone left the card blank. */}
          {(item.description || (item.type === 'note' ? getNotePreview(item, 90) : '')) ? (
            <Text style={styles.itemDescription} numberOfLines={2}>
              {item.description || getNotePreview(item, 90)}
            </Text>
          ) : null}
          <View style={styles.itemFooter}>
            <View style={[styles.typeBadge, { backgroundColor: `${color}20` }]}>
              <Text style={[styles.typeBadgeText, { color }]}>
                {item.type === 'worksheet' ? 'Worksheet' : 
                 item.type === 'note' ? (item.noteType === 'therapyBook' ? 'Book' : 'Note') : 
                 'Resource'}
              </Text>
            </View>
            {item.createdAt && (
              <Text style={styles.itemDate}>{formatDate(item.createdAt)}</Text>
            )}
            {/* Worksheets are filled in inside the app, so only notes, books and
                resources are downloadable. */}
            {item.type !== 'worksheet' && (
              <TouchableOpacity
                style={styles.downloadBtn}
                disabled={downloadingId === item.id}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDownload(item);
                }}
              >
                {downloadingId === item.id ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="download-outline" size={18} color={Colors.primary} />
                )}
              </TouchableOpacity>
            )}
          </View>
          {isCompleted && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.completedText}>Completed</Text>
            </View>
          )}
          {hasNew && (
            <View style={styles.newBadge}>
              <Ionicons name="alert-circle" size={16} color="#F59E0B" />
              <Text style={styles.newText}>New Fields</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading resources...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resources</Text>
        <TouchableOpacity onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
          <Ionicons
            name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
            size={24}
            color={Colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Search and Categories */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search resources..."
            placeholderTextColor={Colors.textSecondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.categoriesContainer}>
        {categories.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryButton,
              selectedCategory === category.id && styles.categoryButtonActive
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Ionicons
              name={category.icon}
              size={20}
              color={selectedCategory === category.id ? Colors.surface : Colors.textSecondary}
            />
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category.id && styles.categoryTextActive
              ]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Resources List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>
              {searchTerm ? 'No resources found' : `No ${selectedCategory} available`}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchTerm ? 'Try a different search term' : 'Check back later for new content'}
            </Text>
          </View>
        ) : (
          filteredItems.map(renderItem)
        )}
      </ScrollView>

      {/* Worksheet Modal */}
      <Modal
        visible={showWorksheetModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWorksheetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedWorksheet?.goal || 'Worksheet'}
              </Text>
              <TouchableOpacity onPress={() => setShowWorksheetModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {selectedWorksheet?.description && (
                <Text style={styles.worksheetDescription}>
                  {selectedWorksheet.description}
                </Text>
              )}
              {selectedWorksheet?.fields?.map((field, index) => (
                <View key={index} style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>
                    {/* The builder stores the label as `name`. */}
                    {field.name || field.label || field.question || `Question ${index + 1}`}
                    {field.required ? ' *' : ''}
                  </Text>
                  {/* Choice fields get tappable options; everything else a text box.
                      Rendering a text box for a dropdown asked the client to guess
                      the therapist's options. */}
                  {['select', 'radio', 'multiple-choice'].includes(field.type)
                    && Array.isArray(field.options) && field.options.length > 0 ? (
                    <View style={styles.optionWrap}>
                      {field.options.filter(Boolean).map((opt) => {
                        const multi = field.type === 'multiple-choice';
                        const current = worksheetResponses[index];
                        const picked = multi
                          ? String(current || '').split('|').filter(Boolean).includes(opt)
                          : current === opt;
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.optionChip, picked && styles.optionChipActive]}
                            onPress={() => setWorksheetResponses((prev) => {
                              if (!multi) return { ...prev, [index]: opt };
                              const set = String(prev[index] || '').split('|').filter(Boolean);
                              const next = set.includes(opt)
                                ? set.filter((v) => v !== opt)
                                : [...set, opt];
                              return { ...prev, [index]: next.join('|') };
                            })}
                          >
                            <Text style={[styles.optionChipText, picked && styles.optionChipTextActive]}>
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <TextInput
                      style={styles.fieldInput}
                      placeholder={field.type === 'number' ? 'Enter a number…' : 'Your answer...'}
                      placeholderTextColor={Colors.textSecondary}
                      value={worksheetResponses[index] || ''}
                      keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                      onChangeText={(text) => {
                        setWorksheetResponses(prev => ({ ...prev, [index]: text }));
                      }}
                      multiline={field.type === 'textarea'}
                      numberOfLines={field.type === 'textarea' ? 4 : 1}
                    />
                  )}
                </View>
              ))}
              {/* Once answered, the worksheet is read-only until the therapist
                  updates it (which reopens it server-side). Without this the
                  client could keep re-submitting the same sheet. */}
              {selectedWorksheet?.isCompleted ? (
                <View style={styles.completedNote}>
                  <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                  <Text style={styles.completedNoteText}>
                    You&apos;ve completed this worksheet. Your therapist will let you know
                    if anything needs updating.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.submitButton, isSubmittingWorksheet && styles.submitButtonDisabled]}
                  onPress={handleSubmitWorksheet}
                  disabled={isSubmittingWorksheet}
                >
                  {isSubmittingWorksheet ? (
                    <ActivityIndicator color={Colors.surface} />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit Worksheet</Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Resource Modal — shows the attachment itself: image, audio player,
          video, downloadable file or link, depending on the type the therapist
          chose. */}
      <Modal
        visible={showResourceModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowResourceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {selectedResource?.title || 'Resource'}
              </Text>
              <TouchableOpacity onPress={() => setShowResourceModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {selectedResource?.description ? (
                <Text style={styles.noteDescription}>{selectedResource.description}</Text>
              ) : null}

              <ResourceMedia resource={selectedResource} />

              {selectedResource?.content ? (
                <Text style={styles.noteContent}>{selectedResource.content}</Text>
              ) : null}

              {selectedResource ? (
                <TouchableOpacity
                  style={styles.resourceDownloadBtn}
                  disabled={downloadingId === selectedResource.id}
                  onPress={() => handleDownload(selectedResource)}
                >
                  {downloadingId === selectedResource.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.resourceDownloadText}>Download as PDF</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Note Modal */}
      <Modal
        visible={showNoteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNoteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedNote?.bookTitle || selectedNote?.title || 'Note'}
              </Text>
              <TouchableOpacity onPress={() => setShowNoteModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {selectedNote?.description && (
                <Text style={styles.noteDescription}>
                  {selectedNote.description}
                </Text>
              )}
              {selectedNote?.noteContent && (
                <Text style={styles.noteContent}>
                  {selectedNote.noteContent}
                </Text>
              )}
              {selectedNote?.chapters && (
                <Text style={styles.noteContent}>
                  {selectedNote.chapters}
                </Text>
              )}
              {selectedNote?.content && (
                <Text style={styles.noteContent}>
                  {selectedNote.content}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  categoriesContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  categoryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  categoryButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  categoryTextActive: {
    color: Colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  itemIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  itemDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  resourceDownloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, paddingVertical: 13, borderRadius: 10, backgroundColor: Colors.primary,
  },
  resourceDownloadText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  downloadBtn: {
    marginLeft: 10,
    padding: 4,
  },
  itemDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  completedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  newText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    width: '90%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  modalContent: {
    padding: 20,
  },
  worksheetDescription: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 20,
    lineHeight: 24,
  },
  completedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  completedNoteText: { flex: 1, fontSize: 13, color: '#15803d', fontWeight: '600', lineHeight: 18 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  optionChipActive: { borderColor: Colors.primary, backgroundColor: '#eef7f1' },
  optionChipText: { fontSize: 14, color: '#334155', fontWeight: '600' },
  optionChipTextActive: { color: Colors.primary },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  fieldInput: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  noteDescription: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 24,
  },
  noteContent: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
  },
});

export default ClientResourcesScreen;
