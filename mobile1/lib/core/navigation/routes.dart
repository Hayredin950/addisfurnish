import 'package:flutter/material.dart';

import '../../features/favorites/presentation/favorites_screen.dart';
import '../../features/listings/presentation/listing_detail_screen.dart';
import '../../features/listings/presentation/search_screen.dart';
import '../../features/listings/presentation/shop_screen.dart';
import '../../features/messages/presentation/chat_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/profile/presentation/safety_screen.dart';
import '../../features/profile/presentation/setup_profile_screen.dart';
import '../models/models.dart';

/// Centralised navigation helpers.
class Routes {
  Routes._();

  static void listing(BuildContext context, Listing listing) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ListingDetailScreen(listing: listing)),
    );
  }

  static void listingById(BuildContext context, String listingId) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ListingDetailScreen(listingId: listingId)),
    );
  }

  static void shop(BuildContext context, String shopSlug) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ShopScreen(shopSlug: shopSlug)),
    );
  }

  static void search(BuildContext context, {String? initialQuery, String? categorySlug}) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SearchScreen(initialQuery: initialQuery, categorySlug: categorySlug),
      ),
    );
  }

  static Future<void> chat(BuildContext context, {
    required String conversationId,
    required String otherName,
    String? listingTitle,
  }) {
    return Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          conversationId: conversationId,
          otherName: otherName,
          listingTitle: listingTitle,
        ),
      ),
    );
  }

  static void notifications(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const NotificationsScreen()),
    );
  }

  static void favorites(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const FavoritesScreen()),
    );
  }

  static void safety(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SafetyScreen()),
    );
  }

  static void setupProfile(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SetupProfileScreen()),
    );
  }
}
