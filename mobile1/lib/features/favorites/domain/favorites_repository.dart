import '../../../core/models/models.dart';

/// Contract for the favorites feature.
abstract class FavoritesRepository {
  Future<List<String>> getFavoriteIds(String userId);

  Future<List<Listing>> getFavorites(String userId);

  Future<bool> toggle(String userId, String listingId, bool currentlySaved);
}
