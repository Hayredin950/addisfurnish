import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../utils/image_url.dart';

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
    this.targetWidth,
  });

  final String? url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final IconData icon;

  /// Pixel width to request from the image host — see [thumbUrl]. A card does
  /// not need the seller's 4 MB original, and downloading it is why a feed of
  /// Supabase-hosted photos used to sit on the placeholder forever. Leave null
  /// only where the full-size image is the point, such as a zoomable gallery.
  final int? targetWidth;

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
      imageUrl: thumbUrl(url, width: targetWidth)!,
      fit: fit,
      width: width,
      height: height,
      // Bound the decoded bitmap too, not just the download: a 4000x3000 JPEG
      // decodes to ~48 MB in memory, which on a mid-range Android device is
      // enough for the image to be dropped and the placeholder to stay put.
      memCacheWidth: targetWidth,
      placeholder: (_, _) => placeholder,
      errorWidget: (_, _, _) => placeholder,
    );

    if (borderRadius != null) {
      image = ClipRRect(borderRadius: borderRadius!, child: image);
    }
    return image;
  }
}
