import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/widgets/listing_grid.dart';
import '../../../core/widgets/section_header.dart';
import '../domain/favorites_repository.dart';

/// Saved listings ("favorites").
class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> with AppStateMixin {
  FavoritesRepository get _repo => sl<FavoritesRepository>();

  List<Listing>? _listings;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final uid = AppState.instance.userId;
    if (uid == null) {
      setState(() {
        _loading = false;
        _listings = const [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final listings = await _repo.getFavorites(uid);
      if (!mounted) return;
      setState(() {
        _listings = listings;
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
    final listings = _listings ?? const <Listing>[];

    return Scaffold(
      appBar: AppBar(title: Text(state.t('tabs.favorites'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
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
              : listings.isEmpty
                  ? EmptyState(
                      icon: Icons.favorite_border,
                      title: state.t('fav.emptyTitle'),
                      body: state.t('fav.findSomething'),
                      actionLabel: state.t('home.browseListings'),
                      onAction: () => Routes.search(context),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListingGrid(
                        listings: listings,
                        onListingTap: (l) => Routes.listing(context, l),
                      ),
                    ),
    );
  }
}
