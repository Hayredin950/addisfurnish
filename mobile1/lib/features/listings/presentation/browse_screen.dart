import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/widgets/listing_grid.dart';
import '../../../core/widgets/section_header.dart';
import '../../profile/domain/profile_repository.dart';
import '../../notifications/domain/notifications_repository.dart';
import '../domain/listings_repository.dart';

/// Home / Browse: search bar, categories, fresh listings, most viewed,
/// recently viewed and popular searches.
class BrowseScreen extends StatefulWidget {
  const BrowseScreen({super.key});

  @override
  State<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends State<BrowseScreen> with AppStateMixin {
  ListingsRepository get _repo => sl<ListingsRepository>();
  ProfileRepository get _profileRepo => sl<ProfileRepository>();
  NotificationsRepository get _notifsRepo => sl<NotificationsRepository>();

  List<Listing>? _fresh;
  List<Listing>? _viewed;
  List<Listing>? _recent;
  List<String>? _trending;
  List<Category>? _categories;
  List<SavedSearch> _saved = const [];
  int _unread = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final freshF = _repo.getFresh(limit: 12);
      final viewedF = _repo.getMostViewed(limit: 12);
      final categoriesF = _repo.getCategories();
      final trendingF = _repo.getTrendingSearches(limit: 6);
      final results = await Future.wait<Object>([
        freshF,
        viewedF,
        categoriesF,
        trendingF,
      ]);
      if (!mounted) return;
      setState(() {
        _fresh = results[0] as List<Listing>;
        _viewed = results[1] as List<Listing>;
        _categories = results[2] as List<Category>;
        _trending = results[3] as List<String>;
      });
      _loadRecent();
      _loadSaved();
      _loadUnread();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Future<void> _loadUnread() async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    try {
      final notifs = await _notifsRepo.getNotifications(uid, limit: 20);
      if (!mounted) return;
      setState(() => _unread = notifs.where((n) => !n.isRead).length);
    } catch (_) {}
  }

  Future<void> _loadSaved() async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    try {
      final saved = await _profileRepo.getSavedSearches(uid);
      if (!mounted) return;
      setState(() => _saved = saved);
    } catch (_) {}
  }

  Future<void> _deleteSaved(SavedSearch s) async {
    try {
      await _profileRepo.deleteSavedSearch(s.id);
      if (!mounted) return;
      setState(() => _saved = [..._saved]..removeWhere((e) => e.id == s.id));
    } catch (_) {}
  }

  void _openSaved(SavedSearch s) {
    Routes.search(context,
        initialQuery: s.query, categorySlug: _savedCategorySlug(s));
  }

  String? _savedCategorySlug(SavedSearch s) {
    final cat = s.filters['category'] as String?;
    if (cat == null) return null;
    for (final c in _categories ?? const <Category>[]) {
      if (c.slug == cat || c.id == cat || c.name == cat) return c.slug;
    }
    return cat;
  }

  String _savedLabel(SavedSearch s) {
    final q = s.query;
    if (q != null && q.isNotEmpty) return q;
    return s.filters['category'] as String? ?? AppState.instance.t('profile.savedSearches');
  }

  Future<void> _loadRecent() async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    try {
      final recent = await _repo.getRecentViewed(uid);
      if (!mounted) return;
      setState(() => _recent = recent);
    } catch (_) {}
  }

  void _openListing(Listing l) => Routes.listing(context, l);

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final categories = _categories ?? const <Category>[];
    final parents = categories.where((c) => c.parentId == null).toList();
    final children = categories.where((c) => c.parentId != null).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          state.t('app.name'),
          style: theme.textTheme.titleLarge?.copyWith(
            fontFamily: 'Fraunces',
            color: theme.colorScheme.primary,
          ),
        ),
        actions: [
          IconButton(
            onPressed: () => Routes.notifications(context),
            icon: _unread > 0
                ? Badge(
                    label: Text(_unread > 9 ? '9+' : '$_unread'),
                    isLabelVisible: true,
                    child: const Icon(Icons.notifications),
                  )
                : const Icon(Icons.notifications_none),
            tooltip: state.t('nav.notifications'),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              onPressed: _toggleLang,
              icon: Text(
                state.lang == 'am' ? 'EN' : 'አማ',
                style: theme.textTheme.titleSmall?.copyWith(color: theme.colorScheme.primary),
              ),
              tooltip: state.t('nav.language'),
            ),
          ),
        ],
      ),
      body: _error != null
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
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  // Search bar
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                    child: Hero(
                      tag: 'search-bar',
                      child: Material(
                        color: theme.colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(14),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: () => Routes.search(context),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                            child: Row(
                              children: [
                                Icon(Icons.search, color: theme.colorScheme.outline),
                                const SizedBox(width: 10),
                                Text(
                                  state.t('nav.search'),
                                  style: theme.textTheme.bodyMedium
                                      ?.copyWith(color: theme.colorScheme.outline),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),

                  // Categories
                  if (parents.isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                      child: SizedBox(
                        height: 96,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: parents.length,
                          separatorBuilder: (_, _) => const SizedBox(width: 12),
                          itemBuilder: (context, i) {
                            final cat = parents[i];
                            final subCount = children.where((c) => c.parentId == cat.id).length;
                            return _CategoryChip(
                              category: cat,
                              subCount: subCount,
                              onTap: () => Routes.search(context, categorySlug: cat.slug),
                            );
                          },
                        ),
                      ),
                    ),
                  ],

                  if (_fresh?.isNotEmpty == true) ...[
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: SectionHeader(
                        title: state.t('home.freshListings'),
                        actionLabel: state.t('home.seeAll'),
                        onAction: () => Routes.search(context),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ListingRow(
                      listings: _fresh!,
                      onListingTap: _openListing,
                    ),
                  ],

                  if (_viewed?.isNotEmpty == true) ...[
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: SectionHeader(title: state.t('home.mostViewed')),
                    ),
                    const SizedBox(height: 8),
                    ListingRow(
                      listings: _viewed!,
                      onListingTap: _openListing,
                    ),
                  ],

                  if (_recent?.isNotEmpty == true) ...[
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: SectionHeader(title: state.t('home.recentlyViewed')),
                    ),
                    const SizedBox(height: 8),
                    ListingRow(
                      listings: _recent!,
                      onListingTap: _openListing,
                    ),
                  ],

                  if (_saved.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: SectionHeader(title: state.t('home.savedSearches')),
                    ),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in _saved)
                            InputChip(
                              avatar: const Icon(Icons.bookmark, size: 14),
                              label: Text(_savedLabel(s)),
                              onPressed: () => _openSaved(s),
                              onDeleted: () => _deleteSaved(s),
                            ),
                        ],
                      ),
                    ),
                  ],
                  if (_trending?.isNotEmpty == true) ...[
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: SectionHeader(title: state.t('home.popularSearches')),
                    ),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final q in _trending!)
                            ActionChip(
                              label: Text(q),
                              onPressed: () => Routes.search(context, initialQuery: q),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }

  Future<void> _toggleLang() async {
    final state = AppState.instance;
    await state.setLang(state.lang == 'am' ? 'en' : 'am');
    await state.saveLangPreference();
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.category, required this.subCount, required this.onTap});

  final Category category;
  final int subCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 92,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(_categoryIcon(category.icon), color: theme.colorScheme.primary, size: 26),
            const SizedBox(height: 6),
            Text(
              category.name,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall,
            ),
          ],
        ),
      ),
    );
  }

  IconData _categoryIcon(String? icon) {
    switch (icon) {
      case 'sofa':
        return Icons.weekend_outlined;
      case 'bed':
        return Icons.bed_outlined;
      case 'briefcase':
        return Icons.business_center_outlined;
      case 'utensils':
        return Icons.kitchen_outlined;
      case 'trees':
        return Icons.local_florist_outlined;
      case 'archive':
        return Icons.archive_outlined;
      default:
        return Icons.chair_outlined;
    }
  }
}
