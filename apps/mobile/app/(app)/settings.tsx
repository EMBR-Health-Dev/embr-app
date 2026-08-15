import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { changePasswordSchema } from "@embr/validation";
import type { DeviceSessionDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { theme } from "../../lib/theme";

export default function SettingsScreen() {
  const { t } = useTranslation();
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
      setPasswordError(err instanceof ApiError ? err.message : t("settings.genericError"));
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
      setDeleteError(t("settings.enterPasswordToConfirm"));
      return;
    }
    setDeleting(true);
    try {
      await api.auth.deleteAccount({ password: deletePassword });
      await logout();
      router.replace("/login");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("settings.genericError"));
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
            <Text style={styles.title}>{t("settings.title")}</Text>
            {user && <Text style={styles.email}>{user.email}</Text>}

            <Text style={styles.sectionTitle}>{t("settings.changePasswordTitle")}</Text>
            <Text style={styles.sectionHint}>{t("settings.changePasswordHint")}</Text>

            <TextInput
              style={styles.input}
              placeholder={t("settings.currentPasswordPlaceholder")}
              placeholderTextColor={theme.colors.textMuted}
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
              placeholder={t("settings.newPasswordPlaceholder")}
              placeholderTextColor={theme.colors.textMuted}
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
                {changingPassword ? t("settings.changing") : t("settings.changePassword")}
              </Text>
            </Pressable>

            <View style={styles.devicesHeaderRow}>
              <Text style={[styles.sectionTitle, { marginTop: 0 }]}>{t("settings.devices")}</Text>
              <Pressable onPress={() => void logoutEverywhere()} disabled={loggingOutAll}>
                <Text style={styles.dangerText}>
                  {loggingOutAll ? t("settings.loggingOut") : t("settings.logoutEverywhere")}
                </Text>
              </Pressable>
            </View>

            {sessionsLoading && <Text style={styles.emptyText}>{t("common.loading")}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.sessionRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.sessionTitleRow}>
                <Text style={styles.sessionDevice}>
                  {item.userAgent ?? t("settings.unknownDevice")}
                </Text>
                {item.current && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t("settings.thisDevice")}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sessionMeta}>
                {item.ipAddress ?? t("settings.unknownIp")} · {t("settings.signedIn")}{" "}
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Pressable
              onPress={() => void revokeSession(item.id)}
              disabled={revokingId === item.id}
            >
              <Text style={styles.dangerTextSmall}>
                {revokingId === item.id ? "…" : t("settings.revoke")}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !sessionsLoading ? (
            <Text style={styles.emptyText}>{t("settings.noActiveSessions")}</Text>
          ) : null
        }
        ListFooterComponent={
          <View>
            <Pressable style={styles.logoutRow} onPress={() => void handleLogout()}>
              <Text style={styles.dangerText}>{t("settings.logout")}</Text>
            </Pressable>

            <View style={styles.deleteSection}>
              <Text style={styles.sectionTitle}>{t("settings.deleteAccountTitle")}</Text>
              <Text style={styles.sectionHint}>{t("settings.deleteAccountHint")}</Text>

              {!deleteConfirming ? (
                <Pressable onPress={() => setDeleteConfirming(true)}>
                  <Text style={styles.dangerText}>{t("settings.deleteMyAccount")}</Text>
                </Pressable>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.input}
                    placeholder={t("settings.confirmPasswordPlaceholder")}
                    placeholderTextColor={theme.colors.textMuted}
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
                        {deleting ? t("settings.deleting") : t("settings.permanentlyDelete")}
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
                      <Text style={styles.sectionHint}>{t("settings.cancel")}</Text>
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
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  listContent: { padding: 20, paddingBottom: 40 },
  header: { gap: 4, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "600", color: theme.colors.textPrimary },
  email: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 4,
    color: theme.colors.textPrimary,
  },
  sectionHint: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 8,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
  fieldError: { color: theme.colors.error, fontSize: 12, marginTop: 4 },
  error: { color: theme.colors.error, fontSize: 14, marginTop: 8 },
  button: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 15, fontWeight: "600" },
  devicesHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
  },
  dangerText: { fontSize: 14, color: theme.colors.error, fontWeight: "500" },
  dangerTextSmall: { fontSize: 13, color: theme.colors.error },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sessionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sessionDevice: { fontSize: 14, fontWeight: "500", color: theme.colors.textPrimary },
  sessionMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: theme.colors.successSoft,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: "600", color: theme.colors.success },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, paddingVertical: 12 },
  logoutRow: { marginTop: 20, paddingVertical: 12 },
  deleteSection: {
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  deleteActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 12,
  },
  deleteButton: {
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
});
