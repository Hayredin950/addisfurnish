import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../domain/admin_repository.dart';
import 'admin_widgets.dart';

/// Settings (web /admin Settings parity, spec SS22-23): system health probes,
/// the roles & permissions matrix, super-admin access management
/// (role grant/revoke confirmed by an emailed 6-digit code), and marketplace
/// rule toggles backed by `app_settings`.
class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key, this.onOpenUsers});

  /// Jump to the read-only users directory.
  final VoidCallback? onOpenUsers;

  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();

  SystemHealth? _health;
  Map<String, Object>? _settings;
  bool _loading = true;
  String? _error;
  bool _isSuper = false;

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
      final app = AppState.instance;
      final scopes = await _repo.getScopes(app.userId ?? '');
      final results = await Future.wait<Object>([
        _repo.getSystemHealth(),
        _repo.getSettings(),
      ]);
      if (!mounted) return;
      setState(() {
        _health = results[0] as SystemHealth;
        _settings = results[1] as Map<String, Object>;
        _isSuper = scopes.contains(AdminScopes.settings);
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

  bool _boolSetting(String key) => _settings?[key] == true;

  Future<void> _toggleSetting(String key) async {
    final next = !_boolSetting(key);
    try {
      await _repo.setSetting(key, next);
      if (mounted) setState(() => _settings = {...?_settings, key: next});
    } catch (e) {
      if (mounted) adminSnack(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return adminErrorView(context, _error!, _load);

    final state = AppState.instance;
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _healthCard(context, state, theme),
        _rolesMatrixCard(context, state),
        if (_isSuper) _manageAccessCard(context, state),
        _marketplaceCard(context, state),
      ],
    );
  }

  // ── System health (spec SS23) ───────────────────────────────────────────

  Widget _healthCard(BuildContext context, AppState state, ThemeData theme) {
    final h = _health;
    Widget row(String label, bool? ok) {
      final color = ok == null
          ? theme.colorScheme.outline
          : ok
              ? Colors.green
              : theme.colorScheme.error;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Icon(
              ok == null
                  ? Icons.help_outline
                  : ok
                      ? Icons.check_circle_outline
                      : Icons.cancel_outlined,
              size: 16,
              color: color,
            ),
            const SizedBox(width: 8),
            Text(label, style: theme.textTheme.bodyMedium),
          ],
        ),
      );
    }

    return SectionCard(
      title: state.t('admin.systemHealth'),
      icon: Icons.monitor_heart_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          row(state.t('admin.healthDb'), h?.dbOk),
          row(state.t('admin.healthStorage'), h?.storageOk),
          const SizedBox(height: 6),
          Text(
            '${state.t('admin.tgFailures')}: ${h?.tgErrorsToday ?? 0}',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  // ── Roles & permissions matrix (spec SS22) ──────────────────────────────

  Widget _rolesMatrixCard(BuildContext context, AppState state) {
    final rows = <(String, String)>[
      ('admin.roleSuperAdmin', 'admin.permAll'),
      ('admin.roleModerator', 'admin.permModerator'),
      ('admin.roleVerification', 'admin.permVerification'),
      ('admin.roleCategoryManager', 'admin.permCategories'),
      ('admin.roleAnalytics', 'admin.permAnalytics'),
    ];
    return SectionCard(
      title: state.t('admin.rolesPermissions'),
      icon: Icons.shield_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (role, scope) in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 2,
                    child: Text(state.t(role), style: Theme.of(context).textTheme.bodyMedium),
                  ),
                  Expanded(
                    flex: 3,
                    child: Text(
                      state.t(scope),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Text(
            state.t(_isSuper ? 'admin.superAdminYou' : 'admin.rolesNote'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (!_isSuper && widget.onOpenUsers != null)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(top: 10),
                child: OutlinedButton.icon(
                  onPressed: widget.onOpenUsers,
                  icon: const Icon(Icons.chevron_right, size: 18),
                  label: Text(state.t('admin.browseUsersCta')),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ── Manage access — super-admin only ────────────────────────────────────

  Widget _manageAccessCard(BuildContext context, AppState state) {
    return SectionCard(
      title: state.t('admin.manageAccess'),
      icon: Icons.admin_panel_settings_outlined,
      child: _RoleManager(onChanged: _load),
    );
  }

  // ── Marketplace rules ───────────────────────────────────────────────────

  Widget _marketplaceCard(BuildContext context, AppState state) {
    final builtIn = <(String, String)>[
      ('moderation.auto_flag_views', 'admin.setAutoFlag'),
      ('notifications.email_enabled', 'admin.setEmailNotifs'),
      ('notifications.telegram_enabled', 'admin.setTgNotifs'),
    ];
    return SectionCard(
      title: state.t('admin.marketplaceSettings'),
      icon: Icons.tune_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (key, label) in builtIn)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(state.t(label)),
              value: _boolSetting(key),
              onChanged: (_) => _toggleSetting(key),
            ),
          const SizedBox(height: 4),
          Text(state.t('admin.settingsNote'), style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

/// Search + pick a user and grant/revoke admin roles. Confirmation is a
/// 6-digit code emailed to the acting super admin (web UserAccessManager).
class _RoleManager extends StatefulWidget {
  const _RoleManager({required this.onChanged});

  final VoidCallback onChanged;

  @override
  State<_RoleManager> createState() => _RoleManagerState();
}

class _RoleManagerState extends State<_RoleManager> with AppStateMixin {
  AdminRepository get _repo => sl<AdminRepository>();

  static const _adminRoles = <String>[
    'moderator',
    'verification',
    'category_manager',
    'analytics',
    'admin',
  ];

  List<AdminUser>? _users;
  bool _loadingUsers = true;
  String _search = '';
  AdminUser? _selected;
  bool _busy = false;

  // Role-change flow.
  bool _dialogOpen = false;
  bool _codeSent = false;
  String? _pendingRole;
  String? _pendingAction; // 'grant' | 'revoke'
  final _codeController = TextEditingController();

  String _roleLabel(String role) => AppState.instance.t(switch (role) {
        'admin' => 'admin.roleAdmin',
        'moderator' => 'admin.roleModerator',
        'verification' => 'admin.roleVerification',
        'category_manager' => 'admin.roleCategoryManager',
        _ => 'admin.roleAnalytics',
      });

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _loadUsers() async {
    setState(() => _loadingUsers = true);
    try {
      final users = await _repo.getUsers();
      if (mounted) {
        setState(() {
          _users = users;
          _loadingUsers = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loadingUsers = false);
    }
  }

  List<AdminUser> get _pickable {
    final term = _search.trim().toLowerCase();
    final users = _users ?? const [];
    final filtered = term.isEmpty
        ? users
        : users
            .where((u) =>
                (u.displayName.toLowerCase().contains(term) ||
                 (u.city ?? '').toLowerCase().contains(term) ||
                 (u.phone ?? '').toLowerCase().contains(term)))
            .toList();
    return filtered.take(25).toList(growable: false);
  }

  String? _ownedRole(AdminUser u) {
    for (final r in _adminRoles) {
      if (u.roles.contains(r)) return r;
    }
    return null;
  }

  Future<void> _requestChange() async {
    if (_selected == null || _pendingRole == null || _pendingAction == null) return;
    final app = AppState.instance;
    setState(() => _busy = true);
    final err = await _repo.requestRoleChange(
      targetUserId: _selected!.id,
      role: _pendingRole!,
      action: _pendingAction!,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (err != null) {
      adminSnack(
        context,
        app.t(switch (err) {
          'super_admin' => 'admin.superAdminProtected',
          'self' => 'admin.roleChangeSelf',
          'no_email' => 'admin.roleChangeNoEmail',
          'already_role' => 'admin.roleChangeAlreadyRole',
          _ => 'admin.roleChangeFailed',
        }),
      );
      return;
    }
    setState(() => _codeSent = true);
    adminSnack(context, app.t('admin.roleChangeEmailSent'));
  }

  Future<void> _confirmChange() async {
    final code = _codeController.text.trim();
    if (code.length != 6) return;
    final app = AppState.instance;
    setState(() => _busy = true);
    final err = await _repo.confirmRoleChange(code);
    if (!mounted) return;
    setState(() => _busy = false);
    if (err != null) {
      adminSnack(
        context,
        app.t(switch (err) {
          'expired' => 'admin.roleChangeExpired',
          'invalid' => 'admin.roleChangeInvalidCode',
          'super_admin' => 'admin.superAdminProtected',
          'self' => 'admin.roleChangeSelf',
          _ => 'admin.roleChangeFailed',
        }),
      );
      return;
    }
    adminSnack(
      context,
      app.t(_pendingAction == 'grant' ? 'admin.roleChangeSuccess' : 'admin.roleChangeRemoved'),
    );
    _closeDialog();
    widget.onChanged();
  }

  void _closeDialog() {
    setState(() {
      _dialogOpen = false;
      _codeSent = false;
      _pendingRole = null;
      _pendingAction = null;
      _codeController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final theme = Theme.of(context);
    final selected = _selected;

    if (_loadingUsers) return const Center(child: CircularProgressIndicator());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          onChanged: (v) => setState(() {
            _search = v;
            _selected = null;
          }),
          decoration: InputDecoration(
            hintText: app.t('admin.searchUsers'),
            prefixIcon: const Icon(Icons.search, size: 18),
            isDense: true,
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        if (selected == null)
          _pickable.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(app.t('admin.noUsers'), style: theme.textTheme.bodyMedium),
                )
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 260),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _pickable.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final u = _pickable[i];
                      final role = _ownedRole(u);
                      return ListTile(
                        dense: true,
                        leading: CircleAvatar(
                          radius: 16,
                          backgroundImage: u.avatarUrl != null || u.shopLogoUrl != null
                              ? NetworkImage(u.shopLogoUrl ?? u.avatarUrl!)
                              : null,
                          child: u.avatarUrl == null && u.shopLogoUrl == null
                              ? Text(u.displayName.isEmpty
                                    ? '?'
                                    : u.displayName[0].toUpperCase())
                              : null,
                        ),
                        title: Text(u.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                          u.isSuperAdmin
                              ? app.t('admin.roleSuperAdmin')
                              : role != null
                                  ? _roleLabel(role)
                                  : u.isSeller
                                      ? app.t('admin.roleSeller')
                                      : app.t('admin.roleBuyer'),
                        ),
                        onTap: () => setState(() {
                          _search = '';
                          _selected = u;
                        }),
                      );
                    },
                  ),
                )
          else
            _selectedCard(context, app, theme, selected),

        // Role change dialog (email-code confirmed).
        if (_dialogOpen) _roleDialog(context, app),
      ],
    );
  }

  Widget _selectedCard(BuildContext context, AppState app, ThemeData theme, AdminUser u) {
    final role = _ownedRole(u);
    final me = AppState.instance.userId;
    final protected = u.isSuperAdmin || u.id == me;
    final suspended = u.suspended;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundImage:
                      u.avatarUrl != null || u.shopLogoUrl != null
                          ? NetworkImage(u.shopLogoUrl ?? u.avatarUrl!)
                          : null,
                  child: u.avatarUrl == null && u.shopLogoUrl == null
                      ? Text(u.displayName.isEmpty ? '?' : u.displayName[0].toUpperCase())
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(u.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall),
                      Text(
                        [
                          if (u.isSuperAdmin) app.t('admin.roleSuperAdmin'),
                          for (final r in u.roles) if (r != 'user') _roleLabel(r),
                        ].join(' · '),
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (suspended)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '${app.t('admin.suspendedUntil')}: ${u.bannedUntil}',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                ),
              ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (!protected)
                  OutlinedButton.icon(
                    onPressed: () => _openRoleDialog(
                      action: role == null ? 'grant' : 'revoke',
                      role: role ?? 'moderator',
                    ),
                    icon: const Icon(Icons.mail_outline, size: 18),
                    label: Text(
                      role == null ? app.t('admin.grantRole') : app.t('admin.revokeRole'),
                    ),
                  ),
                if (role == null && !protected)
                  ..._adminRoles.map((r) => ActionChip(
                        avatar: const Icon(Icons.add, size: 16),
                        label: Text(_roleLabel(r)),
                        onPressed: () => _openRoleDialog(action: 'grant', role: r),
                      )),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _openRoleDialog({required String action, required String role}) {
    setState(() {
      _pendingAction = action;
      _pendingRole = role;
      _codeSent = false;
      _dialogOpen = true;
    });
  }

  Widget _roleDialog(BuildContext context, AppState app) {
    final granting = _pendingAction == 'grant';
    final roleLabel = _pendingRole == null ? '' : _roleLabel(_pendingRole!);
    return AlertDialog(
      title: Text(app.t(_codeSent ? 'admin.roleChangeEnterCode' : (granting ? 'admin.grantTitle' : 'admin.revokeTitle'))),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              app.t(_codeSent ? 'admin.roleChangeCodeHint' : (granting ? 'admin.grantBody' : 'admin.revokeBody')) +
                  (roleLabel.isEmpty ? '' : ' ($roleLabel)'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (!_codeSent)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: RoleDropdown(
                  roles: _adminRoles,
                  value: _pendingRole ?? 'moderator',
                  labelOf: _roleLabel,
                  onChanged: (r) => setState(() => _pendingRole = r),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: TextField(
                  controller: _codeController,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.bold),
                  decoration: const InputDecoration(hintText: '000000', counterText: ''),
                  onChanged: (v) => setState(() {}),
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : _closeDialog,
          child: Text(app.t('admin.cancel')),
        ),
        FilledButton(
          onPressed: _busy
              ? null
              : _codeSent
                  ? (_codeController.text.trim().length == 6 ? _confirmChange : null)
                  : _requestChange,
          child: Text(app.t(_codeSent ? 'admin.roleChangeConfirmCode' : 'admin.roleChangeSendCode')),
        ),
      ],
    );
  }
}

/// Bottom-sheet style role picker (top-level fallback widget can't be private
/// constraints — kept as a tiny stateless helper).
class RoleDropdown extends StatelessWidget {
  const RoleDropdown({
    super.key,
    required this.roles,
    required this.value,
    required this.labelOf,
    required this.onChanged,
  });

  final List<String> roles;
  final String value;
  final String Function(String) labelOf;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: roles.contains(value) ? value : roles.first,
      isExpanded: true,
      decoration: const InputDecoration(border: OutlineInputBorder()),
      items: [for (final r in roles) DropdownMenuItem(value: r, child: Text(labelOf(r)))],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}