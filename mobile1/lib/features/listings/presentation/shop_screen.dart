import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/widgets/app_image.dart';
import '../../../core/widgets/listing_grid.dart';
import '../../../core/widgets/section_header.dart';
import '../../../core/network/supabase_api.dart' show ListingFilters;
import '../../../core/network/supabase_client.dart';
import '../../sell/domain/sell_repository.dart';
import '../domain/listing_query.dart';
import '../domain/listings_repository.dart';

/// A seller's shop page: banner, info, reviews and all their listings.
class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key, required this.shopSlug});

  final String shopSlug;

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> with AppStateMixin {
  ListingsRepository get _repo => sl<ListingsRepository>();
  SellRepository get _sellRepo => sl<SellRepository>();

  Profile? _shop;
  List<Listing>? _listings;
  List<Review>? _reviews;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Resolve a storage path to a full public URL for profile/shop images.
  /// Listing images are resolved inside SupabaseApi, but profile images
  /// (avatar_url, shop_logo_url) are stored as paths too.
  String? _resolveImageUrl(String? pathOrUrl) {
    if (pathOrUrl == null || pathOrUrl.isEmpty) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    // Profile images bucket for avatar, listing-images for shop logos
    // Shop logos are stored under listing-images/<userId>/logos/
    return AppSupabase.client.storage
        .from('listing-images')
        .getPublicUrl(pathOrUrl);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final shop = await _repo.getShop(widget.shopSlug);
      if (shop == null) {
        setState(() {
          _loading = false;
          _error = 'not_found';
        });
        return;
      }
      // Set the shop immediately so the header renders even if
      // listings/reviews fail to load.
      if (!mounted) return;
      setState(() => _shop = shop);

      // Load listings and reviews in parallel; failures are non-fatal.
      final results = await Future.wait<Object?>([
        _repo
            .getListings(
                ListingQuery(filters: ListingFilters(sellerId: shop.id, limit: 48)))
            .catchError((_) => const ListingsPage(items: [], hasMore: false, nextPage: 0)),
        _repo.getReviews(shop.id).catchError((_) => const <Review>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _listings = (results[0] as ListingsPage).items;
        _reviews = results[1] as List<Review>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final shop = _shop;
    final listings = _listings ?? const <Listing>[];
    final reviews = _reviews ?? const <Review>[];
    final avgRating = reviews.isEmpty
        ? null
        : (reviews.map((r) => r.rating).reduce((a, b) => a + b) / reviews.length);

    return Scaffold(
      appBar: AppBar(
        title: Text(shop?.shopName ?? shop?.fullName ?? ''),
        actions: [
          if (shop != null)
            IconButton(
              onPressed: () => _reportShop(context, state, shop),
              icon: const Icon(Icons.flag_outlined),
              tooltip: state.t('shop.report'),
            ),
        ],
      ),
      body: _loading && _shop == null
          ? const Center(child: CircularProgressIndicator())
          : _error == 'not_found'
              ? EmptyState(
                  icon: Icons.storefront_outlined,
                  title: state.t('shop.notFound'),
                )
              : _error != null && _shop == null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!),
                          const SizedBox(height: 12),
                          FilledButton(onPressed: _load, child: Text(state.t('common.retry'))),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.only(bottom: 32),
                        children: [
                          _shopHeader(context, state, theme, shop!, avgRating),
                          _contactActions(context, state, theme, shop!),
                          if (_loading)
                            const Padding(
                              padding: EdgeInsets.all(32),
                              child: Center(child: CircularProgressIndicator()),
                            )
                          else ...[
                            if (reviews.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                                child: SectionHeader(
                                  title: state.t('shop.reviews'),
                                  actionLabel:
                                      state.t('shop.reviewCount', {'count': reviews.length}),
                                ),
                              ),
                            if (reviews.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 16),
                                child: _reviewsList(context, state, theme, reviews),
                              )
                            else
                              Padding(
                                padding: const EdgeInsets.all(16),
                                child: Text(
                                  state.t('shop.noReviews'),
                                  style: theme.textTheme.bodyMedium
                                      ?.copyWith(color: theme.colorScheme.outline),
                                ),
                              ),
                            if (listings.isNotEmpty) ...[
                              const SizedBox(height: 16),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 16),
                                child: SectionHeader(title: state.t('home.freshListings')),
                              ),
                              const SizedBox(height: 4),
                              ListingGrid(
                                listings: listings,
                                onListingTap: (l) => Routes.listing(context, l),
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                              ),
                            ] else
                              Padding(
                                padding: const EdgeInsets.all(24),
                                child: EmptyState(
                                  icon: Icons.storefront_outlined,
                                  title: state.t('shop.noListings'),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
    );
  }

  Widget _shopHeader(
      BuildContext context, AppState state, ThemeData theme, Profile shop, double? avgRating) {
    final resolvedLogo = _resolveImageUrl(shop.shopLogoUrl);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(20),
          bottomRight: Radius.circular(20),
        ),
      ),
      child: Column(
        children: [
          // Logo
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: theme.colorScheme.secondary,
            ),
            child: ClipOval(
              child: AppImage(
                resolvedLogo,
                width: 76,
                height: 76,
                icon: Icons.storefront_outlined,
                targetWidth: 228,
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Shop name
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  shop.shopName ?? shop.fullName,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              if (shop.verified) ...[
                const SizedBox(width: 6),
                Icon(Icons.verified, size: 20, color: theme.colorScheme.primary),
              ],
            ],
          ),
          // Verified badge pill
          if (shop.verified)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(50),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.verified, size: 14, color: theme.colorScheme.primary),
                    const SizedBox(width: 4),
                    Text(
                      state.t('shop.verified'),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          // City + online status
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              [
                if (shop.city != null) shop.city!,
                shop.isOnline ? state.t('shop.online') : state.t('shop.offline'),
              ].join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),
          ),
          // Description
          if (shop.shopDescription != null && shop.shopDescription!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                shop.shopDescription!,
                style: theme.textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
            ),
          // Rating
          if (avgRating != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (int i = 1; i <= 5; i++)
                    Icon(
                      i <= avgRating.round() ? Icons.star : Icons.star_border,
                      size: 16,
                      color: Colors.amber,
                    ),
                  const SizedBox(width: 8),
                  Text(
                    '${avgRating.toStringAsFixed(1)} · ${(_reviews ?? []).length} ${state.t('shop.reviews')}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Contact action buttons (Call, WhatsApp, Telegram) matching the RN shop screen.
  Widget _contactActions(BuildContext context, AppState state, ThemeData theme, Profile shop) {
    final hasPhone = shop.phone != null && shop.phone!.isNotEmpty;
    final hasWhatsApp = shop.whatsapp != null && shop.whatsapp!.isNotEmpty;
    final hasTelegram = shop.telegram != null && shop.telegram!.isNotEmpty;

    if (!hasPhone && !hasWhatsApp && !hasTelegram) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 10,
        runSpacing: 10,
        children: [
          if (hasPhone)
            _actionChip(
              icon: Icons.call,
              label: state.t('listing.call'),
              color: theme.colorScheme.primary,
              onTap: () => _launch('tel:${shop.phone}'),
            ),
          if (hasWhatsApp)
            _actionChip(
              icon: Icons.chat,
              label: state.t('listing.whatsapp'),
              color: Colors.green,
              onTap: () {
                final digits = shop.whatsapp!.replaceAll(RegExp(r'[^0-9]'), '');
                _launch('https://wa.me/$digits');
              },
            ),
          if (hasTelegram)
            _actionChip(
              icon: Icons.send,
              label: state.t('listing.telegram'),
              color: Colors.blue,
              onTap: () {
                final handle = shop.telegram!.replaceAll('@', '');
                _launch('https://t.me/$handle');
              },
            ),
        ],
      ),
    );
  }

  Widget _actionChip({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(50),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(50),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 17, color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _reviewsList(BuildContext context, AppState state, ThemeData theme, List<Review> reviews) {
    return Column(
      children: [
        for (final r in reviews.take(5))
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(r.authorName ?? 'Buyer', style: theme.textTheme.titleSmall),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (int i = 0; i < 5; i++)
                          Icon(
                            i < r.rating ? Icons.star : Icons.star_border,
                            size: 14,
                            color: Colors.amber,
                          ),
                      ],
                    ),
                  ],
                ),
                if (r.comment != null && r.comment!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    r.comment!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _launch(String url) async {
    final uri = Uri.parse(url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) _snack('Could not open');
  }

  Future<void> _reportShop(BuildContext context, AppState state, Profile shop) async {
    final uid = state.userId;
    if (uid == null) {
      _snack('Please sign in first');
      return;
    }
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text(state.t('shop.report')),
        children: [
          for (final r in const ['Suspected scam', 'Misleading listings', 'Offensive or abusive'])
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, r),
              child: Text(r),
            ),
        ],
      ),
    );
    if (reason == null) return;
    await _sellRepo.submitReport(
      reporterId: uid,
      reason: reason,
      reportedUserId: shop.id,
    );
    _snack('Report sent ✓');
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }
}
