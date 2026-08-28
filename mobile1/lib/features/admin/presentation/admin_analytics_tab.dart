import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../domain/admin_repository.dart';
import 'admin_widgets.dart';

/// Analytics — acquisition sources (spec §8.2) and seller performance
/// (spec §8.4), mirroring the web AnalyticsTab.
class AnalyticsTab extends StatefulWidget {
  const AnalyticsTab({super.key});

  @override
  State<AnalyticsTab> createState() => _AnalyticsTabState();
}

class _AnalyticsTabState extends State<AnalyticsTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AcquisitionRow>? _sources;
  List<SellerPerformanceRow>? _sellers;
  int _rangeDays = 90;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<Object>([
        _repo.getAcquisition(_rangeDays),
        _repo.getSellerPerformance(),
      ]);
      if (!mounted) return;
      setState(() {
        _sources = results[0] as List<AcquisitionRow>;
        _sellers = results[1] as List<SellerPerformanceRow>;
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

  Future<void> _loadSources() async {
    try {
      final sources = await _repo.getAcquisition(_rangeDays);
      if (mounted) setState(() => _sources = sources);
    } catch (_) {
      if (mounted) setState(() => _sources = const []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final sources = _sources;
    if (_loading && sources == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return adminErrorView(context, _error!, _load);
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Acquisition sources, grouped client-side like the web.
          SectionCard(
            title: state.t('admin.acquisitionSources'),
            icon: Icons.language_outlined,
            trailing: SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 30, label: Text('30d')),
                ButtonSegment(value: 90, label: Text('90d')),
              ],
              selected: {_rangeDays},
              onSelectionChanged: (s) {
                setState(() => _rangeDays = s.first);
                _loadSources();
              },
              style: const ButtonStyle(
                visualDensity: VisualDensity.compact,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(state.t('admin.acquisitionHint'), style: theme.textTheme.bodySmall),
                const SizedBox(height: 10),
                if (sources!.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(state.t('admin.noSourceData'),
                          style: theme.textTheme.bodySmall),
                    ),
                  )
                else
                  Column(
                    children: [
                      for (final src in sources)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  src.source.isEmpty
                                      ? src.source
                                      : src.source[0].toUpperCase() + src.source.substring(1),
                                  style: theme.textTheme.bodyMedium,
                                ),
                              ),
                              SizedBox(
                                width: 90,
                                child: Text('${state.t('admin.signupsCol')}: ${src.signups}',
                                    textAlign: TextAlign.end,
                                    style: theme.textTheme.labelMedium),
                              ),
                              SizedBox(
                                width: 90,
                                child: Text('${state.t('admin.listingsCol')}: ${src.listings}',
                                    textAlign: TextAlign.end,
                                    style: theme.textTheme.labelMedium),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),

          // Seller performance table.
          SectionCard(
            title: state.t('admin.sellerPerformance'),
            icon: Icons.storefront_outlined,
            child: _sellers == null || _sellers!.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(state.t('admin.noSourceData'),
                          style: theme.textTheme.bodySmall),
                    ),
                  )
                : Column(
                    children: [
                      for (final s in _sellers!)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(s.name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: theme.textTheme.titleSmall),
                                  ),
                                  if (s.verified)
                                    const Icon(Icons.verified, size: 14, color: Colors.green),
                                  if (s.suspended)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 4),
                                      child: StatusChip(
                                          label: state.t('admin.suspended'),
                                          color: theme.colorScheme.error),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Wrap(
                                spacing: 12,
                                runSpacing: 4,
                                children: [
                                  Text('${state.t('admin.catListings')}: ${s.listings}',
                                      style: theme.textTheme.bodySmall),
                                  Text('${state.t('admin.catViews')}: ${s.views}',
                                      style: theme.textTheme.bodySmall),
                                  Text('${state.t('admin.catInquiries')}: ${s.inquiries}',
                                      style: theme.textTheme.bodySmall),
                                  Text('${state.t('admin.responseRate')}: ${s.responseRatePct ?? '—'}%',
                                      style: theme.textTheme.bodySmall),
                                  Text(
                                    '${state.t('admin.avgResponse')}: ${s.avgResponseMinutes == null ? '—' : '${s.avgResponseMinutes!.round()}m'}',
                                    style: theme.textTheme.bodySmall,
                                  ),
                                  Text('${state.t('admin.catSold')}: ${s.sales}',
                                      style: theme.textTheme.bodySmall),
                                  if (s.rating != null)
                                    Text('★ ${s.rating}',
                                        style: theme.textTheme.bodySmall),
                                  if (s.reports > 0)
                                    Text('${state.t('admin.catReports')}: ${s.reports}',
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(color: theme.colorScheme.error)),
                                ],
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}