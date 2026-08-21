import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Network image with a warm placeholder + graceful error fallback.
/// Uses [CachedNetworkImage] so images persist on disk and load instantly on
/// repeat visits (offline-first friendly).
class AppImage extends StatelessWidget {
  const AppImage(
    this.url, {
    super.key,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.borderRadius,
    this.icon = Icons.chair_outlined,
  });

  final String? url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final placeholder = Container(
      width: width,
      height: height,
      color: theme.colorScheme.surfaceContainerHighest,
      child: Icon(icon, size: 32, color: theme.colorScheme.outline),
    );

    if (url == null || url!.isEmpty) return placeholder;

    Widget image = CachedNetworkImage(
      imageUrl: url!,
      fit: fit,
      width: width,
      height: height,
      placeholder: (_, _) => placeholder,
      errorWidget: (_, _, _) => placeholder,
    );

    if (borderRadius != null) {
      image = ClipRRect(borderRadius: borderRadius!, child: image);
    }
    return image;
  }
}
