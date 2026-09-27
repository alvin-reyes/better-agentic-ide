# Draft for submission to homebrew/cask (Casks/b/better-terminal.rb).
# Fill `version` and both sha256 values with scripts/update-homebrew-cask.sh.
# Requirements before submitting: the .dmg files must be signed with a
# Developer ID and notarized (no quarantine workaround is allowed), and the
# repo must meet Homebrew's notability bar (75 stars, 30 forks or 30 watchers).
cask "better-terminal" do
  arch arm: "aarch64", intel: "x64"

  version "0.15.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/alvin-reyes/better-agentic-ide/releases/download/v#{version}/Better.Terminal_#{version}_#{arch}.dmg"
  name "Better Terminal"
  name "ADE"
  desc "Terminal for running and monitoring AI coding agents"
  homepage "https://github.com/alvin-reyes/better-agentic-ide"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :catalina"

  app "Better Terminal.app"

  zap trash: [
    "~/Library/Application Support/com.betterterminal.dev",
    "~/Library/Caches/com.betterterminal.dev",
    "~/Library/Preferences/com.betterterminal.dev.plist",
    "~/Library/Saved Application State/com.betterterminal.dev.savedState",
    "~/Library/WebKit/com.betterterminal.dev",
  ]
end
