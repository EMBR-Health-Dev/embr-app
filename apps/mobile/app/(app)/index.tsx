import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";

export default function HomeScreen() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome{user ? `, ${user.email}` : ""}</Text>
        <Text style={styles.body}>
          This is the starting point for the EMBR mobile app — auth is wired up end to end against
          the real API. Everything past this screen (symptom logging, cycle tracking, trends) is
          still to build.
        </Text>

        <Pressable style={styles.button} onPress={handleLogout}>
          <Text style={styles.buttonText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 24, gap: 16, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "600" },
  body: { fontSize: 15, color: "#4B5563", lineHeight: 21 },
  button: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { fontSize: 16, fontWeight: "500", color: "#111827" },
});
