import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../state/app_state.dart';

/// Draggable-pin location picker using native flutter_map and OpenStreetMap —
/// mirrors the RN app's DraggablePinMap (search, GPS, tap/drag pin).
class DraggablePinMap extends StatefulWidget {
  const DraggablePinMap({
    super.key,
    required this.value,
    required this.onChange,
  });

  final LatLng? value;
  final ValueChanged<LatLng?> onChange;

  @override
  State<DraggablePinMap> createState() => _DraggablePinMapState();
}

class _DraggablePinMapState extends State<DraggablePinMap> {
  final MapController _mapController = MapController();
  final TextEditingController _query = TextEditingController();
  bool _locating = false;
  bool _searching = false;
  bool _noResults = false;

  static const _defaultCenter = LatLng(9.03, 38.74); // Addis Ababa

  /// The pin is ALWAYS visible: it seeds from the initial value, or falls back
  /// to the Addis Ababa default center, so the map never looks empty.
  late LatLng _pin;

  @override
  void initState() {
    super.initState();
    _pin = widget.value ?? _defaultCenter;
  }

  @override
  void didUpdateWidget(covariant DraggablePinMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value) {
      _pin = widget.value ?? _defaultCenter;
    }
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _useMyLocation() async {
    setState(() => _locating = true);
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
        if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(AppState.instance.t('locationDenied'))),
          );
          return;
        }
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      final loc = LatLng(pos.latitude, pos.longitude);
      if (!mounted) return;
      setState(() => _pin = loc);
      widget.onChange(loc);
      _mapController.move(loc, 15);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppState.instance.t('common.error'))),
      );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  /// Nominatim geocoding — free, but requires a descriptive UA and 1 req/sec.
  Future<void> _search() async {
    final q = _query.text.trim();
    if (q.isEmpty || _searching) return;
    setState(() {
      _searching = true;
      _noResults = false;
    });
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'format': 'json',
        'limit': '1',
        'countrycodes': 'et',
        'q': q,
      });
      final res = await http.get(uri, headers: {'Accept': 'application/json'});
      final data = res.statusCode == 200 ? jsonDecode(res.body) as List : const [];
      if (data.isEmpty) {
        if (mounted) setState(() => _noResults = true);
        return;
      }
      final hit = data.first as Map<String, dynamic>;
      final loc = LatLng(double.parse(hit['lat']), double.parse(hit['lon']));
      if (!mounted) return;
      setState(() => _pin = loc);
      widget.onChange(loc);
      _mapController.move(loc, math.max(_mapController.camera.zoom, 15));
    } catch (_) {
      if (mounted) setState(() => _noResults = true);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _onTapMap(TapPosition pos, LatLng latlng) {
    setState(() => _pin = latlng);
    widget.onChange(latlng);
  }

  /// Drag the pin without reporting on every frame; report on release.
  void _onPanUpdate(DragUpdateDetails details) {
    final cam = _mapController.camera;
    final screen = cam.latLngToScreenOffset(_pin) + details.delta;
    setState(() => _pin = cam.offsetToCrs(screen));
  }

  void _reportPin() => widget.onChange(_pin);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = AppState.instance;
    final hasValue = widget.value != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _query,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: state.t('mapSearchPlaceholder'),
                  prefixIcon: const Icon(Icons.search, size: 18),
                  filled: true,
                  fillColor: theme.colorScheme.surface,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: theme.colorScheme.outline),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: theme.colorScheme.outline),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: _searching ? null : _search,
              child: _searching
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(state.t('mapSearch')),
            ),
          ],
        ),
        if (_noResults) ...[
          const SizedBox(height: 6),
          Text(
            state.t('noResults'),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
          ),
        ],
        const SizedBox(height: 8),
        Container(
          height: 220,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          clipBehavior: Clip.hardEdge,
          child: Stack(
            children: [
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: widget.value ?? _defaultCenter,
                  initialZoom: widget.value != null ? 15 : 13,
                  onTap: _onTapMap,
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                  ),
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.maktech.addisfurnish',
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: _pin,
                        width: 40,
                        height: 40,
                        child: GestureDetector(
                          onTap: _reportPin,
                          onPanUpdate: _onPanUpdate,
                          onPanEnd: (_) => _reportPin(),
                          child: const Icon(
                            Icons.location_on,
                            size: 40,
                            color: Colors.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              if (!hasValue)
                Positioned(
                  top: 10,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.touch_app, size: 14, color: Colors.white),
                          const SizedBox(width: 6),
                          Text(
                            state.t('dragPinHint'),
                            style: const TextStyle(color: Colors.white, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: FilledButton.tonalIcon(
                onPressed: _locating ? null : _useMyLocation,
                icon: _locating
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location, size: 18),
                label: Text(state.t('useCurrentLocation')),
              ),
            ),
            if (hasValue) ...[
              const SizedBox(width: 12),
              OutlinedButton(
                onPressed: () => widget.onChange(null),
                child: Text(state.t('clear')),
              ),
            ],
          ],
        ),
        if (hasValue) ...[
          const SizedBox(height: 4),
          Text(
            '${widget.value!.latitude.toStringAsFixed(5)}, ${widget.value!.longitude.toStringAsFixed(5)}',
            style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
          ),
        ],
      ],
    );
  }
}