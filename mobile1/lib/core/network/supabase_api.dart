import 'dart:convert';

import 'package:flutter/foundation.dart' hide Category;
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import '../../features/sell/domain/listing_attributes.dart';
import 'env.dart';
import 'supabase_client.dart';

/// The join select used everywhere a listing is loaded (mirrors web LISTING_SELECT).
const String _listingSelect =
    '*, listing_images(id,url,position), '
    'profiles!listings_seller_id_fkey(id,full_name,shop_name,shop_slug,shop_logo_url,avatar_url,verified,city,phone,last_seen,is_online,whatsapp,telegram), '
    'categories(name,slug,name_am)';

class ApiError implements Exception {
  ApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Raised when saving a phone that already belongs to a different account
/// (unique index `profiles_phone_key`). UI maps this to a friendly message.
class PhoneTakenError extends ApiError {
  PhoneTakenError() : super('');
  @override
  String toString() => 'phone_taken';
}

/// Low-level data access layer mirroring `web/src/lib/marketplace.ts` + the old
/// mobile `api.ts`. Every call is anon-key-safe under the shared RLS policies.
///
/// Feature repositories build on top of this with caching, offline fallback,
/// and pagination.
class SupabaseApi {
  SupabaseApi._();

  static SupabaseClient get _db => AppSupabase.client;

  static Never _raise(Object e) => throw ApiError(_errMsg(e));

  static String _errMsg(Object e) {
    if (e is PostgrestException) return e.message;
    if (e is StorageException) return e.message;
    if (e is AuthException) return e.message;
    return '$e';
  }

  /// Bucket that holds listing photos (mirrors web/mobile `storage.ts`).
  static const _listingBucket = 'listing-images';

  /// Resolves a stored listing image reference to a full public https URL.
  /// Mirrors web/mobile `imageUrl()`. Accepts every shape found in the DB:
  /// full http(s) URLs (Cloudinary pass through unchanged), bare storage paths
  /// like `<uuid>/photo.jpg` (Supabase `uploadBinary`), and legacy rows that
  /// stored the bucket name as a prefix (`listing-images/<uuid>/photo.jpg`).
  static String _resolveStorageUrl(String url) {
    if (url.isEmpty) return url;
    if (url.startsWith('http')) return url;
    final path = url.startsWith('$_listingBucket/')
        ? url.substring(_listingBucket.length + 1)
        : url;
    return AppSupabase.client.storage.from(_listingBucket).getPublicUrl(path);
  }

  /// Inverse of [_resolveStorageUrl] for delete/remove calls: strips the
  /// bucket prefix so the value is a path *inside* the bucket.
  static String _storagePath(String url) {
    return url.startsWith('$_listingBucket/')
        ? url.substring(_listingBucket.length + 1)
        : url;
  }

  /// Ensures every listing_images URL is a full https:// URL.
  /// Supabase `uploadBinary` returns a storage path, not a public URL.
  static Map<String, dynamic> _resolveImageUrls(Map<String, dynamic> row) {
    final images = row['listing_images'] as List<dynamic>?;
    if (images == null || images.isEmpty) return row;
    final resolved = images.map((img) {
      final m = Map<String, dynamic>.from(img as Map);
      final url = m['url'] as String? ?? '';
      m['url'] = _resolveStorageUrl(url);
      return m;
    }).toList();
    return {...row, 'listing_images': resolved};
  }

  /// Addis Ababa sub-city centres (mirrors web `ADDIS_SUBCITY_COORDS`). Used as
  /// a fallback so listings still get a map pin when the seller left the
  /// location blank but filled in a sub-city.
  static const Map<String, ({double lat, double lng})> _addisSubCityCoords = {
    'Bole': (lat: 8.9903, lng: 38.7877),
    'Yeka': (lat: 9.0307, lng: 38.7745),
    'Arada': (lat: 9.0222, lng: 38.7469),
    'Kirkos': (lat: 9.0115, lng: 38.7639),
    'Lideta': (lat: 9.0019, lng: 38.7353),
    'Addis Ketema': (lat: 9.0302, lng: 38.7364),
    'Nifas Silk-Lafto': (lat: 8.9701, lng: 38.7162),
    'Kolfe Keranio': (lat: 9.0106, lng: 38.6991),
    'Gulele': (lat: 9.0477, lng: 38.7243),
    'Akaki Kality': (lat: 8.8683, lng: 38.7906),
    'Lemi Kura': (lat: 9.0357, lng: 38.7918),
  };

  /// Official Addis Ababa sub-cities, offered as a dropdown on the sell form
  /// when the selected city is Addis Ababa.
  static const List<String> addisSubCities = [
    'Bole',
    'Yeka',
    'Arada',
    'Kirkos',
    'Lideta',
    'Addis Ketema',
    'Nifas Silk-Lafto',
    'Kolfe Keranio',
    'Gulele',
    'Akaki Kality',
    'Lemi Kura',
  ];

  /// Centre coordinates of a known Addis Ababa sub-city, or null if unknown.
  static ({double lat, double lng})? coordsForSubCity(String? subCity) {
    if (subCity == null) return null;
    return _addisSubCityCoords[_trimSubCity(subCity)];
  }

  static String _trimSubCity(String subCity) {
    final t = subCity.trim();
    // Normalize case-insensitively: sub-city names match after lowercasing.
    for (final entry in _addisSubCityCoords.entries) {
      if (entry.key.toLowerCase() == t.toLowerCase()) return entry.key;
    }
    return t;
  }

  // ── Categories ──────────────────────────────────────────────────────────

  static Future<List<Category>> fetchCategories() async {
    try {
      final data = await _db.from('categories').select().order('sort_order');
      return data.map(Category.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<Map<String, int>> categoryCounts() async {
    try {
      final data = await _db
          .from('category_listing_counts')
          .select('category_id,listing_count');
      final counts = <String, int>{};
      for (final row in data) {
        final id = row['category_id'] as String?;
        final count = (row['listing_count'] as num?)?.toInt() ?? 0;
        if (id != null) counts[id] = count;
      }
      return counts;
    } catch (e) {
      _raise(e);
    }
  }

  // ── Listings ────────────────────────────────────────────────────────────

  static Future<List<Listing>> fetchListings({ListingFilters? filters}) async {
    final f = filters ?? const ListingFilters();
    try {
      var q = _db
          .from('listings')
          .select(_listingSelect)
          .neq('status', 'draft');

      if (f.q != null && f.q!.trim().isNotEmpty) {
        final queryText = f.q!.trim();
        q = q.or('title.ilike.%$queryText%,description.ilike.%$queryText%');
      }
      if (f.condition != null) q = q.eq('condition', f.condition!);
      if (f.material != null) q = q.eq('material', f.material!);
      if (f.room != null) q = q.eq('room_type', f.room!);
      if (f.city != null) q = q.eq('city', f.city!);
      if (f.sellerId != null) q = q.eq('seller_id', f.sellerId!);
      if (f.min != null && f.min! > 0) q = q.gte('price', f.min!);
      if (f.max != null && f.max! > 0) q = q.lte('price', f.max!);
      if (f.discounted) q = q.not('original_price', 'is', null);
      if (f.featured) q = q.eq('featured', true);

      // Phase 6 (§14): dynamic attribute filters resolve server-side through
      // the attribute_matching_listing_ids RPC, then narrow by listing id.
      final attrs = f.attributes;
      if (attrs != null && attrs.isNotEmpty) {
        final matches = await _db.rpc(
          'attribute_matching_listing_ids',
          params: {'p_attrs': attrs},
        );
        final ids =
            matches.map((r) => r['listing_id'] as String).toList(growable: false);
        if (ids.isEmpty) return const [];
        q = q.inFilter('id', ids);
      }

      if (f.category != null) {
        final cat = await _db
            .from('categories')
            .select('id')
            .eq('slug', f.category!)
            .maybeSingle();
        if (cat != null) {
          final children = await _db
              .from('categories')
              .select('id')
              .eq('parent_id', cat['id']);
          final ids = [
            cat['id'],
            ...children.map((c) => c['id']),
          ].cast<String>();
          q = q.inFilter('category_id', ids);
        }
      }

      final ordered = switch (f.sort) {
        'price-asc' => q.order('price', ascending: true),
        'price-desc' => q.order('price', ascending: false),
        'viewed' => q.order('view_count', ascending: false),
        _ => q.order('created_at', ascending: false),
      };
      final data = await ordered.limit(f.limit ?? 48);
      return data
          .map((r) => Listing.fromJson(_resolveImageUrls(r)))
          .toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<Listing?> fetchListing(String id) async {
    try {
      final data = await _db
          .from('listings')
          .select(_listingSelect)
          .eq('id', id)
          .maybeSingle();
      return data == null ? null : Listing.fromJson(_resolveImageUrls(data));
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<Map<String, dynamic>>> searchSuggestions(
    String term, {
    int limit = 6,
  }) async {
    if (term.trim().length < 2) return const [];
    try {
      final data = await _db
          .from('listings')
          .select('id,title,city,price')
          .or('title.ilike.%${term.trim()}%,description.ilike.%${term.trim()}%')
          .neq('status', 'draft')
          .order('created_at', ascending: false)
          .limit(limit);
      return data;
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<Map<String, dynamic>>> fetchPriceHistory(
    String listingId,
  ) async {
    try {
      return await _db
          .from('price_history')
          .select('price,changed_at')
          .eq('listing_id', listingId)
          .order('changed_at', ascending: true);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> recordListingView(String listingId) async {
    try {
      await _db.rpc('record_listing_view', params: {'_listing_id': listingId});
    } catch (e) {
      debugPrint('record view failed: ${_errMsg(e)}');
    }
  }

  static Future<void> logSearch(String query) async {
    final q = query.trim();
    if (q.isEmpty) return;
    try {
      await _db.from('search_log').insert({'query': q});
    } catch (e) {
      debugPrint('log search failed: ${_errMsg(e)}');
    }
  }

  // ── Shops & sellers ─────────────────────────────────────────────────────

  static Future<Profile?> fetchShop(String slug) async {
    try {
      final data = await _db
          .from('profiles')
          .select()
          .eq('shop_slug', slug)
          .maybeSingle();
      return data == null ? null : Profile.fromJson(data);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<Review>> fetchReviews(String sellerId) async {
    try {
      final data = await _db
          .from('reviews')
          .select(
            'id,rating,comment,created_at,author_id,profiles!reviews_author_id_fkey(full_name,avatar_url)',
          )
          .eq('seller_id', sellerId)
          .order('created_at', ascending: false);
      return data.map(Review.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> submitReview(
    String sellerId,
    String authorId,
    int rating,
    String comment,
  ) async {
    try {
      await _db.from('reviews').upsert({
        'seller_id': sellerId,
        'author_id': authorId,
        'rating': rating,
        'comment': comment,
      }, onConflict: 'seller_id,author_id');
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> deleteReview(String reviewId) async {
    try {
      await _db.from('reviews').delete().eq('id', reviewId);
    } catch (e) {
      _raise(e);
    }
  }

  // ── Favorites ───────────────────────────────────────────────────────────

  static Future<List<String>> fetchFavoriteIds(String userId) async {
    try {
      final data = await _db
          .from('favorites')
          .select('listing_id')
          .eq('user_id', userId);
      return data.map((r) => r['listing_id'] as String).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<Listing>> fetchFavorites(String userId) async {
    try {
      final data = await _db
          .from('favorites')
          .select('listing_id,listings($_listingSelect)')
          .eq('user_id', userId)
          .order('created_at', ascending: false);
      return data
          .map((r) => r['listings'])
          .whereType<Map<String, dynamic>>()
          .map((m) => Listing.fromJson(_resolveImageUrls(m)))
          .toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> toggleFavorite(
    String userId,
    String listingId,
    bool currentlySaved,
  ) async {
    try {
      if (currentlySaved) {
        await _db
            .from('favorites')
            .delete()
            .eq('user_id', userId)
            .eq('listing_id', listingId);
      } else {
        await _db.from('favorites').upsert({
          'user_id': userId,
          'listing_id': listingId,
        }, ignoreDuplicates: true);
      }
    } catch (e) {
      _raise(e);
    }
  }

  // ── Profile ─────────────────────────────────────────────────────────────

  static Future<Profile?> fetchProfile(String userId) async {
    try {
      final data = await _db
          .from('profiles')
          .select()
          .eq('id', userId)
          .maybeSingle();
      return data == null ? null : Profile.fromJson(data);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> updateProfile(
    String userId,
    Map<String, dynamic> patch,
  ) async {
    try {
      await _db.from('profiles').update(patch).eq('id', userId);
    } catch (e) {
      if (patch.containsKey('phone') && _isPhoneTakenError(e)) {
        throw PhoneTakenError();
      }
      _raise(e);
    }
  }

  static bool _isPhoneTakenError(Object e) {
    final msg = _errMsg(e).toLowerCase();
    return msg.contains('duplicate key') && msg.contains('profiles_phone_key');
  }

  /// URL-safe slug from a shop name, mirroring the web app's slugify().
  static String slugify(String name) {
    final slug = name
        .toLowerCase()
        .replaceAll(RegExp('[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    return slug.length > 40 ? slug.substring(0, 40) : slug;
  }

  /// Picks a `shop_slug` that is not already taken, appending -2, -3… as
  /// needed (mirrors `mobile1/src/lib/slug.ts`).
  static Future<String> uniqueShopSlug(String name) async {
    final base = slugify(name);
    final candidate = base.isEmpty ? 'shop' : base;
    for (var i = 1; ; i++) {
      final slug = i == 1 ? candidate : '$candidate-$i';
      try {
        final data = await _db
            .from('profiles')
            .select('id')
            .eq('shop_slug', slug)
            .maybeSingle();
        if (data == null) return slug;
      } catch (e) {
        _raise(e);
      }
    }
  }

  static Future<void> markOnline() async {
    final userId = _db.auth.currentUser?.id;
    if (userId == null) return;
    try {
      await _db
          .from('profiles')
          .update({
            'is_online': true,
            'last_seen': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', userId);
    } catch (_) {}
  }

  static Future<void> markOffline() async {
    final userId = _db.auth.currentUser?.id;
    if (userId == null) return;
    try {
      await _db.from('profiles').update({'is_online': false}).eq('id', userId);
    } catch (_) {}
  }

  // ── Conversations & messages ────────────────────────────────────────────

  static Future<List<Conversation>> fetchConversations(String userId) async {
    try {
      final rows = await _db
          .from('conversations')
          .select(
            'id,last_message_at,buyer_id,seller_id,listings(id,title,price,listing_images(url))',
          )
          .or(
            'and(buyer_id.eq.$userId,buyer_deleted_at.is.null),'
            'and(seller_id.eq.$userId,seller_deleted_at.is.null)',
          )
          .order('last_message_at', ascending: false);
      if (rows.isEmpty) return const [];

      final otherIds = rows
          .map((r) => r['buyer_id'] == userId ? r['seller_id'] : r['buyer_id'])
          .whereType<String>()
          .toSet()
          .toList();
      final profilesData = await _db
          .from('profiles')
          .select('id,full_name,shop_name,shop_logo_url,is_online,last_seen')
          .inFilter('id', otherIds);
      final byId = {for (final p in profilesData) p['id']: p};

      // Unread per conversation: messages from the other side with no read_at.
      final unreadCounts = <String, int>{};
      if (rows.isNotEmpty) {
        final convIds = rows.map((r) => r['id'] as String).toList();
        final unread = await _db
            .from('messages')
            .select('conversation_id')
            .inFilter('conversation_id', convIds)
            .neq('sender_id', userId)
            .isFilter('read_at', null);
        for (final row in unread) {
          final cid = row['conversation_id'] as String?;
          if (cid == null) continue;
          unreadCounts[cid] = (unreadCounts[cid] ?? 0) + 1;
        }
      }

      return rows
          .map((r) {
            final listing = r['listings'] as Map<String, dynamic>?;
            final otherId = r['buyer_id'] == userId
                ? r['seller_id']
                : r['buyer_id'];
            final profile = byId[otherId];
            final images =
                listing?['listing_images'] as List<dynamic>? ?? const [];
            return Conversation(
              id: r['id'] as String,
              lastMessageAt: DateTime.parse(r['last_message_at'] as String),
              listingId: listing?['id'] as String?,
              listingTitle: listing?['title'] as String?,
              listingPrice: (listing?['price'] as num?)?.toDouble(),
              listingImageUrl: images.isNotEmpty
                  ? _resolveStorageUrl(
                      (images.first as Map<String, dynamic>)['url']
                              as String? ??
                          '',
                    )
                  : null,
              otherParty: profile != null
                  ? SellerSummary.fromJson(profile)
                  : null,
              unread: unreadCounts[r['id'] as String] ?? 0,
            );
          })
          .toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  /// Hides a conversation from the caller's own inbox (the other side keeps
  /// it) — mirrors RN `deleteConversation` + 20260815000000_conversation_delete.
  static Future<void> deleteConversation(
    String conversationId,
    String myUserId,
  ) async {
    try {
      final conv = await _db
          .from('conversations')
          .select('buyer_id,seller_id')
          .eq('id', conversationId)
          .maybeSingle();
      if (conv == null) return;
      final patch = conv['buyer_id'] == myUserId
          ? {'buyer_deleted_at': DateTime.now().toUtc().toIso8601String()}
          : {'seller_deleted_at': DateTime.now().toUtc().toIso8601String()};
      await _db.from('conversations').update(patch).eq('id', conversationId);
    } catch (e) {
      _raise(e);
    }
  }

  /// Marks the counterpart's messages as read in this conversation — mirrors
  /// RN `markConversationRead`.
  static Future<void> markConversationRead(
    String conversationId,
    String myUserId,
  ) async {
    try {
      await _db
          .from('messages')
          .update({'read_at': DateTime.now().toUtc().toIso8601String()})
          .eq('conversation_id', conversationId)
          .neq('sender_id', myUserId)
          .isFilter('read_at', null);
    } catch (e) {
      debugPrint('mark read failed: ${_errMsg(e)}');
    }
  }

  static Future<String> ensureConversation(
    String listingId,
    String buyerId,
    String sellerId,
  ) async {
    try {
      final existing = await _db
          .from('conversations')
          .select('id')
          .eq('listing_id', listingId)
          .eq('buyer_id', buyerId)
          .maybeSingle();
      if (existing != null) return existing['id'] as String;
      final row = await _db
          .from('conversations')
          .insert({
            'listing_id': listingId,
            'buyer_id': buyerId,
            'seller_id': sellerId,
          })
          .select('id')
          .single();
      return row['id'] as String;
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<Message>> fetchMessages(String conversationId) async {
    try {
      final data = await _db
          .from('messages')
          .select(
            'id,conversation_id,body,sender_id,created_at,edited_at,deleted_at',
          )
          .eq('conversation_id', conversationId)
          .order('created_at', ascending: true);
      return data.map(Message.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> sendMessage(
    String conversationId,
    String senderId,
    String body,
  ) async {
    try {
      await _db.from('messages').insert({
        'conversation_id': conversationId,
        'sender_id': senderId,
        'body': body,
      });
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> editMessage(String messageId, String body) async {
    try {
      await _db
          .from('messages')
          .update({
            'body': body,
            'edited_at': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', messageId);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> deleteMessage(String messageId) async {
    try {
      await _db
          .from('messages')
          .update({'deleted_at': DateTime.now().toUtc().toIso8601String()})
          .eq('id', messageId);
    } catch (e) {
      _raise(e);
    }
  }

  // ── Notifications ───────────────────────────────────────────────────────

  static Future<List<AppNotification>> fetchNotifications(
    String userId, {
    int limit = 50,
  }) async {
    try {
      final data = await _db
          .from('notifications')
          .select('id,type,payload,is_read,created_at')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(limit);
      return data.map(AppNotification.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> markNotificationsRead(String userId) async {
    try {
      await _db
          .from('notifications')
          .update({'is_read': true})
          .eq('user_id', userId)
          .isFilter('is_read', false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> markNotificationRead(String id) async {
    try {
      await _db.from('notifications').update({'is_read': true}).eq('id', id);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> notifyUser(
    String userId,
    String type,
    Map<String, dynamic> payload,
  ) async {
    if (userId.isEmpty) return;
    try {
      await _db.rpc(
        'notify_user',
        params: {'_user_id': userId, '_type': type, '_payload': payload},
      );
    } catch (e) {
      debugPrint('notify failed: ${_errMsg(e)}');
    }
  }

  // ── Push tokens (FCM / Expo Push Service) ───────────────────────────────

  /// Attaches this device's token to the current account, clearing any stale
  /// row that still belongs to a previous account on the same phone.
  static Future<void> claimPushToken(
    String token, {
    String platform = 'android',
  }) async {
    if (token.isEmpty) return;
    try {
      await _db.rpc(
        'claim_push_token',
        params: {'_token': token, '_platform': platform},
      );
    } catch (e) {
      _raise(e);
    }
  }

  /// Removes the device token on sign-out so a logged-out device stops
  /// receiving pushes.
  static Future<void> deletePushToken(String token) async {
    if (token.isEmpty) return;
    try {
      await _db.from('push_tokens').delete().eq('token', token);
    } catch (e) {
      _raise(e);
    }
  }

  // ── Telegram connect / disconnect ───────────────────────────────────────

  /// Mints a single-use, 15-minute token and returns the t.me deep link that
  /// binds this user's Telegram chat to their account when they press Start.
  /// Returns null when no bot is configured for this build.
  static Future<String?> telegramConnectUrl() async {
    final username = Env.telegramBotUsername;
    if (username.isEmpty) return null;
    try {
      final token = await _db.rpc<String>('mint_telegram_link_token');
      if (token == null || token.isEmpty) return null;
      return 'https://t.me/${username.replaceFirst('@', '')}?start=$token';
    } catch (e) {
      debugPrint('mint telegram token failed: ${_errMsg(e)}');
      return null;
    }
  }

  /// Disconnect Telegram from the app side (the bot's /stop does the same).
  static Future<bool> disconnectTelegram() async {
    try {
      await _db.rpc('unlink_telegram');
      return true;
    } catch (e) {
      debugPrint('unlink telegram failed: ${_errMsg(e)}');
      return false;
    }
  }

  // ── Phone Verification (Telegram Bot) ───────────────────────────────────

  /// Mints a single-use, 15-minute token and returns the t.me deep link that
  /// starts phone verification in the Telegram bot.
  ///
  /// Returns `(url: null, error: 'not_configured')` when no bot is configured
  /// for this build, `'taken'` when the number already belongs to another
  /// account (the RPC returns NULL for that), and `'server'` on RPC failure.
  static Future<({String? url, String? error})> mintPhoneVerifyToken(
    String phone,
  ) async {
    final username = Env.telegramBotUsername;
    if (username.isEmpty) return (url: null, error: 'not_configured');
    try {
      final token = await _db.rpc<String?>(
        'mint_phone_verify_token',
        params: {'_phone': phone},
      );
      if (token == null || token.isEmpty) return (url: null, error: 'taken');
      return (
        url: 'https://t.me/${username.replaceFirst('@', '')}?start=$token',
        error: null,
      );
    } catch (e) {
      debugPrint('mint phone verify token failed: ${_errMsg(e)}');
      return (url: null, error: 'server');
    }
  }

  static Future<({bool ok, String? error})> verifyPhoneOtp(
    String phone,
    String code,
  ) async {
    try {
      final res = await _db.rpc<String>(
        'verify_phone_otp',
        params: {'_phone': phone, '_code': code.trim()},
      );
      if (res == 'ok') return (ok: true, error: null);
      return (ok: false, error: res);
    } catch (e) {
      return (ok: false, error: _errMsg(e));
    }
  }

  // ── Saved searches ──────────────────────────────────────────────────────

  static Future<List<SavedSearch>> fetchSavedSearches(String userId) async {
    try {
      final data = await _db
          .from('saved_searches')
          .select('id,query,filters,created_at')
          .eq('user_id', userId)
          .order('created_at', ascending: false);
      return data.map(SavedSearch.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> saveSearch(
    String userId, {
    String? query,
    String? category,
    double? min,
    double? max,
  }) async {
    try {
      await _db.from('saved_searches').insert({
        'user_id': userId,
        'query': query?.trim().isEmpty == true ? null : query?.trim(),
        'filters': {
          'category': category,
          'min': min != null && min > 0 ? min : null,
          'max': max != null && max > 0 ? max : null,
        },
      });
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> deleteSavedSearch(String id) async {
    try {
      await _db.from('saved_searches').delete().eq('id', id);
    } catch (e) {
      _raise(e);
    }
  }

  // ── Buyer preferences ───────────────────────────────────────────────────

  static Future<BuyerPreferences> fetchBuyerPreferences(String userId) async {
    try {
      final data = await _db
          .from('buyer_preferences')
          .select(
            'category_ids,price_min,price_max,preferred_cities,telegram_alerts_enabled',
          )
          .eq('user_id', userId)
          .maybeSingle();
      if (data == null) return const BuyerPreferences();
      return BuyerPreferences.fromJson(data);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> saveBuyerPreferences(
    String userId,
    BuyerPreferences prefs,
  ) async {
    try {
      await _db.from('buyer_preferences').upsert({
        'user_id': userId,
        ...prefs.toJson(),
      }, onConflict: 'user_id');
    } catch (e) {
      _raise(e);
    }
  }

  // ── Verification documents ──────────────────────────────────────────────

  static Future<List<VerificationDocument>> fetchMyVerificationDocs(
    String userId,
  ) async {
    try {
      final data = await _db
          .from('seller_verification_documents')
          .select()
          .eq('seller_id', userId)
          .order('created_at', ascending: false);
      return data.map(VerificationDocument.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> submitVerificationDocument(
    String sellerId,
    String documentType,
    String fileUrl,
  ) async {
    try {
      await _db.from('seller_verification_documents').insert({
        'seller_id': sellerId,
        'document_type': documentType,
        'file_url': fileUrl,
      });
    } catch (e) {
      _raise(e);
    }
  }

  // ── Recently viewed / trending ──────────────────────────────────────────

  static Future<List<Listing>> fetchRecentlyViewed(String userId) async {
    try {
      final data = await _db
          .from('recently_viewed')
          .select('listing_id,listings($_listingSelect)')
          .eq('user_id', userId)
          .order('viewed_at', ascending: false)
          .limit(8);
      return data
          .map((r) => r['listings'])
          .whereType<Map<String, dynamic>>()
          .map((m) => Listing.fromJson(_resolveImageUrls(m)))
          .toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<String>> fetchTrendingSearches({int limit = 8}) async {
    try {
      final weekAgo = DateTime.now()
          .subtract(const Duration(days: 7))
          .toUtc()
          .toIso8601String();
      final data = await _db
          .from('search_log')
          .select('query')
          .gte('created_at', weekAgo);
      final counts = <String, int>{};
      for (final row in data) {
        final q = (row['query'] as String? ?? '').trim().toLowerCase();
        if (q.isEmpty) continue;
        counts[q] = (counts[q] ?? 0) + 1;
      }
      final sorted = counts.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return sorted.take(limit).map((e) => e.key).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  // ── Sell ────────────────────────────────────────────────────────────────

  static Future<String> uploadListingImage(String userId, XFile upload) async {
    try {
      final ext = upload.name.contains('.')
          ? upload.name.split('.').last.toLowerCase()
          : 'jpg';
      final path =
          '$userId/${DateTime.now().millisecondsSinceEpoch}-${_rand()}.$ext';
      // uploadBinary returns the bucket-relative path, but some SDK versions
      // prepend the bucket name. Strip it so the DB always stores a bare path
      // like `<uuid>/photo.jpg` — matching what web and Expo Cloudinary uploads
      // produce, and preventing the double-prefix bug on web/Expo.
      final uploaded = await AppSupabase.client.storage
          .from('listing-images')
          .uploadBinary(
            path,
            await upload.readAsBytes(),
            fileOptions: const FileOptions(cacheControl: '3600', upsert: false),
          );
      return uploaded.startsWith('listing-images/')
          ? uploaded.substring('listing-images/'.length)
          : uploaded;
    } catch (e) {
      _raise(e);
    }
  }

  /// Uploads a seller verification document (national ID, business licence, TIN
  /// certificate) to the private `verification-docs` bucket and returns the
  /// bare storage path to store in `seller_verification_documents.file_url`.
  ///
  /// These must not go through [uploadListingImage]: that bucket is public, so
  /// an identity document put there is readable by anyone holding the URL. The
  /// private bucket only grants read to the uploading owner and to admins, and
  /// it is also where both admin panels look — they resolve `file_url` with a
  /// signed URL against `verification-docs`, so a document uploaded anywhere
  /// else cannot be reviewed at all.
  static Future<String> uploadVerificationDocument(
    String userId,
    XFile upload,
  ) async {
    try {
      final ext = upload.name.contains('.')
          ? upload.name.split('.').last.toLowerCase()
          : 'jpg';
      final path =
          '$userId/${DateTime.now().millisecondsSinceEpoch}-${_rand()}.$ext';
      final uploaded = await AppSupabase.client.storage
          .from('verification-docs')
          .uploadBinary(
            path,
            await upload.readAsBytes(),
            fileOptions: const FileOptions(cacheControl: '3600', upsert: false),
          );
      return uploaded.startsWith('verification-docs/')
          ? uploaded.substring('verification-docs/'.length)
          : uploaded;
    } catch (e) {
      _raise(e);
    }
  }

  /// Uploads the single short showcase video (≤ ~60s) straight to Cloudinary,
  /// returning the public `secure_url` to store in `listings.video_url`.
  /// Mirrors the RN app: the server mints a one-user-scoped signature via the
  /// `cloudinary-sign` edge function, then the client POSTs the file to
  /// Cloudinary's upload API.
  static Future<String> uploadListingVideo(String userId, XFile upload) async {
    try {
      final sign = await _db.functions.invoke(
        'cloudinary-sign',
        body: {'scope': 'video'},
      );
      final data = sign.data as Map<String, dynamic>?;
      final uploadUrl = data?['upload_url'] as String?;
      final apiKey = data?['api_key'] as String?;
      final timestamp = data?['timestamp'] as String?;
      final signature = data?['signature'] as String?;
      final folder = data?['folder'] as String?;
      if (uploadUrl == null ||
          apiKey == null ||
          timestamp == null ||
          signature == null ||
          folder == null) {
        throw ApiError('cloudinary sign failed');
      }

      final req = http.MultipartRequest('POST', Uri.parse(uploadUrl))
        ..fields['api_key'] = apiKey
        ..fields['timestamp'] = timestamp
        ..fields['signature'] = signature
        ..fields['folder'] = folder
        ..files.add(
          http.MultipartFile.fromBytes(
            'file',
            await upload.readAsBytes(),
            filename: upload.name,
          ),
        );
      final streamed = await req.send();
      final res = await http.Response.fromStream(streamed);
      final json = (res.statusCode >= 200 && res.statusCode < 300)
          ? (jsonDecode(res.body) as Map<String, dynamic>?)
          : null;
      final url = json?['secure_url'] as String?;
      if (url == null || url.isEmpty) {
        throw ApiError('cloudinary upload failed');
      }
      return url;
    } catch (e) {
      _raise(e);
    }
  }

  /// Uploads the profile avatar / shop logo to Cloudinary (scope "logo"),
  /// mirroring the RN web apps. The old `profile-images` Supabase bucket was
  /// never created, so storage uploads failed with "bucket not found".
  static Future<String> uploadProfileImage(String userId, XFile upload) async {
    try {
      final sign = await _db.functions.invoke(
        'cloudinary-sign',
        body: {'scope': 'logo'},
      );
      final data = sign.data as Map<String, dynamic>?;
      final uploadUrl = data?['upload_url'] as String?;
      final apiKey = data?['api_key'] as String?;
      final timestamp = data?['timestamp'] as String?;
      final signature = data?['signature'] as String?;
      final folder = data?['folder'] as String?;
      if (uploadUrl == null ||
          apiKey == null ||
          timestamp == null ||
          signature == null ||
          folder == null) {
        throw ApiError('cloudinary sign failed');
      }

      final req = http.MultipartRequest('POST', Uri.parse(uploadUrl))
        ..fields['api_key'] = apiKey
        ..fields['timestamp'] = timestamp
        ..fields['signature'] = signature
        ..fields['folder'] = folder
        ..files.add(
          http.MultipartFile.fromBytes(
            'file',
            await upload.readAsBytes(),
            filename: upload.name,
          ),
        );
      final streamed = await req.send();
      final res = await http.Response.fromStream(streamed);
      final json = (res.statusCode >= 200 && res.statusCode < 300)
          ? (jsonDecode(res.body) as Map<String, dynamic>?)
          : null;
      final url = json?['secure_url'] as String?;
      if (url == null || url.isEmpty) {
        throw ApiError('cloudinary upload failed');
      }
      return url;
    } catch (e) {
      _raise(e);
    }
  }

  static Future<String> createListing({
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
  }) async {
    try {
      final row = await _db
          .from('listings')
          .insert({
            'seller_id': sellerId,
            'title': title,
            'description': description,
            'price': price,
            'original_price': originalPrice,
            'negotiable': negotiable,
            'condition': condition,
            'material': material,
            'color': color,
            'room_type': roomType,
            'brand': brand,
            'city': city,
            'sub_city': subCity,
            'category_id': categoryId,
            'delivery_offered': deliveryOffered,
            'delivery_fee': deliveryFee,
            'latitude': latitude,
            'longitude': longitude,
            'discount_expires_at': discountExpiresAt?.toUtc().toIso8601String(),
            'video_url': videoUrl,
            'status': status,
          })
          .select('id')
          .single();

      if (imagePaths.isNotEmpty) {
        final images = [
          for (int i = 0; i < imagePaths.length; i++)
            {'listing_id': row['id'], 'url': imagePaths[i], 'position': i},
        ];
        await _db.from('listing_images').insert(images);
      }
      return row['id'] as String;
    } catch (e) {
      _raise(e);
    }
  }

  /// Attribute definitions configured for a category (spec §14/§15), resolved
  /// through the `category_attribute_set` RPC so attributes attached at a
  /// parent category are inherited. Active options are merged in for select
  /// types. Loaded live so admin changes reach the form without a release.
  static Future<List<CategoryAttributeDef>> fetchCategoryAttributes(
      String categoryId) async {
    try {
      final data = await _db
          .rpc('category_attribute_set', params: {'_category_id': categoryId});
      final defs = (data as List)
          .map((r) => CategoryAttributeDef.fromRow(Map<String, dynamic>.from(r as Map)))
          .toList();
      final selectIds = defs.where((d) => d.isSelect).map((d) => d.attributeId).toList();
      if (selectIds.isEmpty) return defs;
      final opts = await _db
          .from('attribute_options')
          .select('id,attribute_id,value,label,label_am')
          .inFilter('attribute_id', selectIds)
          .eq('is_active', true)
          .order('sort_order');
      final byAttr = <String, List<AttributeOption>>{};
      for (final o in opts) {
        final attrId = o['attribute_id'] as String;
        byAttr.putIfAbsent(attrId, () => []).add(AttributeOption.fromRow(Map<String, dynamic>.from(o)));
      }
      return [
        for (final d in defs)
          CategoryAttributeDef(
            attributeId: d.attributeId,
            slug: d.slug,
            name: d.name,
            nameAm: d.nameAm,
            type: d.type,
            unit: d.unit,
            isRequired: d.isRequired,
            sortOrder: d.sortOrder,
            options: byAttr[d.attributeId] ?? const [],
          ),
      ];
    } catch (e) {
      _raise(e);
    }
  }

  /// Existing seller-provided attribute values for a listing (edit prefill).
  static Future<List<ListingAttributeValue>> fetchListingAttributeValues(
      String listingId) async {
    try {
      final data = await _db
          .from('listing_attribute_values')
          .select('attribute_id,value_text,value_number,value_boolean,option_id')
          .eq('listing_id', listingId);
      return (data as List)
          .map((r) => ListingAttributeValue.fromRow(Map<String, dynamic>.from(r as Map)))
          .toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  /// Persist the seller's attribute values (spec §11): replaces the values of
  /// every attribute in [defs]; empty attributes are simply absent — the
  /// backend enforces required ones when the listing goes active.
  static Future<void> saveListingAttributeValues(
    String listingId,
    List<CategoryAttributeDef> defs,
    List<ListingAttributeValue> values,
  ) async {
    if (defs.isEmpty) return;
    final defIds = defs.map((d) => d.attributeId).toList();
    await _db
        .from('listing_attribute_values')
        .delete()
        .eq('listing_id', listingId)
        .inFilter('attribute_id', defIds);
    if (values.isEmpty) return;
    await _db
        .from('listing_attribute_values')
        .insert([for (final v in values) v.toRow(listingId)]);
  }

  static Future<List<Listing>> fetchMyListings(String sellerId) async {
    try {
      final data = await _db
          .from('listings')
          .select(_listingSelect)
          .eq('seller_id', sellerId)
          .order('created_at', ascending: false);
      return data
          .map((r) => Listing.fromJson(_resolveImageUrls(r)))
          .toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<Listing?> fetchListingForEdit(String id) async {
    try {
      final data = await _db
          .from('listings')
          .select(_listingSelect)
          .eq('id', id)
          .maybeSingle();
      return data == null ? null : Listing.fromJson(_resolveImageUrls(data));
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> updateListing(
    String id,
    Map<String, dynamic> patch,
  ) async {
    try {
      await _db.from('listings').update(patch).eq('id', id);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> replaceListingImages(
    String listingId,
    List<String> urls,
  ) async {
    try {
      await _db
          .from('listing_images')
          .delete()
          .eq('listing_id', listingId)
          .then((_) {});
      if (urls.isEmpty) return;
      await _db.from('listing_images').insert([
        for (int i = 0; i < urls.length; i++)
          {'listing_id': listingId, 'url': urls[i], 'position': i},
      ]);
    } catch (e) {
      _raise(e);
    }
  }

  /// Delete a listing (images cascade; storage objects removed best-effort).
  static Future<void> deleteListing(String id) async {
    try {
      final row = await _db
          .from('listings')
          .select('listing_images(url)')
          .eq('id', id)
          .maybeSingle();
      final paths = (row?['listing_images'] as List<dynamic>? ?? const [])
          .map((e) => (e as Map<String, dynamic>)['url'] as String? ?? '')
          .map(_storagePath)
          .where((url) => url.isNotEmpty && !url.startsWith('http'))
          .toList();
      await _db.from('listings').delete().eq('id', id);
      if (paths.isNotEmpty) {
        await AppSupabase.client.storage.from('listing-images').remove(paths);
      }
    } catch (e) {
      _raise(e);
    }
  }

  /// Delete a listing as admin (images cascade; storage objects removed).
  static Future<void> deleteListingAdmin(String id) async {
    try {
      final row = await _db
          .from('listings')
          .select('listing_images(url)')
          .eq('id', id)
          .maybeSingle();
      final paths = (row?['listing_images'] as List<dynamic>? ?? const [])
          .map((e) => (e as Map<String, dynamic>)['url'] as String? ?? '')
          .map(_storagePath)
          .where((url) => url.isNotEmpty && !url.startsWith('http'))
          .toList();
      await _db.from('listings').delete().eq('id', id);
      if (paths.isNotEmpty) {
        await AppSupabase.client.storage.from('listing-images').remove(paths);
      }
    } catch (e) {
      _raise(e);
    }
  }

  static Future<AdminStats> fetchAdminStats() async {
    try {
      final weekAgo = DateTime.now()
          .subtract(const Duration(days: 7))
          .toUtc()
          .toIso8601String();
      final results = await Future.wait<Object>([
        _db.from('listings').select('id'),
        _db.from('profiles').select('id'),
        _db.from('profiles').select('id').eq('is_seller', true),
        _db
            .from('profiles')
            .select('id')
            .eq('is_seller', true)
            .eq('verified', true),
        _db.from('listings').select('view_count').neq('status', 'draft'),
        fetchTrendingSearches(limit: 6),
        _db.from('listings').select('status'),
        _db.from('listings').select('id').eq('featured', true),
        _db.from('conversations').select('id'),
        _db.from('messages').select('id'),
        _db.from('reviews').select('id'),
        _db.from('listings').select('id').gte('created_at', weekAgo),
        _db.from('profiles').select('id').gte('created_at', weekAgo),
        _db
            .from('telegram_delivery_log')
            .select('ok,error')
            .gte('created_at', weekAgo),
        _db.from('profiles').select('id').not('telegram_chat_id', 'is', null),
        _db.from('profiles').select('id').eq('telegram_blocked', true),
        _db.from('telegram_channel_posts').select('listing_id'),
        _db.from('telegram_processed_updates').select('update_id'),
      ]);

      final listings = results[0] as List;
      final users = results[1] as List;
      final sellers = results[2] as List;
      final verified = results[3] as List;
      final viewsData = results[4] as List;
      final trending = (results[5] as List<dynamic>).cast<String>();
      final statuses = results[6] as List;
      final featured = results[7] as List;
      final conversations = results[8] as List;
      final messages = results[9] as List;
      final reviews = results[10] as List;
      final newListings = results[11] as List;
      final newUsers = results[12] as List;
      final telegramLog = results[13] as List;
      final telegramLinked = results[14] as List;
      final telegramBlocked = results[15] as List;
      final telegramPosts = results[16] as List;
      final telegramUpdates = results[17] as List;

      var totalViews = 0;
      for (final row in viewsData.cast<Map<String, dynamic>>()) {
        totalViews += (row['view_count'] as num?)?.toInt() ?? 0;
      }
      final statusCounts = <String, int>{};
      for (final row in statuses.cast<Map<String, dynamic>>()) {
        final status = row['status'] as String? ?? '';
        statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      }
      final total = listings.length;
      final active = statusCounts['active'] ?? 0;
      final sold = statusCounts['sold'] ?? 0;

      var tgSends = 0;
      var tgOk = 0;
      final tgReasons = <String>[];
      for (final row in telegramLog.cast<Map<String, dynamic>>()) {
        tgSends++;
        if (row['ok'] == true) {
          tgOk++;
        } else {
          final err = row['error'] as String?;
          if (err != null && err.isNotEmpty && !tgReasons.contains(err)) {
            tgReasons.add(err);
          }
        }
      }

      return AdminStats(
        listings: total,
        users: users.length,
        sellers: sellers.length,
        verifiedSellers: verified.length,
        totalViews: totalViews,
        topSearches: trending,
        activeListings: active,
        soldListings: sold,
        otherListings: total - active - sold,
        featuredListings: featured.length,
        conversations: conversations.length,
        messages: messages.length,
        reviews: reviews.length,
        newListings7d: newListings.length,
        newUsers7d: newUsers.length,
        telegramSends7d: tgSends,
        telegramOk7d: tgOk,
        telegramFailures7d: tgSends - tgOk,
        telegramFailureReasons: tgReasons.take(3).toList(),
        telegramLinkedUsers: telegramLinked.length,
        telegramBlockedUsers: telegramBlocked.length,
        telegramChannelPosts: telegramPosts.length,
        telegramProcessedUpdates: telegramUpdates.length,
      );
    } catch (e) {
      _raise(e);
    }
  }

  /// Daily activity series for the admin trend chart (zero-filled, like web).
  static Future<List<TrendDay>> fetchAdminTrend(int days) async {
    try {
      final since = DateTime.now()
          .subtract(Duration(days: days))
          .toUtc()
          .toIso8601String();
      final results = await Future.wait<Object>([
        _db.from('listings').select('created_at').gte('created_at', since),
        _db.from('profiles').select('created_at').gte('created_at', since),
        _db.from('messages').select('created_at').gte('created_at', since),
        _db.from('listing_views').select('created_at').gte('created_at', since),
      ]);
      final listings = results[0] as List;
      final users = results[1] as List;
      final messages = results[2] as List;
      final views = results[3] as List;

      final buckets = <String, TrendDay>{};
      final label = (DateTime d) => '${d.month}/${d.day}';
      for (int i = days - 1; i >= 0; i--) {
        final d = DateTime.now().subtract(Duration(days: i));
        final k = d.toIso8601String().substring(0, 10);
        buckets[k] = TrendDay(
          date: k,
          label: label(d),
          listings: 0,
          users: 0,
          messages: 0,
          views: 0,
        );
      }
      void bump(List rows, String key, int dayCount) {
        for (final row in rows.cast<Map<String, dynamic>>()) {
          final createdAt = row[key] as String?;
          if (createdAt == null) continue;
          final day = createdAt.substring(0, 10);
          final b = buckets[day];
          if (b == null) continue;
          switch (dayCount) {
            case 0:
              buckets[day] = TrendDay(
                date: b.date,
                label: b.label,
                listings: b.listings + 1,
                users: b.users,
                messages: b.messages,
                views: b.views,
              );
            case 1:
              buckets[day] = TrendDay(
                date: b.date,
                label: b.label,
                listings: b.listings,
                users: b.users + 1,
                messages: b.messages,
                views: b.views,
              );
            case 2:
              buckets[day] = TrendDay(
                date: b.date,
                label: b.label,
                listings: b.listings,
                users: b.users,
                messages: b.messages + 1,
                views: b.views,
              );
            default:
              buckets[day] = TrendDay(
                date: b.date,
                label: b.label,
                listings: b.listings,
                users: b.users,
                messages: b.messages,
                views: b.views + 1,
              );
          }
        }
      }

      bump(listings, 'created_at', 0);
      bump(users, 'created_at', 1);
      bump(messages, 'created_at', 2);
      bump(views, 'created_at', 3);
      return buckets.values.toList();
    } catch (e) {
      _raise(e);
    }
  }

  /// Top search terms with counts this week (bars, web parity).
  static Future<List<CategoryCount>> fetchAdminTopSearches() async {
    try {
      final weekAgo = DateTime.now()
          .subtract(const Duration(days: 7))
          .toUtc()
          .toIso8601String();
      final data = await _db
          .from('search_log')
          .select('query')
          .gte('created_at', weekAgo);
      final counts = <String, int>{};
      for (final row in data) {
        final q = (row['query'] as String? ?? '').trim().toLowerCase();
        if (q.isEmpty) continue;
        counts[q] = (counts[q] ?? 0) + 1;
      }
      final sorted = counts.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return [
        for (final e in sorted.take(6))
          CategoryCount(name: e.key, count: e.value),
      ];
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<CategoryCount>> fetchAdminTopCategories() async {
    try {
      final data = await _db
          .from('listings')
          .select('categories(name)')
          .neq('status', 'draft')
          .limit(500);
      final counts = <String, int>{};
      for (final row in data) {
        final cat = row['categories'] as Map<String, dynamic>?;
        final name = cat?['name'] as String? ?? 'Uncategorised';
        counts[name] = (counts[name] ?? 0) + 1;
      }
      final sorted = counts.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return [
        for (final e in sorted.take(10))
          CategoryCount(name: e.key, count: e.value),
      ];
    } catch (e) {
      _raise(e);
    }
  }

  static String _toSlug(String name) {
    final lower = name.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), '-');
    return lower.replaceAll(RegExp(r'^-|-$'), '');
  }

  // ── Seller dashboard (status/stats/callbacks/reports/offers) ────────────

  /// Simple status flip on a listing (mirrors RN `updateListingStatus`).
  static Future<void> updateListingStatus(String listingId, String status) async {
    try {
      await _db.from('listings').update({'status': status}).eq('id', listingId);
    } catch (e) {
      _raise(e);
    }
  }

  /// Mark a listing sold and ping every buyer who has a conversation about it
  /// (mirrors RN `markListingSold`).
  static Future<void> markListingSold(String listingId, String? listingTitle) async {
    try {
      await updateListingStatus(listingId, 'sold');
      final rows = await _db
          .from('conversations')
          .select('buyer_id')
          .eq('listing_id', listingId);
      for (final row in rows) {
        final buyerId = row['buyer_id'] as String?;
        if (buyerId == null) continue;
        await notifyUser(buyerId, 'listing_sold', {'title': listingTitle, 'listingId': listingId});
      }
    } catch (e) {
      _raise(e);
    }
  }

  /// Views per day over the last 14 days for the seller's listings (web parity).
  static Future<List<({String date, int count})>> fetchViewsPerDay(String sellerId) async {
    try {
      final ids = await _db.from('listings').select('id').eq('seller_id', sellerId);
      if (ids.isEmpty) return const [];
      final since = DateTime.now()
          .subtract(const Duration(days: 14))
          .toUtc()
          .toIso8601String();
      final data = await _db
          .from('listing_views')
          .select('created_at')
          .inFilter('listing_id', ids.map((r) => r['id'] as String).toList(growable: false))
          .gte('created_at', since);
      final byDay = <String, int>{};
      for (final row in data) {
        final day = (row['created_at'] as String).substring(0, 10);
        byDay[day] = (byDay[day] ?? 0) + 1;
      }
      final out = <({String date, int count})>[];
      for (int i = 13; i >= 0; i--) {
        final day = DateTime.now()
            .subtract(Duration(days: i))
            .toIso8601String()
            .substring(0, 10);
        out.add((date: day, count: byDay[day] ?? 0));
      }
      return out;
    } catch (e) {
      _raise(e);
    }
  }

  static Future<int> fetchConversationCount(String sellerId) async {
    try {
      final data = await _db
          .from('conversations')
          .select('id')
          .eq('seller_id', sellerId);
      return data.length;
    } catch (e) {
      _raise(e);
    }
  }

  /// Buyer asks the seller to call them back. The callback_requests row must be
  /// inserted BEFORE notify_user — that RPC only notifies someone you already
  /// share a thread with, so the insert is what establishes it (RN parity).
  static Future<void> requestCallback({
    required String listingId,
    required String buyerId,
    required String sellerId,
    required String listingTitle,
    required String phone,
    String? note,
  }) async {
    try {
      await _db.from('callback_requests').insert({
        'listing_id': listingId,
        'buyer_id': buyerId,
        'seller_id': sellerId,
        'phone': phone,
        'note': note,
      });
      await notifyUser(sellerId, 'callback_request', {
        'title': listingTitle,
        'listingId': listingId,
        'phone': phone,
        'buyerId': buyerId,
        if (note != null && note.isNotEmpty) 'note': note,
      });
      // Mirror the request into the chat so the number lives with the
      // conversation, not just in alerts.
      final conversationId = await ensureConversation(listingId, buyerId, sellerId);
      final body = '📞 Callback request — A buyer ($phone) would like you to call them back about "$listingTitle".'
          '${note != null && note.isNotEmpty ? '\nNote: $note' : ''}';
      await sendMessage(conversationId, buyerId, body);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<CallbackRequest>> fetchCallbacks(String sellerId) async {
    try {
      final data = await _db
          .from('callback_requests')
          .select('id,phone,note,status,created_at,buyer_id,listings(title)')
          .eq('seller_id', sellerId)
          .order('created_at', ascending: false);
      return data.map(CallbackRequest.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  /// Mark a callback request contacted/closed and notify the buyer (RN parity).
  static Future<void> updateCallbackStatus(
    String id,
    String status, {
    String? buyerId,
    String? listingTitle,
  }) async {
    try {
      await _db.from('callback_requests').update({'status': status}).eq('id', id);
      if (buyerId != null && buyerId.isNotEmpty) {
        await notifyUser(buyerId, 'callback_response', {
          'status': status,
          if (listingTitle != null && listingTitle.isNotEmpty) 'title': listingTitle,
        });
      }
    } catch (e) {
      _raise(e);
    }
  }

  /// Submit a moderation report on a listing or user (RN parity).
  static Future<void> submitReport({
    required String reporterId,
    required String reason,
    String? details,
    String? listingId,
    String? reportedUserId,
  }) async {
    try {
      await _db.from('reports').insert({
        'reporter_id': reporterId,
        'reason': reason,
        'details': details?.trim().isEmpty ?? false ? null : details?.trim(),
        'listing_id': listingId,
        'reported_user_id': reportedUserId,
        'status': 'pending',
      });
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<Offer>> fetchOffers(String sellerId) async {
    try {
      final data = await _db
          .from('offers')
          .select(
            'id,amount,message,status,created_at,buyer_id,listings(id,title),buyer:profiles!offers_buyer_id_fkey(full_name,phone)',
          )
          .eq('seller_id', sellerId)
          .order('created_at', ascending: false);
      return data.map(Offer.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<Offer?> fetchMyOfferForListing(String listingId, String buyerId) async {
    try {
      final data = await _db
          .from('offers')
          .select(
            'id,amount,message,status,created_at,buyer_id,seller_id,listings(id,title),buyer:profiles!offers_buyer_id_fkey(full_name,phone)',
          )
          .eq('listing_id', listingId)
          .eq('buyer_id', buyerId)
          .maybeSingle();
      return data == null ? null : Offer.fromJson(data);
    } catch (e) {
      _raise(e);
    }
  }

  /// Buyer proposes an amount. The offer row must be inserted before
  /// notify_user — it is what establishes the thread (RN parity).
  static Future<void> makeOffer({
    required String listingId,
    required String buyerId,
    required String sellerId,
    required double amount,
    String? message,
  }) async {
    try {
      final offerRow = await _db
          .from('offers')
          .insert({
            'listing_id': listingId,
            'buyer_id': buyerId,
            'seller_id': sellerId,
            'amount': amount,
            'message': message,
          })
          .select('id')
          .single();
      final conversationId = await ensureConversation(listingId, buyerId, sellerId);
      await notifyUser(sellerId, 'offer_received', {
        'title': (await _db.from('listings').select('title').eq('id', listingId).single())['title'],
        'listingId': listingId,
        'offerId': offerRow['id'],
        'amount': amount,
        'buyerId': buyerId,
        'conversationId': conversationId,
        if (message != null && message.isNotEmpty) 'message': message,
      });
      final body = '💰 Offer — A buyer offers $amount for your listing.'
          '${message != null && message.isNotEmpty ? '\nMessage: $message' : ''}';
      await sendMessage(conversationId, buyerId, body);
    } catch (e) {
      _raise(e);
    }
  }

  /// Seller accepts or declines an offer; the buyer is notified either way.
  static Future<void> respondToOffer(Offer offer, String status, {String? conversationId}) async {
    try {
      await _db.from('offers').update({
        'status': status,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', offer.id);
      final convId = conversationId ??
          await _db
              .from('conversations')
              .select('id')
              .eq('listing_id', offer.listingId)
              .eq('buyer_id', offer.buyerId)
              .maybeSingle()
              .then((r) => r?['id'] as String?);
      await notifyUser(offer.buyerId, 'offer_response', {
        'status': status,
        'title': offer.listingTitle,
        'listingId': offer.listingId,
        'amount': offer.amount,
        if (convId != null && convId.isNotEmpty) 'conversationId': convId,
      });
    } catch (e) {
      _raise(e);
    }
  }

  // ── Admin moderation (reports, verification, users, categories) ─────────

  static Future<List<AdminReport>> fetchAdminReports() async {
    try {
      final data = await _db
          .from('reports')
          .select('*, listings(title,id), profiles(full_name,shop_name)')
          .eq('status', 'pending')
          .order('created_at', ascending: false);
      return data.map(AdminReport.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  /// Resolve or dismiss a report and close the loop with the reporter.
  static Future<void> resolveReport(AdminReport report, String status) async {
    try {
      await _db.from('reports').update({'status': status}).eq('id', report.id);
      final reporterId = report.reporterId;
      final listingId = report.listingId;
      if (reporterId != null && reporterId.isNotEmpty) {
        try {
          await _db.rpc(
            'admin_notify_user',
            params: {
              '_user_id': reporterId,
              '_type': status == 'reviewed' ? 'report_resolved' : 'report_dismissed',
              '_payload': {
                'title': report.listingTitle ?? report.profileShopName ?? report.reason,
                if (listingId != null && listingId.isNotEmpty) 'listingId': listingId,
              },
            },
          );
        } catch (_) {
          // notification must never fail the moderation action
        }
      }
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<AdminVerificationDoc>> fetchVerificationQueue() async {
    try {
      final data = await _db
          .from('seller_verification_documents')
          .select(
            'id,document_type,file_url,status,rejection_reason,reviewed_at,created_at,seller_id,'
            'profiles!seller_verification_documents_seller_id_fkey(full_name,shop_name,shop_slug,phone,city,shop_address,registration_number,created_at)',
          )
          .eq('status', 'pending')
          .order('created_at', ascending: true);
      return data.map(AdminVerificationDoc.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<VerificationDecision>> fetchVerificationDecisions() async {
    try {
      final data = await _db
          .from('verification_decisions')
          .select(
            'id,action,reason,created_at,reviewer_id,seller_id,'
            'profiles!verification_decisions_reviewer_id_fkey(full_name),'
            'seller:profiles!verification_decisions_seller_id_fkey(full_name,shop_name)',
          )
          .order('created_at', ascending: false)
          .limit(25);
      return data.map(VerificationDecision.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  /// Approve/reject a seller verification document, record the audit trail,
  /// update the verified badge on approval, and notify the seller.
  static Future<void> decideDocument(String documentId, String action, {String? reason}) async {
    try {
      final doc = await _db
          .from('seller_verification_documents')
          .select('id,seller_id,status')
          .eq('id', documentId)
          .maybeSingle();
      if (doc == null || doc['status'] != 'pending') throw ApiError('not_found');

      final reviewerId = _db.auth.currentUser?.id ?? doc['seller_id'];

      await _db.from('seller_verification_documents').update({
        'status': action,
        'reviewed_at': DateTime.now().toUtc().toIso8601String(),
        'rejection_reason': action == 'rejected' ? reason : null,
      }).eq('id', documentId);

      await _db.from('verification_decisions').insert({
        'seller_id': doc['seller_id'],
        'document_id': doc['id'],
        'reviewer_id': reviewerId,
        'action': action,
        'reason': action == 'rejected' ? reason : null,
      });

      if (action == 'approved') {
        await _db.from('profiles').update({'verified': true}).eq('id', doc['seller_id'] as String);
      }

      try {
        await _db.rpc(
          'admin_notify_user',
          params: {
            '_user_id': doc['seller_id'],
            '_type': action == 'approved' ? 'seller_verified' : 'seller_rejected',
            '_payload': {'status': action, 'reason': action == 'rejected' ? (reason ?? '') : ''},
          },
        );
      } catch (_) {
        // notification must never fail the moderation action
      }
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<AdminUser>> fetchAdminUsers() async {
    try {
      final data = await _db
          .from('profiles')
          .select(
            'id,full_name,shop_name,shop_slug,avatar_url,shop_logo_url,verified,is_seller,created_at,phone,city,banned_until,ban_reason',
          )
          .order('created_at', ascending: false);
      return data.map(AdminUser.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  /// Log the user out of every device (deletes sessions + refresh tokens).
  static Future<void> revokeSessions(String userId) async {
    try {
      await _db.rpc('admin_revoke_sessions', params: {'_user_id': userId});
    } catch (e) {
      _raise(e);
    }
  }

  /// Suspend a user for `hours` (mirrors RN `banUser`).
  static Future<void> banUser(String userId, int hours, {String? reason}) async {
    try {
      await _db.rpc('admin_set_ban', params: {
        '_user_id': userId,
        '_until': DateTime.now().add(Duration(hours: hours)).toUtc().toIso8601String(),
        '_reason': reason,
      });
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> unbanUser(String userId) async {
    try {
      await _db.rpc('admin_set_ban', params: {
        '_user_id': userId,
        '_until': null,
        '_reason': null,
      });
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<AdminCategory>> fetchAdminCategories() async {
    try {
      final data = await _db.from('categories').select().order('sort_order');
      return data.map(AdminCategory.fromJson).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> createCategory(String name, {String? parentId, String? icon}) async {
    try {
      await _db.from('categories').insert({
        'name': name.trim(),
        'slug': _toSlug(name),
        'parent_id': parentId,
        'icon': icon,
        'sort_order': 1,
      });
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> renameCategory(String id, String name, {String? icon}) async {
    try {
      await _db.from('categories').update({
        'name': name.trim(),
        'slug': _toSlug(name),
        if (icon != null) 'icon': icon,
      }).eq('id', id);
    } catch (e) {
      _raise(e);
    }
  }

  /// Swap a category's sort_order with its adjacent sibling to reorder the tree.
  static Future<void> moveCategory(String id, String direction) async {
    try {
      final data = await _db
          .from('categories')
          .select('id,parent_id,sort_order')
          .order('sort_order');
      final rows = data.cast<Map<String, dynamic>>().toList(growable: false);
      final index = rows.indexWhere((r) => r['id'] == id);
      if (index == -1) return;
      final row = rows[index];
      final siblings = rows.where((r) => r['parent_id'] == row['parent_id']).toList();
      final sibIndex = siblings.indexWhere((r) => r['id'] == id);
      final swap = direction == 'up' ? siblings[sibIndex - 1] : siblings[sibIndex + 1];
      if (swap == null) return; // already first/last
      await Future.wait<void>([
        _db.from('categories').update({'sort_order': swap['sort_order']}).eq('id', id),
        _db.from('categories').update({'sort_order': row['sort_order']}).eq('id', swap['id'] as String),
      ]);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<Map<String, int>> fetchAdminCategoryCounts() async {
    try {
      final data = await _db.from('category_listing_counts').select('category_id,listing_count');
      final counts = <String, int>{};
      for (final row in data) {
        final categoryId = row['category_id'] as String?;
        if (categoryId == null) continue;
        counts[categoryId] = (row['listing_count'] as num?)?.toInt() ?? 0;
      }
      return counts;
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> deleteCategory(String id) async {
    try {
      await _db.from('categories').delete().eq('id', id);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<List<AdminListing>> fetchAdminListings() async {
    try {
      final data = await _db
          .from('listings')
          .select(
            'id,title,price,status,city,featured,created_at,seller_id,listing_images(url),profiles(full_name,shop_name,shop_slug)',
          )
          .order('created_at', ascending: false)
          .limit(60);
      return data.map((r) {
        final images = r['listing_images'] as List<dynamic>? ?? const [];
        if (images.isNotEmpty) {
          final first = Map<String, dynamic>.from(images.first as Map);
          first['url'] = _resolveStorageUrl(first['url'] as String? ?? '');
          r = {...r, 'listing_images': [first, ...images.skip(1)]};
        }
        return AdminListing.fromJson(r);
      }).toList(growable: false);
    } catch (e) {
      _raise(e);
    }
  }

  static Future<void> toggleFeatured(String id, bool featured) async {
    try {
      await _db.from('listings').update({'featured': featured}).eq('id', id);
    } catch (e) {
      _raise(e);
    }
  }

  // ── Misc ────────────────────────────────────────────────────────────────

  /// Mirrors RN `isAdmin` in `mobile/src/lib/admin.ts`: the `has_role` RPC is
  /// granted to authenticated (20260802081500) and reflects the same admin
  /// grant used by every admin RLS policy.
  static Future<bool> isAdmin(String userId) async {
    try {
      final res = await _db.rpc(
        'has_role',
        params: {'_user_id': userId, '_role': 'admin'},
      );
      return res == true;
    } catch (e) {
      _raise(e);
    }
  }

  static String listingImageUrl(String path) => _resolveStorageUrl(path);

  static String profileImageUrl(String path) {
    // Profile images are stored as full Cloudinary URLs (mirrors RN/web); a
    // legacy storage path is returned unchanged since profile-images was never
    // an actual bucket.
    return path;
  }

  /// Admin document viewer: verification documents live in the private bucket,
  /// so the admin needs a short-lived signed URL. Public https URLs pass
  /// through unchanged (e.g. older rows seeded as demos).
  static Future<String?> signedDocumentUrl(String path) async {
    if (path.startsWith('http')) return path;
    try {
      final url = await AppSupabase.client.storage
          .from('verification-docs')
          .createSignedUrl(path, 3600);
      return url;
    } catch (_) {
      return null;
    }
  }

  static String _rand() {
    return '${DateTime.now().microsecondsSinceEpoch % 1000000}';
  }
}

class ListingFilters {
  const ListingFilters({
    this.q,
    this.category,
    this.condition,
    this.material,
    this.room,
    this.city,
    this.min,
    this.max,
    this.discounted = false,
    this.featured = false,
    this.sort,
    this.sellerId,
    this.limit,
    this.attributes,
  });

  final String? q;
  final String? category;
  final String? condition;
  final String? material;
  final String? room;
  final String? city;
  final double? min;
  final double? max;
  final bool discounted;
  final bool featured;
  final String? sort;
  final String? sellerId;
  final int? limit;

  /// Phase 6 (§14): dynamic attribute filters keyed by attribute SLUG.
  /// Values are option values ("wood") for selects, true/false for booleans,
  /// free text for text attributes, or a [min, max] pair (null bound open)
  /// for number/range attributes. Attributes AND; values within one OR.
  final Map<String, List<Object>>? attributes;

  bool get hasActiveFilters =>
      q != null ||
      condition != null ||
      material != null ||
      room != null ||
      city != null ||
      min != null ||
      max != null ||
      (attributes != null && attributes!.isNotEmpty);

  ListingFilters copyWith({
    String? q,
    String? category,
    String? condition,
    String? material,
    String? room,
    String? city,
    double? min,
    double? max,
    bool? discounted,
    bool? featured,
    String? sort,
    String? sellerId,
    int? limit,
    Map<String, List<Object>>? attributes,
    bool clear = false,
  }) {
    return ListingFilters(
      q: clear ? null : (q ?? this.q),
      category: clear ? null : (category ?? this.category),
      condition: clear ? null : (condition ?? this.condition),
      material: clear ? null : (material ?? this.material),
      room: clear ? null : (room ?? this.room),
      city: clear ? null : (city ?? this.city),
      min: clear ? null : (min ?? this.min),
      max: clear ? null : (max ?? this.max),
      discounted: clear ? false : (discounted ?? this.discounted),
      featured: clear ? false : (featured ?? this.featured),
      sort: clear ? null : (sort ?? this.sort),
      sellerId: clear ? null : (sellerId ?? this.sellerId),
      limit: limit ?? this.limit,
      attributes: clear ? null : (attributes ?? this.attributes),
    );
  }
}
