import { describe, expect, it } from "vitest";
import { pluginInstallCommand } from "../AntiSlopTab";
import { traceCommand } from "../ContractsWorkbench";
import { tokenizeFish, tokenizePosix } from "../../lib/__tests__/shellTokenize";

describe("commands typed from components", () => {
  it("the plugin and trace commands are fish-safe", () => {
    // A home folder with a space, a quote after a backslash, and things that expand in double quotes.
    const marketplace = "/Users/a b/it\\'s $HOME `touch X`/.ade/plugin";
    const install = pluginInstallCommand(marketplace, false);
    for (const tokenize of [tokenizeFish, tokenizePosix]) {
      expect(tokenize(install)).toEqual([
        "claude", "plugin", "marketplace", "add", marketplace, ";",
        "claude", "plugin", "install", "ade@ade", "--scope", "user",
      ]);
    }

    // Names come from the project's source files, so they are untrusted.
    const contract = "Vault\\'; touch X; #";
    const test = "test_it's";
    const trace = traceCommand(contract, test);
    for (const tokenize of [tokenizeFish, tokenizePosix]) {
      expect(tokenize(trace)).toEqual([
        "forge", "test", "--match-contract", `^${contract}$`, "--match-test", `^${test}\\(`, "-vvvv",
      ]);
    }
  });

  it("forge gets the same regex as before for an ordinary name", () => {
    expect(tokenizePosix(traceCommand("Vault", "test_deposit"))).toEqual([
      "forge", "test", "--match-contract", "^Vault$", "--match-test", "^test_deposit\\(", "-vvvv",
    ]);
  });
});
