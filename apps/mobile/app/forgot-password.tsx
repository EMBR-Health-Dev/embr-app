import { useState } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { forgotPasswordSchema } from "@embr/validation";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { theme } from "../lib/theme";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    setFieldError(undefined);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.forgotPassword(parsed.data.email);
      // The API always returns success here regardless of whether an
      // account exists for this email (see auth.service.ts's
      // forgotPassword) — showing the same done state for every
      // non-error outcome keeps that true on this screen too.
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("forgotPassword.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>{t("forgotPassword.checkEmailTitle")}</Text>
          <Text style={styles.body}>{t("forgotPassword.checkEmailBody")}</Text>
          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>{t("forgotPassword.backToLogin")}</Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>{t("forgotPassword.title")}</Text>
        <Text style={styles.body}>{t("forgotPassword.subtitle")}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("forgotPassword.emailLabel")}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        </View>

        {fieldError && <Text style={styles.error}>{fieldError}</Text>}
        {formError && <Text style={styles.error}>{formError}</Text>}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
          </Text>
        </Pressable>

        <Link href="/login" style={styles.link}>
          <Text style={styles.linkText}>{t("forgotPassword.backToLogin")}</Text>
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
