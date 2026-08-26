import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { AuthProvider } from "../lib/auth-context";
import { initI18n } from "../lib/i18n";
import { initSentry } from "../lib/sentry";
import { theme } from "../lib/theme";

initSentry();

function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  if (!i18nReady) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds a top-level React error boundary (reporting any
// render error Sentry.captureException wouldn't otherwise see) plus
// native crash/app-start instrumentation — the mobile equivalent of
// apps/web/src/app/global-error.tsx and apps/admin's identical file.
// A no-op wrapper when initSentry() above never called Sentry.init
// (no DSN configured), same as every other call site in this app.
export default Sentry.wrap(RootLayout);
