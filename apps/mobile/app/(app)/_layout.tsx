import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth-context";

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
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t("tabs.symptoms") }} />
      <Tabs.Screen name="cycle" options={{ title: t("tabs.cycle") }} />
      <Tabs.Screen name="trends" options={{ title: t("tabs.trends") }} />
      <Tabs.Screen name="brief" options={{ title: t("tabs.brief") }} />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings") }} />
    </Tabs>
  );
}
