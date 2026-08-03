import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";

const ICON_SIZE = 22;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          height: 60,
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
          title: "SuqBet",
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
    </Tabs>
  );
}
