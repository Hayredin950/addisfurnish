import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/utils/format.dart';
import '../../../core/state/app_state.dart';
import '../../../core/widgets/app_image.dart';
import '../../sell/domain/sell_repository.dart';
import '../../sell/presentation/sell_screen.dart';

/// Seller dashboard: headline stats, 14-day views chart, listing management
/// (status changes, delete) and callback-request queue — mirrors the RN
/// `dashboard.tsx` + the web `/dashboard`.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  SellRepository get _repo => sl<SellRepository>();

  List<Listing>? _listings;
  List<({String date, int count})>? _views;
  List<CallbackRequest>? _callbacks;
  List<Offer>? _offers;
  int _convCount = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<Object>([
        _repo.getMyListings(uid),
        _repo.getViewsPerDay(uid),
        _repo.getCallbacks(uid),
        _repo.getConversationCount(uid),
        _repo.getOffers(uid),
      ]);
      if (!mounted) return;
      setState(() {
        _listings = results[0] as List<Listing>;
        _views = results[1] as List<({String date, int count})>;
        _callbacks = results[2] as List<CallbackRequest>;
        _convCount = results[3] as int;
        _offers = results[4] as List<Offer>;
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

  Future<void> _setStatus(Listing listing, String status, {bool sold = false}) async {
    try {
      if (sold) {
        await _repo.markSold(listing.id, listing.title);
      } else {
        await _repo.updateStatus(listing.id, status);
      }
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Status → $status')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
    _load();
  }

  Future<void> _deleteListing(Listing listing) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete listing?'),
        content: Text('"${listing.title}" will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(AppState.instance.t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            child: Text(AppState.instance.t('common.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _repo.deleteListing(listing.id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
    _load();
  }

  Future<void> _updateCallback(CallbackRequest c, String status) async {
    try {
      await _repo.updateCallbackStatus(
        c.id,
        status,
        buyerId: c.buyerId,
        listingTitle: c.listingTitle,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
    _load();
  }

  Future<void> _respondToOffer(Offer offer, String status) async {
    try {
      await _repo.respondToOffer(offer, status);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              status == 'accepted'
                  ? AppState.instance.t('offer.acceptedToast')
                  : AppState.instance.t('offer.declinedToast'),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final listings = _listings ?? const <Listing>[];
    final views = _views ?? const <({String date, int count})>[];
    final callbacks = _callbacks ?? const <CallbackRequest>[];
    final offers = _offers ?? const <Offer>[];
    final totalViews = listings.fold<int>(0, (sum, l) => sum + l.viewCount);

    return Scaffold(
      appBar: AppBar(title: Text(state.t('profile.dashboard'))),
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
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          _statCard(context, state.t('profile.myListings'), listings.length.toString()),
                          const SizedBox(width: 12),
                          _statCard(context, 'Views', totalViews.toString()),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          _statCard(context, 'Call-backs', callbacks.length.toString()),
                          const SizedBox(width: 12),
                          _statCard(context, 'Discussions', '$_convCount'),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Text(
                        state.t('profile.myListings'),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      if (views.isNotEmpty) ...[
                        _viewsChart(context, views),
                        const SizedBox(height: 20),
                      ],
                      if (listings.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 32),
                          child: Text(
                            'No listings yet — post your first one from the Sell tab.',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ),
                      for (final l in listings) _listingRow(context, l),
                      if (callbacks.isNotEmpty) ...[
                        const SizedBox(height: 24),
                        Text(
                          'Call-back requests',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        for (final c in callbacks) _callbackRow(context, c),
                      ],
                      const SizedBox(height: 24),
                      Text(
                        state.t('dash.offers'),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      if (offers.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: Text(
                            state.t('dash.noOffers'),
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ),
                      for (final o in offers) _offerRow(context, o),
                    ],
                  ),
                ),
    );
  }

  Widget _statCard(BuildContext context, String label, String value) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
            const SizedBox(height: 2),
            Text(label, style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }

  Widget _viewsChart(BuildContext context, List<({String date, int count})> views) {
    final theme = Theme.of(context);
    final max = views.fold<int>(0, (m, v) => v.count > m ? v.count : m);

    return Container(
      height: 160,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final v in views)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (v.count > 0)
                      Text('${v.count}', style: theme.textTheme.labelSmall?.copyWith(fontSize: 9)),
                    const SizedBox(height: 2),
                    Container(
                      height: max == 0 ? 4 : (v.count / max) * 90,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(alpha: v.count == 0 ? 0.15 : 0.9),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _dayLabel(v.date),
                      style: theme.textTheme.labelSmall?.copyWith(fontSize: 9),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _dayLabel(String date) {
    final d = DateTime.tryParse(date);
    if (d == null) return '';
    return DateShort.day(d);
  }

  Widget _listingRow(BuildContext context, Listing l) {
    final theme = Theme.of(context);
    final statusColor = switch (l.status) {
      'active' => theme.colorScheme.primary,
      'reserved' => Colors.orange,
      'sold' => theme.colorScheme.outline,
      _ => theme.colorScheme.outline,
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppImage(
              l.coverImageUrl,
              width: 52,
              height: 52,
              borderRadius: BorderRadius.circular(8),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall),
                  Text(
                    '${Fmt.birr(l.price)} · ${l.viewCount} views',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final s in const ['active', 'reserved', 'sold'])
                        InkWell(
                          onTap: () => _setStatus(l, s, sold: s == 'sold'),
                          borderRadius: BorderRadius.circular(999),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: l.status == s
                                  ? statusColor
                                  : theme.colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              _statusLabel(s),
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: l.status == s
                                    ? theme.colorScheme.onPrimary
                                    : theme.colorScheme.onSurfaceVariant,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () => _editListing(l),
              icon: const Icon(Icons.edit_outlined),
              color: theme.colorScheme.primary,
              tooltip: 'Edit',
            ),
            IconButton(
              onPressed: () => _deleteListing(l),
              icon: const Icon(Icons.delete_outline),
              color: theme.colorScheme.error,
              tooltip: 'Delete',
            ),
          ],
        ),
      ),
    );
  }

  void _editListing(Listing l) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => SellScreen(editListingId: l.id)),
    ).then((_) => _load());
  }

  String _statusLabel(String s) => switch (s) {
        'active' => 'Active',
        'reserved' => 'Reserved',
        'sold' => 'Sold',
        _ => s,
      };

  Widget _offerRow(BuildContext context, Offer o) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final statusKey = switch (o.status) {
      'accepted' => 'dash.offerStatusAccepted',
      'declined' => 'dash.offerStatusDeclined',
      'cancelled' => 'dash.offerStatusCancelled',
      _ => 'dash.offerStatusPending',
    };
    final statusColor = o.isPending
        ? Colors.amber.shade700
        : o.status == 'accepted'
            ? theme.colorScheme.primary
            : theme.colorScheme.outline;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${o.listingTitle ?? state.t('msg.listing')} — ${Fmt.birr(o.amount)}',
                    style: theme.textTheme.titleSmall,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    state.t(statusKey).toUpperCase(),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: statusColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            if (o.buyerName != null || o.buyerPhone != null) ...[
              const SizedBox(height: 2),
              Text(
                [o.buyerName, o.buyerPhone].whereType<String>().join(' · '),
                style: theme.textTheme.bodySmall,
              ),
            ],
            if (o.message != null) ...[
              const SizedBox(height: 2),
              Text('“${o.message}”', style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: 4),
            Text(
              Fmt.timeAgoShort(o.createdAt),
              style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.outline),
            ),
            if (o.isPending) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  FilledButton(
                    onPressed: () => _respondToOffer(o, 'accepted'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      visualDensity: VisualDensity.compact,
                    ),
                    child: Text(state.t('dash.acceptOffer')),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () => _respondToOffer(o, 'declined'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      visualDensity: VisualDensity.compact,
                    ),
                    child: Text(state.t('dash.declineOffer')),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _callbackRow(BuildContext context, CallbackRequest c) {
    final theme = Theme.of(context);
    final statusColor = switch (c.status) {
      'pending' => Colors.orange,
      'contacted' => theme.colorScheme.primary,
      _ => theme.colorScheme.outline,
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${c.listingTitle ?? 'Listing'} — ${c.phone}',
                    style: theme.textTheme.titleSmall,
                  ),
                  if (c.note != null) ...[
                    const SizedBox(height: 2),
                    Text(c.note!, style: theme.textTheme.bodySmall),
                  ],
                  const SizedBox(height: 2),
                  Text(
                    Fmt.timeAgoShort(c.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    c.status.toUpperCase(),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: statusColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            if (c.isPending)
              Column(
                children: [
                  FilledButton.tonal(
                    onPressed: () => _updateCallback(c, 'contacted'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      visualDensity: VisualDensity.compact,
                    ),
                    child: const Text('Contacted'),
                  ),
                  const SizedBox(height: 6),
                  OutlinedButton(
                    onPressed: () => _updateCallback(c, 'closed'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      visualDensity: VisualDensity.compact,
                    ),
                    child: const Text('Close'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

/// Tiny date helper to avoid pulling intl into the widget tree here.
class DateShort {
  DateShort._();
  static const _days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  static String day(DateTime d) => _days[d.weekday - 1];
}