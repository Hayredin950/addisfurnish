import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:addisfurnish/app.dart';

void main() {
  testWidgets('app builds without Supabase configured', (tester) async {
    await tester.pumpWidget(const HabeshaHomeApp());
    await tester.pump();
    expect(find.byType(Scaffold), findsWidgets);
  });
}
