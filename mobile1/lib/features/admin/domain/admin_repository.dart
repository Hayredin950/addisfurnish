import '../../../core/models/models.dart';

/// Contract for the admin moderation console (mirrors `mobile1/src/lib/admin.ts`).
///
/// Every call is re-verified as admin server-side via RLS + SECURITY DEFINER
/// RPCs — the UI is only the trigger.
abstract class AdminRepository {
  Future<bool> isAdmin(String userId);

  Future<List<AdminReport>> getReports({String status = 'pending'});

  Future<void> resolveReport(AdminReport report, String status);

  Future<List<FlaggedListingGroup>> getFlagged();

  Future<void> dismissReports(List<String> ids);

  Future<List<AdminVerificationDoc>> getVerificationQueue();

  Future<List<VerificationDecision>> getVerificationDecisions();

  Future<void> decideDocument(
    String documentId,
    String action, {
    String? reason,
  });

  Future<List<AdminUser>> getUsers();

  Future<void> revokeSessions(String userId);

  Future<void> banUser(String userId, int hours, {String? reason});

  Future<void> unbanUser(String userId);

  Future<List<AdminCategory>> getCategories();

  Future<void> createCategory(String name, {String? parentId, String? icon});

  Future<void> renameCategory(String id, String name, {String? icon});

  Future<void> moveCategory(String id, String direction);

  Future<Map<String, int>> getCategoryCounts();

  Future<void> deleteCategory(String id);

  Future<List<AdminListing>> getListings();

  Future<void> toggleFeatured(String id, bool featured);

  Future<void> deleteListing(String id);

  Future<AdminStats> getStats();

  Future<List<TrendDay>> getTrend(int days);

  Future<List<CategoryCount>> getTopCategories();

  Future<List<CategoryCount>> getTopSearches();

  Future<String?> signedDocumentUrl(String path);

  /// Extended panel (web /admin parity).

  Future<Set<String>> getScopes(String userId);

  Future<AdminActionCounts> getActionCounts();

  Future<HealthStats> getHealthStats();

  Future<List<CategoryPerformance>> getCategoryPerformance();

  Future<List<SellerPerformanceRow>> getSellerPerformance();

  Future<List<AuditLogEntry>> getAuditLog();

  Future<List<AdminDispute>> getDisputes();

  Future<void> resolveDispute(String id, String status, {String? resolution});

  Future<void> logAdminAction({
    required String action,
    required String entityType,
    String? entityId,
    Object? oldValue,
    Object? newValue,
    String? reason,
  });

  Future<List<AcquisitionRow>> getAcquisition(int rangeDays);

  Future<List<TelegramPost>> getTelegramPosts();

  /// Settings tab (web /admin Settings parity).

  Future<SystemHealth> getSystemHealth();

  Future<Map<String, Object>> getSettings();

  Future<void> setSetting(String key, Object value);

  Future<String?> requestRoleChange({
    required String targetUserId,
    required String role,
    required String action,
  });

  Future<String?> confirmRoleChange(String code);
}