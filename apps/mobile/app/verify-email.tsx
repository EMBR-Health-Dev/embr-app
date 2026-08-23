import { useState } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { forgotPasswordSchema } from "@embr/validation";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { extractToken } from "../lib/reset-token";
import { theme } from "../lib/theme";

// Same known limitation as reset-password.tsx: there's no deep-linking
// set up for this flow on mobile — the verification email always
// points at a web page (see mailer.ts's sendVerificationEmail), so
// there's no incoming URL param to auto-verify from the way
// apps/web/src/app/verify-email/page.tsx does. This is not a
// regression or a shortcut being pretended away — it's the same real,
// unaddressed gap reset-password already has, reusing the same
// paste-the-link-or-token fallback rather than inventing a different
// one for this screen.
export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const [tokenInput, setTokenInput] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [resendEmail, setResendEmail] = useState("");
  const [resendFieldError, setResendFieldError] = useState<string | undefined>();
  const [resendFormError, setResendFormError] = useState<string | null>(null);
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  async function handleVerify() {
    setFormError(null);
    setFieldError(undefined);

    const token = extractToken(tokenInput);
    if (!token) {
      setFieldError(t("verifyEmail.tokenRequired"));
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.verifyEmail(token);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("verifyEmail.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResendFormError(null);
    setResendFieldError(undefined);

    const parsed = forgotPasswordSchema.safeParse({ email: resendEmail });
    if (!parsed.success) {
      setResendFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setResendSubmitting(true);
    try {
      await api.auth.resendVerification(parsed.data.email);
      // Same non-enumeration promise as forgot-password: the API
      // always returns success here regardless of whether an account
      // exists or is already verified (see auth.service.ts's
      // resendVerification).
      setResendDone(true);
    } catch (err) {
      setResendFormError(err instanceof ApiError ? err.message : t("verifyEmail.genericError"));
    } finally {
      setResendSubmitting(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>{t("verifyEmail.successTitle")}</Text>
          <Text style={styles.body}>{t("verifyEmail.successBody")}</Text>
          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>{t("verifyEmail.goToLogin")}</Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>{t("verifyEmail.title")}</Text>
        <Text style={styles.body}>{t("verifyEmail.subtitle")}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("verifyEmail.tokenLabel")}</Text>
          <TextInput
            style={styles.input}
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          {fieldError && <Text style={styles.error}>{fieldError}</Text>}
        </View>

        {formError && <Text style={styles.error}>{formError}</Text>}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? t("verifyEmail.submitting") : t("verifyEmail.submit")}
          </Text>
        </Pressable>

        <View style={styles.resendSection}>
          <Text style={styles.body}>{t("verifyEmail.resendPrompt")}</Text>
          {resendDone ? (
            <Text style={styles.successText}>{t("verifyEmail.resendCheckEmail")}</Text>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>{t("verifyEmail.emailLabel")}</Text>
                <TextInput
                  style={styles.input}
                  value={resendEmail}
                  onChangeText={setResendEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                {resendFieldError && <Text style={styles.error}>{resendFieldError}</Text>}
              </View>
              {resendFormError && <Text style={styles.error}>{resendFormError}</Text>}
              <Pressable
                style={[styles.button, resendSubmitting && styles.buttonDisabled]}
                onPress={handleResend}
                disabled={resendSubmitting}
              >
                <Text style={styles.buttonText}>
                  {resendSubmitting
                    ? t("verifyEmail.resendSubmitting")
                    : t("verifyEmail.resendButton")}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        <Link href="/login" style={styles.link}>
          <Text style={styles.linkText}>{t("verifyEmail.backToLogin")}</Text>
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
  successText: { color: theme.colors.success, fontSize: 14 },
  button: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 16, fontWeight: "600" },
  resendSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderStrong,
    gap: 12,
  },
  link: { marginTop: 8, alignSelf: "center" },
  linkText: { color: theme.colors.success, fontWeight: "500" },
});
