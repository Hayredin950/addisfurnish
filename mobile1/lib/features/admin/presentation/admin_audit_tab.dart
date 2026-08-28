import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/utils/format.dart';
import '../domain/admin_repository.dart';
import 'admin_widgets.dart';

/// Admin audit log (web `AuditLogTab`, spec §21) — the 100 most recent
/// recorded admin actions, newest first.
class AuditLogTab extends StatefulWidget {
  const AuditLogTab({super.key});

  @override
  State<AuditLogTab> createState() => _AuditLogTabState();
}

class _AuditLogTabState extends State<AuditLogTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AuditLogEntry>? _entries;
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
      final entries = await _repo.getAuditLog();
      if (!mounted) return;
      setState(() {
        _entries = entries;
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
    final entries = _entries;
    if (_loading && entries == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return adminErrorView(context, _error!, _load);
    }
    if (entries!.isEmpty) {
      return adminEmpty(context, 'admin.auditLogEmpty');
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: entries.length,
        itemBuilder: (context, i) {
          final e = entries[i];
          final label = e.actionLabel.isEmpty
              ? '—'
              : '${e.actionLabel[0].toUpperCase()}${e.actionLabel.substring(1)}';
          return Card(
            margin: const EdgeInsets.symmetric(vertical: 4),
            child: ListTile(
              dense: true,
              leading: Icon(Icons.receipt_long_outlined,
                  size: 18, color: theme.colorScheme.primary),
              title: Row(
                children: [
                  Flexible(child: Text(label, style: theme.textTheme.bodyMedium)),
                  const SizedBox(width: 8),
                  StatusChip(label: e.entityType, color: theme.colorScheme.outline),
                ],
              ),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (e.entityId != null)
                    Text(e.entityId!, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (e.reason != null) Text('“${e.reason}”'),
                  Text(
                    '${state.t('admin.by')} ${e.adminName ?? '—'} · ${Fmt.timeAgo(e.createdAt)}',
                    style: theme.textTheme.bodySmall,
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