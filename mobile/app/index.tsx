import { NOISE_PATTERN } from "@ade/protocol";
import { StyleSheet, Text, View } from "react-native";

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ADE Remote</Text>
      <Text style={styles.detail}>{NOISE_PATTERN}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  detail: { fontSize: 12, opacity: 0.6 },
});
