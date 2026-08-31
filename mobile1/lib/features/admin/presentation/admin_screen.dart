import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/utils/format.dart';
import '../../../core/widgets/app_image.dart';
import '../domain/admin_repository.dart';
import 'admin_analytics_tab.dart';
import 'admin_attributes_panel.dart';
import 'admin_audit_tab.dart';
import 'admin_dashboard_tab.dart';
import 'admin_moderation_tab.dart';
import 'admin_settings_tab.dart';
import 'admin_telegram_tab.dart';

enum AdminTab {
  dashboard,
  moderation,
  verification,
  users,
  categories,
  listings,
  featured,
  audit,
  analytics,
  telegram,
  settings,
}

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

  /// Fallback scopes when the server re-check times out: the cached admin
  /// status is authoritative, so grant the full admin set (no `settings`,
  /// which only super admins derive).
  static const _fallbackScopes = <String>{
    AdminScopes.users,
    AdminScopes.listings,
    AdminScopes.moderation,
    AdminScopes.verification,
    AdminScopes.categories,
    AdminScopes.analytics,
  };

  static const _tabMeta = <AdminTab, (IconData, String, String?)>{
    AdminTab.dashboard: (Icons.space_dashboard_outlined, 'admin.tabDashboard', null),
    AdminTab.moderation: (Icons.gavel_outlined, 'admin.tabModeration', AdminScopes.moderation),
    AdminTab.verification:
        (Icons.verified_outlined, 'admin.tabVerification', AdminScopes.verification),
    AdminTab.users: (Icons.people_outline, 'admin.tabUsers', AdminScopes.users),
    AdminTab.categories: (Icons.grid_view_outlined, 'admin.tabCategories', AdminScopes.categories),
    AdminTab.listings: (Icons.list_alt_outlined, 'admin.tabListings', AdminScopes.listings),
    AdminTab.featured: (Icons.star_outline, 'admin.tabFeatured', AdminScopes.users),
    AdminTab.audit: (Icons.history_outlined, 'admin.tabAudit', AdminScopes.users),
    AdminTab.analytics: (Icons.insights_outlined, 'admin.tabAnalytics', AdminScopes.analytics),
    AdminTab.telegram: (Icons.send_outlined, 'admin.tabTelegram', AdminScopes.users),
    AdminTab.settings: (Icons.settings_outlined, 'admin.tabSettings', AdminScopes.settings),
  };

  AdminTab _tab = AdminTab.dashboard;
  String _usersFilter = 'all';
  String _moderationQueue = 'reports';
  bool _admin = false;
  Set<String> _scopes = const {};

  bool _tabAllowed(AdminTab tab) {
    final scope = _tabMeta[tab]!.$3;
    return scope == null || _scopes.contains(scope);
  }

  AdminTab get _activeTab => _tabAllowed(_tab) ? _tab : AdminTab.dashboard;

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
      // Scopes are derived from the same role rows `isAdmin` reads, so a
      // single fetch answers both questions (web `adminScopesForRoles`).
      final scopes = await _repo
          .getScopes(uid)
          .timeout(const Duration(seconds: 10), onTimeout: () => _fallbackScopes);
      if (mounted) {
        setState(() {
          _scopes = scopes;
          _admin = scopes.isNotEmpty;
        });
      }
    } catch (_) {
      // Keep the cached status on failure — never hang on a spinner.
      if (_admin) setState(() => _scopes = _fallbackScopes);
    }
  }

  void _openUsers(String filter) {
    setState(() {
      _usersFilter = filter;
      _tab = AdminTab.users;
    });
  }

  void _openModeration(String queue) {
    setState(() {
      _moderationQueue = queue;
      _tab = AdminTab.moderation;
    });
  }

  void _openVerification() => setState(() => _tab = AdminTab.verification);

  void _openSettings() => setState(() => _tab = AdminTab.settings);

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
                  child: switch (_activeTab) {
                    AdminTab.dashboard => DashboardTab(
                        onOpenUsers: _openUsers,
                        onOpenModeration: _openModeration,
                        onOpenVerification: _openVerification,
                      ),
                    AdminTab.moderation => ModerationTab(
                        initialQueue: _moderationQueue,
                        key: ValueKey(_moderationQueue),
                      ),
                    AdminTab.verification => const VerificationTab(),
                    AdminTab.users => UsersTab(
                      initialFilter: _usersFilter,
                      canManageAccess: _tabAllowed(AdminTab.settings),
                      onOpenSettings: _openSettings,
                    ),
                    AdminTab.categories => const CategoriesTab(),
                    AdminTab.listings => const ListingsTab(),
                    AdminTab.featured => const FeaturedTab(),
                    AdminTab.audit => const AuditLogTab(),
                    AdminTab.analytics => const AnalyticsTab(),
                    AdminTab.telegram => const TelegramTab(),
                    AdminTab.settings => SettingsTab(onOpenUsers: () => _openUsers('all')),
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
    final allowed =
        _tabMeta.entries.where((e) => _tabAllowed(e.key)).map((e) => e.key).toList();
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          for (final tab in allowed)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                selected: _activeTab == tab,
                onSelected: (_) => setState(() => _tab = tab),
                avatar: Icon(
                  _tabMeta[tab]!.$1,
                  size: 16,
                  color: _activeTab == tab
                      ? Theme.of(context).colorScheme.onSecondaryContainer
                      : Theme.of(context).colorScheme.outline,
                ),
                label: Text(state.t(_tabMeta[tab]!.$2)),
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
  String _status = 'open';

  static const _statusChips = [
    ('open', 'admin.statusOpen'),
    ('investigating', 'admin.statusInvestigating'),
    ('escalated', 'admin.statusEscalated'),
    ('resolved', 'admin.resolved'),
    ('dismissed', 'admin.statusDismissed'),
    ('all', 'admin.statusAll'),
  ];

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
      final reports = await _repo.getReports(status: _status);
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
    final theme = Theme.of(context);
    final loading = _loading && reports == null;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final (value, key) in _statusChips) ...[
                  ChoiceChip(
                    label: Text(state.t(key)),
                    selected: _status == value,
                    onSelected: (_) {
                      if (_status == value) return;
                      setState(() => _status = value);
                      _load();
                    },
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _errorView(context, _error!, _load, state)
                  : reports!.isEmpty
                      ? Center(
                          child: Text(
                            state.t('admin.noReports'),
                            style: theme.textTheme.bodyLarge,
                          ),
                        )
                      : RefreshIndicator(
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
                                      Text(r.displayTitle,
                                          style: theme.textTheme.titleMedium),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${state.t('admin.reportReason')}: ${r.reason} · ${Fmt.timeAgo(r.createdAt)}',
                                        style: theme.textTheme.bodySmall,
                                      ),
                                      if (r.details != null) ...[
                                        const SizedBox(height: 4),
                                        Text(r.details!,
                                            style: theme.textTheme.bodySmall),
                                      ],
                                      if (r.resolution != null) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          '${state.t('admin.resolution')}: ${r.resolution}',
                                          style: theme.textTheme.bodySmall,
                                        ),
                                      ],
                                      const SizedBox(height: 10),
                                      Row(
                                        children: [
                                          Expanded(
                                            child: OutlinedButton(
                                              onPressed: () =>
                                                  _act(r, 'dismissed'),
                                              child:
                                                  Text(state.t('admin.dismiss')),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: FilledButton(
                                              onPressed: () =>
                                                  _act(r, 'resolved'),
                                              child:
                                                  Text(state.t('admin.resolved')),
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
                        ),
        ),
      ],
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
  const UsersTab({
    super.key,
    this.initialFilter = 'all',
    this.canManageAccess = false,
    this.onOpenSettings,
  });

  final String initialFilter;

  /// Whether the signed-in admin can reach Settings → Manage access.
  final bool canManageAccess;

  final VoidCallback? onOpenSettings;

  @override
  State<UsersTab> createState() => _UsersTabState();
}

class _UsersTabState extends State<UsersTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminUser>? _users;
  bool _loading = true;
  String? _error;
  String _filter = 'all';
  String _search = '';

  @override
  void initState() {
    super.initState();
    _filter = widget.initialFilter;
    _load();
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

  String _roleLabel(AppState state, String role) => state.t(switch (role) {
        'admin' => 'admin.roleAdmin',
        'moderator' => 'admin.roleModerator',
        'verification' => 'admin.roleVerification',
        'category_manager' => 'admin.roleCategoryManager',
        'analytics' => 'admin.roleAnalytics',
        _ => 'admin.roleAdmin',
      });

  Widget _rolePill(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }

  Widget _userCard(BuildContext context, AppState state, AdminUser u) {
    final theme = Theme.of(context);
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
            if (u.isSuperAdmin || u.roles.any((r) => r != 'user'))
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (u.isSuperAdmin)
                      _rolePill(state.t('admin.roleSuperAdmin'), Theme.of(context).colorScheme.primary),
                    for (final r in u.roles)
                      if (r != 'user')
                        _rolePill(
                          _roleLabel(state, r),
                          Theme.of(context).colorScheme.primary,
                        ),
                  ],
                ),
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
            if (widget.canManageAccess) _accessCta(context, state),
          ],
        ),
      ),
    );
  }

  /// The Users tab is a read-only directory — account actions (roles, email,
  /// sessions, suspension) live in Settings → Manage access.
  Widget _accessCta(BuildContext context, AppState state) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: widget.onOpenSettings,
          icon: const Icon(Icons.admin_panel_settings_outlined, size: 18),
          label: Text(state.t('admin.manageAccess')),
        ),
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
          const Divider(),
          const SizedBox(height: 8),
          const AdminAttributesPanel(),
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


// ── Featured listings ────────────────────────────────────────────────────

/// Featured placement management with deadlines (web Featured tab, spec SS20):
/// rows split into active vs expired placements, with +7d / +30d / permanent
/// scheduling, a renew action for expired rows, and immediate expiry.
class FeaturedTab extends StatefulWidget {
  const FeaturedTab({super.key});

  @override
  State<FeaturedTab> createState() => _FeaturedTabState();
}

class _FeaturedTabState extends State<FeaturedTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();
  List<AdminListing>? _rows;
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
      final rows = await _repo.getFeaturedListings();
      if (!mounted) return;
      setState(() {
        _rows = rows;
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

  Future<void> _setUntil(AdminListing l, int? days) async {
    try {
      await _repo.setFeaturedUntil(
        l.id,
        days == null ? null : DateTime.now().add(Duration(days: days)),
      );
      await _load();
    } catch (e) {
      if (mounted) _snack(context, '$e');
    }
  }

  Future<void> _expire(AdminListing l) async {
    try {
      await _repo.expireFeatured(l.id);
      await _load();
    } catch (e) {
      if (mounted) _snack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final rows = _rows;
    final theme = Theme.of(context);
    if (_loading && rows == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _errorView(context, _error!, _load, state);
    }
    final active = rows!.where((l) => l.featuredActive).toList();
    final expired = rows.where((l) => !l.featuredActive).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text(state.t('admin.noFeatured'), style: theme.textTheme.bodyMedium),
              ),
            ),
          if (active.isNotEmpty) ...[
            _sectionTitle(context, state, 'admin.featuredActive'),
            for (final l in active) _featuredCard(context, state, theme, l),
          ],
          if (expired.isNotEmpty) ...[
            const SizedBox(height: 16),
            _sectionTitle(context, state, 'admin.featuredExpired'),
            for (final l in expired) _featuredCard(context, state, theme, l),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, AppState state, String key) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
      child: Text(
        state.t(key),
        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }

  Widget _featuredCard(
      BuildContext context, AppState state, ThemeData theme, AdminListing l) {
    final expired = !l.featuredActive;
    final deadline =
        l.featuredUntil != null
            ? Fmt.dateTime(l.featuredUntil!)
            : state.t('admin.featuredPermanent');
    final deadlineLabel = expired
        ? '${state.t('admin.featuredExpired')} ${Fmt.timeAgo(l.featuredUntil!)}'
        : (l.featuredUntil != null
            ? state.t('admin.featuredUntil', {'date': deadline})
            : deadline);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.title,
                maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(
              '${Fmt.birr(l.price)} · ${l.status} · ${l.sellerLabel}',
              style: theme.textTheme.bodySmall,
            ),
            Text(deadlineLabel, style: theme.textTheme.bodySmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: !expired
                  ? [
                      _chip(context, state, '+7d', () => _setUntil(l, 7)),
                      _chip(context, state, '+30d', () => _setUntil(l, 30)),
                      _chip(context, state, '∞', () => _setUntil(l, null)),
                      OutlinedButton(
                        onPressed: () => _expire(l),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: theme.colorScheme.error,
                        ),
                        child: Text(state.t('admin.featureExpire')),
                      ),
                    ]
                  : [
                      _chip(context, state, state.t('admin.featureRenew'),
                          () => _setUntil(l, 7)),
                    ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(BuildContext context, AppState state, String label, VoidCallback onTap) {
    return OutlinedButton(onPressed: onTap, child: Text(label));
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