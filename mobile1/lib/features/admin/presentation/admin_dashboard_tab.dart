import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../domain/admin_repository.dart';
import 'admin_widgets.dart';

/// Dashboard — the admin ACTION → HEALTH → INTELLIGENCE → DETAIL hierarchy,
/// mirroring the web `/admin` DashboardTab (spec §24):
///  - Tier 1: action-required counters (pending reports/flagged/disputes/
///    verification queue), each opening the matching queue.
///  - Tier 2: marketplace health (`admin_health_stats`) — sell-through,
///    median days-to-sale, seller response speed and the conversion funnel.
///  - Tier 3: category performance (supply vs demand per root category).
///  - Tier 4: platform volume — trend, status breakdown, top categories /
///    searches and telegram delivery health.
class DashboardTab extends StatefulWidget {
  const DashboardTab({
    super.key,
    this.onOpenUsers,
    this.onOpenModeration,
    this.onOpenVerification,
  });

  final void Function(String filter)? onOpenUsers;
  final void Function(String queue)? onOpenModeration;
  final VoidCallback? onOpenVerification;

  @override
  State<DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<DashboardTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();

  AdminActionCounts? _actions;
  HealthStats? _health;
  List<CategoryPerformance>? _catPerf;
  AdminStats? _stats;
  List<CategoryCount> _topCats = const [];
  List<CategoryCount> _topSearches = const [];
  List<TrendDay> _trend = const [];
  int _range = 14;
  String _metric = 'views';
  bool _loading = true;
  String? _error;

  static const _metrics = <String, (String, int Function(TrendDay))>{
    'views': ('admin.trendViews', _views),
    'listings': ('admin.trendListings', _listings),
    'users': ('admin.trendUsers', _users),
    'messages': ('admin.trendMessages', _messages),
  };

  static int _views(TrendDay d) => d.views;
  static int _listings(TrendDay d) => d.listings;
  static int _users(TrendDay d) => d.users;
  static int _messages(TrendDay d) => d.messages;

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
        _repo.getActionCounts(),
        _repo.getHealthStats(),
        _repo.getCategoryPerformance(),
        _repo.getStats(),
        _repo.getTopCategories(),
        _repo.getTopSearches(),
        _repo.getTrend(_range),
      ]);
      if (!mounted) return;
      setState(() {
        _actions = results[0] as AdminActionCounts;
        _health = results[1] as HealthStats;
        _catPerf = results[2] as List<CategoryPerformance>;
        _stats = results[3] as AdminStats;
        _topCats = results[4] as List<CategoryCount>;
        _topSearches = results[5] as List<CategoryCount>;
        _trend = results[6] as List<TrendDay>;
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

  Future<void> _loadTrend() async {
    try {
      final trend = await _repo.getTrend(_range);
      if (mounted) setState(() => _trend = trend);
    } catch (_) {
      if (mounted) setState(() => _trend = const []);
    }
  }

  void _setRange(int r) {
    setState(() => _range = r);
    _loadTrend();
  }

  void _openModeration(String queue) => widget.onOpenModeration?.call(queue);

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final stats = _stats;
    final actions = _actions;
    if (_loading && stats == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return adminErrorView(context, _error!, _load);
    }
    final s = stats!;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _tier1Actions(theme, actions),
          _tier2Health(theme, _health),
          _tier3CategoryPerf(theme),
          _tier4Volume(theme, state, s),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  // ── Tier 1: action required ────────────────────────────────────────────

  Widget _tier1Actions(ThemeData theme, AdminActionCounts? actions) {
    final state = AppState.instance;
    final a = actions ?? const AdminActionCounts();
    final items = <(IconData, String, int, Color, VoidCallback)>[
      (Icons.flag_outlined, state.t('admin.tierReports'), a.reports,
          theme.colorScheme.error, () => _openModeration('reports')),
      (Icons.outlined_flag, state.t('admin.tierFlagged'), a.flagged,
          theme.colorScheme.tertiary, () => _openModeration('flagged')),
      (Icons.gavel_outlined, state.t('admin.tierDisputes'), a.disputes,
          theme.colorScheme.primary, () => _openModeration('disputes')),
      (Icons.shield_outlined, state.t('admin.tierVerifications'), a.verifications,
          Colors.green, () => widget.onOpenVerification?.call()),
    ];
    return SectionCard(
      title: state.t('admin.tier1Title'),
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final (icon, label, count, color, onTap) in items)
            GestureDetector(
              onTap: onTap,
              child: Container(
                width: (MediaQuery.sizeOf(context).width - 42 - 10) / 2,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: color.withValues(alpha: 0.25)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(icon, size: 16, color: color),
                        const Spacer(),
                        Text('$count',
                            style: theme.textTheme.titleLarge?.copyWith(
                              color: color,
                              fontWeight: FontWeight.w800,
                            )),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(label, style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ── Tier 2: marketplace health ─────────────────────────────────────────

  Widget _tier2Health(ThemeData theme, HealthStats? health) {
    final state = AppState.instance;
    final h = health;
    if (h == null) {
      return SectionCard(
        title: state.t('admin.tier2Title'),
        child: Text(state.t('admin.healthUnavailable'), style: theme.textTheme.bodySmall),
      );
    }
    final funnel = <(String, int)>[
      (state.t('admin.funnelPublished'), h.funnelPublished),
      (state.t('admin.funnelViewed'), h.funnelViewed),
      (state.t('admin.funnelInquiries'), h.funnelInquiries),
      (state.t('admin.funnelResponded'), h.funnelResponded),
      (state.t('admin.funnelDeals'), h.funnelDeals),
      (state.t('admin.funnelSales'), h.funnelSales),
    ];
    return SectionCard(
      title: state.t('admin.tier2Title'),
      icon: Icons.monitor_heart_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(state.t('admin.sellThrough'), style: theme.textTheme.labelMedium),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              StatusChip(
                  label: '7d · ${h.sellThroughD7.round()}%',
                  color: _pctColor(theme, h.sellThroughD7)),
              StatusChip(
                  label: '30d · ${h.sellThroughD30.round()}%',
                  color: _pctColor(theme, h.sellThroughD30)),
              StatusChip(
                  label: '60d · ${h.sellThroughD60.round()}%',
                  color: _pctColor(theme, h.sellThroughD60)),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 16,
            runSpacing: 10,
            children: [
              EngRow(
                  icon: Icons.schedule_outlined,
                  label: state.t('admin.medianDays'),
                  value: '${h.medianDaysToSale ?? '—'}'),
              EngRow(
                  icon: Icons.bolt_outlined,
                  label: state.t('admin.responseRate'),
                  value: h.responseRatePct == null ? '—%' : '${h.responseRatePct!.round()}%'),
              EngRow(
                  icon: Icons.timer_outlined,
                  label: state.t('admin.avgResponse'),
                  value: h.responseAvgMinutes == null ? '—' : '${h.responseAvgMinutes!.round()}m'),
              EngRow(
                  icon: Icons.timelapse_outlined,
                  label: state.t('admin.medianResponse'),
                  value: h.responseMedianMinutes == null
                      ? '—'
                      : '${h.responseMedianMinutes!.round()}m'),
            ],
          ),
          const SizedBox(height: 12),
          Text(state.t('admin.funnelTitle'), style: theme.textTheme.labelMedium),
          const SizedBox(height: 6),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            children: [
              for (final (label, value) in funnel)
                EngRow(icon: Icons.filter_alt_outlined, label: label, value: value),
            ],
          ),
        ],
      ),
    );
  }

  static Color _pctColor(ThemeData theme, num pct) {
    if (pct >= 15) return Colors.green;
    if (pct >= 7) return Colors.orange;
    return theme.colorScheme.error;
  }

  // ── Tier 3: category performance ───────────────────────────────────────

  Widget _tier3CategoryPerf(ThemeData theme) {
    final state = AppState.instance;
    final rows = _catPerf ?? const <CategoryPerformance>[];
    final max = rows.fold<int>(1, (m, r) => r.listings > m ? r.listings : m);
    return SectionCard(
      title: state.t('admin.tier3Title'),
      icon: Icons.category_outlined,
      child: rows.isEmpty
          ? Text(state.t('admin.noListings'), style: theme.textTheme.bodySmall)
          : Column(
              children: [
                for (final r in rows.take(6))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(r.name, style: theme.textTheme.bodyMedium)),
                            Text(
                              '${r.views} ${state.t('admin.viewsWord')} · '
                              '${r.inquiries} ${state.t('admin.inquiriesWord')} · '
                              '${r.sold} ${state.t('admin.soldWord')}',
                              style: theme.textTheme.labelSmall,
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: r.listings / max,
                            minHeight: 7,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }

  // ── Tier 4: platform volume ───────────────────────────────────────────

  Widget _tier4Volume(ThemeData theme, AppState state, AdminStats s) {
    final maxCat = _topCats.fold<int>(1, (m, c) => c.count > m ? c.count : m);
    final maxSearch = _topSearches.fold<int>(1, (m, c) => c.count > m ? c.count : m);
    final verifiedPct = s.sellers > 0 ? ((s.verifiedSellers / s.sellers) * 100).round() : 0;
    final total = s.listings < 1 ? 1 : s.listings;
    final segments = <(String, int, Color)>[
      (state.t('admin.statusActive'), s.activeListings, theme.colorScheme.primary),
      (state.t('admin.statusSold'), s.soldListings, Colors.green),
      (state.t('admin.statusOther'), s.otherListings, theme.colorScheme.outline),
    ].where((x) => x.$2 > 0).toList();
    final metricGet = _metrics[_metric]!.$2;
    final trendMax = _trend.fold<int>(1, (m, d) => metricGet(d) > m ? metricGet(d) : m);
    final tgSuccess = s.telegramSends7d > 0
        ? '${((s.telegramOk7d / s.telegramSends7d) * 100).round()}%'
        : '100%';

    return Column(
      children: [
        // Hero row — big numbers + verified ratio.
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            _numberBox(theme, state.t('admin.statListings'), '${s.listings}'),
            _numberBox(theme, state.t('admin.statUsers'), '${s.users}',
                onTap: widget.onOpenUsers == null ? null : () => widget.onOpenUsers!('all')),
            _verifiedBox(theme, state, s, verifiedPct),
            _numberBox(theme, state.t('admin.thisWeek'), '+${s.newListings7d}'),
          ],
        ),
        const SizedBox(height: 12),

        // Engagement strip.
        SectionCard(
          child: Wrap(
            spacing: 16,
            runSpacing: 10,
            children: [
              EngRow(icon: Icons.visibility_outlined, label: state.t('admin.statViews'), value: s.totalViews),
              EngRow(icon: Icons.chat_bubble_outline, label: state.t('admin.statConversations'), value: s.conversations),
              EngRow(icon: Icons.chat_outlined, label: state.t('admin.statMessages'), value: s.messages),
              EngRow(icon: Icons.star_outline, label: state.t('admin.statReviews'), value: s.reviews),
            ],
          ),
        ),

        // Activity trend.
        SectionCard(
          title: state.t('admin.trendTitle'),
          trailing: Wrap(
            spacing: 6,
            children: [
              for (final r in const [7, 14, 30])
                ChoiceChip(
                  label: Text('${r}d'),
                  visualDensity: VisualDensity.compact,
                  selected: _range == r,
                  onSelected: (_) => _setRange(r),
                ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                children: [
                  for (final m in _metrics.keys)
                    ChoiceChip(
                      label: Text(state.t(_metrics[m]!.$1)),
                      visualDensity: VisualDensity.compact,
                      selected: _metric == m,
                      onSelected: (_) => setState(() => _metric = m),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              if (_trend.isEmpty)
                Text(state.t('admin.noListings'), style: theme.textTheme.bodySmall)
              else
                SizedBox(
                  height: 118,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final d in _trend)
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Container(
                                width: double.infinity,
                                height: metricGet(d) / trendMax * 96,
                                margin: const EdgeInsets.symmetric(horizontal: 2),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.primary,
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(d.label,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.labelSmall?.copyWith(fontSize: 8)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),

        // Listing status breakdown.
        SectionCard(
          title: state.t('admin.statusBreakdown'),
          child: segments.isEmpty
              ? Text(state.t('admin.noListings'), style: theme.textTheme.bodySmall)
              : Column(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: SizedBox(
                        height: 10,
                        child: Row(
                          children: [
                            for (final x in segments)
                              Expanded(flex: x.$2, child: Container(color: x.$3)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    for (final x in segments)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(color: x.$3, shape: BoxShape.circle),
                            ),
                            const SizedBox(width: 8),
                            Expanded(child: Text(x.$1, style: theme.textTheme.bodyMedium)),
                            Text('${x.$2} · ${(x.$2 * 100 ~/ total)}%',
                                style: theme.textTheme.labelMedium),
                          ],
                        ),
                      ),
                  ],
                ),
        ),

        // Top categories & searches.
        SectionCard(
          title: state.t('admin.topCategories'),
          child: _topCats.isEmpty
              ? Text(state.t('admin.noListings'), style: theme.textTheme.bodySmall)
              : Column(
                  children: [
                    for (final c in _topCats) BarRow(label: c.name, count: c.count, max: maxCat),
                  ],
                ),
        ),
        SectionCard(
          title: state.t('admin.topSearches'),
          child: _topSearches.isEmpty
              ? Text(state.t('admin.noListings'), style: theme.textTheme.bodySmall)
              : Column(
                  children: [
                    for (final c in _topSearches)
                      BarRow(label: c.name, count: c.count, max: maxSearch),
                  ],
                ),
        ),

        // Telegram delivery health.
        SectionCard(
          title: state.t('admin.telegramHealth'),
          icon: Icons.telegram,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 16,
                runSpacing: 10,
                children: [
                  EngRow(icon: Icons.send_outlined, label: state.t('admin.tgSends'), value: s.telegramSends7d),
                  EngRow(icon: Icons.check_circle_outline, label: state.t('admin.tgSuccess'), value: tgSuccess),
                  EngRow(icon: Icons.cancel_outlined, label: state.t('admin.tgFailures'), value: s.telegramFailures7d),
                  EngRow(icon: Icons.people_outline, label: state.t('admin.tgLinked'), value: s.telegramLinkedUsers),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '${state.t('admin.tgChannelPosts')}: ${s.telegramChannelPosts} · '
                '${state.t('admin.tgProcessed')}: ${s.telegramProcessedUpdates} · '
                '${state.t('admin.tgBlocked')}: ${s.telegramBlockedUsers}',
                style: theme.textTheme.bodySmall,
              ),
              if (s.telegramFailureReasons.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('· ${s.telegramFailureReasons.join(' · ')}',
                      style: theme.textTheme.bodySmall),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _numberBox(ThemeData theme, String label, String value, {VoidCallback? onTap}) {
    final box = Container(
      width: (MediaQuery.sizeOf(context).width - 42 - 10) / 2,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value,
              style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
          const SizedBox(height: 4),
          Text(label, style: theme.textTheme.bodySmall),
        ],
      ),
    );
    if (onTap == null) return box;
    return GestureDetector(onTap: onTap, child: box);
  }

  Widget _verifiedBox(ThemeData theme, AppState state, AdminStats s, int verifiedPct) {
    return GestureDetector(
      onTap: widget.onOpenUsers == null ? null : () => widget.onOpenUsers!('sellers'),
      child: Container(
        width: (MediaQuery.sizeOf(context).width - 42 - 10) / 2,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${s.verifiedSellers}/${s.sellers}',
                style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
            const SizedBox(height: 4),
            Text(state.t('admin.statVerifiedSellers'), style: theme.textTheme.bodySmall),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: (verifiedPct < 2 ? 2 : verifiedPct) / 100,
                minHeight: 5,
                color: Colors.green,
                backgroundColor: theme.colorScheme.surface,
              ),
            ),
            const SizedBox(height: 2),
            Text('$verifiedPct% ${state.t('admin.verifiedRate')}',
                style: theme.textTheme.labelSmall),
          ],
        ),
      ),
    );
  }
}