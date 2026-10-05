import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedClientData } from '../../services/clientDataService';
import { TherapyColors as Colors } from '../../constants/colors';
import BillingAssistantCard from '../../components/BillingAssistantCard';

const ClientBillingScreen = ({ navigation }) => {
  const [billingHistory, setBillingHistory] = useState([]);
  const [clientData, setClientData] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'paid', label: 'Paid' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' }
  ];

  const dateOptions = [
    { value: 'all', label: 'All Time' },
    { value: '30', label: 'Last 30 Days' },
    { value: '90', label: 'Last 90 Days' },
    { value: '365', label: 'Last Year' }
  ];

  useEffect(() => {
    fetchBillingData();
  }, []);

  useEffect(() => {
    filterBillingHistory();
  }, [billingHistory, searchTerm, statusFilter, dateFilter]);

  const fetchBillingData = async () => {
    try {
      setIsLoading(true);
      const userId = await AsyncStorage.getItem('th.userId');
      if (!userId) return;
      const clientId = await AsyncStorage.getItem('th.clientId') || userId;

      let client = getCachedClientData();
      if (!client) {
        client = await api(`/api/v1/patients/${clientId}`).catch(() => null);
      }
      setClientData(client);

      try {
        // Two separate systems hold money information, and this screen read
        // only the first:
        //
        //   /billing/invoices          — issued invoices (often none)
        //   /clients/{id}/billing-records — what the client ACTUALLY PAID
        //
        // Every Paystack charge lands in the second one, so a client who had
        // just paid GHS 2,000 saw an empty billing screen. Merge both, newest
        // first, and normalise the record shape onto the invoice shape the
        // list already renders.
        const [invoices, records] = await Promise.all([
          api(`/api/v1/billing/invoices?patientId=${clientId}`).catch(() => []),
          api(`/api/v1/clients/${clientId}/billing-records`).catch(() => []),
        ]);

        const asInvoice = (r) => ({
          id: r.id,
          amount: (Number(r.amountCents) || 0) / 100,
          currency: r.currency || 'GHS',
          status: r.status || 'paid',
          description: r.description || 'Payment',
          createdAt: r.createdAt,
          source: 'payment',
        });

        const history = [
          ...(Array.isArray(invoices) ? invoices : []),
          ...(Array.isArray(records) ? records.map(asInvoice) : []),
        ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        setBillingHistory(history);
        setFilteredHistory(history);
      } catch (error) {
        console.error('Error fetching billing history:', error);
      }

      try {
        const methods = await api(`/api/v1/billing-profile/payment-methods?userId=${userId}`);
        setPaymentMethods(Array.isArray(methods) ? methods : []);
      } catch (error) {
        console.error('Error fetching payment methods:', error);
      }

      try {
        const subs = await api(`/api/v1/billing-profile/subscriptions?userId=${userId}`);
        const list = (Array.isArray(subs) ? subs : [])
          .filter(s => ['active', 'pending', 'cancelled'].includes(s.status))
          .sort((a, b) => new Date(b.startedAt || b.createdAt || 0) - new Date(a.startedAt || a.createdAt || 0));
        if (list.length > 0) setSubscription(list[0]);
      } catch (error) {
        console.error('Error fetching subscription:', error);
      }

    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterBillingHistory = () => {
    let filtered = billingHistory;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.amount?.toString().includes(searchTerm)
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    // Filter by date
    if (dateFilter !== 'all') {
      const days = parseInt(dateFilter);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      filtered = filtered.filter(item => {
        const itemDate = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return itemDate >= cutoffDate;
      });
    }

    setFilteredHistory(filtered);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'failed': return 'alert-circle';
      case 'refunded': return 'arrow-down-circle';
      default: return 'alert-circle';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid': return '#10B981';
      case 'pending': return '#F59E0B';
      case 'failed': return '#EF4444';
      case 'refunded': return '#3B82F6';
      default: return Colors.textSecondary;
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getTotalAmount = () => {
    return filteredHistory.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const getOutstandingBalance = () => {
    return filteredHistory
      .filter(item => item.status === 'pending' || item.status === 'failed')
      .reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const downloadInvoice = (invoice) => {
    Alert.alert('Download Invoice', `Invoice ${invoice.invoiceNumber} download functionality will be implemented.`);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBillingData();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading billing information...</Text>
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
        <Text style={styles.headerTitle}>Billing & Payments</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Invoices, insurance verification and claims. */}
        <BillingAssistantCard accent={Colors.primary} />

        {/* Billing Summary */}
        <View style={styles.summaryCards}>
          <View style={styles.summaryCard}>
            <View style={[styles.cardIcon, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="cash" size={24} color="#10B981" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Total Paid</Text>
              <Text style={styles.cardAmount}>{formatCurrency(getTotalAmount())}</Text>
            </View>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={[styles.cardIcon, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="alert-circle" size={24} color="#F59E0B" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Outstanding</Text>
              <Text style={[styles.cardAmount, styles.outstandingAmount]}>
                {formatCurrency(getOutstandingBalance())}
              </Text>
            </View>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={[styles.cardIcon, { backgroundColor: '#3B82F620' }]}>
              <Ionicons name="card" size={24} color="#3B82F6" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Payment Methods</Text>
              <Text style={styles.cardCount}>{paymentMethods.length} active</Text>
            </View>
          </View>
        </View>

        {/* Current Subscription */}
        {subscription && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Subscription</Text>
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionInfo}>
                <Text style={styles.subscriptionPlan}>
                  {subscription.planName || 'Standard Plan'}
                </Text>
                <Text style={styles.subscriptionPrice}>
                  {formatCurrency(subscription.amount)} / {subscription.billingCycle || 'month'}
                </Text>
                <View style={[
                  styles.subscriptionStatus,
                  { backgroundColor: `${getStatusColor(subscription.status)}20` }
                ]}>
                  <Ionicons
                    name={getStatusIcon(subscription.status)}
                    size={16}
                    color={getStatusColor(subscription.status)}
                  />
                  <Text style={[styles.statusText, { color: getStatusColor(subscription.status) }]}>
                    {subscription.status}
                  </Text>
                </View>
              </View>
              <View style={styles.subscriptionActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="eye-outline" size={16} color={Colors.primary} />
                  <Text style={styles.actionButtonText}>View Details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.primaryActionButton]}>
                  <Ionicons name="card-outline" size={16} color={Colors.surface} />
                  <Text style={[styles.actionButtonText, styles.primaryActionButtonText]}>
                    Update Payment
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Payment Methods */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Methods</Text>
          {paymentMethods.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No payment methods</Text>
              <Text style={styles.emptySubtext}>
                Add a payment method to manage your subscription
              </Text>
              <TouchableOpacity style={styles.addButton}>
                <Ionicons name="add-circle" size={20} color={Colors.surface} />
                <Text style={styles.addButtonText}>Add Payment Method</Text>
              </TouchableOpacity>
            </View>
          ) : (
            paymentMethods.map((method) => (
              <View key={method.id} style={styles.paymentMethodCard}>
                <View style={styles.methodIcon}>
                  <Ionicons name="card" size={24} color={Colors.primary} />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodTitle}>
                    {method.cardType} ending in {method.lastFour}
                  </Text>
                  <Text style={styles.methodExpiry}>
                    Expires {method.expiryMonth}/{method.expiryYear}
                  </Text>
                  {method.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
                <View style={styles.methodActions}>
                  <TouchableOpacity style={styles.editButton}>
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeButton}>
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Billing History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billing History</Text>
          
          {/* Filters */}
          <View style={styles.filtersContainer}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search invoices..."
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
            <View style={styles.filterRow}>
              <View style={styles.filterSelect}>
                <Text style={styles.filterLabel}>Status:</Text>
                {statusOptions.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.filterChip,
                      statusFilter === option.value && styles.filterChipActive
                    ]}
                    onPress={() => setStatusFilter(option.value)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      statusFilter === option.value && styles.filterChipTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Date Range:</Text>
              {dateOptions.map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.filterChip,
                    dateFilter === option.value && styles.filterChipActive
                  ]}
                  onPress={() => setDateFilter(option.value)}
                >
                  <Text style={[
                    styles.filterChipText,
                    dateFilter === option.value && styles.filterChipTextActive
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Billing History List */}
          {filteredHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>No billing history found</Text>
              <Text style={styles.emptySubtext}>
                {searchTerm || statusFilter !== 'all' || dateFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No invoices or payments yet'
                }
              </Text>
            </View>
          ) : (
            filteredHistory.map((item) => (
              <View key={item.id} style={styles.billingItem}>
                <View style={styles.billingItemHeader}>
                  <View style={styles.billingItemInfo}>
                    <Text style={styles.invoiceNumber}>
                      {item.invoiceNumber || `Invoice #${item.id.slice(0, 8)}`}
                    </Text>
                    <Text style={styles.billingDescription} numberOfLines={2}>
                      {item.description || 'Payment'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
                    <Ionicons
                      name={getStatusIcon(item.status)}
                      size={16}
                      color={getStatusColor(item.status)}
                    />
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.billingItemFooter}>
                  <Text style={styles.billingDate}>{formatDate(item.createdAt)}</Text>
                  <Text style={styles.billingAmount}>{formatCurrency(item.amount)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={() => downloadInvoice(item)}
                >
                  <Ionicons name="download-outline" size={16} color={Colors.primary} />
                  <Text style={styles.downloadButtonText}>Download Invoice</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  summaryCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    minWidth: '48%',
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  cardAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  outstandingAmount: {
    color: '#734e12',
  },
  cardCount: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
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
  subscriptionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  subscriptionInfo: {
    marginBottom: 16,
  },
  subscriptionPlan: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  subscriptionPrice: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  subscriptionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  subscriptionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  primaryActionButton: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  primaryActionButtonText: {
    color: Colors.surface,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: Colors.surface,
    borderRadius: 16,
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
    marginBottom: 24,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    gap: 8,
  },
  addButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  paymentMethodCard: {
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
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  methodExpiry: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  defaultBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.surface,
    textTransform: 'uppercase',
  },
  methodActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.error,
  },
  filtersContainer: {
    marginBottom: 16,
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
    marginBottom: 12,
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
  // Referenced from the JSX but never defined, so this row laid its label and
  // chips out in a column. Undefined styles fail silently in RN — nothing warns.
  filterSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginRight: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  filterChipTextActive: {
    color: Colors.surface,
  },
  billingItem: {
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
  billingItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  billingItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  billingDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  billingItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billingDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  billingAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: 6,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
});

export default ClientBillingScreen;
