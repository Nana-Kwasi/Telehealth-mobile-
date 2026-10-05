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
  RefreshControl,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedClientData } from '../../services/clientDataService';
import { TherapyColors as Colors } from '../../constants/colors';

const ClientSupportScreen = ({ navigation }) => {
  const [recentSessions, setRecentSessions] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [emailingAdmin, setEmailingAdmin] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showIncidentDetails, setShowIncidentDetails] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [searchedIncident, setSearchedIncident] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [incidentSearch, setIncidentSearch] = useState('');
  
  const [rating, setRating] = useState(0);
  const [ratingTherapist, setRatingTherapist] = useState(0);
  const [ratingSystem, setRatingSystem] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  
  const [issueForm, setIssueForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    relatedSession: '',
    consentToShare: false
  });
  const [faqSearch, setFaqSearch] = useState('');

  const faqItems = [
    {
      question: 'How do I schedule a session?',
      answer: 'You can schedule a session by going to the Schedule or Video Calls screen and clicking the "+" button. Select a date and time that works for you, and your therapist will confirm the appointment.'
    },
    {
      question: 'Can I reschedule or cancel a session?',
      answer: 'Yes, you can reschedule or cancel sessions up to 24 hours before the scheduled time. Go to your Schedule screen and select the session you want to modify.'
    },
    {
      question: 'How do I contact my therapist?',
      answer: 'You can message your therapist directly through the Messages screen. Your therapist will respond as soon as possible during their working hours.'
    },
    {
      question: 'What if I have a technical issue?',
      answer: 'If you experience any technical issues, please report them using the "Report Issue" button on this screen. Our support team will help you resolve the problem.'
    },
    {
      question: 'How do I access my resources?',
      answer: 'All your assigned resources, worksheets, and notes are available in the Resources screen. You can search and filter them by category.'
    },
    {
      question: 'How do I update my payment information?',
      answer: 'You can update your payment methods and view billing history in the Billing screen under your dashboard menu.'
    },
    {
      question: 'What should I do in case of an emergency?',
      answer: 'If you are experiencing a mental health emergency, please call 112 (national emergency) or the Mental Health Authority helpline on 0509 405 480 immediately. This platform is not for emergency situations.'
    },
    {
      question: 'How do I change my password?',
      answer: 'Go to Settings > Security section and click "Change Password". You will need to enter your current password and then set a new one.'
    }
  ];

  useEffect(() => {
    fetchSupportData();
  }, []);

  const fetchSupportData = async () => {
    try {
      setIsLoading(true);
      const clientId = await AsyncStorage.getItem('th.clientId') || await AsyncStorage.getItem('th.userId');
      if (!clientId) return;

      try {
        const calls = await api(`/api/v1/scheduled-calls?clientId=${clientId}`);
        const sessions = (Array.isArray(calls) ? calls : [])
          .filter(s => s.status === 'completed')
          .sort((a, b) => new Date(b.scheduledTime || b.scheduledAt || b.startsAt || 0) - new Date(a.scheduledTime || a.scheduledAt || a.startsAt || 0))
          .slice(0, 5);
        setRecentSessions(sessions);
      } catch (error) { console.error('Error fetching sessions:', error); }

      try {
        const tickets = await api(`/api/v1/care/support/tickets?reporterId=${clientId}`);
        setSupportTickets((Array.isArray(tickets) ? tickets : []).slice(0, 10));
      } catch (error) { console.error('Error fetching support tickets:', error); }

      try {
        const incidents = await api(`/api/v1/therapist-reports?clientId=${clientId}`);
        setIncidents(Array.isArray(incidents) ? incidents : []);
      } catch (error) { console.error('Error fetching incidents:', error); }

    } catch (error) {
      console.error('Error fetching support data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRatingSubmit = async () => {
    if (!selectedSession || rating === 0) {
      Alert.alert('Error', 'Please provide a rating for the session.');
      return;
    }

    try {
      const uid = await AsyncStorage.getItem('th.userId');
      await api('/api/v1/session-ratings', {
        method: 'POST',
        body: {
          sessionId: selectedSession.id,
          clientId: uid,
          therapistId: selectedSession.therapistId,
          rating,
          therapistRating: ratingTherapist,
          systemRating: ratingSystem,
          comment: ratingComment,
          sessionDate: (selectedSession.scheduledTime || selectedSession.scheduledAt) ? new Date(selectedSession.scheduledTime || selectedSession.scheduledAt).toISOString().split('T')[0] : null,
        },
      });

      Alert.alert('Success', 'Thank you for your feedback!');
      setShowRatingModal(false);
      setRating(0);
      setRatingTherapist(0);
      setRatingSystem(0);
      setRatingComment('');
      setSelectedSession(null);
    } catch (error) {
      console.error('Error submitting rating:', error);
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    }
  };

  /**
   * Files the ticket AND emails the administrators now. Identity is read from
   * the auth token on the backend, so nothing identifying is sent from here.
   */
  const handleEmailAdmin = async () => {
    if (!issueForm.title || !issueForm.description) {
      Alert.alert('Required', 'Please add a subject and a description first.');
      return;
    }
    setEmailingAdmin(true);
    try {
      await api('/api/v1/support/contact-admin', {
        method: 'POST',
        body: {
          subject: issueForm.title,
          message: issueForm.description,
          category: 'client_support',
          priority: issueForm.severity || 'normal',
        },
      });
      Alert.alert('Sent', 'Your message has been emailed to our administrators. You will get a copy by email.');
      setShowIssueModal(false);
    } catch {
      Alert.alert('Error', 'Could not send the email. Please try again.');
    } finally {
      setEmailingAdmin(false);
    }
  };

  const handleIssueSubmit = async () => {
    if (!issueForm.title || !issueForm.description) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }

    try {
      const uid = await AsyncStorage.getItem('th.userId');
      await api('/api/v1/care/support/tickets', {
        method: 'POST',
        body: {
          reporterId: uid,
          subject: issueForm.title,
          description: issueForm.description,
          severity: issueForm.severity,
          relatedSessionId: issueForm.relatedSession || null,
          status: 'open',
        },
      });

      Alert.alert('Success', 'Support ticket created successfully! We will get back to you soon.');
      setShowIssueModal(false);
      setIssueForm({
        title: '',
        description: '',
        severity: 'medium',
        relatedSession: '',
        consentToShare: false
      });
      fetchSupportData();
    } catch (error) {
      console.error('Error creating support ticket:', error);
      Alert.alert('Error', 'Failed to create support ticket. Please try again.');
    }
  };

  const handleIncidentSearch = () => {
    if (!incidentSearch.trim()) {
      Alert.alert('Error', 'Please enter an incident ID to search.');
      return;
    }

    setIsSearching(true);
    const searchId = incidentSearch.trim();
    const foundIncident = incidents.find(incident => 
      incident.incidentId === searchId
    );
    
    if (foundIncident) {
      setSearchedIncident(foundIncident);
      setShowIncidentDetails(true);
      setIncidentSearch('');
    } else {
      Alert.alert('Not Found', `Incident ID "${searchId}" not found. Please check your incident ID and try again.`);
    }
    setIsSearching(false);
  };

  const formatSessionDate = (scheduledTime) => {
    const date = scheduledTime?.toDate ? scheduledTime.toDate() : new Date(scheduledTime);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatIncidentDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTicketStatusColor = (status) => {
    switch (status) {
      case 'open': return '#3B82F6';
      case 'in_progress': return '#F59E0B';
      case 'resolved': return '#10B981';
      case 'closed': return Colors.textSecondary;
      default: return Colors.textSecondary;
    }
  };

  const getIncidentStatusColor = (status) => {
    switch (status) {
      case 'submitted': return '#3B82F6';
      case 'seen': return '#F59E0B';
      case 'processing': return '#F97316';
      case 'completed': return '#10B981';
      default: return Colors.textSecondary;
    }
  };

  const filteredFAQ = faqItems.filter(item =>
    item.question.toLowerCase().includes(faqSearch.toLowerCase()) ||
    item.answer.toLowerCase().includes(faqSearch.toLowerCase())
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSupportData();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading support information...</Text>
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
        <Text style={styles.headerTitle}>Feedback & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Emergency & Crisis Section */}
        <View style={styles.crisisSection}>
          <View style={styles.crisisSectionHeader}>
            <Ionicons name="warning" size={22} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.crisisTitle}>Crisis & Emergency Support</Text>
              <Text style={styles.crisisSubtitle}>Immediate help is available 24/7</Text>
            </View>
          </View>
          {[
            { name: 'National Emergency — 112', desc: 'Police, ambulance & fire — 24/7', url: 'tel:112', color: '#8c322d' },
            { name: 'Mental Health Authority Helpline', desc: '0509 405 480 — 24/7 counselling', url: 'tel:+233509405480', color: '#7c3aed' },
            { name: 'Suicide Prevention (Ghana)', desc: '0244 846 701', url: 'tel:+233244846701', color: '#0ea5e9' },
            { name: 'National Ambulance — 193', desc: 'Ambulance dispatch', url: 'tel:193', color: '#ea580c' },
            { name: 'NAMI Helpline', desc: '1-800-950-6264', url: 'tel:18009506264', color: '#2f7d5f' },
          ].map((h, i) => (
            <TouchableOpacity key={i} style={styles.crisisHotlineRow} onPress={() => Linking.openURL(h.url)}>
              <View style={[styles.crisisHotlineDot, { backgroundColor: h.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.crisisHotlineName}>{h.name}</Text>
                <Text style={styles.crisisHotlineDesc}>{h.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ))}
          <Text style={styles.crisisSafetyNote}>This platform is not for emergencies. Call 112 if in danger.</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => {
              if (recentSessions.length > 0) {
                setSelectedSession(recentSessions[0]);
              }
              setShowRatingModal(true);
            }}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="star" size={32} color="#F59E0B" />
            </View>
            <Text style={styles.actionTitle}>Rate Session</Text>
            <Text style={styles.actionSubtitle}>Share your experience</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => setShowIssueModal(true)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EF444420' }]}>
              <Ionicons name="alert-circle" size={32} color="#EF4444" />
            </View>
            <Text style={styles.actionTitle}>Report Issue</Text>
            <Text style={styles.actionSubtitle}>Get technical help</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => setShowFAQ(true)}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#3B82F620' }]}>
              <Ionicons name="help-circle" size={32} color="#3B82F6" />
            </View>
            <Text style={styles.actionTitle}>FAQ</Text>
            <Text style={styles.actionSubtitle}>Common questions</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
            {recentSessions.slice(0, 3).map((session) => (
              <View key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionTherapist}>
                    Session with {session.therapistName || 'Therapist'}
                  </Text>
                  <Text style={styles.sessionDate}>
                    {formatSessionDate(session.scheduledTime)}
                  </Text>
                  <Text style={styles.sessionDuration}>
                    {session.duration || 30} minutes
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.rateButton}
                  onPress={() => {
                    setSelectedSession(session);
                    setShowRatingModal(true);
                  }}
                >
                  <Ionicons name="star" size={16} color={Colors.surface} />
                  <Text style={styles.rateButtonText}>Rate</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Support Tickets */}
        {supportTickets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Support Tickets</Text>
            {supportTickets.map((ticket) => (
              <View key={ticket.id} style={styles.ticketCard}>
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketTitle}>{ticket.title}</Text>
                  <View style={[
                    styles.ticketStatus,
                    { backgroundColor: `${getTicketStatusColor(ticket.status)}20` }
                  ]}>
                    <Text style={[
                      styles.ticketStatusText,
                      { color: getTicketStatusColor(ticket.status) }
                    ]}>
                      {ticket.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.ticketDescription} numberOfLines={2}>
                  {ticket.description}
                </Text>
                <Text style={styles.ticketDate}>
                  {formatIncidentDate(ticket.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Incident Tracking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incident Tracking</Text>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter incident ID to track status..."
              placeholderTextColor={Colors.textSecondary}
              value={incidentSearch}
              onChangeText={setIncidentSearch}
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleIncidentSearch}
              disabled={isSearching || !incidentSearch.trim()}
            >
              {isSearching ? (
                <ActivityIndicator size="small" color={Colors.surface} />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {incidents.length > 0 && (
            <View style={styles.incidentsList}>
              {incidents.map((incident) => (
                <View key={incident.id} style={styles.incidentCard}>
                  <View style={styles.incidentHeader}>
                    <Text style={styles.incidentId}>{incident.incidentId}</Text>
                    <View style={[
                      styles.incidentStatus,
                      { backgroundColor: `${getIncidentStatusColor(incident.status)}20` }
                    ]}>
                      <Text style={[
                        styles.incidentStatusText,
                        { color: getIncidentStatusColor(incident.status) }
                      ]}>
                        {incident.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.incidentType}>
                    {incident.incidentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Text style={styles.incidentDate}>
                    {formatIncidentDate(incident.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRatingModal(false)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rate Session</Text>
              <TouchableOpacity onPress={() => setShowRatingModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <Text style={styles.ratingLabel}>Overall Session Rating *</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                  >
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={32}
                      color={star <= rating ? '#F59E0B' : Colors.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.ratingLabel}>Therapist Rating</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRatingTherapist(star)}
                  >
                    <Ionicons
                      name={star <= ratingTherapist ? 'star' : 'star-outline'}
                      size={32}
                      color={star <= ratingTherapist ? '#F59E0B' : Colors.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.ratingLabel}>System Rating</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRatingSystem(star)}
                  >
                    <Ionicons
                      name={star <= ratingSystem ? 'star' : 'star-outline'}
                      size={32}
                      color={star <= ratingSystem ? '#F59E0B' : Colors.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.ratingLabel}>Comments (optional)</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Share your feedback..."
                placeholderTextColor={Colors.textSecondary}
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity
                style={[styles.submitButton, rating === 0 && styles.submitButtonDisabled]}
                onPress={handleRatingSubmit}
                disabled={rating === 0}
              >
                <Text style={styles.submitButtonText}>Submit Rating</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Issue Modal */}
      <Modal
        visible={showIssueModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowIssueModal(false)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Issue</Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Brief description of the issue"
                  placeholderTextColor={Colors.textSecondary}
                  value={issueForm.title}
                  onChangeText={(text) => setIssueForm({...issueForm, title: text})}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe the issue in detail..."
                  placeholderTextColor={Colors.textSecondary}
                  value={issueForm.description}
                  onChangeText={(text) => setIssueForm({...issueForm, description: text})}
                  multiline
                  numberOfLines={6}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Severity</Text>
                <View style={styles.severityContainer}>
                  {['low', 'medium', 'high'].map(severity => (
                    <TouchableOpacity
                      key={severity}
                      style={[
                        styles.severityButton,
                        issueForm.severity === severity && styles.severityButtonActive
                      ]}
                      onPress={() => setIssueForm({...issueForm, severity})}
                    >
                      <Text style={[
                        styles.severityButtonText,
                        issueForm.severity === severity && styles.severityButtonTextActive
                      ]}>
                        {severity.charAt(0).toUpperCase() + severity.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitButton, (!issueForm.title || !issueForm.description) && styles.submitButtonDisabled]}
                onPress={handleIssueSubmit}
                disabled={!issueForm.title || !issueForm.description}
              >
                <Text style={styles.submitButtonText}>Submit Ticket</Text>
              </TouchableOpacity>

              {/* Second route to the same people, for anyone who would rather
                  reach a person than wait on a queue. */}
              <TouchableOpacity
                style={[styles.emailAdminButton, (emailingAdmin || !issueForm.title || !issueForm.description) && { opacity: 0.6 }]}
                onPress={handleEmailAdmin}
                disabled={emailingAdmin || !issueForm.title || !issueForm.description}
              >
                <Text style={styles.emailAdminButtonText}>
                  {emailingAdmin ? 'Sending…' : 'Email an Administrator'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* FAQ Modal */}
      <Modal
        visible={showFAQ}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFAQ(false)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Frequently Asked Questions</Text>
              <TouchableOpacity onPress={() => setShowFAQ(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search FAQ..."
                placeholderTextColor={Colors.textSecondary}
                value={faqSearch}
                onChangeText={setFaqSearch}
              />
            </View>
            <ScrollView style={styles.modalContent}>
              {filteredFAQ.map((item, index) => (
                <View key={index} style={styles.faqItem}>
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  <Text style={styles.faqAnswer}>{item.answer}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Incident Details Modal */}
      <Modal
        visible={showIncidentDetails}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowIncidentDetails(false)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Incident Details</Text>
              <TouchableOpacity onPress={() => setShowIncidentDetails(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {searchedIncident && (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Incident ID:</Text>
                    <Text style={styles.detailValue}>{searchedIncident.incidentId}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type:</Text>
                    <Text style={styles.detailValue}>
                      {searchedIncident.incidentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <Text style={[styles.detailValue, { color: getIncidentStatusColor(searchedIncident.status) }]}>
                      {searchedIncident.status?.charAt(0).toUpperCase() + searchedIncident.status?.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date Created:</Text>
                    <Text style={styles.detailValue}>
                      {formatIncidentDate(searchedIncident.createdAt)}
                    </Text>
                  </View>
                  {searchedIncident.description && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Description:</Text>
                      <Text style={styles.detailValue}>{searchedIncident.description}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  sessionInfo: {
    flex: 1,
  },
  sessionTherapist: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  sessionDate: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  sessionDuration: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 6,
  },
  rateButtonText: {
    color: Colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  ticketCard: {
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
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 12,
  },
  ticketStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ticketStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ticketDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  ticketDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  searchButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  searchButtonText: {
    color: Colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  incidentsList: {
    gap: 12,
  },
  incidentCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  incidentId: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  incidentStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  incidentStatusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  incidentType: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  incidentDate: {
    fontSize: 12,
    color: Colors.textSecondary,
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
  },
  modalContent: {
    padding: 20,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  commentInput: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  severityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    padding: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  severityButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  severityButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  severityButtonTextActive: {
    color: Colors.surface,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  emailAdminButton: {
    marginTop: 10, paddingVertical: 14, borderRadius: 999, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#bfdbfe', backgroundColor: 'rgba(207,169,97,0.12)',
  },
  emailAdminButtonText: { fontSize: 15, fontWeight: '700', color: '#2f5d7d' },
  submitButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  faqItem: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  faqQuestion: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  faqAnswer: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: Colors.text,
  },
  // Crisis section
  crisisSection: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  crisisSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  crisisTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8c322d',
    marginBottom: 2,
  },
  crisisSubtitle: {
    fontSize: 13,
    color: '#0d0d0d',
  },
  crisisHotlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    gap: 10,
  },
  crisisHotlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  crisisHotlineName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0d0d0d',
  },
  crisisHotlineDesc: {
    fontSize: 12,
    color: '#0d0d0d',
    marginTop: 2,
  },
  crisisSafetyNote: {
    fontSize: 12,
    color: '#0d0d0d',
    fontStyle: 'italic',
    marginTop: 8,
  },
});

export default ClientSupportScreen;
