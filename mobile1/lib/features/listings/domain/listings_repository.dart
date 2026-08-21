import 'package:image_picker/image_picker.dart';

import '../../../core/models/models.dart';
import 'listing_query.dart';

/// Contract for everything listing/category/shop related.
abstract class ListingsRepository {
  Future<List<Category>> getCategories();

  Future<Map<String, int>> getCategoryCounts();

  Future<List<({String price, String changedAt})>> getPriceHistory(String listingId);

  Future<List<Listing>> getFeatured({int limit = 12});

  Future<List<Listing>> getFresh({int limit = 12});

  Future<List<Listing>> getMostViewed({int limit = 12});

  Future<List<Listing>> getRecentViewed(String userId, {int limit = 8});

  Future<List<String>> getTrendingSearches({int limit = 8});

  Future<ListingsPage> getListings(ListingQuery query);

  Future<Listing?> getListing(String id);

  Future<List<Map<String, dynamic>>> getSuggestions(String term, {int limit = 6});

  Future<Profile?> getShop(String slug);

  Future<List<Review>> getReviews(String sellerId);

  Future<void> recordView(String listingId);

  Future<void> logSearch(String query);

  Future<String> uploadImage(String userId, XFile file);

  String imageUrl(String path);
}
