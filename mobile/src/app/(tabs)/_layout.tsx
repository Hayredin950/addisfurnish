import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../lib/theme";

const ICON_SIZE = 22;

export default function TabsLayout() {
  // Android renders edge-to-edge by default, so the app draws under the
  // system navigation bar. Its height differs per device and per nav mode
  // (gesture ≈ small inset, 3-button ≈ 48dp), so the tab bar must read the
  // real inset at runtime — a hardcoded height makes the system bar overlap
  // the tabs in 3-button mode. The hook re-renders live if the user switches
  // modes without restarting the app.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          height: 60 + insets.bottom,
          paddingBottom: 8,
          paddingTop: 6,
        },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "600", color: colors.text },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "HabeshaHome",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: "Sell",
          tabBarIcon: ({ color }) => <Ionicons name="add-circle" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={ICON_SIZE} color={color} />
          ),
        }}
      />
      {/* Favourites is deliberately not a tab — the bar stays at five (Home,
          Browse, Sell, Messages, Profile). The route lives on for deep links;
          access comes from the heart card on the Profile screen. */}
      <Tabs.Screen name="favorites" options={{ href: null }} />
    </Tabs>
  );
}
