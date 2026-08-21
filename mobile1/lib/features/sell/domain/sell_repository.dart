import 'package:image_picker/image_picker.dart';

import '../../../core/models/models.dart';

/// Contract for the sell feature (seller listing management).
abstract class SellRepository {
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
  });

  Future<String> uploadImage(String userId, XFile file);

  Future<String> uploadVideo(String userId, XFile file);

  String imageUrl(String path);

  Future<Listing?> fetchListingForEdit(String listingId);

  Future<void> updateListing(String listingId, Map<String, dynamic> patch);

  Future<void> replaceListingImages(String listingId, List<String> urls);

  Future<List<Listing>> getMyListings(String sellerId);

  Future<void> updateStatus(String listingId, String status);

  Future<void> markSold(String listingId, String? listingTitle);

  Future<void> deleteListing(String listingId);

  Future<List<({String date, int count})>> getViewsPerDay(String sellerId);

  Future<int> getConversationCount(String sellerId);

  Future<void> requestCallback({
    required String listingId,
    required String buyerId,
    required String sellerId,
    required String listingTitle,
    required String phone,
    String? note,
  });

  Future<List<CallbackRequest>> getCallbacks(String sellerId);

  Future<void> updateCallbackStatus(
    String id,
    String status, {
    String? buyerId,
    String? listingTitle,
  });

  Future<void> submitReport({
    required String reporterId,
    required String reason,
    String? details,
    String? listingId,
    String? reportedUserId,
  });

  Future<void> submitReview(String sellerId, String authorId, int rating, String comment);

  Future<void> deleteReview(String reviewId);

  Future<List<Offer>> getOffers(String sellerId);

  Future<Offer?> getMyOfferForListing(String listingId, String buyerId);

  Future<void> makeOffer({
    required String listingId,
    required String buyerId,
    required String sellerId,
    required double amount,
    String? message,
  });

  Future<void> respondToOffer(Offer offer, String status, {String? conversationId});
}
