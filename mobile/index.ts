// This import must stay first. Hermes has no crypto.getRandomValues until it
// runs, and @ade/protocol takes its randomness only from there.
import "react-native-get-random-values";
import "expo-router/entry";
