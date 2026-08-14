import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { changePasswordSchema } from "@embr/validation";
import type { DeviceSessionDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [sessions, setSessions] = useState<DeviceSessionDto[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api.auth.sessions.list();
      setSessions(list);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function handleChangePassword() {
    setPasswordError(null);
    setFieldErrors({});

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
      setFieldErrors(errors);
      return;
    }

    setChangingPassword(true);
    try {
      await api.auth.changePassword(parsed.data);
      // Changing your password revokes every session, including this
      // one (see apps/api's auth.service.ts) — matches apps/web, this
      // redirect to login is expected, not an error path.
      await logout();
      router.replace("/login?reason=password-changed");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function revokeSession(id: string) {
    setRevokingId(id);
    try {
      await api.auth.sessions.revoke(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setRevokingId(null);
    }
  }

  async function logoutEverywhere() {
    setLoggingOutAll(true);
    try {
      await api.auth.logoutAll();
    } finally {
      // logoutAll revokes this device's session too, so there's no
      // separate server-side logout() call to make here — just clear
      // the now-dead local tokens the same way logout() would.
      await logout();
      router.replace("/login");
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    if (!deletePassword) {
      setDeleteError("Enter your password to confirm.");
      return;
    }
    setDeleting(true);
    try {
      await api.auth.deleteAccount({ password: deletePassword });
      await logout();
      router.replace("/login");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            {user && <Text style={styles.email}>{user.email}</Text>}

            <Text style={styles.sectionTitle}>Change password</Text>
            <Text style={styles.sectionHint}>
              Changing your password signs you out everywhere, including this device.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              autoComplete="current-password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            {fieldErrors.currentPassword && (
              <Text style={styles.fieldError}>{fieldErrors.currentPassword}</Text>
            )}
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              autoComplete="new-password"
              value={newPassword}
              onChangeText={setNewPassword}
            />
            {fieldErrors.newPassword && (
              <Text style={styles.fieldError}>{fieldErrors.newPassword}</Text>
            )}

            {passwordError && <Text style={styles.error}>{passwordError}</Text>}

            <Pressable
              style={[styles.button, changingPassword && styles.buttonDisabled]}
              onPress={() => void handleChangePassword()}
              disabled={changingPassword}
            >
              <Text style={styles.buttonText}>
                {changingPassword ? "Changing…" : "Change password"}
              </Text>
            </Pressable>

            <View style={styles.devicesHeaderRow}>
              <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Devices</Text>
              <Pressable onPress={() => void logoutEverywhere()} disabled={loggingOutAll}>
                <Text style={styles.dangerText}>
                  {loggingOutAll ? "Logging out…" : "Log out everywhere"}
                </Text>
              </Pressable>
            </View>

            {sessionsLoading && <Text style={styles.emptyText}>Loading…</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.sessionRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.sessionTitleRow}>
                <Text style={styles.sessionDevice}>{item.userAgent ?? "Unknown device"}</Text>
                {item.current && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>This device</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sessionMeta}>
                {item.ipAddress ?? "Unknown IP"} · signed in{" "}
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Pressable
              onPress={() => void revokeSession(item.id)}
              disabled={revokingId === item.id}
            >
              <Text style={styles.dangerTextSmall}>{revokingId === item.id ? "…" : "Revoke"}</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !sessionsLoading ? <Text style={styles.emptyText}>No active sessions.</Text> : null
        }
        ListFooterComponent={
          <View>
            <Pressable style={styles.logoutRow} onPress={() => void handleLogout()}>
              <Text style={styles.dangerText}>Log out</Text>
            </Pressable>

            <View style={styles.deleteSection}>
              <Text style={styles.sectionTitle}>Delete account</Text>
              <Text style={styles.sectionHint}>
                This permanently deletes your account and everything in it — symptom logs, cycle
                entries, briefs, and settings. This cannot be undone.
              </Text>

              {!deleteConfirming ? (
                <Pressable onPress={() => setDeleteConfirming(true)}>
                  <Text style={styles.dangerText}>Delete my account</Text>
                </Pressable>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm your password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                    autoComplete="current-password"
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                  />
                  {deleteError && <Text style={styles.error}>{deleteError}</Text>}
                  <View style={styles.deleteActionsRow}>
                    <Pressable
                      style={[styles.deleteButton, deleting && styles.buttonDisabled]}
                      onPress={() => void handleDeleteAccount()}
                      disabled={deleting}
                    >
                      <Text style={styles.buttonText}>
                        {deleting ? "Deleting…" : "Permanently delete"}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={deleting}
                      onPress={() => {
                        setDeleteConfirming(false);
                        setDeletePassword("");
                        setDeleteError(null);
                      }}
                    >
                      <Text style={styles.sectionHint}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  listContent: { padding: 20, paddingBottom: 40 },
  header: { gap: 4, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "600" },
  email: { fontSize: 14, color: "#6B7280", marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginTop: 24, marginBottom: 4 },
  sectionHint: { fontSize: 13, color: "#6B7280", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 8,
  },
  fieldError: { color: "#DC2626", fontSize: 12, marginTop: 4 },
  error: { color: "#DC2626", fontSize: 14, marginTop: 8 },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  devicesHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
  },
  dangerText: { fontSize: 14, color: "#DC2626", fontWeight: "500" },
  dangerTextSmall: { fontSize: 13, color: "#DC2626" },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sessionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sessionDevice: { fontSize: 14, fontWeight: "500" },
  sessionMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  badge: {
    backgroundColor: "#ECFDF5",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#059669" },
  emptyText: { fontSize: 14, color: "#9CA3AF", paddingVertical: 12 },
  logoutRow: { marginTop: 20, paddingVertical: 12 },
  deleteSection: {
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  deleteActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 12,
  },
  deleteButton: {
    backgroundColor: "#DC2626",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});
