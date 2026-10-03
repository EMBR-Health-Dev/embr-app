// Image imports (Metro in the app, Vite in tests). Expo declares these in
// the generated, gitignored expo-env.d.ts; this keeps typecheck working
// without it, for example in CI.
declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";
  const source: ImageSourcePropType;
  export default source;
}
