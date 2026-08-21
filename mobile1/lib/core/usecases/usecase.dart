/// Base class for a single business action.
///
/// ```dart
/// class GetListing extends UseCase<Listing?, String> {
///   GetListing(this._repo);
///   final ListingsRepository _repo;
///   @override
///   Future<Listing?> call(String params) => _repo.getListing(params);
/// }
/// ```
abstract class UseCase<Output, Params> {
  Future<Output> call(Params params);
}

class NoParams {
  const NoParams();
}
