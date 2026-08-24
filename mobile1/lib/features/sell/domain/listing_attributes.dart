/// Dynamic per-category attribute definitions (spec §8–§11, Phase 5).
///
/// Categories say WHAT a product is; these attributes say what is DIFFERENT
/// about it. Definitions come from the `category_attribute_set` RPC, which
/// resolves attributes attached at any level of the category hierarchy
/// (attributes attached to a parent apply to its children).
class AttributeOption {
  const AttributeOption({
    required this.id,
    required this.value,
    required this.label,
    this.labelAm,
  });

  final String id;
  /// Stable machine value ("wood") — what attribute filters match on.
  final String value;
  final String label;
  final String? labelAm;

  factory AttributeOption.fromRow(Map<String, dynamic> r) => AttributeOption(
        id: r['id'] as String,
        value: (r['value'] ?? '') as String,
        label: (r['label'] ?? '') as String,
        labelAm: r['label_am'] as String?,
      );
}

class CategoryAttributeDef {
  const CategoryAttributeDef({
    required this.attributeId,
    required this.slug,
    required this.name,
    required this.type,
    required this.isRequired,
    required this.sortOrder,
    this.nameAm,
    this.unit,
    this.options = const [],
  });

  final String attributeId;
  /// Stable machine slug — what dynamic filters key on.
  final String slug;
  final String name;
  final String? nameAm;
  /// One of: text | number | boolean | single_select | multi_select | range.
  final String type;
  final String? unit;
  final bool isRequired;
  final int sortOrder;
  /// Active options for select types; empty otherwise.
  final List<AttributeOption> options;

  bool get isSelect => type == 'single_select' || type == 'multi_select';

  factory CategoryAttributeDef.fromRow(Map<String, dynamic> r) =>
      CategoryAttributeDef(
        attributeId: r['attribute_id'] as String,
        slug: (r['slug'] ?? '') as String,
        name: (r['name'] ?? '') as String,
        nameAm: r['name_am'] as String?,
        type: (r['type'] ?? 'text') as String,
        unit: r['unit'] as String?,
        isRequired: (r['is_required'] ?? false) as bool,
        sortOrder: (r['sort_order'] ?? 0) as int,
      );
}

/// A seller-provided value for one attribute of a listing (spec §11).
/// Exactly one of the value fields is set, matching the attribute's type.
class ListingAttributeValue {
  const ListingAttributeValue({
    required this.attributeId,
    this.valueText,
    this.valueNumber,
    this.valueBoolean,
    this.optionId,
  });

  final String attributeId;
  final String? valueText;
  final double? valueNumber;
  final bool? valueBoolean;
  final String? optionId;

  Map<String, dynamic> toRow(String listingId) => {
        'listing_id': listingId,
        'attribute_id': attributeId,
        'value_text': valueText,
        'value_number': valueNumber,
        'value_boolean': valueBoolean,
        'option_id': optionId,
      };

  factory ListingAttributeValue.fromRow(Map<String, dynamic> r) =>
      ListingAttributeValue(
        attributeId: r['attribute_id'] as String,
        valueText: r['value_text'] as String?,
        valueNumber: (r['value_number'] as num?)?.toDouble(),
        valueBoolean: r['value_boolean'] as bool?,
        optionId: r['option_id'] as String?,
      );
}
