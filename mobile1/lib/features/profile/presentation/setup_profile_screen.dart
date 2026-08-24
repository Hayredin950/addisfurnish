import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/network/supabase_api.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/utils/format.dart';
import '../../../core/widgets/draggable_pin_map.dart';
import '../domain/profile_repository.dart';

/// Four-step profile setup wizard, mirroring `mobile/src/app/setup-profile.tsx`:
/// 1. Basics (name, city, phone)
/// 2. Shop creator (optional)
/// 3. Alert preferences
/// 4. Review + phone verification + verified badge
class SetupProfileScreen extends StatefulWidget {
  const SetupProfileScreen({super.key});

  @override
  State<SetupProfileScreen> createState() => _SetupProfileScreenState();
}

class _SetupProfileScreenState extends State<SetupProfileScreen> with AppStateMixin {
  static const _cities = ["Addis Ababa", "Dire Dawa", "Hawassa", "Bahir Dar", "Mekelle", "Adama", "Gondar"];
  static const _docTypes = ["National ID", "Business License", "TIN Certificate", "Other"];
  static const _steps = 4;

  ProfileRepository get _repo => sl<ProfileRepository>();

  int _step = 1;
  bool _saving = false;
  bool _loaded = false;

  // Step 1 — basics
  final _fullNameCtrl = TextEditingController();
  String _city = '';
  final _phoneCtrl = TextEditingController();

  // Step 2 — shop (optional)
  bool _selling = false;
  final _shopNameCtrl = TextEditingController();
  final _shopDescCtrl = TextEditingController();
  final _shopAddrCtrl = TextEditingController();
  final _whatsappCtrl = TextEditingController();
  final _telegramCtrl = TextEditingController();
  LatLng? _shopLoc;

  // Step 3 — alert preferences
  BuyerPreferences _prefs = const BuyerPreferences();
  final _prefMinCtrl = TextEditingController();
  final _prefMaxCtrl = TextEditingController();
  List<Category> _categories = const [];

  // Step 4 — phone verification + verified badge
  final _otpPhoneCtrl = TextEditingController();
  final _otpCodeCtrl = TextEditingController();
  bool _otpSent = false;
  bool _otpBusy = false;
  bool _docBusy = false;
  String _docType = _docTypes.first;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _fullNameCtrl.dispose();
    _phoneCtrl.dispose();
    _shopNameCtrl.dispose();
    _shopDescCtrl.dispose();
    _shopAddrCtrl.dispose();
    _whatsappCtrl.dispose();
    _telegramCtrl.dispose();
    _prefMinCtrl.dispose();
    _prefMaxCtrl.dispose();
    _otpPhoneCtrl.dispose();
    _otpCodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final state = AppState.instance;
    final uid = state.userId;
    final p = state.profile;
    if (uid == null || p == null) return;
    try {
      final results = await Future.wait<Object>([
        _repo.getBuyerPreferences(uid),
        SupabaseApi.fetchCategories(),
      ]);
      if (!mounted) return;
      final prefs = results[0] as BuyerPreferences;
      final cats = results[1] as List<Category>;
      setState(() {
        _prefs = prefs;
        _categories = cats;
        if (_fullNameCtrl.text.isEmpty) _fullNameCtrl.text = p.fullName;
        if (_phoneCtrl.text.isEmpty) _phoneCtrl.text = p.phone ?? '';
        _city = p.city ?? '';
        _selling = p.isSeller;
        if (_shopNameCtrl.text.isEmpty) _shopNameCtrl.text = p.shopName ?? '';
        if (_shopDescCtrl.text.isEmpty) _shopDescCtrl.text = p.shopDescription ?? '';
        if (_shopAddrCtrl.text.isEmpty) _shopAddrCtrl.text = p.shopAddress ?? '';
        if (_whatsappCtrl.text.isEmpty) _whatsappCtrl.text = p.whatsapp ?? '';
        if (_telegramCtrl.text.isEmpty) _telegramCtrl.text = p.telegram ?? '';
        if (p.latitude != null && p.longitude != null) {
          _shopLoc = LatLng(p.latitude!, p.longitude!);
        }
        if (_otpPhoneCtrl.text.isEmpty) _otpPhoneCtrl.text = p.phone ?? '';
        if (_prefMinCtrl.text.isEmpty && prefs.priceMin != null) {
          _prefMinCtrl.text = prefs.priceMin!.toStringAsFixed(0);
        }
        if (_prefMaxCtrl.text.isEmpty && prefs.priceMax != null) {
          _prefMaxCtrl.text = prefs.priceMax!.toStringAsFixed(0);
        }
        _loaded = true;
      });
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  Future<void> _saveBasics() async {
    final state = AppState.instance;
    final uid = state.userId;
    if (uid == null) return;
    if (_fullNameCtrl.text.trim().isEmpty) {
      _toast(state.t('setup.nameRequired'), error: true);
      return;
    }
    if (_city.isEmpty) {
      _toast(state.t('setup.cityRequired'), error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      await _repo.updateProfile(uid, {
        'full_name': _fullNameCtrl.text.trim(),
        'city': _city,
        'phone': _phoneCtrl.text.trim(),
      });
      await AppState.instance.refreshProfile();
      if (mounted) setState(() {
        _step = 2;
        _saving = false;
      });
    } catch (e) {
      _toast(e is PhoneTakenError ? state.t('setup.phoneTaken') : '$e', error: true);
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _saveShop() async {
    final state = AppState.instance;
    final uid = state.userId;
    if (uid == null) return;
    if (_selling && _shopNameCtrl.text.trim().isEmpty) {
      _toast(state.t('setup.shopNameRequired'), error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      if (_selling) {
        final name = _shopNameCtrl.text.trim();
        final profile = state.profile;
        final slug = (profile?.shopName?.trim() == name && (profile?.shopSlug?.isNotEmpty ?? false))
            ? profile!.shopSlug!
            : await SupabaseApi.uniqueShopSlug(name);
        await _repo.updateProfile(uid, {
          'shop_name': name,
          'shop_slug': slug,
          'shop_description': _shopDescCtrl.text.trim(),
          'shop_address': _shopAddrCtrl.text.trim(),
          'whatsapp': _whatsappCtrl.text.trim(),
          'telegram': _telegramCtrl.text.trim().replaceFirst(RegExp(r'^@'), ''),
          if (_shopLoc != null) 'latitude': _shopLoc!.latitude,
          if (_shopLoc != null) 'longitude': _shopLoc!.longitude,
          'is_seller': true,
        });
      }
      await AppState.instance.refreshProfile();
      if (mounted) setState(() {
        _step = 3;
        _saving = false;
      });
    } catch (e) {
      _toast('$e', error: true);
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _savePrefs() async {
    final uid = AppState.instance.userId;
    if (uid == null) return;
    setState(() => _saving = true);
    try {
      await _repo.saveBuyerPreferences(uid, BuyerPreferences(
        categoryIds: _prefs.categoryIds,
        priceMin: _prefMinCtrl.text.isEmpty ? null : double.tryParse(_prefMinCtrl.text),
        priceMax: _prefMaxCtrl.text.isEmpty ? null : double.tryParse(_prefMaxCtrl.text),
        preferredCities: _prefs.preferredCities,
        telegramAlertsEnabled: _prefs.telegramAlertsEnabled,
      ));
      if (mounted) setState(() {
        _step = 4;
        _saving = false;
      });
    } catch (e) {
      _toast('$e', error: true);
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _startVerify() async {
    final state = AppState.instance;
    final norm = Fmt.normalizePhone(_otpPhoneCtrl.text.trim());
    if (norm == null) {
      _toast(state.t('setup.invalidPhone'), error: true);
      return;
    }
    setState(() => _otpBusy = true);
    final res = await SupabaseApi.mintPhoneVerifyToken(norm);
    if (!mounted) return;
    setState(() => _otpBusy = false);
    if (res.url != null) {
      await launchUrl(Uri.parse(res.url!), mode: LaunchMode.externalApplication);
      if (mounted) setState(() => _otpSent = true);
    } else {
      final msg = switch (res.error) {
        'taken' => state.t('setup.phoneTaken'),
        'invalid_phone' => state.t('setup.invalidPhone'),
        'not_configured' => state.t('profile.telegramNotConfigured'),
        _ => state.t('common.error'),
      };
      _toast(msg, error: true);
    }
  }

  Future<void> _confirmVerify() async {
    final state = AppState.instance;
    setState(() => _otpBusy = true);
    final res = await SupabaseApi.verifyPhoneOtp(_otpPhoneCtrl.text.trim(), _otpCodeCtrl.text.trim());
    if (!mounted) return;
    setState(() => _otpBusy = false);
    if (res.ok) {
      _toast(state.t('setup.otpVerified'));
      setState(() {
        _otpSent = false;
        _otpCodeCtrl.clear();
      });
      await AppState.instance.refreshProfile();
    } else {
      final msg = switch (res.error) {
        'wrong_code' => state.t('setup.wrongCode'),
        'expired' => state.t('setup.expired'),
        'too_many' => state.t('setup.tooMany'),
        'no_code' => state.t('setup.noCodeYet'),
        _ => state.t('common.error'),
      };
      _toast(msg, error: true);
    }
  }

  Future<void> _submitDoc() async {
    final p = AppState.instance.profile;
    if (p == null) return;
    setState(() => _docBusy = true);
    try {
      final picker = ImagePicker();
      // 2000px keeps small print on an ID legible; the original off a phone
      // camera is 4000px and several megabytes for no extra readability.
      final file = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 2000,
        maxHeight: 2000,
        imageQuality: 88,
      );
      if (file == null) return;
      final url = await SupabaseApi.uploadVerificationDocument(p.id, file);
      final docTypeEnum = switch (_docType) {
        'National ID' => 'national_id',
        'Business License' => 'business_license',
        'TIN Certificate' => 'tin_certificate',
        _ => 'other',
      };
      await _repo.submitVerificationDocument(p.id, docTypeEnum, url);
      if (mounted) _toast(AppState.instance.t('setup.docSubmitted'));
    } catch (e) {
      if (mounted) _toast('$e', error: true);
    } finally {
      if (mounted) setState(() => _docBusy = false);
    }
  }

  void _togglePrefCategory(String id) {
    setState(() {
      final current = _prefs.categoryIds;
      _prefs = BuyerPreferences(
        categoryIds: current.contains(id)
            ? current.where((c) => c != id).toList()
            : [...current, id],
        priceMin: _prefs.priceMin,
        priceMax: _prefs.priceMax,
        preferredCities: _prefs.preferredCities,
        telegramAlertsEnabled: _prefs.telegramAlertsEnabled,
      );
    });
  }

  void _togglePrefCity(String c) {
    setState(() {
      final current = _prefs.preferredCities;
      _prefs = BuyerPreferences(
        categoryIds: _prefs.categoryIds,
        priceMin: _prefs.priceMin,
        priceMax: _prefs.priceMax,
        preferredCities: current.contains(c)
            ? current.where((x) => x != c).toList()
            : [...current, c],
        telegramAlertsEnabled: _prefs.telegramAlertsEnabled,
      );
    });
  }

  void _toast(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: error ? null : Theme.of(context).colorScheme.primary),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final theme = Theme.of(context);

    if (!_loaded) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(title: Text(state.t('setup.title'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              state.t('setup.subtitle'),
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                for (var i = 1; i <= _steps; i++)
                  Expanded(
                    child: Container(
                      height: 5,
                      margin: const EdgeInsets.only(right: 6),
                      decoration: BoxDecoration(
                        color: i < _step ? theme.colorScheme.primary : theme.colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                const SizedBox(width: 8),
                Text(
                  '${state.t('setup.step')} $_step/$_steps',
                  style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ),
            const SizedBox(height: 20),
            if (_step == 1) _buildBasics(state, theme),
            if (_step == 2) _buildShop(state, theme),
            if (_step == 3) _buildPrefs(state, theme),
            if (_step == 4) _buildReview(state, theme),
          ],
        ),
      ),
    );
  }

  Widget _buildBasics(AppState state, ThemeData theme) {
    return _Card(
      title: state.t('setup.basics'),
      hint: state.t('setup.basicsHint'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _fullNameCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(labelText: state.t('auth.fullName')),
          ),
          const SizedBox(height: 16),
          Text(state.t('profile.city'), style: theme.textTheme.labelMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _cities.map((c) {
              final selected = _city == c;
              return ChoiceChip(
                label: Text(c),
                selected: selected,
                onSelected: (s) => setState(() => _city = s ? c : ''),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(labelText: state.t('setup.phone')),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _saving ? null : _saveBasics,
            child: _saving ? const _Spinner() : Text(state.t('setup.continue')),
          ),
        ],
      ),
    );
  }

  Widget _buildShop(AppState state, ThemeData theme) {
    return _Card(
      title: state.t('setup.shop'),
      hint: state.t('setup.shopHint'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SwitchListTile(
            title: Text(state.t('setup.selling')),
            value: _selling,
            onChanged: (v) => setState(() => _selling = v),
            contentPadding: EdgeInsets.zero,
          ),
          if (!_selling)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(state.t('setup.skipShopHint'), style: theme.textTheme.bodySmall),
            )
          else ...[
            const SizedBox(height: 8),
            TextField(
              controller: _shopNameCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: state.t('profile.shopName')),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _shopDescCtrl,
              maxLines: 3,
              decoration: InputDecoration(labelText: state.t('profile.shopDesc')),
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
                    decoration: InputDecoration(labelText: state.t('profile.telegram')),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _shopAddrCtrl,
              decoration: InputDecoration(labelText: state.t('profile.address')),
            ),
            const SizedBox(height: 16),
            Text(state.t('setup.location'), style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            DraggablePinMap(
              value: _shopLoc,
              onChange: (loc) => setState(() => _shopLoc = loc),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _saving ? null : _saveShop,
            child: _saving ? const _Spinner() : Text(state.t('setup.continue')),
          ),
        ],
      ),
    );
  }

  Widget _buildPrefs(AppState state, ThemeData theme) {
    final topCats = _categories.where((c) => c.parentId == null).toList();
    return _Card(
      title: state.t('setup.prefs'),
      hint: state.t('setup.prefsHint'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(state.t('profile.prefCategories'), style: theme.textTheme.labelMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: topCats.map((c) {
              final active = _prefs.categoryIds.contains(c.id);
              return ChoiceChip(
                label: Text(state.lang == 'am' ? (c.nameAm ?? c.name) : c.name),
                selected: active,
                onSelected: (_) => _togglePrefCategory(c.id),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          Text(state.t('profile.prefCities'), style: theme.textTheme.labelMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _cities.map((c) {
              final active = _prefs.preferredCities.contains(c);
              return ChoiceChip(
                label: Text(c),
                selected: active,
                onSelected: (_) => _togglePrefCity(c),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _prefMinCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: state.t('profile.minPrice')),
                ),
              ),
              const SizedBox(width: 12),
              Text(state.t('profile.to')),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _prefMaxCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: state.t('profile.maxPrice')),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            title: Text(state.t('profile.telegramAlerts')),
            subtitle: Text(state.t('profile.alertsDesc')),
            value: _prefs.telegramAlertsEnabled,
            onChanged: (v) => setState(() {
              _prefs = BuyerPreferences(
                categoryIds: _prefs.categoryIds,
                priceMin: _prefs.priceMin,
                priceMax: _prefs.priceMax,
                preferredCities: _prefs.preferredCities,
                telegramAlertsEnabled: v,
              );
            }),
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _saving ? null : _savePrefs,
            child: _saving ? const _Spinner() : Text(state.t('setup.continue')),
          ),
        ],
      ),
    );
  }

  Widget _buildReview(AppState state, ThemeData theme) {
    final p = AppState.instance.profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Card(
          title: state.t('setup.review'),
          hint: state.t('setup.reviewHint'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SummaryRow(icon: Icons.person_outline, label: state.t('auth.fullName'), value: _fullNameCtrl.text.trim().isEmpty ? '—' : _fullNameCtrl.text.trim()),
              _SummaryRow(icon: Icons.location_on_outlined, label: state.t('profile.city'), value: _city.isEmpty ? '—' : _city),
              _SummaryRow(icon: Icons.call_outlined, label: state.t('setup.phone'), value: _phoneCtrl.text.trim().isEmpty ? '—' : _phoneCtrl.text.trim()),
              if (_selling) ...[
                _SummaryRow(icon: Icons.storefront_outlined, label: state.t('profile.shopName'), value: _shopNameCtrl.text.trim().isEmpty ? '—' : _shopNameCtrl.text.trim()),
                if (_shopLoc != null)
                  _SummaryRow(
                    icon: Icons.map_outlined,
                    label: state.t('setup.location'),
                    value: '${_shopLoc!.latitude.toStringAsFixed(4)}, ${_shopLoc!.longitude.toStringAsFixed(4)}',
                  ),
              ],
              _SummaryRow(
                icon: Icons.notifications_outlined,
                label: state.t('setup.alertPrefs'),
                value: _prefs.categoryIds.isNotEmpty || _prefs.preferredCities.isNotEmpty
                    ? '${_prefs.categoryIds.length} ${state.t('setup.catShort')} · ${_prefs.preferredCities.length} ${state.t('setup.cityShort')}'
                    : state.t('setup.noPrefs'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.check_circle, color: theme.colorScheme.primary),
                  const SizedBox(width: 8),
                  Text(state.t('setup.done'), style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(state.t('setup.finish')),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _buildPhoneVerify(state, theme, p),
        if (_selling) ...[
          const SizedBox(height: 16),
          _Card(
            title: state.t('setup.verifyBadge'),
            hint: state.t('setup.docHint'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _docTypes.map((dt) {
                    return ChoiceChip(
                      label: Text(dt),
                      selected: _docType == dt,
                      onSelected: (s) {
                        if (s) setState(() => _docType = dt);
                      },
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _docBusy ? null : _submitDoc,
                  icon: _docBusy ? const _Spinner() : const Icon(Icons.upload_file),
                  label: Text(state.t('profile.uploadDoc')),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildPhoneVerify(AppState state, ThemeData theme, Profile? p) {
    final verified = p?.phoneVerifiedAt != null;
    return _Card(
      title: state.t('setup.verifyPhone'),
      hint: verified ? null : state.t('setup.otpHint'),
      child: verified
          ? Row(
              children: [
                Icon(Icons.check_circle, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(state.t('setup.otpVerified')),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _otpPhoneCtrl,
                  keyboardType: TextInputType.phone,
                  enabled: !_otpSent,
                  decoration: InputDecoration(labelText: state.t('setup.phone')),
                ),
                if (_otpSent) ...[
                  const SizedBox(height: 12),
                  Text(state.t('setup.otpCodeSent'), style: theme.textTheme.bodySmall),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _otpCodeCtrl,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: state.t('setup.otpPlaceholder')),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _otpBusy || _otpCodeCtrl.text.trim().length < 4 ? null : _confirmVerify,
                    child: _otpBusy ? const _Spinner() : Text(state.t('setup.otpVerify')),
                  ),
                ] else ...[
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _otpBusy || _otpPhoneCtrl.text.trim().length < 9 ? null : _startVerify,
                    icon: _otpBusy ? const _Spinner() : const Icon(Icons.telegram),
                    label: Text(state.t('setup.otpVerifyViaTelegram')),
                  ),
                ],
              ],
            ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.outline),
          const SizedBox(width: 8),
          SizedBox(
            width: 96,
            child: Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
          ),
          Expanded(
            child: Text(value, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child, this.hint});

  final String title;
  final String? hint;
  final Widget child;

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
          Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          if (hint != null) ...[
            const SizedBox(height: 6),
            Text(hint!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline)),
          ],
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2));
  }
}