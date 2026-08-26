import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";

describe("Jest + jest-expo RN testing harness", () => {
  it("renders a basic React Native component and finds its text", async () => {
    const { getByText } = await render(
      <View>
        <Text>Hello from the RN test harness</Text>
      </View>,
    );

    expect(getByText("Hello from the RN test harness")).toBeTruthy();
  });
});
