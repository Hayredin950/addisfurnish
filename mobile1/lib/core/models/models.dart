/// Typed models mirroring the Supabase schema shared with the web app.
library;

/// A furniture category (may have a `parentId`).
class Category {
  const Category({
    required this.id,
    required this.name,
    required this.slug,
    this.nameAm,
    this.parentId,
    this.icon,
    required this.sortOrder,
  });

  final String id;
  final String name;
  final String slug;
  final String? nameAm;
  final String? parentId;
  final String? icon;
  final int sortOrder;

  factory Category.fromJson(Map<String, dynamic> json) => Category(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        nameAm: json['name_am'] as String?,
        parentId: json['parent_id'] as String?,
        icon: json['icon'] as String?,
        sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'slug': slug,
        'name_am': nameAm,
        'parent_id': parentId,
        'icon': icon,
        'sort_order': sortOrder,
      };
}

/// The seller/author profile embedded into listings.
class SellerSummary {
  const SellerSummary({
    required this.id,
    this.fullName,
    this.shopName,
    this.shopSlug,
    this.shopLogoUrl,
    this.avatarUrl,
    this.verified = false,
    this.city,
    this.phone,
    this.lastSeen,
    this.isOnline = false,
    this.whatsapp,
    this.telegram,
  });

  final String id;
  final String? fullName;
  final String? shopName;
  final String? shopSlug;
  final String? shopLogoUrl;
  final String? avatarUrl;
  final bool verified;
  final String? city;
  final String? phone;
  final String? lastSeen;
  final bool isOnline;
  final String? whatsapp;
  final String? telegram;

  factory SellerSummary.fromJson(Map<String, dynamic> json) => SellerSummary(
        id: json['id'] as String,
        fullName: json['full_name'] as String?,
        shopName: json['shop_name'] as String?,
        shopSlug: json['shop_slug'] as String?,
        shopLogoUrl: json['shop_logo_url'] as String?,
        avatarUrl: json['avatar_url'] as String?,
        verified: json['verified'] as bool? ?? false,
        city: json['city'] as String?,
        phone: json['phone'] as String?,
        lastSeen: json['last_seen'] as String?,
        isOnline: json['is_online'] as bool? ?? false,
        whatsapp: json['whatsapp'] as String?,
        telegram: json['telegram'] as String?,
      );

  String get displayName => shopName?.isNotEmpty == true ? shopName! : fullName ?? '';

  /// Public profile photo — shop logo if present, otherwise avatar.
  String? get photoUrl => shopLogoUrl ?? avatarUrl;
}

/// A used-furniture listing with joined images + seller + category.
class Listing {
  const Listing({
    required this.id,
    required this.sellerId,
    required this.title,
    required this.description,
    required this.price,
    required this.condition,
    required this.city,
    required this.status,
    required this.viewCount,
    required this.createdAt,
    this.categoryId,
    this.originalPrice,
    this.negotiable = false,
    this.material,
    this.color,
    this.roomType,
    this.brand,
    this.subCity,
    this.featured = false,
    this.deliveryOffered = false,
    this.deliveryFee,
    this.discountExpiresAt,
    this.latitude,
    this.longitude,
    this.videoUrl,
    this.images = const [],
    this.seller,
    this.category,
  });

  final String id;
  final String sellerId;
  final String? categoryId;
  final String title;
  final String description;
  final double price;
  final double? originalPrice;
  final bool negotiable;
  final String condition;
  final String? material;
  final String? color;
  final String? roomType;
  final String? brand;
  final String city;
  final String? subCity;
  final String status;
  final int viewCount;
  final DateTime createdAt;
  final bool featured;
  final bool deliveryOffered;
  final double? deliveryFee;
  final DateTime? discountExpiresAt;
  final double? latitude;
  final double? longitude;
  final String? videoUrl;
  final List<ListingImage> images;
  final SellerSummary? seller;
  final ({String name, String slug, String? nameAm})? category;

  bool get isDiscounted => originalPrice != null && originalPrice! > price;

  bool get discountActive =>
      isDiscounted && (discountExpiresAt == null || discountExpiresAt!.isAfter(DateTime.now()));

  bool get isSold => status == 'sold';
  bool get isReserved => status == 'reserved';

  String? get coverImageUrl => images.isNotEmpty ? images.first.url : null;

  factory Listing.fromJson(Map<String, dynamic> json) {
    final imagesJson = json['listing_images'] as List<dynamic>? ?? const [];
    final sellerJson = json['profiles'] as Map<String, dynamic>?;
    final categoryJson = json['categories'] as Map<String, dynamic>?;
    return Listing(
      id: json['id'] as String,
      sellerId: json['seller_id'] as String,
      categoryId: json['category_id'] as String?,
      title: json['title'] as String,
      description: json['description'] as String? ?? '',
      price: (json['price'] as num).toDouble(),
      originalPrice: (json['original_price'] as num?)?.toDouble(),
      negotiable: json['negotiable'] as bool? ?? false,
      condition: json['condition'] as String? ?? '',
      material: json['material'] as String?,
      color: json['color'] as String?,
      roomType: json['room_type'] as String?,
      brand: json['brand'] as String?,
      city: json['city'] as String? ?? '',
      subCity: json['sub_city'] as String?,
      status: json['status'] as String? ?? 'active',
      viewCount: (json['view_count'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['created_at'] as String),
      featured: json['featured'] as bool? ?? false,
      deliveryOffered: json['delivery_offered'] as bool? ?? false,
      deliveryFee: (json['delivery_fee'] as num?)?.toDouble(),
      discountExpiresAt: json['discount_expires_at'] != null
          ? DateTime.tryParse(json['discount_expires_at'] as String)
          : null,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      videoUrl: json['video_url'] as String?,
      images: imagesJson
          .map((e) => ListingImage.fromJson(e as Map<String, dynamic>))
          .toList(growable: false),
      seller: sellerJson != null ? SellerSummary.fromJson(sellerJson) : null,
      category: categoryJson != null
          ? (
              name: categoryJson['name'] as String? ?? '',
              slug: categoryJson['slug'] as String? ?? '',
              nameAm: categoryJson['name_am'] as String?,
            )
          : null,
    );
  }
}

class ListingImage {
  const ListingImage({required this.id, required this.url, required this.position});

  final String id;
  final String url;
  final int position;

  factory ListingImage.fromJson(Map<String, dynamic> json) => ListingImage(
        id: json['id'] as String,
        url: json['url'] as String,
        position: (json['position'] as num?)?.toInt() ?? 0,
      );
}

/// The signed-in user's own profile row.
class Profile {
  const Profile({
    required this.id,
    required this.fullName,
    this.phone,
    this.city,
    this.bio,
    this.avatarUrl,
    this.isSeller = false,
    this.shopName,
    this.shopSlug,
    this.shopDescription,
    this.shopLogoUrl,
    this.shopAddress,
    this.verified = false,
    this.isOnline = false,
    this.lastSeen,
    this.phoneVerifiedAt,
    this.whatsapp,
    this.telegram,
    this.telegramChatId,
    this.preferredLanguage = 'en',
    this.registrationNumber,
    this.latitude,
    this.longitude,
    this.bannedUntil,
    this.banReason,
    this.createdAt,
    this.accountType = 'BUYER',
    this.sellerStatus = 'UNVERIFIED',
  });

  final String id;
  final String fullName;
  final String? phone;
  final String? city;
  final String? bio;
  final String? avatarUrl;
  final bool isSeller;
  final String? shopName;
  final String? shopSlug;
  final String? shopDescription;
  final String? shopLogoUrl;
  final String? shopAddress;
  final bool verified;
  final bool isOnline;
  final String? lastSeen;
  final String? phoneVerifiedAt;
  final String? whatsapp;
  final String? telegram;
  final String? telegramChatId;
  final String preferredLanguage;
  final String? registrationNumber;
  final double? latitude;
  final double? longitude;
  final String? bannedUntil;
  final String? banReason;
  final DateTime? createdAt;
  final String accountType;
  final String sellerStatus;

  bool get isBanned {
    final until = bannedUntil;
    if (until == null) return false;
    final parsed = DateTime.tryParse(until);
    return parsed != null && parsed.isAfter(DateTime.now());
  }

  factory Profile.fromJson(Map<String, dynamic> json) => Profile(
        id: json['id'] as String,
        fullName: json['full_name'] as String? ?? '',
        phone: json['phone'] as String?,
        city: json['city'] as String?,
        bio: json['bio'] as String?,
        avatarUrl: json['avatar_url'] as String?,
        isSeller: json['is_seller'] as bool? ?? false,
        shopName: json['shop_name'] as String?,
        shopSlug: json['shop_slug'] as String?,
        shopDescription: json['shop_description'] as String?,
        shopLogoUrl: json['shop_logo_url'] as String?,
        shopAddress: json['shop_address'] as String?,
        verified: json['verified'] as bool? ?? false,
        isOnline: json['is_online'] as bool? ?? false,
        lastSeen: json['last_seen'] as String?,
        phoneVerifiedAt: json['phone_verified_at'] as String?,
        whatsapp: json['whatsapp'] as String?,
        telegram: json['telegram'] as String?,
        telegramChatId: json['telegram_chat_id'] as String?,
        preferredLanguage: json['preferred_language'] as String? ?? 'en',
        registrationNumber: json['registration_number'] as String?,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        bannedUntil: json['banned_until'] as String?,
        banReason: json['ban_reason'] as String?,
        createdAt: json['created_at'] != null
            ? DateTime.tryParse(json['created_at'] as String)
            : null,
        accountType: json['account_type'] as String? ?? 'BUYER',
        sellerStatus: json['seller_status'] as String? ?? 'UNVERIFIED',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'full_name': fullName,
        'phone': phone,
        'city': city,
        'bio': bio,
        'avatar_url': avatarUrl,
        'is_seller': isSeller,
        'shop_name': shopName,
        'shop_slug': shopSlug,
        'shop_description': shopDescription,
        'shop_logo_url': shopLogoUrl,
        'shop_address': shopAddress,
        'verified': verified,
        'is_online': isOnline,
        'last_seen': lastSeen,
        'phone_verified_at': phoneVerifiedAt,
        'whatsapp': whatsapp,
        'telegram': telegram,
        'telegram_chat_id': telegramChatId,
        'preferred_language': preferredLanguage,
        'registration_number': registrationNumber,
        'latitude': latitude,
        'longitude': longitude,
        'account_type': accountType,
        'seller_status': sellerStatus,
      };
}

class Message {
  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.body,
    required this.createdAt,
    this.editedAt,
    this.deletedAt,
  });

  final String id;
  final String conversationId;
  final String senderId;
  final String body;
  final DateTime createdAt;
  final DateTime? editedAt;
  final DateTime? deletedAt;

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['id'] as String,
        conversationId: json['conversation_id'] as String,
        senderId: json['sender_id'] as String,
        body: json['body'] as String? ?? '',
        createdAt: DateTime.parse(json['created_at'] as String),
        editedAt: json['edited_at'] != null ? DateTime.tryParse(json['edited_at'] as String) : null,
        deletedAt: json['deleted_at'] != null
            ? DateTime.tryParse(json['deleted_at'] as String)
            : null,
      );
}

class Conversation {
  const Conversation({
    required this.id,
    required this.lastMessageAt,
    this.listingTitle,
    this.listingPrice,
    this.listingImageUrl,
    this.listingId,
    this.otherParty,
    this.unread = 0,
  });

  final String id;
  final DateTime lastMessageAt;
  final String? listingId;
  final String? listingTitle;
  final double? listingPrice;
  final String? listingImageUrl;
  final SellerSummary? otherParty;
  final int unread;

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final listing = json['listings'] as Map<String, dynamic>?;
    final images = listing?['listing_images'] as List<dynamic>? ?? const [];
    final listingImage = images.isNotEmpty
        ? (images.first as Map<String, dynamic>)['url'] as String?
        : null;
    return Conversation(
      id: json['id'] as String,
      lastMessageAt: json['last_message_at'] != null 
          ? DateTime.parse(json['last_message_at'] as String) 
          : DateTime.now(),
      listingId: listing?['id'] as String?,
      listingTitle: listing?['title'] as String?,
      listingPrice: (listing?['price'] as num?)?.toDouble(),
      listingImageUrl: listingImage,
      otherParty: json['profiles'] != null
          ? SellerSummary.fromJson(json['profiles'] as Map<String, dynamic>)
          : null,
    );
  }
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    this.title,
    this.listingId,
    this.query,
    this.status,
    this.oldPrice,
    this.newPrice,
    required this.isRead,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String? title;
  final String? listingId;
  final String? query;
  final String? status;
  final double? oldPrice;
  final double? newPrice;
  final bool isRead;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final payload = json['payload'] as Map<String, dynamic>?;
    return AppNotification(
      id: json['id'] as String,
      type: json['type'] as String? ?? '',
      title: payload?['title'] as String?,
      listingId: payload?['listingId'] as String?,
      query: payload?['query'] as String?,
      status: payload?['status'] as String?,
      oldPrice: (payload?['oldPrice'] as num?)?.toDouble(),
      newPrice: (payload?['newPrice'] as num?)?.toDouble(),
      isRead: json['is_read'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.createdAt,
    this.comment,
    this.authorId,
    this.authorName,
  });

  final String id;
  final int rating;
  final String? comment;
  final String? authorId;
  final String? authorName;
  final DateTime createdAt;

  factory Review.fromJson(Map<String, dynamic> json) {
    final author = json['profiles'] as Map<String, dynamic>?;
    return Review(
      id: json['id'] as String,
      rating: (json['rating'] as num).toInt(),
      comment: json['comment'] as String?,
      authorId: json['author_id'] as String?,
      authorName: author?['full_name'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

class SavedSearch {
  const SavedSearch({
    required this.id,
    required this.createdAt,
    this.query,
    this.filters = const {},
  });

  final String id;
  final String? query;
  final Map<String, dynamic> filters;
  final DateTime createdAt;

  factory SavedSearch.fromJson(Map<String, dynamic> json) => SavedSearch(
        id: json['id'] as String,
        query: json['query'] as String?,
        filters: json['filters'] as Map<String, dynamic>? ?? const {},
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}

class VerificationDocument {
  const VerificationDocument({
    required this.id,
    required this.documentType,
    required this.fileUrl,
    required this.status,
    required this.createdAt,
    this.rejectionReason,
    this.reviewedAt,
  });

  final String id;
  final String documentType;
  final String fileUrl;
  final String status;
  final String? rejectionReason;
  final DateTime? reviewedAt;
  final DateTime createdAt;

  factory VerificationDocument.fromJson(Map<String, dynamic> json) => VerificationDocument(
        id: json['id'] as String,
        documentType: json['document_type'] as String? ?? '',
        fileUrl: json['file_url'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
        rejectionReason: json['rejection_reason'] as String?,
        reviewedAt: json['reviewed_at'] != null
            ? DateTime.tryParse(json['reviewed_at'] as String)
            : null,
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}

class BuyerPreferences {
  const BuyerPreferences({
    this.categoryIds = const [],
    this.priceMin,
    this.priceMax,
    this.preferredCities = const [],
    this.telegramAlertsEnabled = false,
  });

  final List<String> categoryIds;
  final double? priceMin;
  final double? priceMax;
  final List<String> preferredCities;
  final bool telegramAlertsEnabled;

  BuyerPreferences copyWith({
    List<String>? categoryIds,
    double? priceMin,
    double? priceMax,
    List<String>? preferredCities,
    bool? telegramAlertsEnabled,
  }) =>
      BuyerPreferences(
        categoryIds: categoryIds ?? this.categoryIds,
        priceMin: priceMin ?? this.priceMin,
        priceMax: priceMax ?? this.priceMax,
        preferredCities: preferredCities ?? this.preferredCities,
        telegramAlertsEnabled: telegramAlertsEnabled ?? this.telegramAlertsEnabled,
      );

  factory BuyerPreferences.fromJson(Map<String, dynamic> json) => BuyerPreferences(
        categoryIds: (json['category_ids'] as List<dynamic>? ?? const []).cast<String>(),
        priceMin: (json['price_min'] as num?)?.toDouble(),
        priceMax: (json['price_max'] as num?)?.toDouble(),
        preferredCities:
            (json['preferred_cities'] as List<dynamic>? ?? const []).cast<String>(),
        telegramAlertsEnabled: json['telegram_alerts_enabled'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'category_ids': categoryIds,
        'price_min': priceMin,
        'price_max': priceMax,
        'preferred_cities': preferredCities,
        'telegram_alerts_enabled': telegramAlertsEnabled,
      };
}

/// A buyer's price offer on a listing (buyer proposes amount + message; the
/// seller accepts or declines on the dashboard).
class Offer {
  const Offer({
    required this.id,
    required this.listingId,
    required this.buyerId,
    required this.sellerId,
    required this.amount,
    required this.status,
    required this.createdAt,
    this.message,
    this.listingTitle,
    this.buyerName,
    this.buyerPhone,
  });

  final String id;
  final String listingId;
  final String buyerId;
  final String sellerId;
  final double amount;
  final String? message;
  final String status;
  final DateTime createdAt;
  final String? listingTitle;
  final String? buyerName;
  final String? buyerPhone;

  bool get isPending => status == 'pending';

  factory Offer.fromJson(Map<String, dynamic> json) {
    final listing = json['listings'] as Map<String, dynamic>?;
    final buyer = json['buyer'] as Map<String, dynamic>?;
    return Offer(
      id: json['id'] as String,
      listingId: json['listing_id'] as String,
      buyerId: json['buyer_id'] as String,
      sellerId: json['seller_id'] as String,
      amount: (json['amount'] as num).toDouble(),
      message: json['message'] as String?,
      status: json['status'] as String? ?? 'pending',
      createdAt: DateTime.parse(json['created_at'] as String),
      listingTitle: listing?['title'] as String?,
      buyerName: buyer?['full_name'] as String?,
      buyerPhone: buyer?['phone'] as String?,
    );
  }
}

/// A "call me back" request a buyer makes on a listing (seller view).
class CallbackRequest {
  const CallbackRequest({
    required this.id,
    required this.phone,
    required this.status,
    required this.createdAt,
    this.note,
    this.buyerId,
    this.listingTitle,
  });

  final String id;
  final String phone;
  final String? note;
  final String status;
  final String? buyerId;
  final String? listingTitle;
  final DateTime createdAt;

  bool get isPending => status == 'pending';

  factory CallbackRequest.fromJson(Map<String, dynamic> json) {
    final listing = json['listings'] as Map<String, dynamic>?;
    return CallbackRequest(
      id: json['id'] as String,
      phone: json['phone'] as String? ?? '',
      note: json['note'] as String?,
      status: json['status'] as String? ?? 'pending',
      buyerId: json['buyer_id'] as String?,
      listingTitle: listing?['title'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

// ── Admin (moderation console) ────────────────────────────────────────────
// Models mirror `mobile1/src/lib/admin.ts`. Every read/write is gated by the
// admin role server-side (RLS + SECURITY DEFINER RPCs); these are plain DTOs.

/// A moderation report from a user about a listing or shop.
class AdminReport {
  const AdminReport({
    required this.id,
    required this.reason,
    required this.status,
    required this.createdAt,
    this.details,
    this.reporterId,
    this.listingId,
    this.reportedUserId,
    this.listingTitle,
    this.profileName,
    this.profileShopName,
  });

  final String id;
  final String reason;
  final String? details;
  final String status;
  final String? reporterId;
  final String? listingId;
  final String? reportedUserId;
  final String? listingTitle;
  final String? profileName;
  final String? profileShopName;
  final DateTime createdAt;

  String get displayTitle =>
      listingTitle ?? profileShopName ?? profileName ?? reason;

  factory AdminReport.fromJson(Map<String, dynamic> json) {
    final listing = json['listings'] as Map<String, dynamic>?;
    final profile = json['profiles'] as Map<String, dynamic>?;
    return AdminReport(
      id: json['id'] as String,
      reason: json['reason'] as String? ?? '',
      details: json['details'] as String?,
      status: json['status'] as String? ?? 'pending',
      reporterId: json['reporter_id'] as String?,
      listingId: json['listing_id'] as String?,
      reportedUserId: json['reported_user_id'] as String?,
      listingTitle: listing?['title'] as String?,
      profileName: profile?['full_name'] as String?,
      profileShopName: profile?['shop_name'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

/// A pending seller verification document awaiting admin review.
class AdminVerificationDoc {
  const AdminVerificationDoc({
    required this.id,
    required this.documentType,
    required this.fileUrl,
    required this.status,
    required this.createdAt,
    required this.sellerId,
    this.rejectionReason,
    this.reviewedAt,
    this.sellerName,
    this.shopName,
    this.shopSlug,
    this.phone,
    this.city,
    this.shopAddress,
    this.registrationNumber,
  });

  final String id;
  final String documentType;
  final String fileUrl;
  final String status;
  final String? rejectionReason;
  final DateTime? reviewedAt;
  final DateTime createdAt;
  final String sellerId;
  final String? sellerName;
  final String? shopName;
  final String? shopSlug;
  final String? phone;
  final String? city;
  final String? shopAddress;
  final String? registrationNumber;

  String get sellerLabel => shopName ?? sellerName ?? sellerId;

  factory AdminVerificationDoc.fromJson(Map<String, dynamic> json) {
    final profile =
        json['profiles']?['seller_verification_documents_seller_id_fkey'] as Map<String, dynamic>? ??
        json['profiles'] as Map<String, dynamic>? ??
        json['seller'] as Map<String, dynamic>?;
    return AdminVerificationDoc(
      id: json['id'] as String,
      documentType: json['document_type'] as String? ?? '',
      fileUrl: json['file_url'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      rejectionReason: json['rejection_reason'] as String?,
      reviewedAt: json['reviewed_at'] != null
          ? DateTime.tryParse(json['reviewed_at'] as String)
          : null,
      createdAt: DateTime.parse(json['created_at'] as String),
      sellerId: json['seller_id'] as String,
      sellerName: profile?['full_name'] as String?,
      shopName: profile?['shop_name'] as String?,
      shopSlug: profile?['shop_slug'] as String?,
      phone: profile?['phone'] as String?,
      city: profile?['city'] as String?,
      shopAddress: profile?['shop_address'] as String?,
      registrationNumber: profile?['registration_number'] as String?,
    );
  }
}

/// An entry in the verification audit trail (decisions made by reviewers).
class VerificationDecision {
  const VerificationDecision({
    required this.id,
    required this.action,
    required this.createdAt,
    this.reason,
    this.reviewerId,
    this.sellerId,
    this.reviewerName,
    this.sellerName,
    this.shopName,
  });

  final String id;
  final String action;
  final String? reason;
  final DateTime createdAt;
  final String? reviewerId;
  final String? sellerId;
  final String? reviewerName;
  final String? sellerName;
  final String? shopName;

  String get sellerLabel => shopName ?? sellerName ?? sellerId ?? '—';

  factory VerificationDecision.fromJson(Map<String, dynamic> json) {
    final reviewer =
        json['profiles']?['verification_decisions_reviewer_id_fkey'] as Map<String, dynamic>? ??
        json['profiles'] as Map<String, dynamic>?;
    final seller =
        json['seller']?['profiles']?['verification_decisions_seller_id_fkey'] as Map<String, dynamic>? ??
        json['seller'] as Map<String, dynamic>? ??
        json['seller_profile'] as Map<String, dynamic>?;
    return VerificationDecision(
      id: json['id'] as String,
      action: json['action'] as String? ?? '',
      reason: json['reason'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      reviewerId: json['reviewer_id'] as String?,
      sellerId: json['seller_id'] as String?,
      reviewerName: reviewer?['full_name'] as String?,
      sellerName: seller?['full_name'] as String?,
      shopName: seller?['shop_name'] as String?,
    );
  }
}

/// Admin users list row (used for searching, banning, revoking sessions).
class AdminUser {
  const AdminUser({
    required this.id,
    required this.fullName,
    required this.isSeller,
    required this.createdAt,
    this.shopName,
    this.shopSlug,
    this.avatarUrl,
    this.shopLogoUrl,
    this.verified = false,
    this.phone,
    this.city,
    this.bannedUntil,
    this.banReason,
    this.roles = const [],
    this.isSuperAdmin = false,
  });

  final String id;
  final String fullName;
  final String? shopName;
  final String? shopSlug;
  final String? avatarUrl;
  final String? shopLogoUrl;
  final bool verified;
  final bool isSeller;
  final DateTime createdAt;
  final String? phone;
  final String? city;
  final String? bannedUntil;
  final String? banReason;

  /// Admin-ish roles (`admin`, `moderator`, `verification`, etc.) for badges.
  final List<String> roles;

  /// Super-admin flag (settings scope, role management).
  final bool isSuperAdmin;

  bool get suspended {
    final until = bannedUntil;
    if (until == null) return false;
    final parsed = DateTime.tryParse(until);
    return parsed != null && parsed.isAfter(DateTime.now());
  }

  String get displayName => shopName ?? fullName;

  factory AdminUser.fromJson(Map<String, dynamic> json) => AdminUser(
        id: json['id'] as String,
        fullName: json['full_name'] as String? ?? '',
        shopName: json['shop_name'] as String?,
        shopSlug: json['shop_slug'] as String?,
        avatarUrl: json['avatar_url'] as String?,
        shopLogoUrl: json['shop_logo_url'] as String?,
        verified: json['verified'] as bool? ?? false,
        isSeller: json['is_seller'] as bool? ?? false,
        createdAt: DateTime.parse(json['created_at'] as String),
        phone: json['phone'] as String?,
        city: json['city'] as String?,
        bannedUntil: json['banned_until'] as String?,
        banReason: json['ban_reason'] as String?,
        roles: (json['roles'] as List<dynamic>?)
                ?.map((r) => r as String)
                .where((r) => r.isNotEmpty)
                .toList(growable: false) ??
            const [],
        isSuperAdmin: json['is_super_admin'] as bool? ?? false,
      );
}

/// Admin category row (id,name,slug,parent,icon,sort).
class AdminCategory {
  const AdminCategory({
    required this.id,
    required this.name,
    required this.slug,
    required this.sortOrder,
    this.parentId,
    this.icon,
  });

  final String id;
  final String name;
  final String slug;
  final String? parentId;
  final String? icon;
  final int sortOrder;

  factory AdminCategory.fromJson(Map<String, dynamic> json) => AdminCategory(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        parentId: json['parent_id'] as String?,
        icon: json['icon'] as String?,
        sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      );
}

/// Admin listings tab row (feature/delete).
class AdminListing {
  const AdminListing({
    required this.id,
    required this.title,
    required this.price,
    required this.status,
    required this.createdAt,
    required this.sellerId,
    this.city,
    this.featured = false,
    this.coverUrl,
    this.sellerName,
    this.shopName,
  });

  final String id;
  final String title;
  final double price;
  final String status;
  final String? city;
  final bool featured;
  final DateTime createdAt;
  final String sellerId;
  final String? coverUrl;
  final String? sellerName;
  final String? shopName;

  String get sellerLabel => shopName ?? sellerName ?? sellerId;

  factory AdminListing.fromJson(Map<String, dynamic> json) {
    final images = json['listing_images'] as List<dynamic>? ?? const [];
    final profile = json['profiles'] as Map<String, dynamic>?;
    return AdminListing(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      price: (json['price'] as num).toDouble(),
      status: json['status'] as String? ?? '',
      city: json['city'] as String?,
      featured: json['featured'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
      sellerId: json['seller_id'] as String,
      coverUrl: images.isNotEmpty ? (images.first as Map<String, dynamic>)['url'] as String? : null,
      sellerName: profile?['full_name'] as String?,
      shopName: profile?['shop_name'] as String?,
    );
  }
}

/// Platform headline stats for the admin Stats tab.
class AdminStats {
  const AdminStats({
    required this.listings,
    required this.users,
    required this.sellers,
    required this.totalViews,
    this.verifiedSellers = 0,
    this.activeListings = 0,
    this.soldListings = 0,
    this.otherListings = 0,
    this.featuredListings = 0,
    this.conversations = 0,
    this.messages = 0,
    this.reviews = 0,
    this.newListings7d = 0,
    this.newUsers7d = 0,
    this.telegramSends7d = 0,
    this.telegramOk7d = 0,
    this.telegramFailures7d = 0,
    this.telegramFailureReasons = const [],
    this.telegramLinkedUsers = 0,
    this.telegramBlockedUsers = 0,
    this.telegramChannelPosts = 0,
    this.telegramProcessedUpdates = 0,
    this.topSearches = const [],
  });

  final int listings;
  final int users;
  final int sellers;
  final int verifiedSellers;
  final int totalViews;
  final int activeListings;
  final int soldListings;
  final int otherListings;
  final int featuredListings;
  final int conversations;
  final int messages;
  final int reviews;
  final int newListings7d;
  final int newUsers7d;
  final int telegramSends7d;
  final int telegramOk7d;
  final int telegramFailures7d;
  final List<String> telegramFailureReasons;
  final int telegramLinkedUsers;
  final int telegramBlockedUsers;
  final int telegramChannelPosts;
  final int telegramProcessedUpdates;
  final List<String> topSearches;
}

/// One day in the admin activity trend series (zero-filled).
class TrendDay {
  const TrendDay({
    required this.date,
    required this.label,
    required this.listings,
    required this.users,
    required this.messages,
    required this.views,
  });

  final String date;
  final String label;
  final int listings;
  final int users;
  final int messages;
  final int views;
}

/// "Top categories by listing count" for the admin Stats tab.
class CategoryCount {
  const CategoryCount({required this.name, required this.count});

  final String name;
  final int count;

  factory CategoryCount.fromJson(Map<String, dynamic> json) => CategoryCount(
        name: json['name'] as String? ?? json['categoryName'] as String? ?? 'Uncategorised',
        count: (json['count'] as num?)?.toInt() ?? 0,
      );
}

// ── Admin (extended panel — web /admin parity) ────────────────────────────
// Ported from the web admin console (`web/src/routes/admin.tsx`): dashboard
// health RPC, disputes queue, audit log, analytics, telegram + scope-based
// tab gating. Mirror the column names / shapes the web client uses.

/// Admin scope names (match `AdminScope` in web `marketplace.ts`). A scope
/// holder gets exactly the tab(s) listed in `adminScopesForRoles`.
class AdminScopes {
  AdminScopes._();

  static const users = 'users';
  static const listings = 'listings';
  static const moderation = 'moderation';
  static const verification = 'verification';
  static const categories = 'categories';
  static const analytics = 'analytics';
  static const settings = 'settings';

  /// Derives the visible admin scopes from the role list + super-admin flag,
  /// mirroring `adminScopesForRoles` on the web app verbatim.
  static Set<String> forRoles(List<String> roles, bool isSuperAdmin) {
    final scopes = <String>{};
    if (isSuperAdmin || roles.contains('admin')) {
      scopes
        ..add(users)
        ..add(listings)
        ..add(moderation)
        ..add(verification)
        ..add(categories)
        ..add(analytics);
      if (isSuperAdmin) scopes.add(settings);
      return scopes;
    }
    if (roles.contains('moderator')) {
      scopes
        ..add(moderation)
        ..add(listings);
    }
    if (roles.contains('verification')) scopes.add(verification);
    if (roles.contains('category_manager')) scopes.add(categories);
    if (roles.contains('analytics')) scopes.add(analytics);
    return scopes;
  }
}

/// Dashboard tier-1 counters: items that need an admin's attention right now.
class AdminActionCounts {
  const AdminActionCounts({
    this.reports = 0,
    this.flagged = 0,
    this.disputes = 0,
    this.verifications = 0,
  });

  final int reports;
  final int flagged;
  final int disputes;
  final int verifications;

  int get total => reports + flagged + disputes + verifications;
}

/// Marketplace health (RPC `admin_health_stats`) — sell-through, median days
/// to sale, seller response speed and the conversion funnel, all in one call.
class HealthStats {
  const HealthStats({
    required this.sellThroughD7,
    required this.sellThroughD30,
    required this.sellThroughD60,
    this.medianDaysToSale,
    this.responseRatePct,
    this.responseAvgMinutes,
    this.responseMedianMinutes,
    required this.funnelPublished,
    this.funnelViewed = 0,
    this.funnelInquiries = 0,
    this.funnelResponded = 0,
    this.funnelDeals = 0,
    this.funnelSales = 0,
  });

  final num sellThroughD7;
  final num sellThroughD30;
  final num sellThroughD60;
  final num? medianDaysToSale;
  final num? responseRatePct;
  final num? responseAvgMinutes;
  final num? responseMedianMinutes;
  final int funnelPublished;
  final int funnelViewed;
  final int funnelInquiries;
  final int funnelResponded;
  final int funnelDeals;
  final int funnelSales;

  factory HealthStats.fromJson(Map<String, dynamic> json) {
    final st = json['sell_through'] as Map<String, dynamic>? ?? const {};
    final resp = json['seller_response'] as Map<String, dynamic>? ?? const {};
    final funnel = json['funnel'] as Map<String, dynamic>? ?? const {};
    num n(Object? v) => v is num ? v : ((v as num?) ?? 0);
    int i(Object? v) => (v as num?)?.toInt() ?? 0;
    return HealthStats(
      sellThroughD7: n(st['d7']),
      sellThroughD30: n(st['d30']),
      sellThroughD60: n(st['d60']),
      medianDaysToSale: json['median_days_to_sale'] as num?,
      responseRatePct: resp['rate_pct'] as num?,
      responseAvgMinutes: resp['avg_minutes'] as num?,
      responseMedianMinutes: resp['median_minutes'] as num?,
      funnelPublished: i(funnel['published']),
      funnelViewed: i(funnel['viewed']),
      funnelInquiries: i(funnel['inquiries']),
      funnelResponded: i(funnel['responded']),
      funnelDeals: i(funnel['deals']),
      funnelSales: i(funnel['sales']),
    );
  }
}

/// One dispute in the admin queue (spec §12). Statuses: pending, investigating,
/// resolved, dismissed, escalated. Open disputes (`pending`/`investigating`/
/// `escalated`) render first, mirroring the web queue sort.
class AdminDispute {
  const AdminDispute({
    required this.id,
    required this.reason,
    required this.status,
    required this.createdAt,
    required this.buyerLabel,
    required this.sellerLabel,
    this.description,
    this.deadlineAt,
    this.resolution,
    this.listingId,
    this.listingTitle,
    this.conversationId,
    this.messageCount = 0,
  });

  final String id;
  final String reason;
  final String? description;
  final String status;
  final DateTime? deadlineAt;
  final String? resolution;
  final DateTime createdAt;
  final String? listingId;
  final String? listingTitle;
  final String? conversationId;
  final int messageCount;
  final String buyerLabel;
  final String sellerLabel;

  bool get isOpen =>
      status == 'pending' || status == 'investigating' || status == 'escalated';

  bool get overdue {
    final deadline = deadlineAt;
    return deadline != null && deadline.isBefore(DateTime.now());
  }

  String get listingLabel => listingTitle ?? listingId ?? '—';

  factory AdminDispute.fromJson(Map<String, dynamic> json) {
    final listing = json['listings'] as Map<String, dynamic>?;
    final buyer = json['buyer'] as Map<String, dynamic>?;
    final seller = json['seller'] as Map<String, dynamic>?;
    String label(Map<String, dynamic>? p, String fallback) {
      if (p == null) return fallback;
      return (p['shop_name'] as String?) ?? (p['full_name'] as String?) ?? fallback;
    }

    return AdminDispute(
      id: json['id'] as String,
      reason: json['reason'] as String? ?? '',
      description: json['description'] as String?,
      status: json['status'] as String? ?? 'pending',
      deadlineAt: json['deadline_at'] != null
          ? DateTime.tryParse(json['deadline_at'] as String)
          : null,
      resolution: json['resolution'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      listingId: json['listing_id'] as String?,
      listingTitle: listing?['title'] as String?,
      conversationId: json['conversation_id'] as String?,
      messageCount: (json['message_count'] as num?)?.toInt() ?? 0,
      buyerLabel: label(buyer, json['buyer_id'] as String? ?? '—'),
      sellerLabel: label(seller, json['seller_id'] as String? ?? '—'),
    );
  }
}

/// One row of the admin audit log (`admin_audit_log`, spec §21).
class AuditLogEntry {
  const AuditLogEntry({
    required this.id,
    required this.action,
    required this.entityType,
    required this.createdAt,
    this.entityId,
    this.reason,
    this.adminName,
  });

  final String id;
  final String action;
  final String entityType;
  final String? entityId;
  final String? reason;
  final DateTime createdAt;
  final String? adminName;

  String get actionLabel => action.replaceAll('_', ' ');

  factory AuditLogEntry.fromJson(Map<String, dynamic> json) {
    final profile = json['profiles'] as Map<String, dynamic>?;
    return AuditLogEntry(
      id: json['id'] as String,
      action: json['action'] as String? ?? '',
      entityType: json['entity_type'] as String? ?? '',
      entityId: json['entity_id'] as String?,
      reason: json['reason'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      adminName: profile?['full_name'] as String?,
    );
  }
}

/// One seller in the seller-performance table (RPC `admin_seller_performance`).
class SellerPerformanceRow {
  const SellerPerformanceRow({
    required this.sellerId,
    required this.name,
    this.verified = false,
    this.suspended = false,
    this.listings = 0,
    this.views = 0,
    this.inquiries = 0,
    this.responded = 0,
    this.avgResponseMinutes,
    this.sales = 0,
    this.rating,
    this.reports = 0,
  });

  final String sellerId;
  final String name;
  final bool verified;
  final bool suspended;
  final int listings;
  final int views;
  final int inquiries;
  final int responded;
  final num? avgResponseMinutes;
  final int sales;
  final num? rating;
  final int reports;

  int? get responseRatePct =>
      inquiries > 0 ? (responded * 100 ~/ inquiries) : null;

  factory SellerPerformanceRow.fromJson(Map<String, dynamic> json) => SellerPerformanceRow(
        sellerId: json['seller_id'] as String? ?? '',
        name: json['name'] as String? ?? '—',
        verified: json['verified'] as bool? ?? false,
        suspended: json['suspended'] as bool? ?? false,
        listings: (json['listings'] as num?)?.toInt() ?? 0,
        views: (json['views'] as num?)?.toInt() ?? 0,
        inquiries: (json['inquiries'] as num?)?.toInt() ?? 0,
        responded: (json['responded'] as num?)?.toInt() ?? 0,
        avgResponseMinutes: json['avg_response_minutes'] as num?,
        sales: (json['sales'] as num?)?.toInt() ?? 0,
        rating: json['rating'] as num?,
        reports: (json['reports'] as num?)?.toInt() ?? 0,
      );
}

/// Acquisition source with signup + listing creation counts (spec §8.2).
class AcquisitionRow {
  const AcquisitionRow({
    required this.source,
    this.signups = 0,
    this.listings = 0,
  });

  final String source;
  final int signups;
  final int listings;

  int get total => signups + listings;
}

/// Root-category performance (dashboard tier 3): supply vs demand rollup.
class CategoryPerformance {
  const CategoryPerformance({
    required this.name,
    this.listings = 0,
    this.views = 0,
    this.inquiries = 0,
    this.sold = 0,
  });

  final String name;
  final int listings;
  final int views;
  final int inquiries;
  final int sold;
}

/// A listing that was posted to the Telegram channel (`telegram_channel_posts`).
class TelegramPost {
  const TelegramPost({
    required this.listingId,
    required this.postedAt,
    this.listingTitle,
  });

  final String listingId;
  final DateTime postedAt;
  final String? listingTitle;

  factory TelegramPost.fromJson(Map<String, dynamic> json) {
    final listing = json['listings'] as Map<String, dynamic>?;
    return TelegramPost(
      listingId: json['listing_id'] as String,
      postedAt: DateTime.parse(json['posted_at'] as String),
      listingTitle: listing?['title'] as String?,
    );
  }
}

/// Lightweight system-health probes (web spec SS23) for the Settings tab.
class SystemHealth {
  const SystemHealth({
    required this.dbOk,
    required this.storageOk,
    this.tgErrorsToday = 0,
  });

  final bool dbOk;
  final bool storageOk;
  final int tgErrorsToday;
}
