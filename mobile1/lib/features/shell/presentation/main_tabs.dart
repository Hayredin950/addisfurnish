import 'package:flutter/material.dart';

import '../../../core/state/app_state.dart';
import '../../auth/presentation/guest_gate.dart';
import '../../home/presentation/home_screen.dart';
import '../../listings/presentation/search_screen.dart';
import '../../messages/presentation/messages_screen.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../sell/presentation/sell_screen.dart';

/// A request to open the Browse tab with a search query or category applied.
class BrowseRequest {
  const BrowseRequest({this.q, this.category});

  final String? q;
  final String? category;
}

/// Controller so the Home screen can hand a query/category over to the Browse
/// tab (mirrors RN `router.push("/browse?q=…")`).
class BrowseRequestController extends ValueNotifier<BrowseRequest?> {
  BrowseRequestController() : super(null);

  void search(String q) => value = BrowseRequest(q: q.trim());

  void category(String slug) => value = BrowseRequest(category: slug);
}

/// Root tab navigator (Home / Browse / Sell / Messages / Profile) mirroring the
/// React Native app. Favorites is deliberately NOT a tab — it opens from the
/// Profile screen, exactly like mobile1.
///
/// Tab 0 (Home) and Tab 1 (Browse) are open to guests; the rest show a
/// friendly [GuestGate] when the user is not signed in.
class MainTabs extends StatefulWidget {
  const MainTabs({super.key});

  static final BrowseRequestController browseRequest = BrowseRequestController();

  static void openBrowse({String? q, String? category}) {
    browseRequest.value = BrowseRequest(
      q: q?.trim().isNotEmpty == true ? q!.trim() : null,
      category: category?.isNotEmpty == true ? category : null,
    );
  }

  @override
  State<MainTabs> createState() => _MainTabsState();
}

class _MainTabsState extends State<MainTabs> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    MainTabs.browseRequest.addListener(_onBrowseRequest);
  }

  @override
  void dispose() {
    MainTabs.browseRequest.removeListener(_onBrowseRequest);
    super.dispose();
  }

  void _onBrowseRequest() {
    if (MainTabs.browseRequest.value != null && _index != 1 && mounted) {
      setState(() => _index = 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Wrapping in ListenableBuilder so language toggle + sign-in/out
    // immediately rebuilds tab labels and tab body screens.
    return ListenableBuilder(
      listenable: AppState.instance,
      builder: (context, _) {
        final state = AppState.instance;
        final signedIn = state.isSignedIn;

        final screens = [
          HomeScreen(),
          BrowseTab(),
          signedIn ? SellScreen(profile: state.profile) : GuestGate.sell(),
          signedIn ? MessagesScreen() : GuestGate.messages(),
          signedIn ? ProfileScreen() : GuestGate.profile(),
        ];

        return Scaffold(
          body: IndexedStack(index: _index, children: screens),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: [
              NavigationDestination(
                icon: const Icon(Icons.home_outlined),
                selectedIcon: const Icon(Icons.home),
                label: state.t('tabs.home'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.search_outlined),
                selectedIcon: const Icon(Icons.search),
                label: state.t('tabs.browse'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.add_circle_outline),
                selectedIcon: const Icon(Icons.add_circle),
                label: state.t('tabs.sell'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.chat_bubble_outline),
                selectedIcon: const Icon(Icons.chat_bubble),
                label: state.t('tabs.messages'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.person_outline),
                selectedIcon: const Icon(Icons.person),
                label: state.t('tabs.profile'),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// The Browse tab wraps [SearchScreen] so it stays alive across tab switches
/// and re-applies queries/categories requested from the Home screen.
class BrowseTab extends StatefulWidget {
  const BrowseTab({super.key});

  @override
  State<BrowseTab> createState() => _BrowseTabState();
}

class _BrowseTabState extends State<BrowseTab> {
  String? _q;
  String? _category;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    MainTabs.browseRequest.addListener(_handleRequest);
    final initial = MainTabs.browseRequest.value;
    if (initial != null) {
      _q = initial.q;
      _category = initial.category;
    }
  }

  @override
  void dispose() {
    MainTabs.browseRequest.removeListener(_handleRequest);
    super.dispose();
  }

  void _handleRequest() {
    final request = MainTabs.browseRequest.value;
    if (request == null) return;
    if (!mounted) return;
    setState(() {
      _q = request.q;
      _category = request.category;
      _generation++;
    });
    // Consume so the same query can be requested again later.
    MainTabs.browseRequest.value = null;
  }

  @override
  Widget build(BuildContext context) {
    return SearchScreen(
      key: ValueKey(_generation),
      initialQuery: _q,
      categorySlug: _category,
    );
  }
}