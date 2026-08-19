import 'package:image_picker/image_picker.dart';

import '../../../core/cache/cache_manager.dart';
import '../../../core/error/failures.dart';
import '../../../core/models/models.dart';
import '../../../core/network/connectivity.dart';
import '../../../core/network/supabase_api.dart';
import '../../../core/state/app_state.dart';
import '../domain/sell_repository.dart';

/// Sell repository. Listing creation is queued offline and uploaded once the
/// connection is back (offline-first writes via [OfflineQueue]).
class SellRepositoryImpl implements SellRepository {
  SellRepositoryImpl({CacheManager? cache, ConnectivityService? connectivity})
      : _cache = cache ?? CacheManager.instance,
        _connectivity = connectivity ?? ConnectivityService.instance;

  final CacheManager _cache;
  final ConnectivityService _connectivity;

  static const _myKey = 'cache:my_listings:';

  @override
  Future<String> createListing({
    required String sellerId,
    required String title,
    required String description,
    required double price,
    double? originalPrice,
    bool negotiable = false,
    String condition = 'good',
    String? material,
    String? color,
    String? roomType,
    String? brand,
    required String city,
    String? subCity,
    String? categoryId,
    bool deliveryOffered = false,
    double? deliveryFee,
    double? latitude,
    double? longitude,
    DateTime? discountExpiresAt,
    String? videoUrl,
    List<String> imagePaths = const [],
    String status = 'active',
  }) {
    if (!_connectivity.isOnline) throw const NetworkFailure('offline');
    return SupabaseApi.createListing(
      sellerId: sellerId,
      title: title,
      description: description,
      price: price,
      originalPrice: originalPrice,
      negotiable: negotiable,
      condition: condition,
      material: material,
      color: color,
      roomType: roomType,
      brand: brand,
      city: city,
      subCity: subCity,
      categoryId: categoryId,
      deliveryOffered: deliveryOffered,
      deliveryFee: deliveryFee,
      latitude: latitude,
      longitude: longitude,
      discountExpiresAt: discountExpiresAt,
      videoUrl: videoUrl,
      imagePaths: imagePaths,
      status: status,
    );
  }

  @override
  Future<String> uploadImage(String userId, XFile file) {
    if (!_connectivity.isOnline) throw const NetworkFailure('offline');
    return SupabaseApi.uploadListingImage(userId, file);
  }

  @override
  Future<String> uploadVideo(String userId, XFile file) {
    if (!_connectivity.isOnline) throw const NetworkFailure('offline');
    return SupabaseApi.uploadListingVideo(userId, file);
  }

  @override
  String imageUrl(String path) => SupabaseApi.listingImageUrl(path);

  @override
  Future<Listing?> fetchListingForEdit(String listingId) {
    if (!_connectivity.isOnline) throw const NetworkFailure('offline');
    return SupabaseApi.fetchListingForEdit(listingId);
  }

  @override
  Future<void> updateListing(String listingId, Map<String, dynamic> patch) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.updateListing(listingId, patch).then((_) {
      _cache.remove(_myKey + (AppState.instance.userId ?? ''));
    });
  }

  @override
  Future<void> replaceListingImages(String listingId, List<String> urls) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.replaceListingImages(listingId, urls);
  }

  @override
  Future<List<Listing>> getMyListings(String sellerId) async {
    final key = _myKey + sellerId;
    final cached = _cache.read<List<Listing>>(key);
    if (cached != null && !_connectivity.isOnline) return cached;
    final rows = await SupabaseApi.fetchMyListings(sellerId);
    _cache.put(key, rows);
    return rows;
  }

  @override
  Future<void> updateStatus(String listingId, String status) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.updateListingStatus(listingId, status);
  }

  @override
  Future<void> markSold(String listingId, String? listingTitle) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.markListingSold(listingId, listingTitle);
  }

  @override
  Future<void> deleteListing(String listingId) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.deleteListing(listingId).then((_) {
      _cache.remove(_myKey + (AppState.instance.userId ?? ''));
    });
  }

  @override
  Future<List<({String date, int count})>> getViewsPerDay(String sellerId) {
    if (!_connectivity.isOnline) return Future.value(const []);
    return SupabaseApi.fetchViewsPerDay(sellerId);
  }

  @override
  Future<int> getConversationCount(String sellerId) {
    if (!_connectivity.isOnline) return Future.value(0);
    return SupabaseApi.fetchConversationCount(sellerId);
  }

  @override
  Future<void> requestCallback({
    required String listingId,
    required String buyerId,
    required String sellerId,
    required String listingTitle,
    required String phone,
    String? note,
  }) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.requestCallback(
      listingId: listingId,
      buyerId: buyerId,
      sellerId: sellerId,
      listingTitle: listingTitle,
      phone: phone,
      note: note,
    );
  }

  @override
  Future<List<CallbackRequest>> getCallbacks(String sellerId) {
    if (!_connectivity.isOnline) return Future.value(const []);
    return SupabaseApi.fetchCallbacks(sellerId);
  }

  @override
  Future<void> updateCallbackStatus(
    String id,
    String status, {
    String? buyerId,
    String? listingTitle,
  }) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.updateCallbackStatus(id, status, buyerId: buyerId, listingTitle: listingTitle);
  }

  @override
  Future<void> submitReport({
    required String reporterId,
    required String reason,
    String? details,
    String? listingId,
    String? reportedUserId,
  }) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.submitReport(
      reporterId: reporterId,
      reason: reason,
      details: details,
      listingId: listingId,
      reportedUserId: reportedUserId,
    );
  }

  @override
  Future<void> submitReview(String sellerId, String authorId, int rating, String comment) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.submitReview(sellerId, authorId, rating, comment);
  }

  @override
  Future<void> deleteReview(String reviewId) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.deleteReview(reviewId);
  }

  @override
  Future<List<Offer>> getOffers(String sellerId) {
    if (!_connectivity.isOnline) return Future.value(const []);
    return SupabaseApi.fetchOffers(sellerId);
  }

  @override
  Future<Offer?> getMyOfferForListing(String listingId, String buyerId) {
    if (!_connectivity.isOnline) return Future.value(null);
    return SupabaseApi.fetchMyOfferForListing(listingId, buyerId);
  }

  @override
  Future<void> makeOffer({
    required String listingId,
    required String buyerId,
    required String sellerId,
    required double amount,
    String? message,
  }) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.makeOffer(
      listingId: listingId,
      buyerId: buyerId,
      sellerId: sellerId,
      amount: amount,
      message: message,
    );
  }

  @override
  Future<void> respondToOffer(Offer offer, String status, {String? conversationId}) {
    if (!_connectivity.isOnline) throw const NetworkFailure();
    return SupabaseApi.respondToOffer(offer, status, conversationId: conversationId);
  }
}
