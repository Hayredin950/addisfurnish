import 'dart:async';

import 'package:image_picker/image_picker.dart';

import '../../../core/cache/cache_manager.dart';
import '../../../core/error/failures.dart';
import '../../../core/models/models.dart';
import '../../../core/network/connectivity.dart';
import '../../../core/network/supabase_api.dart';
import '../domain/listing_query.dart';
import '../domain/listings_repository.dart';

/// Listings repository: caches categories/trending/home rows, paginates the
/// feed, and falls back to a cached page when offline.
class ListingsRepositoryImpl implements ListingsRepository {
  ListingsRepositoryImpl({CacheManager? cache, ConnectivityService? connectivity})
      : _cache = cache ?? CacheManager.instance,
        _connectivity = connectivity ?? ConnectivityService.instance;

  final CacheManager _cache;
  final ConnectivityService _connectivity;

  static const _categoriesKey = 'cache:categories';
  static const _trendingKey = 'cache:trending';
  static const _feedPrefix = 'cache:listings:';

  bool get _offline => !_connectivity.isOnline;

  /// Returns cached data first, then refreshes from network when possible.
  Future<List<T>> _cachedList<T>(String key, Future<List<T>> Function() fetch) async {
    final cached = _cache.read<List>(key) as List<T>?;
    if (cached != null && cached.isNotEmpty) {
      if (_offline) return cached;
      unawaited(_refreshAndStore(key, fetch));
      return cached;
    }
    if (_offline) throw const NetworkFailure('offline');
    final fresh = await fetch();
    _cache.put(key, fresh);
    return fresh;
  }

  Future<void> _refreshAndStore<T>(String key, Future<List<T>> Function() fetch) async {
    try {
      final fresh = await fetch();
      _cache.put(key, fresh);
    } catch (_) {}
  }

  @override
  Future<List<Category>> getCategories() {
    return _cachedList(_categoriesKey, SupabaseApi.fetchCategories);
  }

  @override
  Future<Map<String, int>> getCategoryCounts() {
    if (_offline) return Future.value(const {});
    return SupabaseApi.categoryCounts();
  }

  @override
  Future<List<({String price, String changedAt})>> getPriceHistory(String listingId) async {
    if (_offline) return const [];
    final rows = await SupabaseApi.fetchPriceHistory(listingId);
    return [
      for (final r in rows)
        (price: '${r['price']}', changedAt: r['changed_at'] as String? ?? ''),
    ];
  }

  @override
  Future<List<String>> getTrendingSearches({int limit = 8}) {
    return _cachedList(_trendingKey, () => SupabaseApi.fetchTrendingSearches(limit: limit));
  }

  Future<List<Listing>> _homeFeed(String kind, int limit) async {
    final key = '$_feedPrefix$kind:$limit';
    final cached = _cache.read<List>(key) as List<Listing>?;
    if (cached != null && cached.isNotEmpty) {
      if (_offline) return cached;
      unawaited(_refreshAndStore(key, () => _fetchHomeFeed(kind, limit)));
      return cached;
    }
    if (_offline) throw const NetworkFailure('offline');
    final fresh = await _fetchHomeFeed(kind, limit);
    _cache.put(key, fresh);
    return fresh;
  }

  Future<List<Listing>> _fetchHomeFeed(String kind, int limit) async {
    switch (kind) {
      case 'featured':
        return SupabaseApi.fetchListings(filters: const ListingFilters(featured: true, limit: 12));
      case 'viewed':
        return SupabaseApi.fetchListings(filters: const ListingFilters(sort: 'viewed', limit: 12));
      default:
        return SupabaseApi.fetchListings(filters: ListingFilters(limit: limit));
    }
  }

  @override
  Future<List<Listing>> getFeatured({int limit = 12}) => _homeFeed('featured', limit);

  @override
  Future<List<Listing>> getFresh({int limit = 12}) => _homeFeed('fresh', limit);

  @override
  Future<List<Listing>> getMostViewed({int limit = 12}) => _homeFeed('viewed', limit);

  @override
  Future<List<Listing>> getRecentViewed(String userId, {int limit = 8}) {
    if (_offline) return Future.value(const []);
    return SupabaseApi.fetchRecentlyViewed(userId);
  }

  @override
  Future<ListingsPage> getListings(ListingQuery query) async {
    if (_offline) {
      final cached = _cache.read<List>(_feedPrefix + query.cacheKey) as List<Listing>?;
      if (cached != null) {
        final start = query.page * query.limit;
        final slice = start >= cached.length ? const <Listing>[] : cached.sublist(start);
        return ListingsPage(items: slice, hasMore: slice.length >= query.limit, nextPage: query.page + 1);
      }
      throw const NetworkFailure('offline');
    }

    final items = await SupabaseApi.fetchListings(filters: _filtersFrom(query));
    final hasMore = items.length >= query.limit;
    if (query.page == 0) {
      _cache.put(_feedPrefix + query.cacheKey, items);
    }
    return ListingsPage(items: items, hasMore: hasMore, nextPage: query.page + 1);
  }

  ListingFilters _filtersFrom(ListingQuery query) {
    final f = query.filters;
    return ListingFilters(
      q: f.q,
      category: f.category,
      condition: f.condition,
      material: f.material,
      room: f.room,
      city: f.city,
      min: f.min,
      max: f.max,
      discounted: f.discounted,
      featured: f.featured,
      sort: f.sort,
      sellerId: f.sellerId,
      limit: query.limit,
    );
  }

  @override
  Future<Listing?> getListing(String id) async {
    final key = 'cache:listing:$id';
    final cached = _cache.read<Listing>(key);
    if (cached != null) {
      if (_offline) return cached;
      unawaited(_refreshListing(key, id));
      return cached;
    }
    if (_offline) throw const NetworkFailure('offline');
    final fresh = await SupabaseApi.fetchListing(id);
    if (fresh != null) _cache.put(key, fresh);
    return fresh;
  }

  Future<void> _refreshListing(String key, String id) async {
    try {
      final fresh = await SupabaseApi.fetchListing(id);
      if (fresh != null) _cache.put(key, fresh);
    } catch (_) {}
  }

  @override
  Future<List<Map<String, dynamic>>> getSuggestions(String term, {int limit = 6}) {
    if (_offline) return Future.value(const []);
    return SupabaseApi.searchSuggestions(term, limit: limit);
  }

  @override
  Future<Profile?> getShop(String slug) {
    if (_offline) return Future.value(null);
    return SupabaseApi.fetchShop(slug);
  }

  @override
  Future<List<Review>> getReviews(String sellerId) {
    if (_offline) return Future.value(const []);
    return SupabaseApi.fetchReviews(sellerId);
  }

  @override
  Future<void> recordView(String listingId) => SupabaseApi.recordListingView(listingId);

  @override
  Future<void> logSearch(String query) => SupabaseApi.logSearch(query);

  @override
  Future<String> uploadImage(String userId, XFile file) {
    return SupabaseApi.uploadListingImage(userId, file);
  }

  @override
  String imageUrl(String path) => SupabaseApi.listingImageUrl(path);
}
