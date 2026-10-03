import { Image, StyleSheet } from "react-native";
import wordmark from "../assets/embr-wordmark.png";

// Generated with every other logo file by scripts/brand/build-brand-assets.cjs.
// 403 x 96 source pixels; drawn 15 points tall, as on the web.
const HEIGHT = 15;
const WIDTH = (403 / 96) * HEIGHT;

/** The EMBR wordmark, shown above the title of each screen before sign in. */
export function BrandWordmark() {
  return (
    <Image
      source={wordmark}
      style={styles.wordmark}
      accessible
      accessibilityRole="image"
      accessibilityLabel="EMBR"
    />
  );
}

const styles = StyleSheet.create({
  wordmark: { width: WIDTH, height: HEIGHT, marginBottom: 20 },
});
