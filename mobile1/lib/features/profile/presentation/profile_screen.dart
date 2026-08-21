import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/network/env.dart';
import '../../../core/utils/format.dart';
import '../../../core/navigation/routes.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/widgets/app_image.dart';
import '../../../core/widgets/draggable_pin_map.dart';
import '../../../core/network/supabase_api.dart';
import '../domain/profile_repository.dart';
import '../../admin/presentation/admin_screen.dart';
import 'dashboard_screen.dart';

/// Monolithic profile screen mirroring `mobile1/src/app/(tabs)/profile.tsx`.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with AppStateMixin {
  ProfileRepository get _repo => sl<ProfileRepository>();

  bool _busy = false;
  BuyerPreferences _prefs = const BuyerPreferences();
  List<VerificationDocument> _docs = [];
  List<Category> _cats = const [];
  final _prefMinCtrl = TextEditingController();
  final _prefMaxCtrl = TextEditingController();
  bool _telegramBusy = false;

  static const _cities = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];
  static const _docTypes = ["National ID", "Business License", "TIN Certificate", "Other"];
  String _docType = _docTypes.first;

  // Controllers for Account
  final _fullNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  
  // Controllers for Shop
  final _shopNameCtrl = TextEditingController();
  final _shopSlugCtrl = TextEditingController();
  final _shopDescCtrl = TextEditingController();
  final _shopAddrCtrl = TextEditingController();
  final _shopRegCtrl = TextEditingController();
  final _whatsappCtrl = TextEditingController();
  final _telegramCtrl = TextEditingController();
  LatLng? _shopLoc;

  // Telegram Verification
  final _otpCodeCtrl = TextEditingController();
  bool _otpInputVisible = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _fullNameCtrl.dispose();
    _phoneCtrl.dispose();
    _cityCtrl.dispose();
    _bioCtrl.dispose();
    _shopNameCtrl.dispose();
    _shopSlugCtrl.dispose();
    _shopDescCtrl.dispose();
    _shopAddrCtrl.dispose();
    _shopRegCtrl.dispose();
    _whatsappCtrl.dispose();
    _telegramCtrl.dispose();
    _otpCodeCtrl.dispose();
    _prefMinCtrl.dispose();
    _prefMaxCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final state = AppState.instance;
    final uid = state.userId;
    if (uid == null) return;
    try {
      final results = await Future.wait<Object>([
        _repo.getBuyerPreferences(uid),
        if (state.isSeller) _repo.getVerificationDocs(uid) else Future.value(const <VerificationDocument>[]),
      ]);
      final cats = await SupabaseApi.fetchCategories();
      if (!mounted) return;
      setState(() {
        _prefs = results[0] as BuyerPreferences;
        _docs = results[1] as List<VerificationDocument>;
        _cats = cats;
      });
      _prefMinCtrl.text = _prefs.priceMin?.toStringAsFixed(0) ?? '';
      _prefMaxCtrl.text = _prefs.priceMax?.toStringAsFixed(0) ?? '';
      _syncFields(state.profile);
    } catch (_) {}
  }

  void _syncFields(Profile? p) {
    if (p == null) return;
    if (_fullNameCtrl.text.isEmpty) _fullNameCtrl.text = p.fullName;
    if (_phoneCtrl.text.isEmpty) _phoneCtrl.text = p.phone ?? '';
    if (_cityCtrl.text.isEmpty) _cityCtrl.text = p.city ?? '';
    if (_bioCtrl.text.isEmpty) _bioCtrl.text = p.bio ?? '';
    if (_shopNameCtrl.text.isEmpty) _shopNameCtrl.text = p.shopName ?? '';
    if (_shopSlugCtrl.text.isEmpty) _shopSlugCtrl.text = p.shopSlug ?? '';
    if (_shopDescCtrl.text.isEmpty) _shopDescCtrl.text = p.shopDescription ?? '';
    if (_shopAddrCtrl.text.isEmpty) _shopAddrCtrl.text = p.shopAddress ?? '';
    if (_shopRegCtrl.text.isEmpty) _shopRegCtrl.text = p.registrationNumber ?? '';
    if (_whatsappCtrl.text.isEmpty) _whatsappCtrl.text = p.whatsapp ?? '';
    if (_telegramCtrl.text.isEmpty) _telegramCtrl.text = p.telegram ?? '';
    if (_shopLoc == null && p.latitude != null && p.longitude != null) {
      _shopLoc = LatLng(p.latitude!, p.longitude!);
    }
  }

  Future<void> _updateProfile(Map<String, dynamic> patch) async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    setState(() => _busy = true);
    try {
      await _repo.updateProfile(uid, patch);
      await AppState.instance.refreshProfile();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppState.instance.t('profile.updated'))));
      }
    } catch (e) {
      if (mounted) {
        final msg = e is PhoneTakenError
            ? AppState.instance.t('setup.phoneTaken')
            : '$e';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickAndUpload(bool isAvatar) async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery, maxWidth: 800, maxHeight: 800);
    if (file == null) return;
    setState(() => _busy = true);
    try {
      final url = await _repo.uploadProfileImage(uid, file);
      await _repo.updateProfile(uid, {isAvatar ? 'avatar_url' : 'shop_logo_url': url});
      await AppState.instance.refreshProfile();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    setState(() => _busy = true);
    await AppState.instance.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);
    final p = state.profile;
    _syncFields(p);

    return Scaffold(
      appBar: AppBar(
        title: Text(state.t('profile.title')),
        actions: [
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
        ],
      ),
      body: p == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildHeader(p, theme, state),
                const SizedBox(height: 16),
                _buildQuickActions(p, theme, state),
                const SizedBox(height: 16),
                _buildSetupCta(p, theme, state),
                const SizedBox(height: 16),
                _buildAccountCard(p, theme, state),
                const SizedBox(height: 16),
                _buildShopCard(p, theme, state),
                const SizedBox(height: 16),
                _buildPhoneVerifyCard(p, theme, state),
                const SizedBox(height: 16),
                if (p.isSeller) ...[
                  _buildVerifyBadgeCard(p, theme, state),
                  const SizedBox(height: 16),
                ],
                _buildPrefsCard(theme, state),
                const SizedBox(height: 16),
                _buildAdminCard(p, theme, state),
                const SizedBox(height: 32),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _signOut,
                  icon: const Icon(Icons.logout),
                  label: Text(state.t('auth.signOut')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.error,
                    side: BorderSide(color: theme.colorScheme.error.withValues(alpha: 0.4)),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
    );
  }

  Widget _buildHeader(Profile p, ThemeData theme, AppState state) {
    return Row(
      children: [
        GestureDetector(
          onTap: () => _pickAndUpload(true),
          child: Stack(
            children: [
              ClipOval(
                child: AppImage(
                  p.avatarUrl ?? p.shopLogoUrl,
                  width: 72,
                  height: 72,
                  icon: Icons.person_outline,
                ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(color: theme.colorScheme.primary, shape: BoxShape.circle),
                  child: const Icon(Icons.camera_alt, size: 12, color: Colors.white),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      p.fullName,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ),
                  if (p.verified) ...[
                    const SizedBox(width: 6),
                    Icon(Icons.verified, size: 18, color: theme.colorScheme.primary),
                  ],
                ],
              ),
              Text(state.user?.email ?? '', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildQuickActions(Profile p, ThemeData theme, AppState state) {
    return Row(
      children: [
        if (p.isSeller)
          Expanded(
            child: _QuickBtn(
              icon: Icons.dashboard_outlined,
              label: state.t('profile.dashboard'),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DashboardScreen())),
            ),
          ),
        if (p.isSeller) const SizedBox(width: 8),
        Expanded(
          child: _QuickBtn(
            icon: Icons.favorite_border,
            label: state.t('tabs.favorites'),
            onTap: () => Routes.favorites(context),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _QuickBtn(
            icon: Icons.shield_outlined,
            label: state.t('safetyTitle'),
            onTap: () => Routes.safety(context),
          ),
        ),
      ],
    );
  }

  Widget _buildSetupCta(Profile p, ThemeData theme, AppState state) {
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () => Routes.setupProfile(context),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.rocket_launch_outlined, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      state.t('setup.title'),
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      state.t('setup.subtitle'),
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: theme.colorScheme.outline),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAccountCard(Profile p, ThemeData theme, AppState state) {
    final summary = [
      _fullNameCtrl.text.trim(),
      _cityCtrl.text.trim(),
    ].where((s) => s.isNotEmpty).join(' · ');
    return _CollapsibleCard(
      title: state.t('profile.accountSetup'),
      icon: Icons.person_outline,
      summary: summary.isEmpty ? state.t('profile.sectionSummaryNone') : summary,
      defaultOpen: true,
      children: [
        TextField(
          controller: _fullNameCtrl,
          decoration: InputDecoration(labelText: state.t('profile.fullName')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phoneCtrl,
          decoration: InputDecoration(labelText: state.t('profile.phone')),
          keyboardType: TextInputType.phone,
        ),
        const SizedBox(height: 12),
        Text(state.t('profile.city'), style: theme.textTheme.labelMedium),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _cities.map((c) {
            final isSelected = _cityCtrl.text == c;
            return ChoiceChip(
              label: Text(c),
              selected: isSelected,
              onSelected: (selected) {
                setState(() {
                  _cityCtrl.text = selected ? c : '';
                });
              },
            );
          }).toList(),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _bioCtrl,
          maxLines: 3,
          decoration: InputDecoration(labelText: state.t('profile.bio')),
        ),
        const SizedBox(height: 16),
        FilledButton.tonal(
          onPressed: _busy
              ? null
              : () => _updateProfile({
                    'full_name': _fullNameCtrl.text.trim(),
                    'phone': _phoneCtrl.text.trim(),
                    'city': _cityCtrl.text.trim(),
                    'bio': _bioCtrl.text.trim(),
                  }),
          child: Text(state.t('profile.saveChanges')),
        ),
      ],
    );
  }

  Widget _buildShopCard(Profile p, ThemeData theme, AppState state) {
    if (!p.isSeller) {
      return _Card(
        title: state.t('profile.becomeSeller'),
        icon: Icons.storefront_outlined,
        children: [
          Text(state.t('profile.becomeSellerDesc')),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy
                ? null
                : () => _updateProfile({'is_seller': true}),
            child: Text(state.t('profile.becomeSeller')),
          ),
        ],
      );
    }

    final shopName = _shopNameCtrl.text.trim();
    return _CollapsibleCard(
      title: state.t('profile.sellerShop'),
      icon: Icons.storefront_outlined,
      summary: shopName.isEmpty ? state.t('profile.noShopYet') : shopName,
      children: [
        Row(
          children: [
            GestureDetector(
              onTap: () => _pickAndUpload(false),
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: p.shopLogoUrl != null
                      ? AppImage(p.shopLogoUrl!)
                      : Icon(Icons.add_photo_alternate_outlined, color: theme.colorScheme.outline),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                state.t('profile.shopLogoHint'),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _shopNameCtrl,
          decoration: InputDecoration(labelText: state.t('profile.shopName')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _shopSlugCtrl,
          decoration: InputDecoration(labelText: state.t('profile.shopSlug')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _shopDescCtrl,
          decoration: InputDecoration(labelText: state.t('profile.shopDesc')),
          maxLines: 3,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _shopAddrCtrl,
          decoration: InputDecoration(labelText: state.t('profile.address')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _shopRegCtrl,
          decoration: InputDecoration(labelText: state.t('profile.regNumber')),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _whatsappCtrl,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: state.t('profile.whatsapp')),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                controller: _telegramCtrl,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(labelText: state.t('profile.telegram')),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text(state.t('profile.location'), style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        DraggablePinMap(
          value: _shopLoc,
          onChange: (loc) => setState(() => _shopLoc = loc),
        ),
        const SizedBox(height: 16),
        FilledButton.tonal(
          onPressed: _busy
              ? null
              : () => _updateProfile({
                    'shop_name': _shopNameCtrl.text.trim(),
                    'shop_slug': _shopSlugCtrl.text.trim(),
                    'shop_description': _shopDescCtrl.text.trim(),
                    'shop_address': _shopAddrCtrl.text.trim(),
                    'registration_number': _shopRegCtrl.text.trim(),
                    'whatsapp': _whatsappCtrl.text.trim(),
                    'telegram': _telegramCtrl.text.trim(),
                    if (_shopLoc != null) 'latitude': _shopLoc!.latitude,
                    if (_shopLoc != null) 'longitude': _shopLoc!.longitude,
                  }),
          child: Text(state.t('profile.saveChanges')),
        ),
      ],
    );
  }

  Widget _buildPhoneVerifyCard(Profile p, ThemeData theme, AppState state) {
    final verified = p.phoneVerifiedAt != null;
    return _CollapsibleCard(
      title: state.t('profile.phoneVerification'),
      icon: verified ? Icons.check_circle_outline : Icons.phone_android,
      summary: verified
          ? state.t('setup.otpVerified')
          : state.t('profile.notVerified'),
      children: [
        if (verified)
          Row(
            children: [
              Icon(Icons.check_circle, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(child: Text(state.t('profile.phoneVerified'), style: theme.textTheme.bodyMedium)),
            ],
          )
        else ...[
          Text(
            state.t('profile.verifyPhoneDesc'),
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          if (!_otpInputVisible)
            FilledButton.icon(
              onPressed: _busy
                  ? null
                  : () async {
                      if (p.phone == null || p.phone!.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Please save a phone number first.')));
                        return;
                      }
                      final norm = Fmt.normalizePhone(p.phone!);
                      if (norm == null) {
                        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.t('profile.invalidPhone'))));
                        return;
                      }
                      setState(() => _busy = true);
                      final res = await SupabaseApi.mintPhoneVerifyToken(norm);
                      setState(() => _busy = false);
                      if (res.url != null) {
                        await launchUrl(Uri.parse(res.url!), mode: LaunchMode.externalApplication);
                        setState(() => _otpInputVisible = true);
                      } else {
                        final msg = switch (res.error) {
                          'not_configured' => state.t('profile.telegramNotConfigured'),
                          'taken' => state.t('profile.tokenTaken'),
                          _ => state.t('profile.tokenError'),
                        };
                        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
                      }
                    },
              icon: const Icon(Icons.telegram),
              label: Text(state.t('profile.startVerify')),
            )
          else ...[
            TextField(
              controller: _otpCodeCtrl,
              decoration: InputDecoration(labelText: state.t('profile.otpCode')),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () async {
                      setState(() => _busy = true);
                      final res = await SupabaseApi.verifyPhoneOtp(p.phone!, _otpCodeCtrl.text.trim());
                      if (res.ok) {
                        await AppState.instance.refreshProfile();
                      } else {
                        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.error ?? 'Error')));
                      }
                      if (mounted) setState(() => _busy = false);
                    },
              child: Text(state.t('profile.verifyCode')),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildVerifyBadgeCard(Profile p, ThemeData theme, AppState state) {
    final pending = _docs.any((d) => d.status == 'pending');
    final rejected = _docs.any((d) => d.status == 'rejected');
    final summary = p.verified
        ? state.t('profile.docStatusApproved')
        : pending
            ? state.t('profile.docStatusPending')
            : rejected
                ? state.t('profile.docStatusRejected')
                : state.t('profile.sectionSummaryNone');

    return _CollapsibleCard(
      title: state.t('profile.sellerBadge'),
      icon: p.verified ? Icons.verified : Icons.badge_outlined,
      summary: summary,
      children: [
        if (p.verified)
          Row(
            children: [
              Icon(Icons.verified, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(child: Text(state.t('profile.verifiedSeller'))),
            ],
          )
        else ...[
          Text(
            state.t('profile.verifyDesc'),
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          if (pending)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: theme.colorScheme.tertiaryContainer, borderRadius: BorderRadius.circular(8)),
              child: Text(
                state.t('profile.docStatusPending'),
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onTertiaryContainer),
              ),
            )
          else ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _docTypes.map((dt) {
                return ChoiceChip(
                  label: Text(dt),
                  selected: _docType == dt,
                  onSelected: (selected) {
                    if (selected) setState(() => _docType = dt);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () async {
                final picker = ImagePicker();
                final file = await picker.pickImage(source: ImageSource.gallery);
                if (file == null) return;
                setState(() => _busy = true);
                try {
                  final url = await SupabaseApi.uploadListingImage(p.id, file); // Reuse storage or create 'verification-docs' storage bucket. Actually, web app uses 'verification-documents' or similar. We'll use profile repo.
                  // Map the pretty name to the enum expected by the backend
                  final docTypeEnum = switch (_docType) {
                    'National ID' => 'national_id',
                    'Business License' => 'business_license',
                    'TIN Certificate' => 'tin_certificate',
                    _ => 'other'
                  };
                  await _repo.submitVerificationDocument(p.id, docTypeEnum, url);
                  await _load();
                } catch (e) {
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                } finally {
                  if (mounted) setState(() => _busy = false);
                }
              },
              icon: const Icon(Icons.upload_file),
              label: Text(state.t('profile.uploadDoc')),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildPrefsCard(ThemeData theme, AppState state) {
    final telegramConnected = AppState.instance.profile?.telegramChatId != null;
    final summary =
        '${_prefs.categoryIds.length} ${state.t('profile.categories')} · ${telegramConnected ? state.t('profile.telegramConnected') : state.t('profile.alertsOff')}';
    return _CollapsibleCard(
      title: state.t('profile.preferences'),
      icon: Icons.settings_outlined,
      summary: summary,
      children: [
        if (Env.telegramConfigured)
          _telegramBlock(theme, state),
        Text(state.t('profile.prefCategories'), style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in _cats.where((c) => c.parentId == null))
              ChoiceChip(
                label: Text(state.lang == 'am' ? (c.nameAm ?? c.name) : c.name),
                selected: _prefs.categoryIds.contains(c.id),
                onSelected: (_) => setState(() {
                  final ids = [..._prefs.categoryIds];
                  if (ids.contains(c.id)) {
                    ids.remove(c.id);
                  } else {
                    ids.add(c.id);
                  }
                  _prefs = _prefs.copyWith(categoryIds: ids);
                }),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text(state.t('profile.prefCities'), style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in _cities)
              ChoiceChip(
                label: Text(c),
                selected: _prefs.preferredCities.contains(c),
                onSelected: (_) => setState(() {
                  final cities = [..._prefs.preferredCities];
                  if (cities.contains(c)) {
                    cities.remove(c);
                  } else {
                    cities.add(c);
                  }
                  _prefs = _prefs.copyWith(preferredCities: cities);
                }),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text(state.t('profile.priceRange'), style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _prefMinCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: state.t('profile.minPrice')),
              ),
            ),
            const SizedBox(width: 8),
            Text(state.t('profile.to')),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _prefMaxCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: state.t('profile.maxPrice')),
              ),
            ),
          ],
        ),
        const Divider(height: 24),
        SwitchListTile(
          title: Text(state.t('profile.telegramAlerts')),
          subtitle: Text(state.t('profile.alertsDesc')),
          value: _prefs.telegramAlertsEnabled,
          onChanged: (v) => setState(() {
            _prefs = _prefs.copyWith(telegramAlertsEnabled: v);
          }),
          contentPadding: EdgeInsets.zero,
        ),
        const Divider(),
        SwitchListTile(
          title: Text(state.t('nav.language')),
          subtitle: Text(state.lang == 'am' ? 'አማርኛ' : 'English'),
          value: state.lang == 'am',
          onChanged: (v) async {
            await state.setLang(v ? 'am' : 'en');
            await state.saveLangPreference();
          },
          contentPadding: EdgeInsets.zero,
        ),
        const SizedBox(height: 12),
        FilledButton.tonal(
          onPressed: _busy ? null : _savePrefs,
          child: Text(state.t('profile.saveChanges')),
        ),
      ],
    );
  }

  Widget _telegramBlock(ThemeData theme, AppState state) {
    final connected = AppState.instance.profile?.telegramChatId != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (connected) ...[
          Row(
            children: [
              Icon(Icons.check_circle, color: theme.colorScheme.primary, size: 18),
              const SizedBox(width: 8),
              Expanded(child: Text(state.t('profile.telegramConnected'))),
            ],
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _telegramBusy ? null : _disconnectTelegram,
            child: Text(state.t('profile.telegramDisconnect')),
          ),
        ] else ...[
          Text(
            state.t('profile.telegramAlertsHint'),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _telegramBusy ? null : _connectTelegram,
            icon: const Icon(Icons.telegram, size: 18),
            label: Text(state.t('profile.telegramConnect')),
          ),
        ],
        const Divider(height: 24),
      ],
    );
  }

  Future<void> _connectTelegram() async {
    final state = AppState.instance;
    setState(() => _telegramBusy = true);
    try {
      final url = await SupabaseApi.telegramConnectUrl();
      if (url == null) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(state.t('profile.telegramLinkError'))));
        }
        return;
      }
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(state.t('profile.telegramLinkError'))));
      }
    } finally {
      if (mounted) setState(() => _telegramBusy = false);
    }
  }

  Future<void> _disconnectTelegram() async {
    setState(() => _telegramBusy = true);
    try {
      await SupabaseApi.disconnectTelegram();
      await AppState.instance.refreshProfile();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(AppState.instance.t('common.error'))));
      }
    } finally {
      if (mounted) setState(() => _telegramBusy = false);
    }
  }

  Future<void> _savePrefs() async {
    final state = AppState.instance;
    final uid = state.userId;
    if (uid == null) return;
    setState(() => _busy = true);
    try {
      await SupabaseApi.saveBuyerPreferences(uid, _prefs.copyWith(
        priceMin: _prefMinCtrl.text.trim().isEmpty ? null : double.tryParse(_prefMinCtrl.text),
        priceMax: _prefMaxCtrl.text.trim().isEmpty ? null : double.tryParse(_prefMaxCtrl.text),
      ));
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(state.t('profile.prefsSaved'))));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(state.t('common.error'))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _buildAdminCard(Profile p, ThemeData theme, AppState state) {
    if (!state.isAdmin) return const SizedBox.shrink();
    return _Card(
      title: state.t('profile.adminTitle'),
      icon: Icons.admin_panel_settings,
      children: [
        FilledButton.tonal(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const AdminScreen()),
          ),
          child: Text(state.t('profile.adminTitle')),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.icon, required this.children});
  
  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, color: theme.colorScheme.primary, size: 22),
              const SizedBox(width: 8),
              Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

class _CollapsibleCard extends StatefulWidget {
  const _CollapsibleCard({
    required this.title,
    required this.icon,
    this.summary,
    this.defaultOpen = false,
    required this.children,
  });

  final String title;
  final IconData icon;
  final String? summary;
  final bool defaultOpen;
  final List<Widget> children;

  @override
  State<_CollapsibleCard> createState() => _CollapsibleCardState();
}

class _CollapsibleCardState extends State<_CollapsibleCard> {
  late bool _open = widget.defaultOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Icon(widget.icon, color: theme.colorScheme.primary, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title,
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        if (widget.summary != null && widget.summary!.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            widget.summary!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Icon(
                    _open ? Icons.expand_less : Icons.expand_more,
                    color: theme.colorScheme.outline,
                  ),
                ],
              ),
            ),
          ),
          if (_open) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: widget.children,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _QuickBtn extends StatelessWidget {
  const _QuickBtn({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(icon, color: theme.colorScheme.primary),
            const SizedBox(height: 4),
            Text(label, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}
