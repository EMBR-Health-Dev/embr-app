import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View, type ColorValue } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth-context";
import { theme } from "../../lib/theme";

function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={color} />;
  }
  return TabIcon;
}

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t("tabs.symptoms"), tabBarIcon: tabIcon("pulse-outline") }}
      />
      <Tabs.Screen
        name="cycle"
        options={{ title: t("tabs.cycle"), tabBarIcon: tabIcon("calendar-outline") }}
      />
      <Tabs.Screen
        name="trends"
        options={{ title: t("tabs.trends"), tabBarIcon: tabIcon("trending-up-outline") }}
      />
      <Tabs.Screen
        name="brief"
        options={{ title: t("tabs.brief"), tabBarIcon: tabIcon("document-text-outline") }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t("tabs.settings"), tabBarIcon: tabIcon("settings-outline") }}
      />
    </Tabs>
  );
}
