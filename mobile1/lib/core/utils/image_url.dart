/// Width-capped image delivery. Mirrors `web/src/lib/storage.ts` and
/// `mobile/src/lib/storage.ts`, which do the same rewriting for the web app and
/// the Expo app.
///
/// Two upload pipelines feed `listing_images.url`, and neither stores a
/// display-sized picture:
///
///  * Cloudinary (web, Expo, and this app's video uploads) stores the original
///    and expects a transformation in the URL.
///  * Supabase Storage (this app's photo uploads, and the Telegram bot) stores
///    the bytes untouched. Photos that predate the upload-side cap in
///    `sell_screen.dart` are 4000x3000 and 2-5 MB each.
///
/// Downloading those originals into a feed either takes an age or never
/// finishes, so cards stay on the placeholder. Both hosts can resize on
/// delivery, which turns a 4 MB photo into ~30-50 KB, so ask them to.
library;

/// Longest edge to request for a card in a list or grid.
const int kThumbWidth = 400;

/// Longest edge to request for a full-width hero or gallery page.
const int kLargeWidth = 1200;

/// Returns [url] rewritten to be delivered at most [width] pixels wide.
///
/// Unrecognised URLs (and a null, empty or zero-width request) are returned
/// unchanged, so this is always safe to wrap around a value of unknown origin.
String? thumbUrl(String? url, {int? width}) {
  if (url == null || url.isEmpty || width == null || width <= 0) return url;
  final cloud = _cloudinaryThumb(url, width);
  if (cloud != null) return cloud;
  return _storageThumb(url, width) ?? url;
}

/// Inserts `w_<width>,q_auto,f_auto` into a Cloudinary delivery URL, letting
/// Cloudinary choose format and compression per device. Returns null when [url]
/// is not a Cloudinary image URL.
String? _cloudinaryThumb(String url, int width) {
  const marker = '/image/upload/';
  if (!url.startsWith('https://res.cloudinary.com/')) return null;
  final idx = url.indexOf(marker);
  if (idx == -1) return null;
  final head = url.substring(0, idx + marker.length);
  final tail = url.substring(idx + marker.length);
  return '${head}w_$width,q_auto,f_auto/$tail';
}

/// Rewrites a Supabase Storage public object URL to the image transformation
/// endpoint. Returns null when [url] is not such a URL — including for a
/// private bucket's signed URL, which must be delivered as issued.
String? _storageThumb(String url, int width) {
  const marker = '/storage/v1/object/public/';
  final idx = url.indexOf(marker);
  if (idx == -1) return null;
  final rewritten = url.replaceFirst(marker, '/storage/v1/render/image/public/');
  final separator = rewritten.contains('?') ? '&' : '?';
  return '$rewritten${separator}width=$width&resize=contain&quality=70';
}
