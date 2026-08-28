import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/utils/format.dart';
import '../domain/admin_repository.dart';
import 'admin_widgets.dart';

/// Telegram management (web `TelegramTab`, spec §19): bot delivery health,
/// recent channel posts and acquisition attribution from telegram-sourced
/// analytics events.
class TelegramTab extends StatefulWidget {
  const TelegramTab({super.key});

  @override
  State<TelegramTab> createState() => _TelegramTabState();
}

class _TelegramTabState extends State<TelegramTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  AdminStats? _stats;
  List<TelegramPost>? _posts;
  List<AcquisitionRow>? _acquisition;
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
        _repo.getStats(),
        _repo.getTelegramPosts(),
        _repo.getAcquisition(30),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as AdminStats;
        _posts = results[1] as List<TelegramPost>;
        _acquisition = results[2] as List<AcquisitionRow>;
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
    final raw = _stats;
    if (_loading && raw == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return adminErrorView(context, _error!, _load);
    }
    final s = raw!;
    final sends = s.telegramSends7d;
    final tgSuccess = sends > 0
        ? '${((s.telegramOk7d / sends) * 100).round()}%'
        : '100%';
    final failures = s.telegramFailureReasons;
    final tg = _acquisition?.firstWhere(
          (a) => a.source == 'telegram',
          orElse: () => const AcquisitionRow(source: 'telegram'),
        ) ??
        const AcquisitionRow(source: 'telegram');
    final posts = _posts ?? const <TelegramPost>[];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Bot & delivery health.
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
                    EngRow(icon: Icons.people_outline, label: state.t('admin.tgLinked'), value: s.telegramLinkedUsers),
                    EngRow(icon: Icons.block_outlined, label: state.t('admin.tgBlocked'), value: s.telegramBlockedUsers),
                    EngRow(icon: Icons.send_outlined, label: state.t('admin.tgSends'), value: sends),
                    EngRow(icon: Icons.check_circle_outline, label: state.t('admin.tgSuccess'), value: tgSuccess),
                    EngRow(icon: Icons.cancel_outlined, label: state.t('admin.tgFailures'), value: s.telegramFailures7d),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  '${state.t('admin.tgChannelPosts')}: ${s.telegramChannelPosts} · '
                  '${state.t('admin.tgProcessed')}: ${s.telegramProcessedUpdates}',
                  style: theme.textTheme.bodySmall,
                ),
                if (failures.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('· ${failures.join(' · ')}',
                        style: theme.textTheme.bodySmall),
                  ),
              ],
            ),
          ),

          // Attribution funnel (spec SS25): telegram-sourced events, 30d.
          SectionCard(
            title: state.t('admin.telegramAttribution'),
            icon: Icons.route_outlined,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(state.t('admin.acquisitionHint'), style: theme.textTheme.bodySmall),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 16,
                  children: [
                    EngRow(icon: Icons.person_add_outlined, label: state.t('admin.signupsCol'), value: tg.signups),
                    EngRow(icon: Icons.add_business_outlined, label: state.t('admin.listingsCol'), value: tg.listings),
                  ],
                ),
              ],
            ),
          ),

          // Recent channel posts.
          SectionCard(
            title: state.t('admin.channelPosts'),
            icon: Icons.article_outlined,
            child: posts.isEmpty
                ? Text(state.t('admin.noPosts'), style: theme.textTheme.bodySmall)
                : Column(
                    children: [
                      for (final p in posts)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 5),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  p.listingTitle ?? p.listingId,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodyMedium,
                                ),
                              ),
                              Text(Fmt.timeAgo(p.postedAt), style: theme.textTheme.labelMedium),
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