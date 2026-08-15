import { useState } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { registerSchema } from "@embr/validation";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api-client";

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setFormError(null);
    setFieldError(undefined);

    const parsed = registerSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data.email, parsed.data.password);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("register.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>{t("register.checkEmailTitle")}</Text>
          <Text style={styles.body}>{t("register.checkEmailBody", { email })}</Text>
          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>{t("register.goToLogin")}</Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>{t("register.title")}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("register.emailLabel")}</Text>
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

        <View style={styles.field}>
          <Text style={styles.label}>{t("register.passwordLabel")}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
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
            {submitting ? t("register.submitting") : t("register.submit")}
          </Text>
        </Pressable>

        <Link href="/login" style={styles.link}>
          <Text>
            {t("register.alreadyHaveAccount")}{" "}
            <Text style={styles.linkText}>{t("register.logIn")}</Text>
          </Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 8 },
  body: { fontSize: 16, color: "#374151", lineHeight: 22 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: { color: "#DC2626", fontSize: 14 },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { marginTop: 8, alignSelf: "center" },
  linkText: { color: "#2563EB", fontWeight: "500" },
});
