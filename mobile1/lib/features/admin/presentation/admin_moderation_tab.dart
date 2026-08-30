import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/utils/format.dart';
import '../domain/admin_repository.dart';
import 'admin_screen.dart' show ReportsTab;
import 'admin_widgets.dart';

/// Moderation tab — the reports queue, flagged listings and the disputes
/// queue behind a toggle, mirroring the web moderation area (spec §10 / §12).
/// Reports reuse the existing [ReportsTab]; the flagged queue groups open
/// reports per listing ([FlaggedQueue]); disputes get their own queue with
/// deadline + evidence and resolve/dismiss actions into the audit log.
class ModerationTab extends StatefulWidget {
  const ModerationTab({super.key, this.initialQueue = 'reports'});

  final String initialQueue;

  @override
  State<ModerationTab> createState() => _ModerationTabState();
}

class _ModerationTabState extends State<ModerationTab> {
  late String _queue;

  @override
  void initState() {
    super.initState();
    _queue = widget.initialQueue;
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SegmentedButton<String>(
              segments: [
                ButtonSegment(
                  value: 'reports',
                  icon: const Icon(Icons.flag_outlined, size: 16),
                  label: Text(state.t('admin.tabReports')),
                ),
                ButtonSegment(
                  value: 'disputes',
                  icon: const Icon(Icons.gavel_outlined, size: 16),
                  label: Text(state.t('admin.tabDisputes')),
                ),
                ButtonSegment(
                  value: 'flagged',
                  icon: const Icon(Icons.outlined_flag, size: 16),
                  label: Text(state.t('admin.tabFlagged')),
                ),
              ],
              selected: {_queue},
              onSelectionChanged: (s) => setState(() => _queue = s.first),
            ),
          ),
        ),
        Expanded(
          child: switch (_queue) {
            'reports' => const ReportsTab(),
            'disputes' => const DisputesQueue(),
            _ => const FlaggedQueue(),
          },
        ),
      ],
    );
  }
}

/// Disputes queue (web `DisputesQueue`, spec §12): every dispute with its
/// status, the 72h decision deadline, evidence = messages in the linked
/// conversation, and resolve/dismiss actions with an optional resolution note.
class DisputesQueue extends StatefulWidget {
  const DisputesQueue({super.key});

  @override
  State<DisputesQueue> createState() => _DisputesQueueState();
}

class _DisputesQueueState extends State<DisputesQueue> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminDispute>? _disputes;
  bool _loading = true;
  String? _error;
  String? _resolvingId;

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
      final disputes = await _repo.getDisputes();
      if (!mounted) return;
      setState(() {
        _disputes = disputes;
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

  Future<void> _resolve(AdminDispute d, String status) async {
    String? resolution;
    if (status == 'resolved') {
      final controller = TextEditingController();
      resolution = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(AppState.instance.t('admin.resolveDispute')),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: AppState.instance.t('admin.resolutionHint'),
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(AppState.instance.t('common.cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, controller.text.trim()),
              child: Text(AppState.instance.t('admin.confirmResolve')),
            ),
          ],
        ),
      );
      controller.dispose();
      if (resolution == null) return;
    } else {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(AppState.instance.t('admin.dismissDispute')),
          content: Text(d.listingLabel),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(AppState.instance.t('common.cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(AppState.instance.t('admin.dismiss')),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    setState(() => _resolvingId = d.id);
    try {
      await _repo.resolveDispute(d.id, status, resolution: resolution);
      adminSnack(context, AppState.instance.t('admin.disputeUpdated'));
      await _load();
    } catch (e) {
      adminSnack(context, '$e');
    } finally {
      if (mounted) setState(() => _resolvingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final disputes = _disputes;
    if (_loading && disputes == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return adminErrorView(context, _error!, _load);
    }
    if (disputes!.isEmpty) {
      return adminEmpty(context, 'admin.noDisputes');
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: disputes.length,
        itemBuilder: (context, i) => _disputeCard(context, state, disputes[i]),
      ),
    );
  }

  Widget _disputeCard(BuildContext context, AppState state, AdminDispute d) {
    final theme = Theme.of(context);
    final statusColor = _statusColor(theme, d.status);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(d.listingLabel,
                      style: theme.textTheme.titleSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ),
                StatusChip(label: d.status, color: statusColor),
              ],
            ),
            const SizedBox(height: 4),
            Text(d.reason, style: theme.textTheme.bodySmall),
            if (d.description != null && d.description!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(d.description!, style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: 8),
            Text(
              '${state.t('admin.disputeParties')}: ${d.sellerLabel} ⇄ ${d.buyerLabel}',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                Text(
                  '${state.t('admin.evidence')}: ${d.messageCount}',
                  style: theme.textTheme.bodySmall,
                ),
                if (d.deadlineAt != null)
                  Text(
                    d.overdue
                        ? '${state.t('admin.deadlineOverdue')}: ${Fmt.timeAgo(d.deadlineAt!)}'
                        : '${state.t('admin.deadline')}: ${_deadlineLabel(d.deadlineAt!)}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: d.overdue ? theme.colorScheme.error : null,
                      fontWeight: d.overdue ? FontWeight.w700 : null,
                    ),
                  ),
              ],
            ),
            if (d.resolution != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '${state.t('admin.resolution')}: ${d.resolution}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        _resolvingId == d.id || !d.isOpen ? null : () => _resolve(d, 'dismissed'),
                    child: Text(state.t('admin.dismiss')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed:
                        _resolvingId == d.id || !d.isOpen ? null : () => _resolve(d, 'resolved'),
                    child: _resolvingId == d.id
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(state.t('admin.resolve')),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static Color _statusColor(ThemeData theme, String status) => switch (status) {
        'pending' => Colors.orange,
        'investigating' => Colors.blue,
        'escalated' => theme.colorScheme.error,
        'resolved' => Colors.green,
        _ => theme.colorScheme.outline,
      };

  static String _deadlineLabel(DateTime deadline) {
    final remaining = deadline.difference(DateTime.now());
    if (remaining.isNegative) return '—';
    final hours = remaining.inHours;
    if (hours < 1) {
      return '${remaining.inMinutes}m';
    }
    if (hours < 72) {
      return '${hours}h ${remaining.inMinutes.remainder(60)}m';
    }
    return '${hours ~/ 24}d ${hours.remainder(24)}h';
  }
}

/// Flagged listings queue (web `FlaggedListingsTab`, spec §10): open reports
/// grouped by listing for listing-level triage — dismiss all reports in one
/// go, or feature the listing from the queue.
class FlaggedQueue extends StatefulWidget {
  const FlaggedQueue({super.key});

  @override
  State<FlaggedQueue> createState() => _FlaggedQueueState();
}

class _FlaggedQueueState extends State<FlaggedQueue> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<FlaggedListingGroup>? _groups;
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
      final groups = await _repo.getFlagged();
      if (!mounted) return;
      setState(() {
        _groups = groups;
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

  Future<void> _dismissAll(FlaggedListingGroup g) async {
    try {
      await _repo.dismissReports(g.reports.map((r) => r.id).toList());
      if (!mounted) return;
      adminSnack(context, AppState.instance.t('admin.flaggedDismissed'));
      await _load();
    } catch (e) {
      if (!mounted) return;
      adminSnack(context, '$e');
    }
  }

  Future<void> _feature(FlaggedListingGroup g) async {
    try {
      await _repo.toggleFeatured(g.listingId, true);
      if (!mounted) return;
      adminSnack(context, AppState.instance.t('admin.featuredOk'));
      await _load();
    } catch (e) {
      if (!mounted) return;
      adminSnack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final groups = _groups;
    final theme = Theme.of(context);
    if (_loading && groups == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return adminErrorView(context, _error!, _load);
    }
    if (groups!.isEmpty) {
      return Center(
        child: Text(
          state.t('admin.noFlagged'),
          style: theme.textTheme.bodyLarge,
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: groups.length,
        itemBuilder: (context, i) {
          final g = groups[i];
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.outlined_flag, size: 18, color: theme.colorScheme.error),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          g.listingTitle ?? g.listingId,
                          style: theme.textTheme.titleMedium,
                        ),
                      ),
                      const SizedBox(width: 8),
                      StatusChip(
                        label: '${g.reports.length}'
                            ' ${state.t(g.reports.length == 1 ? 'admin.report' : 'admin.reports').toLowerCase()}',
                        color: theme.colorScheme.error,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final r in g.reports.take(4))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        '• ${r.reason}${r.details != null ? ' — ${r.details}' : ''} · ${Fmt.timeAgo(r.createdAt)}',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  if (g.listingStatus != null || g.featured) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        if (g.listingStatus != null)
                          StatusChip(label: g.listingStatus!, color: theme.colorScheme.primary),
                        if (g.featured) ...[
                          const SizedBox(width: 6),
                          StatusChip(
                            label: state.t('admin.featured'),
                            color: theme.colorScheme.tertiary,
                          ),
                        ],
                      ],
                    ),
                  ],
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => _dismissAll(g),
                          child: Text(state.t('admin.dismissAll')),
                        ),
                      ),
                      if (!g.featured) ...[
                        const SizedBox(width: 8),
                        Expanded(
                          child: FilledButton(
                            onPressed: () => _feature(g),
                            child: Text(state.t('admin.feature')),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}