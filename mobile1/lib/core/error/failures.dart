/// Domain failure hierarchy. Repositories return these (via
/// [Result]/exceptions) instead of leaking transport errors to the UI.
library;

sealed class Failure {
  const Failure(this.message);
  final String message;

  @override
  String toString() => message;
}

class NetworkFailure extends Failure {
  const NetworkFailure([super.message = 'No internet connection.']);
}

class ServerFailure extends Failure {
  const ServerFailure([super.message = 'Something went wrong on the server.']);
}

class CacheFailure extends Failure {
  const CacheFailure([super.message = 'Could not read cached data.']);
}

class AuthFailure extends Failure {
  const AuthFailure([super.message = 'Authentication failed.']);
}

class ValidationFailure extends Failure {
  const ValidationFailure(super.message);
}
