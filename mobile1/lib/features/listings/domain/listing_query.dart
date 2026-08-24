import '../../../core/models/models.dart';
import '../../../core/network/supabase_api.dart' show ListingFilters;

/// Paginated result for infinite scroll.
class ListingsPage {
  const ListingsPage({required this.items, required this.hasMore, this.nextPage});

  final List<Listing> items;
  final bool hasMore;
  final int? nextPage;
}

/// Query descriptor for the listings feed.
class ListingQuery {
  const ListingQuery({
    this.filters = const ListingFilters(),
    this.page = 0,
    this.limit = 24,
  });

  final ListingFilters filters;
  final int page;
  final int limit;

  /// Stable key used for caching/observability.
  String get cacheKey {
    final f = filters;
    return [
      f.q,
      f.category,
      f.condition,
      f.material,
      f.room,
      f.city,
      f.min,
      f.max,
      f.discounted,
      f.featured,
      f.sort,
      f.sellerId,
      f.attributes?.toString(),
      page,
      limit,
    ].join('|');
  }

  ListingQuery copyWith({ListingFilters? filters, int? page, int? limit}) => ListingQuery(
        filters: filters ?? this.filters,
        page: page ?? this.page,
        limit: limit ?? this.limit,
      );
}
