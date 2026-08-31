import '../../../core/network/supabase_api.dart';
import '../../../core/models/models.dart';
import '../domain/admin_repository.dart';

/// Admin repository — thin pass-through to the shared Supabase API layer.
class AdminRepositoryImpl implements AdminRepository {
  @override
  Future<bool> isAdmin(String userId) => SupabaseApi.isAdmin(userId);

  @override
  Future<List<AdminReport>> getReports({String status = 'pending'}) =>
      SupabaseApi.fetchAdminReports(status: status);

  @override
  Future<void> resolveReport(AdminReport report, String status) =>
      SupabaseApi.resolveReport(report, status);

  @override
  Future<List<FlaggedListingGroup>> getFlagged() =>
      SupabaseApi.fetchFlaggedListings();

  @override
  Future<void> dismissReports(List<String> ids) =>
      SupabaseApi.dismissReports(ids);

  @override
  Future<List<AdminVerificationDoc>> getVerificationQueue() =>
      SupabaseApi.fetchVerificationQueue();

  @override
  Future<List<VerificationDecision>> getVerificationDecisions() =>
      SupabaseApi.fetchVerificationDecisions();

  @override
  Future<void> decideDocument(String documentId, String action, {String? reason}) =>
      SupabaseApi.decideDocument(documentId, action, reason: reason);

  @override
  Future<List<AdminUser>> getUsers() => SupabaseApi.fetchAdminUsers();

  @override
  Future<void> revokeSessions(String userId) => SupabaseApi.revokeSessions(userId);

  @override
  Future<void> banUser(String userId, int hours, {String? reason}) =>
      SupabaseApi.banUser(userId, hours, reason: reason);

  @override
  Future<void> unbanUser(String userId) => SupabaseApi.unbanUser(userId);

  @override
  Future<String?> setUserEmail(String userId, String newEmail, {String? reason}) =>
      SupabaseApi.setUserEmail(userId, newEmail, reason: reason);

  @override
  Future<List<AdminCategory>> getCategories() => SupabaseApi.fetchAdminCategories();

  @override
  Future<void> createCategory(String name, {String? parentId, String? icon}) =>
      SupabaseApi.createCategory(name, parentId: parentId, icon: icon);

  @override
  Future<void> renameCategory(String id, String name, {String? icon}) =>
      SupabaseApi.renameCategory(id, name, icon: icon);

  @override
  Future<void> moveCategory(String id, String direction) =>
      SupabaseApi.moveCategory(id, direction);

  @override
  Future<Map<String, int>> getCategoryCounts() => SupabaseApi.fetchAdminCategoryCounts();

  @override
  Future<void> deleteCategory(String id) => SupabaseApi.deleteCategory(id);

  @override
  Future<List<AdminAttribute>> getAttributes() => SupabaseApi.fetchAdminAttributes();

  @override
  Future<void> createAttribute({
    required String name,
    String? nameAm,
    required String type,
    String? unit,
    bool isFilterable = true,
  }) =>
      SupabaseApi.createAttribute(
        name: name,
        nameAm: nameAm,
        type: type,
        unit: unit,
        isFilterable: isFilterable,
      );

  @override
  Future<void> updateAttribute(String id, {String? name, String? nameAm, String? unit}) =>
      SupabaseApi.updateAttribute(id, name: name, nameAm: nameAm, unit: unit);

  @override
  Future<void> toggleAttributeFlag(String id, String flag) =>
      SupabaseApi.toggleAttributeFlag(id, flag);

  @override
  Future<List<AdminAttributeOption>> getAttributeOptions(String attributeId) =>
      SupabaseApi.fetchAttributeOptions(attributeId);

  @override
  Future<void> createAttributeOption(
    String attributeId, {
    required String value,
    required String label,
    String? labelAm,
  }) =>
      SupabaseApi.createAttributeOption(attributeId, value: value, label: label, labelAm: labelAm);

  @override
  Future<void> toggleAttributeOption(String id) => SupabaseApi.toggleAttributeOption(id);

  @override
  Future<List<AdminCategoryAttributeDef>> getCategoryAttributeSet(String categoryId) =>
      SupabaseApi.fetchCategoryAttributeSet(categoryId);

  @override
  Future<void> attachCategoryAttribute(String categoryId, String attributeId) =>
      SupabaseApi.attachCategoryAttribute(categoryId, attributeId);

  @override
  Future<void> detachCategoryAttribute(String categoryId, String attributeId) =>
      SupabaseApi.detachCategoryAttribute(categoryId, attributeId);

  @override
  Future<void> setCategoryAttributeFlag(String categoryId, String attributeId, String flag) =>
      SupabaseApi.setCategoryAttributeFlag(categoryId, attributeId, flag);

  @override
  Future<List<AdminListing>> getListings() => SupabaseApi.fetchAdminListings();

  @override
  Future<List<AdminListing>> getFeaturedListings() => SupabaseApi.fetchAdminFeaturedListings();

  @override
  Future<void> setFeaturedUntil(String id, DateTime? until) =>
      SupabaseApi.setFeaturedUntil(id, until);

  @override
  Future<void> expireFeatured(String id) => SupabaseApi.expireFeatured(id);

  @override
  Future<void> toggleFeatured(String id, bool featured) =>
      SupabaseApi.toggleFeatured(id, featured);

  @override
  Future<void> deleteListing(String id) => SupabaseApi.deleteListingAdmin(id);

  @override
  Future<AdminStats> getStats() => SupabaseApi.fetchAdminStats();

  @override
  Future<List<TrendDay>> getTrend(int days) => SupabaseApi.fetchAdminTrend(days);

  @override
  Future<List<CategoryCount>> getTopCategories() => SupabaseApi.fetchAdminTopCategories();

  @override
  Future<List<CategoryCount>> getTopSearches() => SupabaseApi.fetchAdminTopSearches();

  @override
  Future<String?> signedDocumentUrl(String path) => SupabaseApi.signedDocumentUrl(path);

  @override
  Future<Set<String>> getScopes(String userId) => SupabaseApi.fetchAdminScopes(userId);

  @override
  Future<AdminActionCounts> getActionCounts() => SupabaseApi.fetchAdminActionCounts();

  @override
  Future<HealthStats> getHealthStats() => SupabaseApi.fetchAdminHealthStats();

  @override
  Future<List<CategoryPerformance>> getCategoryPerformance() =>
      SupabaseApi.fetchAdminCategoryPerformance();

  @override
  Future<List<SellerPerformanceRow>> getSellerPerformance() =>
      SupabaseApi.fetchAdminSellerPerformance();

  @override
  Future<List<AuditLogEntry>> getAuditLog() => SupabaseApi.fetchAdminAuditLog();

  @override
  Future<List<AdminDispute>> getDisputes() => SupabaseApi.fetchAdminDisputes();

  @override
  Future<void> resolveDispute(String id, String status, {String? resolution}) =>
      SupabaseApi.resolveDispute(id, status, resolution: resolution);

  @override
  Future<void> logAdminAction({
    required String action,
    required String entityType,
    String? entityId,
    Object? oldValue,
    Object? newValue,
    String? reason,
  }) =>
      SupabaseApi.logAdminAction(
        action: action,
        entityType: entityType,
        entityId: entityId,
        oldValue: oldValue,
        newValue: newValue,
        reason: reason,
      );

  @override
  Future<List<AcquisitionRow>> getAcquisition(int rangeDays) =>
      SupabaseApi.fetchAcquisitionRows(rangeDays);

  @override
  Future<List<TelegramPost>> getTelegramPosts() => SupabaseApi.fetchTelegramPosts();

  @override
  Future<SystemHealth> getSystemHealth() => SupabaseApi.fetchSystemHealth();

  @override
  Future<Map<String, Object>> getSettings() => SupabaseApi.fetchAppSettings();

  @override
  Future<void> setSetting(String key, Object value) =>
      SupabaseApi.setAppSetting(key, value);

  @override
  Future<String?> requestRoleChange({
    required String targetUserId,
    required String role,
    required String action,
  }) =>
      SupabaseApi.requestRoleChange(
        targetUserId: targetUserId,
        role: role,
        action: action,
      );

  @override
  Future<String?> confirmRoleChange(String code) =>
      SupabaseApi.confirmRoleChange(code);
}