
import '../../features/auth/data/auth_repository_impl.dart';
import '../../features/auth/domain/auth_repository.dart';
import '../../features/admin/data/admin_repository_impl.dart';
import '../../features/admin/domain/admin_repository.dart';
import '../../features/favorites/data/favorites_repository_impl.dart';
import '../../features/favorites/domain/favorites_repository.dart';
import '../../features/listings/data/listings_repository_impl.dart';
import '../../features/listings/domain/listings_repository.dart';
import '../../features/messages/data/messages_repository_impl.dart';
import '../../features/messages/domain/messages_repository.dart';
import '../../features/notifications/data/notifications_repository_impl.dart';
import '../../features/notifications/domain/notifications_repository.dart';
import '../../features/profile/data/profile_repository_impl.dart';
import '../../features/profile/domain/profile_repository.dart';
import '../../features/sell/data/sell_repository_impl.dart';
import '../../features/sell/domain/sell_repository.dart';
import 'service_locator.dart';

/// Registers all feature repositories in the global service locator.
/// Call once from `main()` before `runApp`.
Future<void> setupLocator() async {
  sl
    ..registerLazySingleton<AuthRepository>(AuthRepositoryImpl.new)
    ..registerLazySingleton<AdminRepository>(AdminRepositoryImpl.new)
    ..registerLazySingleton<ListingsRepository>(ListingsRepositoryImpl.new)
    ..registerLazySingleton<FavoritesRepository>(FavoritesRepositoryImpl.new)
    ..registerLazySingleton<MessagesRepository>(MessagesRepositoryImpl.new)
    ..registerLazySingleton<NotificationsRepository>(NotificationsRepositoryImpl.new)
    ..registerLazySingleton<ProfileRepository>(ProfileRepositoryImpl.new)
    ..registerLazySingleton<SellRepository>(SellRepositoryImpl.new);
}
