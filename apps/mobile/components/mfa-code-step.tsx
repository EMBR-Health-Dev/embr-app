import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { UserDto } from "@embr/types";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api-client";
import { errorMarker, theme } from "../lib/theme";

/**
 * The second step of sign in when two-step sign in is on: the 6 digit
 * code from her authenticator app, or one of her recovery codes. Same
 * flow as apps/web's MfaCodeStep. The server allows 5 minutes and 5
 * codes; once the challenge is gone (a 401) she signs in again.
 */
export function MfaCodeStep({
  mfaToken,
  onSignedIn,
  onRestart,
}: {
  mfaToken: string;
  onSignedIn: (user: UserDto) => void;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const { completeMfa } = useAuth();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError(useRecovery ? t("mfa.enterRecoveryCode") : t("mfa.enterCode"));
      return;
    }
    setSubmitting(true);
    try {
      onSignedIn(await completeMfa(mfaToken, trimmed));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setEnded(err.message);
      else if (err instanceof ApiError && err.status === 400) setError(t("mfa.wrongCode"));
      else setError(err instanceof ApiError ? err.message : t("mfa.genericError"));
      setSubmitting(false);
    }
  }

  if (ended) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>{t("mfa.title")}</Text>
        <Text style={styles.error} accessibilityRole="alert">
          {ended}
        </Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={onRestart}>
          <Text style={styles.buttonText}>{t("mfa.startAgain")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("mfa.title")}</Text>
      <Text style={styles.subtitle}>
        {useRecovery ? t("mfa.recoverySubtitle") : t("mfa.subtitle")}
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>
          {useRecovery ? t("mfa.recoveryCodeLabel") : t("mfa.codeLabel")}
        </Text>
        <TextInput
          key={useRecovery ? "recovery" : "totp"}
          accessibilityLabel={useRecovery ? t("mfa.recoveryCodeLabel") : t("mfa.codeLabel")}
          style={styles.input}
          value={code}
          onChangeText={setCode}
          autoFocus
          autoCorrect={false}
          autoCapitalize={useRecovery ? "characters" : "none"}
          keyboardType={useRecovery ? "default" : "number-pad"}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={useRecovery ? 20 : 7}
        />
      </View>

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>{submitting ? t("mfa.verifying") : t("mfa.verify")}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        style={styles.switch}
        onPress={() => {
          setUseRecovery((v) => !v);
          setCode("");
          setError(null);
        }}
      >
        <Text style={styles.linkText}>{useRecovery ? t("mfa.useApp") : t("mfa.useRecovery")}</Text>
      </Pressable>
      <Text style={styles.hint}>{t("mfa.lostBoth")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  title: { fontSize: 28, fontWeight: "600", color: theme.colors.textPrimary },
  subtitle: { fontSize: 15, color: theme.colors.textSecondary },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500", color: theme.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    letterSpacing: 2,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
  error: { ...errorMarker, fontSize: 14 },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.primaryForeground, fontSize: 16, fontWeight: "600" },
  switch: { minHeight: 44, justifyContent: "center" },
  linkText: { color: theme.colors.success, fontWeight: "500" },
  hint: { fontSize: 13, color: theme.colors.textSecondary },
});
