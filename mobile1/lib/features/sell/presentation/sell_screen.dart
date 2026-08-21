import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:video_player/video_player.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/network/supabase_api.dart';
import '../../../core/state/app_state.dart';
import '../../../core/state/app_state_mixin.dart';
import '../../../core/widgets/calendar_picker.dart';
import '../../../core/widgets/draggable_pin_map.dart';
import '../../../core/widgets/section_header.dart';
import '../../listings/domain/listings_repository.dart';
import '../../profile/domain/profile_repository.dart';
import '../domain/sell_repository.dart';

/// A listing photo shown in the form. In edit mode existing photos keep their
/// stored URL and are not re-uploaded; `[_SellImage.file]` is only set for
/// newly picked images.
class _SellImage {
  const _SellImage({this.file, this.url, required this.isExisting});

  final XFile? file;
  final String? url;
  final bool isExisting;
}

/// Where a listing photo should come from: freshly taken with the camera or
/// picked from the device gallery.
enum _ImageSource { camera, gallery }

/// Post-a-listing flow. If the user has not set up a shop yet, prompts them
/// to fill shop name and slug inline to start selling. When [editListingId] is
/// given the screen loads the existing listing and updates it instead of
/// creating a new one.
class SellScreen extends StatefulWidget {
  const SellScreen({super.key, this.profile, this.editListingId});

  final Profile? profile;
  final String? editListingId;

  @override
  State<SellScreen> createState() => _SellScreenState();
}

class _SellScreenState extends State<SellScreen> with AppStateMixin {
  SellRepository get _repo => sl<SellRepository>();
  ListingsRepository get _listingsRepo => sl<ListingsRepository>();

  final _title = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _originalPrice = TextEditingController();
  final _material = TextEditingController();
  final _room = TextEditingController();
  final _color = TextEditingController();
  final _brand = TextEditingController();
  final _city = TextEditingController(text: 'Addis Ababa');
  final _subCity = TextEditingController();
  final _deliveryFee = TextEditingController();

  // Shop setup controller
  final _shopNameCtrl = TextEditingController();

  bool _negotiable = true;
  bool _delivery = false;
  String? _condition = 'good';
  String? _categoryId;
  String? _rootCategoryId;
  String? _level1CategoryId;
  List<Category> _categories = const [];
  List<_SellImage> _images = const [];
  String? _discountDate;
  XFile? _video;
  String? _videoUrl;
  bool _videoExisting = false;
  LatLng? _location;
  bool _editing = false;
  bool _loadingEdit = false;
  bool _busy = false;
  bool _uploaded = false;

  static const _conditions = ['like new', 'good', 'fair', 'poor'];

  bool get _isEditMode => widget.editListingId != null;

  @override
  void initState() {
    super.initState();
    _loadCategories();
    final p = widget.profile ?? AppState.instance.profile;
    if (p != null) {
      if (p.latitude != null && p.longitude != null) {
        _location = LatLng(p.latitude!, p.longitude!);
      }
      if (_city.text == 'Addis Ababa' && p.city != null && p.city!.isNotEmpty) {
        _city.text = p.city!;
      }
    }
    if (_isEditMode) _loadForEdit();
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _price.dispose();
    _originalPrice.dispose();
    _material.dispose();
    _room.dispose();
    _color.dispose();
    _brand.dispose();
    _city.dispose();
    _subCity.dispose();
    _deliveryFee.dispose();
    _shopNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final cats = await _listingsRepo.getCategories();
      if (!mounted) return;
      setState(() => _categories = cats);
    } catch (_) {}
  }

  Future<void> _loadForEdit() async {
    final id = widget.editListingId;
    if (id == null) return;
    setState(() => _loadingEdit = true);
    try {
      final item = await _repo.fetchListingForEdit(id);
      if (!mounted || item == null) return;
      setState(() {
        _editing = true;
        _title.text = item.title;
        _description.text = item.description;
        _price.text = item.price.toStringAsFixed(0);
        _originalPrice.text = item.originalPrice?.toStringAsFixed(0) ?? '';
        _negotiable = item.negotiable;
        _condition = item.condition.isNotEmpty ? item.condition : _condition;
        _city.text = item.city.isNotEmpty ? item.city : _city.text;
        _subCity.text = item.subCity ?? '';
        _material.text = item.material ?? '';
        _room.text = item.roomType ?? '';
        _color.text = item.color ?? '';
        _brand.text = item.brand ?? '';
        _delivery = item.deliveryOffered;
        _deliveryFee.text = item.deliveryFee?.toStringAsFixed(0) ?? '';
        _discountDate = item.discountExpiresAt?.toIso8601String();
        _location = (item.latitude != null && item.longitude != null)
            ? LatLng(item.latitude!, item.longitude!)
            : _location;
        _videoUrl = item.videoUrl;
        _videoExisting = item.videoUrl != null;
        _categoryId = item.categoryId;
        Category? cat;
        try {
          cat = _categories.firstWhere((c) => c.id == item.categoryId);
        } catch (_) {
          cat = null;
        }
        // Walk up to root so the cascade reflects the right tier.
        _rootCategoryId = null;
        _level1CategoryId = null;
        if (cat != null) {
          if (cat.level >= 1 && cat.parentId != null) {
            _level1CategoryId = cat.parentId;
            Category? l1;
            try {
              l1 = _categories.firstWhere((c) => c.id == cat!.parentId);
            } catch (_) {
              l1 = null;
            }
            if ((l1?.level ?? 0) >= 1 && l1?.parentId != null) {
              _rootCategoryId = l1!.parentId;
            } else {
              _rootCategoryId = cat.parentId;
              _level1CategoryId = null;
            }
          } else {
            _rootCategoryId = cat.id;
          }
        }
        _images = [
          for (final img in item.images)
            _SellImage(url: img.url, isExisting: true),
        ];
      });
    } catch (_) {
      // Seed failure keeps the form in create mode; the seller can retype.
    } finally {
      if (mounted) setState(() => _loadingEdit = false);
    }
  }

  Future<void> _pickImages() async {
    final state = AppState.instance;
    final source = await showModalBottomSheet<_ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(state.t('sell.takePhoto')),
              onTap: () => Navigator.pop(ctx, _ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(state.t('sell.chooseGallery')),
              onTap: () => Navigator.pop(ctx, _ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    final picker = ImagePicker();
    final XFile? single;
    final List<XFile> picked;
    if (source == _ImageSource.camera) {
      single = await picker.pickImage(source: ImageSource.camera);
      if (single == null) return;
      picked = [single];
    } else {
      picked = await picker.pickMultiImage(limit: 10 - _images.length);
      if (picked.isEmpty) return;
    }
    setState(() {
      _images = [
        ..._images,
        ...picked.map((f) => _SellImage(file: f, isExisting: false)),
      ];
    });
  }

  Future<void> _pickVideo() async {
    final picker = ImagePicker();
    final file = await picker.pickVideo(source: ImageSource.gallery, maxDuration: const Duration(seconds: 60));
    if (file == null) return;
    final tooLong = await _videoLongerThan(file, const Duration(seconds: 60));
    if (!mounted) return;
    if (tooLong) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(AppState.instance.t('sell.videoTooLong'))));
      return;
    }
    setState(() {
      _video = file;
      _videoUrl = null;
      _videoExisting = false;
    });
  }

  Future<bool> _videoLongerThan(XFile file, Duration limit) async {
    try {
      final ctrl = VideoPlayerController.file(File(file.path));
      await ctrl.initialize();
      final duration = ctrl.value.duration;
      await ctrl.dispose();
      return duration > limit;
    } catch (_) {
      return false; // Best-effort; don't block upload if duration can't be read.
    }
  }

  void _removeImage(int index) {
    setState(() => _images = [..._images]..removeAt(index));
  }

  Future<void> _publish([bool asDraft = false]) async {
    final state = AppState.instance;
    final profile = state.profile;
    if (profile == null) return;

    final priceRaw = double.tryParse(_price.text);
    if (_title.text.trim().isEmpty) {
      _snack(state.t('sell.titleRequired'));
      return;
    }
    final double price;
    if (asDraft) {
      price = priceRaw == null || priceRaw < 0 ? 0 : priceRaw;
    } else if (priceRaw == null || priceRaw <= 0) {
      _snack(state.t('sell.titlePriceRequired'));
      return;
    } else {
      price = priceRaw;
    }
    final status = asDraft ? 'draft' : 'active';

    setState(() => _busy = true);
    try {
      final uploadedPaths = <String>[];
      for (final img in _images) {
        if (img.isExisting) {
          uploadedPaths.add(img.url!);
        } else {
          final path = await _repo.uploadImage(profile.id, img.file!);
          uploadedPaths.add(path);
        }
      }

      String? videoUrl;
      final video = _video;
      if (video != null) {
        videoUrl = await _repo.uploadVideo(profile.id, video);
      } else if (_videoExisting && _videoUrl != null) {
        videoUrl = _videoUrl;
      }

      var lat = _location?.latitude;
      var lon = _location?.longitude;
      final subCity = _subCity.text.trim();
      if (lat == null && lon == null && subCity.isNotEmpty) {
        final c = SupabaseApi.coordsForSubCity(subCity);
        if (c != null) {
          lat = c.lat;
          lon = c.lng;
        }
      }
      final categoryId = _categoryId ?? _level1CategoryId ?? _rootCategoryId;

      if (_isEditMode && _editing) {
        final id = widget.editListingId!;
        await _repo.updateListing(id, {
          'title': _title.text.trim(),
          'description': _description.text.trim(),
          'price': price,
          'original_price': _originalPrice.text.trim().isEmpty ? null : double.tryParse(_originalPrice.text),
          'negotiable': _negotiable,
          'condition': _condition ?? 'good',
          'material': _material.text.trim().isEmpty ? null : _material.text.trim(),
          'color': _color.text.trim().isEmpty ? null : _color.text.trim(),
          'room_type': _room.text.trim().isEmpty ? null : _room.text.trim(),
          'brand': _brand.text.trim().isEmpty ? null : _brand.text.trim(),
          'city': _city.text.trim().isEmpty ? 'Addis Ababa' : _city.text.trim(),
          'sub_city': subCity.isEmpty ? null : subCity,
          'category_id': categoryId,
          'delivery_offered': _delivery,
          'delivery_fee': _delivery ? double.tryParse(_deliveryFee.text) : null,
          'discount_expires_at': _discountDate,
          'latitude': lat,
          'longitude': lon,
          'video_url': videoUrl,
          'status': status,
        });
        await _repo.replaceListingImages(id, uploadedPaths);
        if (!mounted) return;
        _snack(state.t(asDraft ? 'sell.draftUpdated' : 'sell.updated'));
      } else {
        await _repo.createListing(
          sellerId: profile.id,
          title: _title.text.trim(),
          description: _description.text.trim(),
          price: price,
          originalPrice: _originalPrice.text.trim().isEmpty ? null : double.tryParse(_originalPrice.text),
          negotiable: _negotiable,
          condition: _condition ?? 'good',
          material: _material.text.trim().isEmpty ? null : _material.text.trim(),
          roomType: _room.text.trim().isEmpty ? null : _room.text.trim(),
          color: _color.text.trim().isEmpty ? null : _color.text.trim(),
          brand: _brand.text.trim().isEmpty ? null : _brand.text.trim(),
          city: _city.text.trim().isEmpty ? 'Addis Ababa' : _city.text.trim(),
          subCity: subCity.isEmpty ? null : subCity,
          categoryId: categoryId,
          deliveryOffered: _delivery,
          deliveryFee: _delivery ? double.tryParse(_deliveryFee.text) : null,
          latitude: lat,
          longitude: lon,
          discountExpiresAt: _discountDate != null ? DateTime.tryParse(_discountDate!) : null,
          videoUrl: videoUrl,
          imagePaths: uploadedPaths,
          status: status,
        );
        if (!mounted) return;
        _snack(state.t(asDraft ? 'sell.draftSaved' : 'sell.saved'));
      }
      if (!mounted) return;
      if (_isEditMode) {
        Navigator.of(context, rootNavigator: true).pop();
        return;
      }
      setState(() => _uploaded = true);
      _reset();
    } catch (e) {
      if (!mounted) return;
      _snack('Failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _reset() {
    _title.clear();
    _description.clear();
    _price.clear();
    _originalPrice.clear();
    _material.clear();
    _room.clear();
    _color.clear();
    _brand.clear();
    _subCity.clear();
    _deliveryFee.clear();
    _condition = 'good';
    _categoryId = null;
    _rootCategoryId = null;
    _level1CategoryId = null;
    _images = const [];
    _video = null;
    _videoUrl = null;
    _videoExisting = false;
    _discountDate = null;
    _location = null;
    _negotiable = true;
    _delivery = false;
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _syncShopFields(Profile? p) {
    if (p == null) return;
    if (_shopNameCtrl.text.isEmpty && p.shopName != null) {
      _shopNameCtrl.text = p.shopName!;
    }
  }

  String _slugFor(String name, String uid) {
    final slug = name
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    if (slug.isNotEmpty) return slug;
    final short = uid.replaceAll('-', '');
    final seed = short.isEmpty ? DateTime.now().millisecondsSinceEpoch.toString() : short;
    return 'shop-${seed.substring(0, seed.length > 8 ? 8 : seed.length)}';
  }

  Future<void> _createShop() async {
    final state = AppState.instance;
    final uid = state.userId;
    if (uid == null) return;

    final name = _shopNameCtrl.text.trim();
    if (name.isEmpty) {
      _snack(state.t('sell.enterShopName'));
      return;
    }
    final slug = _slugFor(name, uid);

    setState(() => _busy = true);
    try {
      final profileRepo = sl<ProfileRepository>();
      await profileRepo.updateProfile(uid, {
        'is_seller': true,
        'shop_name': name,
        'shop_slug': slug,
      });
      await state.refreshProfile();
      _snack('Shop created successfully!');
    } catch (e) {
      _snack('Failed to create shop: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final profile = state.profile;
    final theme = Theme.of(context);

    if (profile == null) {
      return Scaffold(
        appBar: AppBar(title: Text(state.t(_isEditMode ? 'sell.editTitle' : 'sell.title'))),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final isSeller = profile.isSeller;

    if (!isSeller) {
      _syncShopFields(profile);
      return Scaffold(
        appBar: AppBar(title: Text(state.t('sell.title'))),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.colorScheme.outlineVariant, width: 1.5),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  CircleAvatar(
                    radius: 34,
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Icon(Icons.storefront, size: 34, color: theme.colorScheme.primary),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    state.t('sell.setupTitle'),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    state.t('sell.shopNamePrompt'),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _shopNameCtrl,
                    decoration: InputDecoration(
                      labelText: state.t('profile.shopName'),
                      prefixIcon: const Icon(Icons.storefront_outlined),
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy ? null : _createShop,
                    child: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(state.t('profile.save')),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(state.t(_isEditMode ? 'sell.editTitle' : 'sell.title'))),
      body: _loadingEdit
          ? const Center(child: CircularProgressIndicator())
          : _uploaded
              ? EmptyState(
                  icon: Icons.check_circle_outline,
                  title: state.t('sell.saved'),
                  body: state.t('home.freshListings'),
                  actionLabel: state.t('sell.title'),
                  onAction: () => setState(() => _uploaded = false),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    TextField(
                      controller: _title,
                      decoration: InputDecoration(labelText: state.t('sell.titleLabel')),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _description,
                      maxLines: 4,
                      decoration: InputDecoration(labelText: state.t('sell.description')),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _price,
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(labelText: state.t('sell.price')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _originalPrice,
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(labelText: state.t('sell.originalPrice')),
                          ),
                        ),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(state.t('sell.negotiable')),
                      value: _negotiable,
                      onChanged: (v) => setState(() => _negotiable = v),
                    ),
                    if (_originalPrice.text.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _label(state.t('sell.discountEnds')),
                      CalendarPicker(value: _discountDate, onChange: (v) => setState(() => _discountDate = v)),
                    ],

                     const SizedBox(height: 8),
                     _label(state.t('sell.category')),
                     _categoryCascade(),


                    const SizedBox(height: 16),
                    _label(state.t('sell.condition')),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final cond in _conditions)
                          ChoiceChip(
                            label: Text(cond),
                            selected: _condition == cond,
                            onSelected: (_) => setState(() => _condition = cond),
                          ),
                      ],
                    ),

                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _material,
                            decoration: InputDecoration(labelText: state.t('sell.material')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _color,
                            decoration: InputDecoration(labelText: state.t('sell.color')),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _room,
                            decoration: InputDecoration(labelText: state.t('sell.room')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _brand,
                            decoration: InputDecoration(labelText: state.t('sell.brand')),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _city,
                            decoration: InputDecoration(labelText: state.t('sell.city')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _subCity,
                            decoration: InputDecoration(labelText: state.t('sell.subCity')),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 12),
                    _label(state.t('sell.setLocation')),
                    DraggablePinMap(
                      value: _location,
                      onChange: (c) => setState(() => _location = c),
                    ),

                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(state.t('sell.delivery')),
                      value: _delivery,
                      onChanged: (v) => setState(() => _delivery = v),
                    ),
                    if (_delivery)
                      TextField(
                        controller: _deliveryFee,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(labelText: state.t('sell.deliveryFee')),
                      ),

                    const SizedBox(height: 20),
                    _label(state.t('sell.photos')),
                    SizedBox(
                      height: 96,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          for (int i = 0; i < _images.length; i++)
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: _imageTile(theme, _images[i], onRemove: () => _removeImage(i)),
                            ),
                          if (_images.length < 6)
                            InkWell(
                              onTap: _pickImages,
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                width: 96,
                                height: 96,
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: theme.colorScheme.outlineVariant),
                                ),
                                child: const Icon(Icons.add_a_photo_outlined),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (_isEditMode) ...[
                      const SizedBox(height: 4),
                      Text(
                        state.t('sell.keepPhotos'),
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                      ),
                    ],

                    const SizedBox(height: 16),
                    _label(state.t('sell.videoLabel')),
                    if (_video != null)
                      _videoRow(theme, _video!.name)
                    else if (_videoExisting && _videoUrl != null)
                      _videoRow(theme, state.t('sell.videoCurrent'), existing: true)
                    else
                      InkWell(
                        onTap: _pickVideo,
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.videocam_outlined, size: 18),
                              const SizedBox(width: 8),
                              Text(state.t('sell.videoAdd'), style: theme.textTheme.bodyMedium),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      state.t('sell.videoHint'),
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                    ),

                    const SizedBox(height: 24),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _busy ? null : () => _publish(true),
                            icon: const Icon(Icons.drafts_outlined, size: 18),
                            label: Text(state.t('sell.saveDraft')),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: FilledButton(
                            onPressed: _busy ? null : () => _publish(false),
                            child: _busy
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : Text(state.t(_isEditMode ? 'profile.save' : 'sell.publish')),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
    );
  }

  Widget _imageTile(ThemeData theme, _SellImage image, {required VoidCallback onRemove}) {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: image.isExisting
              ? Image.network(
                  image.url!,
                  width: 96,
                  height: 96,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(
                    width: 96,
                    height: 96,
                    color: theme.colorScheme.surfaceContainerHighest,
                    child: const Icon(Icons.image_outlined),
                  ),
                )
              : FutureBuilder<Uint8List>(
                  future: image.file!.readAsBytes(),
                  builder: (context, snap) {
                    if (snap.hasData) {
                      return Image.memory(
                        snap.data!,
                        width: 96,
                        height: 96,
                        fit: BoxFit.cover,
                      );
                    }
                    return Container(
                      width: 96,
                      height: 96,
                      color: theme.colorScheme.surfaceContainerHighest,
                    );
                  },
                ),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: InkWell(
            onTap: onRemove,
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
              child: const Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }

  Widget _videoRow(ThemeData theme, String name, {bool existing = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          const Icon(Icons.videocam, size: 18, color: Colors.green),
          const SizedBox(width: 8),
          Expanded(
            child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium),
          ),
          InkWell(
            onTap: () => setState(() {
              _video = null;
              _videoUrl = null;
              _videoExisting = false;
            }),
            borderRadius: BorderRadius.circular(999),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Icon(Icons.close, size: 15, color: theme.colorScheme.error),
            ),
          ),
        ],
      ),
    );
  }

   Widget _categoryCascade() {
    final cats = _categories.where((c) => c.isActive).toList();
    Category? findById(String? id) {
      if (id == null) return null;
      for (final c in cats) {
        if (c.id == id) return c;
      }
      return null;
    }
    final roots = cats.where((c) => c.parentId == null).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final l1s = _rootCategoryId == null
        ? <Category>[]
        : cats.where((c) => c.parentId == _rootCategoryId).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final l2s = _level1CategoryId == null
        ? <Category>[]
        : cats.where((c) => c.parentId == _level1CategoryId).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    // Path from root to the chosen category (for highlight + display).
    final chosen = findById(_categoryId) ?? findById(_level1CategoryId) ?? findById(_rootCategoryId);
    final chosenPath = <String>[];
    var cur = chosen;
    while (cur != null) {
      chosenPath.insert(0, cur.id);
       cur = findById(cur.parentId);
    }
    final chosenRootId = chosenPath.isNotEmpty ? chosenPath[0] : null;

    Widget chip(Category c, bool selected) => ChoiceChip(
          label: Text(c.name),
          selected: selected,
          onSelected: (_) {
            if (c.parentId == null) {
              setState(() {
                _rootCategoryId = c.id;
                _level1CategoryId = null;
                _categoryId = null;
              });
            } else if (c.parentId == _rootCategoryId) {
              setState(() {
                _level1CategoryId = c.id;
                _categoryId = null;
              });
            } else {
              setState(() => _categoryId = c.id);
            }
          },
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final c in roots) chip(c, chosenRootId == c.id),
          if (_rootCategoryId != null)
            for (final c in l1s)
              chip(c, chosenPath.length > 1 && chosenPath[1] == c.id),
          if (_level1CategoryId != null)
            for (final c in l2s) chip(c, chosenPath.length > 2 && chosenPath[2] == c.id),
        ]),
        if (chosenPath.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('${AppState.instance.t('sell.category')}: ${chosen!.name}',
                style: Theme.of(context).textTheme.bodySmall),
          ),
      ],
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: Theme.of(context).textTheme.titleSmall),
      );
}