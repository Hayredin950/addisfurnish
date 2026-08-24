import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/utils/format.dart';
import '../../../core/widgets/app_image.dart';
import '../domain/admin_repository.dart';

enum AdminTab { reports, verification, users, categories, listings, stats }

/// Admin moderation console. Mirrors the web /admin screen and the RN
/// `admin.tsx`, scaled to a phone: report resolution, the seller-verification
/// queue with document preview and audit trail, user suspension, plus
/// categories / listings / platform stats. Every action is re-verified as
/// admin server-side (RLS + SECURITY DEFINER RPCs) — the UI is only a trigger.
class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();

  AdminTab _tab = AdminTab.reports;
  String _usersFilter = 'all';
  bool _admin = false;

  @override
  void initState() {
    super.initState();
    // The profile tab only exposes this screen to admins, so the cached
    // status is authoritative and renders instantly. The re-check below is a
    // server-side sanity refresh that must never leave the screen spinning:
    // on failure/timeout we keep the cached value instead of erroring out.
    _admin = AppState.instance.isAdmin;
    _checkAdmin();
  }

  Future<void> _checkAdmin() async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    try {
      final admin = await _repo
          .isAdmin(uid)
          .timeout(const Duration(seconds: 10), onTimeout: () => _admin);
      if (mounted) setState(() => _admin = admin);
    } catch (_) {
      // Keep the cached status on failure — never hang on a spinner.
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;

    return Scaffold(
      appBar: AppBar(title: Text(state.t('admin.title'))),
      body: _admin
          ? Column(
              children: [
                _tabBar(context),
                Expanded(
                  child: switch (_tab) {
                    AdminTab.reports => const ReportsTab(),
                    AdminTab.verification => const VerificationTab(),
                    AdminTab.users => UsersTab(initialFilter: _usersFilter),
                    AdminTab.categories => const CategoriesTab(),
                    AdminTab.listings => const ListingsTab(),
                    AdminTab.stats =>
                      StatsTab(onOpenUsers: (f) {
                        setState(() {
                          _usersFilter = f;
                          _tab = AdminTab.users;
                        });
                      }),
                  },
                ),
              ],
            )
          : _denied(context, state),
    );
  }

  Widget _denied(BuildContext context, AppState state) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 48),
            const SizedBox(height: 12),
            Text(state.t('admin.denied'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(
              state.t('admin.deniedHint'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabBar(BuildContext context) {
    final state = AppState.instance;
    const tabs = <AdminTab, (IconData, String)>{
      AdminTab.reports: (Icons.flag_outlined, 'admin.tabReports'),
      AdminTab.verification: (Icons.shield_outlined, 'admin.tabVerification'),
      AdminTab.users: (Icons.people_outline, 'admin.tabUsers'),
      AdminTab.categories: (Icons.grid_view_outlined, 'admin.tabCategories'),
      AdminTab.listings: (Icons.list_alt_outlined, 'admin.tabListings'),
      AdminTab.stats: (Icons.bar_chart_outlined, 'admin.tabStats'),
    };
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          for (final entry in tabs.entries)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                selected: _tab == entry.key,
                onSelected: (_) => setState(() => _tab = entry.key),
                avatar: Icon(
                  entry.value.$1,
                  size: 16,
                  color: _tab == entry.key
                      ? Theme.of(context).colorScheme.onSecondaryContainer
                      : Theme.of(context).colorScheme.outline,
                ),
                label: Text(state.t(entry.value.$2)),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────

void _snack(BuildContext context, String msg) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

Widget _errorView(BuildContext context, String error, VoidCallback retry, AppState state) {
  return Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(error),
        const SizedBox(height: 12),
        FilledButton(onPressed: retry, child: Text(state.t('common.retry'))),
      ],
    ),
  );
}

// ── Reports ──────────────────────────────────────────────────────────────

class ReportsTab extends StatefulWidget {
  const ReportsTab({super.key});

  @override
  State<ReportsTab> createState() => _ReportsTabState();
}

class _ReportsTabState extends State<ReportsTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminReport>? _reports;
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
      final reports = await _repo.getReports();
      if (!mounted) return;
      setState(() {
        _reports = reports;
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

  Future<void> _act(AdminReport r, String status) async {
    try {
      await _repo.resolveReport(r, status);
      _snack(context, AppState.instance.t('admin.reporterNotified'));
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final reports = _reports;
    if (_loading && reports == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _errorView(context, _error!, _load, state);
    }
    if (reports!.isEmpty) {
      return Center(
        child: Text(state.t('admin.noReports'), style: Theme.of(context).textTheme.bodyLarge),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: reports.length,
        itemBuilder: (context, i) {
          final r = reports[i];
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(r.displayTitle, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    '${state.t('admin.reportReason')}: ${r.reason} · ${Fmt.timeAgo(r.createdAt)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  if (r.details != null) ...[
                    const SizedBox(height: 4),
                    Text(r.details!, style: Theme.of(context).textTheme.bodySmall),
                  ],
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => _act(r, 'dismissed'),
                          child: Text(state.t('admin.dismiss')),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton(
                          onPressed: () => _act(r, 'reviewed'),
                          child: Text(state.t('admin.resolved')),
                        ),
                      ),
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

// ── Verification ─────────────────────────────────────────────────────────

class VerificationTab extends StatefulWidget {
  const VerificationTab({super.key});

  @override
  State<VerificationTab> createState() => _VerificationTabState();
}

class _VerificationTabState extends State<VerificationTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminVerificationDoc>? _queue;
  List<VerificationDecision>? _decisions;
  bool _loading = true;
  String? _rejectingId;
  final _reason = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait<Object>([
        _repo.getVerificationQueue(),
        _repo.getVerificationDecisions(),
      ]);
      if (!mounted) return;
      setState(() {
        _queue = results[0] as List<AdminVerificationDoc>;
        _decisions = results[1] as List<VerificationDecision>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack(context, '$e');
    }
  }

  Future<void> _decide(AdminVerificationDoc doc, String action) async {
    setState(() => _busy = true);
    try {
      await _repo.decideDocument(
        doc.id,
        action,
        reason: action == 'rejected' ? _reason.text : null,
      );
      _snack(context, AppState.instance.t(action == 'approved' ? 'admin.verifiedOk' : 'admin.rejectedOk'));
      setState(() {
        _rejectingId = null;
        _reason.clear();
      });
      await _load();
    } catch (e) {
      _snack(context, '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openDoc(AdminVerificationDoc doc) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AdminDocViewerPage(
          filePath: doc.fileUrl,
          title: doc.sellerLabel,
        ),
      ),
    );
  }

  Widget _docCard(BuildContext context, AppState state, AdminVerificationDoc doc) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(doc.sellerLabel, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(
              '${state.t('admin.docType')}: ${doc.documentType} · ${Fmt.timeAgo(doc.createdAt)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (doc.fileUrl.isEmpty || doc.fileUrl.startsWith('demo/'))
              Text(state.t('admin.documentMissing'),
                  style: Theme.of(context).textTheme.bodySmall)
            else
              TextButton.icon(
                onPressed: () => _openDoc(doc),
                icon: const Icon(Icons.description_outlined, size: 16),
                label: Text(state.t('admin.viewDocument')),
              ),
            if (_rejectingId == doc.id) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _reason,
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: state.t('admin.rejectPlaceholder'),
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _rejectingId = null;
                                _reason.clear();
                              }),
                      child: Text(state.t('common.cancel')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.error,
                      ),
                      onPressed: _busy || _reason.text.trim().length < 3
                          ? null
                          : () => _decide(doc, 'rejected'),
                      child: Text(state.t('admin.confirmReject')),
                    ),
                  ),
                ],
              ),
            ] else
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _rejectingId = doc.id;
                                  _reason.clear();
                                }),
                        child: Text(state.t('admin.reject')),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton(
                        onPressed: _busy ? null : () => _decide(doc, 'approved'),
                        child: Text(state.t('admin.approve')),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _decisionCard(BuildContext context, AppState state, VerificationDecision d) {
    final theme = Theme.of(context);
    final color = d.action == 'approved' ? Colors.green : theme.colorScheme.error;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: ListTile(
        title: Text(d.sellerLabel),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(d.action,
                style: TextStyle(color: color, fontWeight: FontWeight.w700)),
            if (d.reason != null) Text(d.reason!),
            Text('${state.t('admin.by')} ${d.reviewerName ?? d.reviewerId ?? ''} · ${Fmt.timeAgo(d.createdAt)}'),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final queue = _queue ?? const <AdminVerificationDoc>[];
    final decisions = _decisions ?? const <VerificationDecision>[];

    if (_loading && _queue == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(state.t('admin.queue'), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (queue.isEmpty)
            Text(state.t('admin.queueEmpty'), style: Theme.of(context).textTheme.bodySmall),
          for (final doc in queue) _docCard(context, state, doc),
          const SizedBox(height: 24),
          Text(state.t('admin.auditTrail'), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (decisions.isEmpty)
            Text(state.t('admin.auditEmpty'), style: Theme.of(context).textTheme.bodySmall),
          for (final d in decisions) _decisionCard(context, state, d),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── Users ────────────────────────────────────────────────────────────────

class UsersTab extends StatefulWidget {
  const UsersTab({super.key, this.initialFilter = 'all'});

  final String initialFilter;

  @override
  State<UsersTab> createState() => _UsersTabState();
}

class _BanOption {
  const _BanOption(this.key, this.hours, this.labelKey);
  final String key;
  final int hours;
  final String labelKey;
}

class _UsersTabState extends State<UsersTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminUser>? _users;
  bool _loading = true;
  String? _error;
  String _filter = 'all';
  String _search = '';

  AdminUser? _banTarget;

  @override
  void initState() {
    super.initState();
    _filter = widget.initialFilter;
    _load();
  }

  static const _options = [
    _BanOption('24h', 24, '24h'),
    _BanOption('7d', 24 * 7, '7d'),
    _BanOption('30d', 24 * 30, '30d'),
    _BanOption('permanent', 24 * 365 * 10, 'admin.banPermanent'),
  ];
  _BanOption _banDuration = _options.first;
  final _banReason = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _banReason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await _repo.getUsers();
      if (!mounted) return;
      setState(() {
        _users = users;
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

  List<AdminUser> get _filtered {
    final all = _users ?? const <AdminUser>[];
    final q = _search.trim().toLowerCase();
    return all.where((u) {
      if (_filter == 'sellers' && !u.isSeller) return false;
      if (_filter == 'buyers' && u.isSeller) return false;
      if (q.isEmpty) return true;
      return (u.displayName).toLowerCase().contains(q) ||
          (u.phone ?? '').toLowerCase().contains(q) ||
          (u.city ?? '').toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _revoke(AdminUser u) async {
    try {
      await _repo.revokeSessions(u.id);
      _snack(context, AppState.instance.t('admin.sessionsRevoked'));
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _confirmBan() async {
    final target = _banTarget;
    if (target == null) return;
    setState(() => _busy = true);
    try {
      await _repo.banUser(target.id, _banDuration.hours, reason: _banReason.text.trim());
      _snack(context, AppState.instance.t('admin.banned'));
      setState(() => _banTarget = null);
      _banReason.clear();
      await _load();
    } catch (e) {
      _snack(context, '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _lift(AdminUser u) async {
    try {
      await _repo.unbanUser(u.id);
      _snack(context, AppState.instance.t('admin.unbanned'));
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final users = _users;
    if (_loading && users == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _errorView(context, _error!, _load, state);
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText: state.t('admin.searchUsers'),
              prefixIcon: const Icon(Icons.search),
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final f in const ['all', 'sellers', 'buyers'])
                ChoiceChip(
                  label: Text(switch (f) {
                    'all' => state.t('admin.filterAll'),
                    'sellers' => state.t('admin.filterSellers'),
                    _ => state.t('admin.filterBuyers'),
                  }),
                  selected: _filter == f,
                  onSelected: (_) => setState(() => _filter = f),
                ),
            ],
          ),
          const SizedBox(height: 8),
          for (final u in _filtered) _userCard(context, state, u),
          if (_filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text(state.t('admin.noUsers'), style: Theme.of(context).textTheme.bodyMedium),
              ),
            ),
        ],
      ),
    );
  }

  Widget _userCard(BuildContext context, AppState state, AdminUser u) {
    final theme = Theme.of(context);
    final myId = AppState.instance.userId;
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
                  child: Text(u.displayName, style: theme.textTheme.titleSmall,
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                if (u.verified) Icon(Icons.verified, size: 16, color: Colors.green),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              '${u.phone ?? '—'} · ${u.city ?? '—'} · ${Fmt.timeAgo(u.createdAt)}',
              style: theme.textTheme.bodySmall,
            ),
            if (u.isSeller) Text(state.t('admin.filterSellers'), style: theme.textTheme.bodySmall),
            if (u.suspended)
              Text(
                '${state.t('admin.suspendedUntil')}: ${u.bannedUntil != null ? Fmt.dateTime(DateTime.parse(u.bannedUntil!)) : '—'}'
                '${u.banReason != null ? ' — ${u.banReason}' : ''}',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
              ),
            if (u.shopSlug != null)
              TextButton.icon(
                onPressed: () => Routes.shop(context, u.shopSlug!),
                icon: const Icon(Icons.storefront_outlined, size: 16),
                label: Text(state.t('admin.visitShop')),
              ),
            if (_banTarget?.id == u.id) _banForm(context, state, u) else _userActions(context, state, u, myId),
          ],
        ),
      ),
    );
  }

  Widget _banForm(BuildContext context, AppState state, AdminUser u) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Text(state.t('admin.banDuration'), style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 4),
        Wrap(
          spacing: 6,
          children: [
            for (final o in _options)
              ChoiceChip(
                label: Text(state.t(o.labelKey)),
                selected: _banDuration.key == o.key,
                onSelected: (_) => setState(() => _banDuration = o),
              ),
          ],
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _banReason,
          decoration: InputDecoration(
            hintText: state.t('admin.banReasonPlaceholder'),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _busy ? null : () => setState(() => _banTarget = null),
                child: Text(state.t('common.cancel')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                ),
                onPressed: _busy ? null : _confirmBan,
                child: _busy
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(state.t('admin.ban')),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _userActions(BuildContext context, AppState state, AdminUser u, String? myId) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => _revoke(u),
              child: Text(state.t('admin.revokeSessions')),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: u.suspended
                ? FilledButton(
                    onPressed: () => _lift(u),
                    child: Text(state.t('admin.unban')),
                  )
                : OutlinedButton(
                    onPressed: u.id == myId
                        ? null
                        : () => setState(() {
                              _banTarget = u;
                              _banDuration = _options.first;
                              _banReason.clear();
                            }),
                    child: Text(state.t('admin.ban')),
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Categories ───────────────────────────────────────────────────────────

class CategoriesTab extends StatefulWidget {
  const CategoriesTab({super.key});

  @override
  State<CategoriesTab> createState() => _CategoriesTabState();
}

class _CategoriesTabState extends State<CategoriesTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminCategory>? _cats;
  Map<String, int> _counts = const {};
  bool _loading = true;
  String? _error;
  bool _busy = false;
  bool _deleting = false;

  final _name = TextEditingController();
  String? _parentId;
  String? _icon;
  String? _renamingId;
  final _renameValue = TextEditingController();
  String? _renameIcon;
  AdminCategory? _pendingDelete;

  static const _iconKeys = <(String, IconData)>[
    ('sofa', Icons.weekend_outlined),
    ('bed', Icons.bed_outlined),
    ('briefcase', Icons.business_center_outlined),
    ('utensils', Icons.restaurant_outlined),
    ('trees', Icons.park_outlined),
    ('archive', Icons.archive_outlined),
    ('tv', Icons.tv_outlined),
    ('lamp', Icons.lightbulb_outline),
    ('wardrobe', Icons.checkroom_outlined),
    ('bookshelf', Icons.library_books_outlined),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _renameValue.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait<Object>([
        _repo.getCategories(),
        _repo.getCategoryCounts(),
      ]);
      if (!mounted) return;
      setState(() {
        _cats = results[0] as List<AdminCategory>;
        _counts = (results[1] as Map).cast<String, int>();
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

  Future<void> _add() async {
    final name = _name.text.trim();
    if (name.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await _repo.createCategory(name, parentId: _parentId, icon: _icon);
      _name.clear();
      setState(() {
        _parentId = null;
        _icon = null;
      });
      await _load();
    } catch (e) {
      _snack(context, '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rename(AdminCategory c) async {
    final name = _renameValue.text.trim();
    if (name.isEmpty) return;
    try {
      await _repo.renameCategory(c.id, name, icon: _renameIcon);
      setState(() => _renamingId = null);
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _move(AdminCategory c, String direction) async {
    try {
      await _repo.moveCategory(c.id, direction);
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _delete(AdminCategory c, List<AdminCategory> all) async {
    final children = all.where((x) => x.parentId == c.id).toList();
    final listingCount = [c.id, ...children.map((x) => x.id)]
        .fold<int>(0, (sum, id) => sum + (_counts[id] ?? 0));
    if (children.isEmpty && listingCount == 0) {
      setState(() => _pendingDelete = c);
    } else {
      setState(() => _pendingDelete = c);
    }
  }

  Future<void> _confirmDelete() async {
    final c = _pendingDelete;
    if (c == null) return;
    setState(() => _deleting = true);
    try {
      await _repo.deleteCategory(c.id);
      if (mounted) setState(() => _pendingDelete = null);
      await _load();
    } catch (e) {
      _snack(context, '$e');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  Widget _row(BuildContext context, AdminCategory c, List<AdminCategory> all, int depth) {
    final theme = Theme.of(context);
    final siblings = all.where((x) => x.parentId == c.parentId).toList();
    final idx = siblings.indexWhere((x) => x.id == c.id);
    final count = _counts[c.id] ?? 0;
    final icon = _iconFor(c.icon);
    return Padding(
      padding: EdgeInsets.only(left: depth * 18, bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: _renamingId == c.id
                ? TextField(
                    controller: _renameValue,
                    decoration: const InputDecoration(border: OutlineInputBorder()),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(icon, size: 15, color: theme.colorScheme.primary),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(c.name,
                                style: theme.textTheme.titleSmall,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                          ),
                          if (count > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text('$count',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: theme.colorScheme.onPrimaryContainer,
                                    fontWeight: FontWeight.w700,
                                  )),
                            ),
                        ],
                      ),
                      Text('/${c.slug}', style: theme.textTheme.bodySmall),
                    ],
                  ),
          ),
          if (_renamingId == c.id)
            TextButton(
              onPressed: () => _rename(c),
              child: Text(AppState.instance.t('common.save')),
            )
          else ...[
            IconButton(
              tooltip: AppState.instance.t('admin.moveUp'),
              iconSize: 16,
              icon: const Icon(Icons.keyboard_arrow_up),
              onPressed: idx <= 0 ? null : () => _move(c, 'up'),
            ),
            IconButton(
              tooltip: AppState.instance.t('admin.moveDown'),
              iconSize: 16,
              icon: const Icon(Icons.keyboard_arrow_down),
              onPressed: idx >= siblings.length - 1 ? null : () => _move(c, 'down'),
            ),
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 18),
              onPressed: () => setState(() {
                _renamingId = c.id;
                _renameValue.text = c.name;
                _renameIcon = c.icon;
              }),
            ),
            IconButton(
              icon: Icon(Icons.delete_outline, size: 18,
                  color: theme.colorScheme.error),
              onPressed: () => _delete(c, all),
            ),
          ],
        ],
      ),
    );
  }

  Widget _iconPicker(String? value, ValueChanged<String?> onChanged) {
    final state = AppState.instance;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        ChoiceChip(
          label: Text(state.t('admin.categoryIconNone')),
          selected: value == null,
          onSelected: (_) => onChanged(null),
        ),
        for (final (key, icon) in _iconKeys)
          ChoiceChip(
            avatar: Icon(icon, size: 16),
            label: Text(key),
            selected: value == key,
            onSelected: (_) => onChanged(value == key ? null : key),
          ),
      ],
    );
  }

  static IconData _iconFor(String? key) {
    for (final (k, icon) in _iconKeys) {
      if (k == key) return icon;
    }
    return Icons.inventory_2_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final all = _cats ?? const <AdminCategory>[];
    if (_loading && _cats == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _errorView(context, _error!, _load, state);
    }
    final roots = all.where((c) => c.parentId == null).toList();
    final pending = _pendingDelete;

    return Stack(
      children: [
        RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(state.t('admin.addCategory'), style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _name,
                    decoration: InputDecoration(
                      hintText: state.t('admin.categoryName'),
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(state.t('admin.categoryParent'), style: Theme.of(context).textTheme.labelMedium),
                  Wrap(
                    spacing: 6,
                    children: [
                      ChoiceChip(
                        label: Text(state.t('admin.categoryRoot')),
                        selected: _parentId == null,
                        onSelected: (_) => setState(() => _parentId = null),
                      ),
                      for (final r in roots)
                        ChoiceChip(
                          label: Text(r.name),
                          selected: _parentId == r.id,
                          onSelected: (_) =>
                              setState(() => _parentId = _parentId == r.id ? null : r.id),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(state.t('admin.categoryIcon'), style: Theme.of(context).textTheme.labelMedium),
                  _iconPicker(_icon, (v) => setState(() => _icon = v)),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _busy || _name.text.trim().isEmpty ? null : _add,
                      child: Text(state.t('admin.addCategory')),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_renamingId != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(state.t('admin.categoryIcon'), style: Theme.of(context).textTheme.labelMedium),
                    _iconPicker(_renameIcon, (v) => setState(() => _renameIcon = v)),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 8),
          if (roots.isEmpty)
            Text(state.t('admin.noCategories'), style: Theme.of(context).textTheme.bodyMedium),
          for (final r in roots) ...[
            _row(context, r, all, 0),
            for (final c in all.where((x) => x.parentId == r.id)) _row(context, c, all, 1),
          ],
          const SizedBox(height: 32),
        ],
        ),
      ),
      if (pending != null)
          AlertDialog(
            title: Text(state.t('admin.deleteCategoryTitle')),
            content: Text(_deleteAffectsText(state, pending, all)),
            actions: [
              TextButton(
                onPressed: _deleting ? null : () => setState(() => _pendingDelete = null),
                child: Text(state.t('common.cancel')),
              ),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                ),
                onPressed: _deleting ? null : _confirmDelete,
                child: _deleting
                    ? const SizedBox(
                        width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(state.t('common.delete')),
              ),
            ],
          ),
      ],
    );
  }

  String _deleteAffectsText(AppState state, AdminCategory c, List<AdminCategory> all) {
    final children = all.where((x) => x.parentId == c.id).length;
    final listings = [c.id, ...all.where((x) => x.parentId == c.id).map((x) => x.id)]
        .fold<int>(0, (sum, id) => sum + (_counts[id] ?? 0));
    if (children == 0 && listings == 0) {
      return state.t('admin.deleteCategoryBody');
    }
    return state.t('admin.deleteCategoryAffects', {
      'children': '$children',
      'listings': '$listings',
    });
  }
}

// ── Listings ─────────────────────────────────────────────────────────────

class ListingsTab extends StatefulWidget {
  const ListingsTab({super.key});

  @override
  State<ListingsTab> createState() => _ListingsTabState();
}

class _ListingsTabState extends State<ListingsTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminListing>? _listings;
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
      final listings = await _repo.getListings();
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

  Future<void> _flip(AdminListing l) async {
    try {
      await _repo.toggleFeatured(l.id, !l.featured);
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  Future<void> _delete(AdminListing l) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppState.instance.t('common.delete')),
        content: Text('${AppState.instance.t('admin.deleteListingBody')} "${l.title}"'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(AppState.instance.t('common.cancel')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text(AppState.instance.t('common.delete')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _repo.deleteListing(l.id);
      await _load();
    } catch (e) {
      _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final listings = _listings;
    if (_loading && listings == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _errorView(context, _error!, _load, state);
    }
    if (listings!.isEmpty) {
      return Center(
        child: Text(state.t('admin.noListings'), style: Theme.of(context).textTheme.bodyLarge),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: listings.length,
        itemBuilder: (context, i) {
          final l = listings[i];
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  AppImage(
                    l.coverUrl,
                    width: 52,
                    height: 52,
                    borderRadius: BorderRadius.circular(8),
                    targetWidth: 160,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l.title,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleSmall),
                        Text(
                          '${Fmt.birr(l.price)} · ${l.status} · ${l.city ?? '—'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        Text(
                          '${l.sellerLabel} · ${Fmt.timeAgo(l.createdAt)}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => _flip(l),
                                child: Text(l.featured
                                    ? state.t('admin.unfeature')
                                    : state.t('admin.feature')),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: FilledButton(
                                style: FilledButton.styleFrom(
                                  backgroundColor: Theme.of(context).colorScheme.error,
                                ),
                                onPressed: () => _delete(l),
                                child: Text(state.t('common.delete')),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
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

// ── Stats ────────────────────────────────────────────────────────────────

class StatsTab extends StatefulWidget {
  const StatsTab({super.key, this.onOpenUsers});

  final void Function(String filter)? onOpenUsers;

  @override
  State<StatsTab> createState() => _StatsTabState();
}

class _StatsTabState extends State<StatsTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  AdminStats? _stats;
  List<CategoryCount>? _topCats;
  List<CategoryCount>? _topSearches;
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
        _repo.getStats(),
        _repo.getTopCategories(),
        _repo.getTopSearches(),
        _repo.getTrend(_range),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as AdminStats;
        _topCats = results[1] as List<CategoryCount>;
        _topSearches = results[2] as List<CategoryCount>;
        _trend = results[3] as List<TrendDay>;
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

  void _openUsers(String filter) => widget.onOpenUsers?.call(filter);

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final stats = _stats;
    final topCats = _topCats ?? const <CategoryCount>[];
    final topSearches = _topSearches ?? const <CategoryCount>[];
    if (_loading && stats == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _errorView(context, _error!, _load, state);
    }
    final s = stats!;
    final maxCat = topCats.fold<int>(1, (m, c) => c.count > m ? c.count : m);
    final maxSearch = topSearches.fold<int>(1, (m, c) => c.count > m ? c.count : m);
    final total = s.listings < 1 ? 1 : s.listings;
    final verifiedPct =
        s.sellers > 0 ? ((s.verifiedSellers / s.sellers) * 100).round() : 0;
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

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Hero row — big numbers + verified ratio; cards open the Users tab.
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _statBox(theme, state.t('admin.statListings'), '${s.listings}'),
              _statBox(theme, state.t('admin.statUsers'), '${s.users}',
                  onTap: () => _openUsers('all')),
              _verifiedBox(theme, state, s, verifiedPct),
              _statBox(theme, state.t('admin.thisWeek'), '+${s.newListings7d}'),
            ],
          ),
          const SizedBox(height: 12),

          // Engagement strip — minor totals, compact.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 16,
                runSpacing: 10,
                children: [
                  _engItem(theme, Icons.visibility_outlined, state.t('admin.statViews'), s.totalViews),
                  _engItem(theme, Icons.chat_bubble_outline, state.t('admin.statConversations'), s.conversations),
                  _engItem(theme, Icons.chat_outlined, state.t('admin.statMessages'), s.messages),
                  _engItem(theme, Icons.star_outline, state.t('admin.statReviews'), s.reviews),
                ],
              ),
            ),
          ),

          // Activity trend — daily bars for one metric, 7/14/30d.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(state.t('admin.trendTitle'), style: theme.textTheme.titleMedium),
                      Wrap(
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
                    ],
                  ),
                  const SizedBox(height: 8),
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
                                      style: theme.textTheme.labelSmall
                                          ?.copyWith(fontSize: 8)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),

          // Listing status breakdown.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(state.t('admin.statusBreakdown'), style: theme.textTheme.titleMedium),
                  const SizedBox(height: 10),
                  if (segments.isEmpty)
                    Text(state.t('admin.noListings'), style: theme.textTheme.bodySmall)
                  else ...[
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
                ],
              ),
            ),
          ),

          // Top categories.
          _barCard(theme, state.t('admin.topCategories'), topCats, maxCat),

          // Top searches.
          _barCard(theme, state.t('admin.topSearches'), topSearches, maxSearch),

          // Telegram integration health.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.telegram, size: 16, color: Colors.green),
                      const SizedBox(width: 6),
                      Text(state.t('admin.telegramHealth'), style: theme.textTheme.titleMedium),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 16,
                    runSpacing: 10,
                    children: [
                      _engItem(theme, Icons.send_outlined, state.t('admin.tgSends'), s.telegramSends7d),
                      _engItem(theme, Icons.check_circle_outline, state.t('admin.tgSuccess'), tgSuccess),
                      _engItem(theme, Icons.cancel_outlined, state.t('admin.tgFailures'), s.telegramFailures7d),
                      _engItem(theme, Icons.people_outline, state.t('admin.tgLinked'), s.telegramLinkedUsers),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(
                      '${state.t('admin.tgChannelPosts')}: ${s.telegramChannelPosts}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(
                      '${state.t('admin.tgProcessed')}: ${s.telegramProcessedUpdates}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(
                      '${state.t('admin.tgBlocked')}: ${s.telegramBlockedUsers}',
                      style: theme.textTheme.bodySmall,
                    ),
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
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _statBox(ThemeData theme, String label, String value, {VoidCallback? onTap}) {
    final box = Container(
      width: (MediaQuery.sizeOf(context).width - 42) / 2,
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
      onTap: () => _openUsers('sellers'),
      child: Container(
        width: (MediaQuery.sizeOf(context).width - 42) / 2,
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

  Widget _engItem(ThemeData theme, IconData icon, String label, Object value) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: theme.colorScheme.primary),
        const SizedBox(width: 4),
        Text('$value', style: theme.textTheme.bodyMedium),
        const SizedBox(width: 4),
        Text(label, style: theme.textTheme.bodySmall),
      ],
    );
  }

  Widget _barCard(ThemeData theme, String title, List<CategoryCount> items, int max) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: theme.textTheme.titleMedium),
            const SizedBox(height: 10),
            if (items.isEmpty)
              Text(AppState.instance.t('admin.noListings'), style: theme.textTheme.bodySmall)
            else
              for (final c in items)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(c.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium),
                          ),
                          Text('${c.count}', style: theme.textTheme.labelMedium),
                        ],
                      ),
                      const SizedBox(height: 3),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: c.count / max,
                          minHeight: 7,
                        ),
                      ),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

/// Verification document viewer: mints a short-lived signed URL on open and
/// shows the image full-screen. Demo/empty paths render a friendly hint.
class AdminDocViewerPage extends StatefulWidget {
  const AdminDocViewerPage({super.key, required this.filePath, this.title});

  final String filePath;
  final String? title;

  @override
  State<AdminDocViewerPage> createState() => _AdminDocViewerPageState();
}

class _AdminDocViewerPageState extends State<AdminDocViewerPage> {
  AdminRepository get _repo => sl<AdminRepository>();
  String? _url;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.filePath.isEmpty || widget.filePath.startsWith('demo/')) return;
    try {
      final url = await _repo.signedDocumentUrl(widget.filePath);
      if (mounted) setState(() => _url = url);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? '')),
      body: Center(
        child: widget.filePath.isEmpty || widget.filePath.startsWith('demo/')
            ? Text(AppState.instance.t('admin.documentMissing'))
            : _url == null
                ? const CircularProgressIndicator()
                : InteractiveViewer(
                    child: Image.network(_url!, fit: BoxFit.contain),
                  ),
      ),
    );
  }
}