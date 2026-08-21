import 'package:flutter/material.dart';

import '../models/models.dart';
import 'listing_card.dart';

/// Two-column responsive listing grid with a tap-through to the listing detail.
/// Optionally supports infinite scroll via [onLoadMore].
class ListingGrid extends StatelessWidget {
  const ListingGrid({
    super.key,
    required this.listings,
    this.onListingTap,
    this.onLoadMore,
    this.hasMore = false,
    this.loadingMore = false,
    this.controller,
    this.shrinkWrap = false,
    this.physics,
  });

  final List<Listing> listings;
  final void Function(Listing)? onListingTap;
  final VoidCallback? onLoadMore;
  final bool hasMore;
  final bool loadingMore;
  final ScrollController? controller;
  final bool shrinkWrap;
  final ScrollPhysics? physics;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      controller: controller,
      shrinkWrap: shrinkWrap,
      physics: physics,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 16,
        crossAxisSpacing: 12,
        childAspectRatio: 0.68,
      ),
      itemCount: listings.length + (hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i >= listings.length) {
          return loadingMore
              ? const Center(
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : const SizedBox.shrink();
        }
        final listing = listings[i];
        // Trigger the next page as the user approaches the end.
        if (hasMore && onLoadMore != null && i >= listings.length - 4) {
          onLoadMore!();
        }
        return ListingCard(
          listing: listing,
          onTap: () => onListingTap?.call(listing),
        );
      },
    );
  }
}

/// Horizontal row of cards for "Fresh listings" / "Similar items".
class ListingRow extends StatelessWidget {
  const ListingRow({super.key, required this.listings, this.onListingTap, this.compact = true});

  final List<Listing> listings;
  final void Function(Listing)? onListingTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: compact ? 210 : 250,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: listings.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, i) {
          final listing = listings[i];
          return SizedBox(
            width: 150,
            child: ListingCard(
              listing: listing,
              compact: compact,
              onTap: () => onListingTap?.call(listing),
            ),
          );
        },
      ),
    );
  }
}
