import '../../../core/network/supabase_api.dart';
import '../../../core/models/models.dart';
import '../domain/admin_repository.dart';

/// Admin repository — thin pass-through to the shared Supabase API layer.
class AdminRepositoryImpl implements AdminRepository {
  @override
  Future<bool> isAdmin(String userId) => SupabaseApi.isAdmin(userId);

  @override
  Future<List<AdminReport>> getReports() => SupabaseApi.fetchAdminReports();

  @override
  Future<void> resolveReport(AdminReport report, String status) =>
      SupabaseApi.resolveReport(report, status);

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
  Future<List<AdminListing>> getListings() => SupabaseApi.fetchAdminListings();

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
}