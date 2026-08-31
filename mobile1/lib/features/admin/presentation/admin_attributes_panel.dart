import 'package:flutter/material.dart';

import '../../../core/di/service_locator.dart';
import '../../../core/models/models.dart';
import '../../../core/state/app_state.dart';
import '../domain/admin_repository.dart';

/// Attribute catalogue + category attachment admin panel
/// (web AttributeManager parity, spec §3/§4/§9/§10).
///
/// Everything here is data, so an admin can add/rename/deactivate an attribute
/// and the sell form + buyer filters pick it up without a rebuild.
class AdminAttributesPanel extends StatefulWidget {
  const AdminAttributesPanel({super.key});

  @override
  State<AdminAttributesPanel> createState() => _AdminAttributesPanelState();
}

class _AdminAttributesPanelState extends State<AdminAttributesPanel> {
  AdminRepository get _repo => sl<AdminRepository>();
  AppState get _state => AppState.instance;

  List<AdminAttribute>? _attributes;
  List<AdminCategory>? _cats;
  bool _loading = true;
  String? _error;
  bool _busy = false;

  final _name = TextEditingController();
  final _nameAm = TextEditingController();
  final _unit = TextEditingController();
  String _type = 'single_select';

  String? _expandedAttr;
  String? _editingAttr;
  final _editName = TextEditingController();
  final _editNameAm = TextEditingController();
  final _editUnit = TextEditingController();

  final _optValue = TextEditingController();
  final _optLabel = TextEditingController();
  final _optLabelAm = TextEditingController();

  String? _categoryId;
  int? _categoryLevel;
  List<AdminCategoryAttributeDef>? _effective;
  bool _effectiveLoading = false;

  static const _types = [
    ('text', 'admin.attributeTypeText'),
    ('number', 'admin.attributeTypeNumber'),
    ('boolean', 'admin.attributeTypeBoolean'),
    ('single_select', 'admin.attributeTypeSingleSelect'),
    ('multi_select', 'admin.attributeTypeMultiSelect'),
    ('range', 'admin.attributeTypeRange'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _nameAm.dispose();
    _unit.dispose();
    _editName.dispose();
    _editNameAm.dispose();
    _editUnit.dispose();
    _optValue.dispose();
    _optLabel.dispose();
    _optLabelAm.dispose();
    super.dispose();
  }

  String _typeLabel(String type) {
    switch (type) {
      case 'text':
        return _state.t('admin.attributeTypeText');
      case 'number':
        return _state.t('admin.attributeTypeNumber');
      case 'boolean':
        return _state.t('admin.attributeTypeBoolean');
      case 'multi_select':
        return _state.t('admin.attributeTypeMultiSelect');
      case 'range':
        return _state.t('admin.attributeTypeRange');
      case 'single_select':
      default:
        return _state.t('admin.attributeTypeSingleSelect');
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<Object>([
        _repo.getAttributes(),
        _repo.getCategories(),
      ]);
      if (!mounted) return;
      setState(() {
        _attributes = results[0] as List<AdminAttribute>;
        _cats = (results[1] as List<AdminCategory>).toList(growable: false);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  Future<void> _loadEffective(String categoryId) async {
    setState(() => _effectiveLoading = true);
    try {
      final set = await _repo.getCategoryAttributeSet(categoryId);
      if (!mounted) return;
      setState(() {
        _effective = set;
        _effectiveLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _effectiveLoading = false;
        _effective = const [];
      });
      _snack('$e');
    }
  }

  void _selectCategory(String? id) {
    int? level;
    for (final c in _cats ?? const <AdminCategory>[]) {
      if (c.id == id) {
        level = c.level;
        break;
      }
    }
    setState(() {
      _categoryId = id;
      _categoryLevel = level;
    });
    if (id != null) _loadEffective(id);
  }

  Future<void> _add() async {
    if (_name.text.trim().isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await _repo.createAttribute(
        name: _name.text,
        nameAm: _nameAm.text,
        type: _type,
        unit: _unit.text,
      );
      _name.clear();
      _nameAm.clear();
      _unit.clear();
      await _load();
    } catch (e) {
      _snack('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveEdit(AdminAttribute a) async {
    try {
      await _repo.updateAttribute(
        a.id,
        name: _editName.text,
        nameAm: _editNameAm.text,
        unit: _editUnit.text,
      );
      if (mounted) setState(() => _editingAttr = null);
      await _load();
      await _reloadEffective();
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _toggleAttr(AdminAttribute a, String flag) async {
    try {
      await _repo.toggleAttributeFlag(a.id, flag);
      await _load();
      await _reloadEffective();
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _addOption(AdminAttribute a) async {
    if (_optValue.text.trim().isEmpty || _optLabel.text.trim().isEmpty) return;
    try {
      await _repo.createAttributeOption(
        a.id,
        value: _optValue.text,
        label: _optLabel.text,
        labelAm: _optLabelAm.text,
      );
      _optValue.clear();
      _optLabel.clear();
      _optLabelAm.clear();
      if (mounted) setState(() {});
      await _reloadEffective();
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _toggleOption(String id) async {
    try {
      await _repo.toggleAttributeOption(id);
      if (mounted) setState(() {});
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _toggleCategoryFlag(AdminCategoryAttributeDef d, String flag) async {
    final id = _categoryId;
    if (id == null) return;
    try {
      await _repo.setCategoryAttributeFlag(id, d.attributeId, flag);
      await _loadEffective(id);
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _attach(AdminAttribute a) async {
    final id = _categoryId;
    if (id == null) return;
    try {
      await _repo.attachCategoryAttribute(id, a.id);
      await _loadEffective(id);
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _detach(AdminCategoryAttributeDef d) async {
    final id = _categoryId;
    if (id == null) return;
    try {
      await _repo.detachCategoryAttribute(id, d.attributeId);
      await _loadEffective(id);
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _reloadEffective() async {
    final id = _categoryId;
    if (id != null && mounted) _loadEffective(id);
  }

  Widget _optionsEditor(AdminAttribute a) {
    final state = _state;
    return FutureBuilder<List<AdminAttributeOption>>(
      future: _repo.getAttributeOptions(a.id),
      builder: (context, snap) {
        final opts = snap.data ?? const <AdminAttributeOption>[];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(state.t('admin.attributeOptions'),
                style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    controller: _optValue,
                    decoration: InputDecoration(
                      hintText: state.t('admin.optionValue'),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: _optLabel,
                    decoration: InputDecoration(
                      hintText: state.t('admin.optionLabel'),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: _optLabelAm,
                    decoration: InputDecoration(
                      hintText: state.t('admin.optionLabelAm'),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.add),
                  onPressed: () => _addOption(a),
                ),
              ],
            ),
            if (opts.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(state.t('admin.noOptions'),
                    style: Theme.of(context).textTheme.bodySmall),
              )
            else
              ...opts.map((o) => ListTile(
                    dense: true,
                    visualDensity: VisualDensity.compact,
                    contentPadding: EdgeInsets.zero,
                    leading: Text(o.value,
                        style: Theme.of(context).textTheme.bodySmall),
                    title: Text(o.label),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!o.isActive)
                          Text(state.t('admin.attributeInactive'),
                              style: Theme.of(context).textTheme.bodySmall),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          icon: Icon(
                            o.isActive
                                ? Icons.toggle_on
                                : Icons.toggle_off,
                            size: 22,
                            color: o.isActive
                                ? Theme.of(context).colorScheme.primary
                                : null,
                          ),
                          onPressed: () => _toggleOption(o.id),
                        ),
                      ],
                    ),
                  )),
            const SizedBox(height: 4),
          ],
        );
      },
    );
  }

  Widget _attributeRow(AdminAttribute a) {
    final theme = Theme.of(context);
    final state = _state;
    final editing = _editingAttr == a.id;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (editing)
                  Expanded(
                    child: Column(
                      children: [
                        TextField(
                          controller: _editName,
                          decoration: InputDecoration(
                            labelText: state.t('admin.attributeName'),
                            isDense: true,
                            border: const OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 4),
                        TextField(
                          controller: _editNameAm,
                          decoration: InputDecoration(
                            labelText: state.t('admin.attributeNameAm'),
                            isDense: true,
                            border: const OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 4),
                        TextField(
                          controller: _editUnit,
                          decoration: InputDecoration(
                            labelText: state.t('admin.attributeUnit'),
                            isDense: true,
                            border: const OutlineInputBorder(),
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(a.name,
                                style: theme.textTheme.titleSmall,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            const SizedBox(width: 6),
                            Text('/${a.slug}',
                                style: theme.textTheme.bodySmall),
                          ],
                        ),
                        Text(
                          _typeLabel(a.type),
                          style: theme.textTheme.bodySmall,
                        ),
                        if (a.unit != null)
                          Text('· ${a.unit}',
                              style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                if (a.isSelect)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: state.t('admin.attributeOptions'),
                    icon: const Icon(Icons.list, size: 18),
                    onPressed: () => setState(
                        () => _expandedAttr = _expandedAttr == a.id ? null : a.id),
                  ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: state.t('admin.attributeFilterable'),
                  icon: Icon(
                    a.isFilterable ? Icons.filter_alt : Icons.filter_alt_off,
                    size: 18,
                  ),
                  onPressed: () => _toggleAttr(a, 'is_filterable'),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip:
                      state.t(a.isActive ? 'admin.attributeActive' : 'admin.attributeInactive'),
                  icon: Icon(
                    a.isActive ? Icons.visibility : Icons.visibility_off,
                    size: 18,
                  ),
                  onPressed: () => _toggleAttr(a, 'is_active'),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: Icon(
                    editing ? Icons.check : Icons.edit_outlined,
                    size: 18,
                  ),
                  onPressed: () {
                    if (editing) {
                      _saveEdit(a);
                    } else {
                      setState(() {
                        _editingAttr = a.id;
                        _editName.text = a.name;
                        _editNameAm.text = a.nameAm ?? '';
                        _editUnit.text = a.unit ?? '';
                      });
                    }
                  },
                ),
              ],
            ),
            if (_expandedAttr == a.id && a.isSelect)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _optionsEditor(a),
              ),
          ],
        ),
      ),
    );
  }

  Widget _effectiveRow(AdminCategoryAttributeDef d) {
    final theme = Theme.of(context);
    final state = _state;
    final direct = _categoryLevel != null && d.fromLevel == _categoryLevel;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(d.name, style: theme.textTheme.titleSmall),
                      const SizedBox(width: 6),
                      if (direct)
                        Chip(
                          label: Text(state.t('admin.attachedDirectly')),
                          visualDensity: VisualDensity.compact,
                          backgroundColor: theme.colorScheme.primaryContainer,
                          labelStyle: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onPrimaryContainer),
                        )
                      else
                        Chip(
                          label: Text(state.t('admin.inheritedFromLevel', {
                            'level': '${d.fromLevel}',
                          })),
                          visualDensity: VisualDensity.compact,
                          backgroundColor: theme.colorScheme.secondaryContainer,
                          labelStyle: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSecondaryContainer),
                        ),
                    ],
                  ),
                  Text(_typeLabel(d.type), style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: state.t('admin.attributeRequired'),
              icon: Icon(
                d.isRequired ? Icons.lock_outline : Icons.lock_open,
                size: 18,
              ),
              onPressed: direct ? () => _toggleCategoryFlag(d, 'is_required') : null,
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: state.t('admin.attributeFilterable'),
              icon: Icon(
                d.isFilterable ? Icons.filter_alt : Icons.filter_alt_off,
                size: 18,
              ),
              onPressed: direct ? () => _toggleCategoryFlag(d, 'is_filterable') : null,
            ),
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: state.t('admin.detach'),
              icon: const Icon(Icons.remove_circle_outline, size: 18),
              onPressed: direct ? () => _detach(d) : null,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    final attrs = _attributes ?? const <AdminAttribute>[];
    final effective = _effective ?? const <AdminCategoryAttributeDef>[];
    final attachable = attrs.where(
      (a) => a.isActive && !effective.any((d) => d.attributeId == a.id),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(state.t('admin.attributeCatalogue'),
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _name,
                decoration: InputDecoration(
                  labelText: state.t('admin.attributeName'),
                  isDense: true,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: TextField(
                controller: _nameAm,
                decoration: InputDecoration(
                  labelText: state.t('admin.attributeNameAm'),
                  isDense: true,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 6),
            DropdownButton<String>(
              value: _type,
              isDense: true,
              items: [
                for (final (type, label) in _types)
                  DropdownMenuItem(value: type, child: Text(state.t(label))),
              ],
              onChanged: (v) => setState(() => _type = v ?? _type),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: TextField(
                controller: _unit,
                decoration: InputDecoration(
                  labelText: state.t('admin.attributeUnit'),
                  isDense: true,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 6),
            FilledButton.icon(
              onPressed: _busy || _name.text.trim().isEmpty ? null : _add,
              icon: const Icon(Icons.add, size: 18),
              label: Text(state.t('admin.addAttribute')),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_error != null)
          Center(
            child: Column(
              children: [
                Text('$_error'),
                const SizedBox(height: 8),
                FilledButton(onPressed: _load, child: Text(state.t('common.retry'))),
              ],
            ),
          )
        else if (attrs.isEmpty)
          Text(state.t('admin.noAttributes'),
              style: Theme.of(context).textTheme.bodyMedium)
        else
          for (final a in attrs) _attributeRow(a),
        const SizedBox(height: 20),
        const Divider(),
        const SizedBox(height: 8),
        Text(state.t('admin.effectiveAttributes'),
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        DropdownButton<String>(
          value: _categoryId,
          isExpanded: true,
          isDense: true,
          hint: Text(state.t('admin.selectCategory')),
          items: [
            for (final c in _cats ?? const <AdminCategory>[])
              DropdownMenuItem(value: c.id, child: Text(c.name)),
          ],
          onChanged: _selectCategory,
        ),
        const SizedBox(height: 8),
        if (_categoryId != null)
          _effectiveLoading
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (effective.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(state.t('admin.noAttributes'),
                            style: Theme.of(context).textTheme.bodyMedium),
                      )
                    else
                      for (final d in effective) _effectiveRow(d),
                    if (attachable.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(state.t('admin.attachAttribute'),
                          style: Theme.of(context).textTheme.labelMedium),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final a in attachable)
                            ActionChip(
                              avatar: const Icon(Icons.add, size: 16),
                              label: Text(a.name),
                              onPressed: () => _attach(a),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
        const SizedBox(height: 4),
      ],
    );
  }
}