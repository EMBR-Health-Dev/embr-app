import { useState } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { passwordSchema } from "@embr/validation";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { extractToken } from "../lib/reset-token";
import { theme } from "../lib/theme";

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [tokenInput, setTokenInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    setFieldErrors({});

    const token = extractToken(tokenInput);
    if (!token) {
      setFieldErrors({ token: t("resetPassword.tokenRequired") });
      return;
    }

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setFieldErrors({ password: parsed.error.issues[0]?.message ?? "" });
      return;
    }
    // Confirmation matching is a client-side-only concept — nothing
    // for the server to check here beyond the password itself (see
    // resetPasswordSchema), same as every other password field in
    // this app never asking the server to confirm a match.
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: t("resetPassword.passwordsDontMatch") });
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.resetPassword({ token, password: parsed.data });
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("resetPassword.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>{t("resetPassword.successTitle")}</Text>
          <Text style={styles.body}>{t("resetPassword.successBody")}</Text>
          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>{t("resetPassword.goToLogin")}</Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>{t("resetPassword.title")}</Text>
        <Text style={styles.body}>{t("resetPassword.subtitle")}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("resetPassword.tokenLabel")}</Text>
          <TextInput
            style={styles.input}
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          {fieldErrors.token && <Text style={styles.error}>{fieldErrors.token}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("resetPassword.newPasswordLabel")}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          {fieldErrors.password && <Text style={styles.error}>{fieldErrors.password}</Text>}
        </View>
        <Text style={styles.hint}>{t("resetPassword.passwordHint")}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("resetPassword.confirmPasswordLabel")}</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          {fieldErrors.confirmPassword && (
            <Text style={styles.error}>{fieldErrors.confirmPassword}</Text>
          )}
        </View>

        {formError && <Text style={styles.error}>{formError}</Text>}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? t("resetPassword.submitting") : t("resetPassword.submit")}
          </Text>
        </Pressable>

        <Link href="/login" style={styles.link}>
          <Text style={styles.linkText}>{t("resetPassword.goToLogin")}</Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 8, color: theme.colors.textPrimary },
  body: { fontSize: 16, color: theme.colors.textSecondary, lineHeight: 22 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500", color: theme.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginTop: -8 },
  error: { color: theme.colors.error, fontSize: 14 },
  button: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 16, fontWeight: "600" },
  link: { marginTop: 8, alignSelf: "center" },
  linkText: { color: theme.colors.success, fontWeight: "500" },
});
