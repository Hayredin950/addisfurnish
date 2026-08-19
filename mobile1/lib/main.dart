import 'package:flutter/material.dart';

import 'app.dart';
import 'core/di/injection.dart';
import 'core/state/app_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppState.instance.init();
  await setupLocator();
  runApp(const AddisFurnishApp());
}
