import 'package:flutter/material.dart';

import '../models/models.dart';
import '../utils/format.dart';
import 'app_image.dart';

/// Card for a single listing: photo, title, price (with strikethrough original
/// when discounted), condition chip and seller/shop name.
class ListingCard extends StatelessWidget {
  const ListingCard({super.key, required this.listing, this.onTap, this.compact = false});

  final Listing listing;
  final VoidCallback? onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final discounted = listing.discountActive;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Image fills the vertical space left after the text block so the
          // card never overflows its fixed grid/row height.
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                AppImage(
                  listing.coverImageUrl,
                  borderRadius: BorderRadius.circular(16),
                ),
                if (listing.featured)
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '★',
                        style: TextStyle(color: theme.colorScheme.onPrimary, fontSize: 11),
                      ),
                    ),
                  ),
                if (discounted)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.error,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${((1 - listing.price / listing.originalPrice!) * 100).round()}% OFF',
                        style: TextStyle(
                          color: theme.colorScheme.onError,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            listing.title,
            maxLines: compact ? 1 : 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall?.copyWith(height: 1.25),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Flexible(
                child: Text(
                  Fmt.birr(listing.price),
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (discounted) ...[
                const SizedBox(width: 6),
                Text(
                  Fmt.birr(listing.originalPrice),
                  style: theme.textTheme.bodySmall?.copyWith(
                    decoration: TextDecoration.lineThrough,
                    color: theme.colorScheme.outline,
                  ),
                ),
              ],
            ],
          ),
          if (!compact) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: Text(
                    listing.seller?.displayName ?? listing.city,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                if (listing.seller?.verified == true)
                  Padding(
                    padding: const EdgeInsets.only(left: 4),
                    child: Icon(Icons.verified, size: 14, color: theme.colorScheme.primary),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
