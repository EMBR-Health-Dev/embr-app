import { useState } from "react";
import { Link, router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { loginSchema } from "@embr/validation";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api-client";
import { LanguageSwitcher } from "../components/language-switcher";
import { theme } from "../lib/theme";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    setFieldError(undefined);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      const user = await login(parsed.data.email, parsed.data.password);
      router.replace(user.onboardingCompletedAt ? "/(app)" : "/onboarding");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("login.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <LanguageSwitcher />

        <Text style={styles.title}>{t("login.title")}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("login.emailLabel")}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            testID="login-email-input"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("login.passwordLabel")}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            testID="login-password-input"
          />
        </View>

        <Link href="/forgot-password" style={styles.forgotPasswordLink}>
          <Text style={styles.linkText}>{t("login.forgotPassword")}</Text>
        </Link>

        {fieldError && <Text style={styles.error}>{fieldError}</Text>}
        {formError && <Text style={styles.error}>{formError}</Text>}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? t("login.submitting") : t("login.submit")}
          </Text>
        </Pressable>

        <Link href="/register" style={styles.link}>
          <Text>
            {t("login.newToEmbr")} <Text style={styles.linkText}>{t("login.createAccount")}</Text>
          </Text>
        </Link>

        <Link href="/assessment" style={styles.link}>
          <Text style={styles.linkText}>{t("login.takeAssessment")}</Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 8, color: theme.colors.textPrimary },
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
  forgotPasswordLink: { alignSelf: "flex-end" },
  linkText: { color: theme.colors.success, fontWeight: "500" },
});
