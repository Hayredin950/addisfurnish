import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/widgets/listing_grid.dart';
import '../../../core/widgets/section_header.dart';
import '../../listings/domain/listings_repository.dart';
import '../../shell/presentation/main_tabs.dart';

/// Home tab (mirrors the RN `index` screen): hero brand + search, trending
/// chips, category grid, featured carousel and fresh listings grid.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  ListingsRepository get _repo => sl<ListingsRepository>();

  final _searchController = TextEditingController();
  List<Category>? _categories;
  List<Listing>? _featured;
  List<Listing>? _fresh;
  List<String>? _trending;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<Object>([
        _repo.getCategories(),
        _repo.getFeatured(limit: 10),
        _repo.getFresh(limit: 10),
        _repo.getTrendingSearches(limit: 8),
      ]);
      if (!mounted) return;
      setState(() {
        _categories = results[0] as List<Category>;
        _featured = results[1] as List<Listing>;
        _fresh = results[2] as List<Listing>;
        _trending = results[3] as List<String>;
      });
    } catch (_) {}
  }

  void _search(String q) {
    final term = q.trim();
    if (term.isEmpty) {
      MainTabs.openBrowse();
      return;
    }
    _repo.logSearch(term);
    MainTabs.openBrowse(q: term);
  }

  void _openListing(Listing l) => Routes.listing(context, l);

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final categories = _categories ?? const <Category>[];
    final rootCats =
        categories.where((c) => c.parentId == null).isEmpty ? categories : categories.where((c) => c.parentId == null).toList();

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: EdgeInsets.zero,
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            _buildHero(context, state, theme),
            if (_trending?.isNotEmpty == true)
              _buildTrending(context, state),
            if (rootCats.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                child: SectionHeader(title: state.t('home.categories')),
              ),
              _buildCategoryGrid(context, state, theme, rootCats),
            ],
            if (_featured?.isNotEmpty == true) ...[
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SectionHeader(
                  title: state.t('home.featured'),
                  actionLabel: state.t('home.seeAll'),
                  onAction: () => MainTabs.openBrowse(),
                ),
              ),
              const SizedBox(height: 8),
              ListingRow(listings: _featured!, onListingTap: _openListing),
            ],
            if (_fresh?.isNotEmpty == true) ...[
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SectionHeader(
                  title: state.t('home.freshListings'),
                  actionLabel: state.t('home.seeAll'),
                  onAction: () => MainTabs.openBrowse(),
                ),
              ),
              const SizedBox(height: 8),
              ListingGrid(
                listings: _fresh!.take(6).toList(),
                onListingTap: _openListing,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
              ),
            ],
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildHero(BuildContext context, AppState state, ThemeData theme) {
    final topPad = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.fromLTRB(16, topPad + 8, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.chair,
                      size: 20,
                      color: theme.colorScheme.onPrimary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Addis',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontFamily: 'Fraunces',
                      fontWeight: FontWeight.w800,
                      fontSize: 26,
                    ),
                  ),
                  Text(
                    'Furnish',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontFamily: 'Fraunces',
                      fontWeight: FontWeight.w800,
                      fontSize: 26,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    onPressed: () => Routes.notifications(context),
                    icon: const Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Icon(Icons.notifications_none, size: 24),
                      ],
                    ),
                    tooltip: state.t('nav.notifications'),
                  ),
                  const SizedBox(width: 4),
                  _buildLangButton(state, theme),
                ],
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(state.t('app.tagline'), style: theme.textTheme.bodyMedium),
          const SizedBox(height: 16),
          TextField(
            controller: _searchController,
            textInputAction: TextInputAction.search,
            onSubmitted: _search,
            onTap: () {
              if (_searchController.text.trim().isEmpty) MainTabs.openBrowse();
            },
            decoration: InputDecoration(
              hintText: state.t('nav.search'),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        _searchController.clear();
                        setState(() {});
                      },
                    )
                  : null,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrending(BuildContext context, AppState state) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(title: state.t('home.trending')),
          const SizedBox(height: 8),
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _trending!.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final q = _trending![i];
                return ActionChip(
                  avatar: Icon(Icons.trending_up, size: 15, color: Theme.of(context).colorScheme.primary),
                  label: Text(q),
                  onPressed: () => _search(q),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryGrid(
      BuildContext context, AppState state, ThemeData theme, List<Category> cats) {
    final shown = cats.take(8).toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 4,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.78,
        ),
        itemCount: shown.length,
        itemBuilder: (context, i) {
          final c = shown[i];
          return InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => MainTabs.openBrowse(category: c.slug),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.secondary,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(_categoryIcon(c.icon), color: theme.colorScheme.primary, size: 26),
                ),
                const SizedBox(height: 6),
                Text(
                  state.lang == 'am' ? (c.nameAm ?? c.name) : c.name,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall,
                ),
              ],
            ),
          );
        },
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

  Widget _buildLangButton(AppState state, ThemeData theme) {
    final isAm = state.lang == 'am';
    return Material(
      color: theme.colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: _showLangMenu,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                isAm ? 'አማ' : 'EN',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 2),
              Icon(Icons.expand_more, size: 16, color: theme.colorScheme.primary),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showLangMenu() async {
    final state = AppState.instance;
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                child: Text(
                  state.t('nav.language'),
                  style: Theme.of(sheetContext).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ),
              RadioGroup<String>(
                groupValue: state.lang,
                onChanged: (v) => Navigator.of(sheetContext).pop(v),
                child: const Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    RadioListTile<String>(
                      value: 'en',
                      title: Text('English'),
                    ),
                    RadioListTile<String>(
                      value: 'am',
                      title: Text('አማርኛ'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
    if (selected == null || !mounted) return;
    await state.setLang(selected);
    await state.saveLangPreference();
  }
}