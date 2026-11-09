# 0017: Engagement webviews use a non-persistent store; their state lives in state/kv

- **Status:** Accepted (2026-11-08). Approved by the owner on 2026-11-08 with the F1 plan; accepted on 2026-11-08, when the delta review of revisions 5 to 5g of the F1 design passed. With the F1 design (section 7). Meets D19 without D30's macOS 14 minimum; the mechanism (design O3) was approved with the plan.
- **Revisions:** 2026-11-08 first version; revised the same day after the adversarial review (M3, B3, minor 3).
- **Context:**
  - D19 requires webview storage separate per profile.
  - On macOS, WebKit keeps data per bundle id. wry's `data_store_identifier` needs macOS 14, and below it silently falls back to the shared default store (`wry-0.54.2/src/wkwebview/mod.rs`).
  - ADE already makes `state/kv` the source of truth for every persisted key (`src/lib/persistence.ts`) and uses no IndexedDB, cookies, Cache Storage or sessionStorage.
- **Decision:**
  - Every window of an engagement instance is made with `incognito(true)`: a non-persistent WebKit store, WebView2 InPrivate, or an ephemeral WebKitGTK context. On Windows it also gets `data_directory(<root>/webview)`. On Linux wry ignores `data_directory` under incognito (`wry-0.54.2/src/webkitgtk/mod.rs:255`), so it is not passed; WebKitGTK and Mesa caches follow `XDG_CACHE_HOME`, which is `<root>/cache` in an engagement.
  - Every `NSWindow` in every profile gets `setRestorable: NO` (tao 0.34.5 answers YES to secure restorable state and never sets it), so no window title reaches `~/Library/Saved Application State/<bundle id>.savedState/`. As a second guard, `ApplePersistenceIgnoreState = YES` is registered in the app's registration domain (`registerDefaults:`, nothing written to disk) before launch finishes, in every profile (revision 3, minor 9).
  - Every window is created in Rust, the main window and detached windows included. `detachWindow.ts`'s JavaScript `new WebviewWindow` is replaced by a command, and `core:webview:allow-create-webview-window` is dropped.
  - The default profile keeps the persistent default store.
  - A static test requires every `localStorage` key to be persisted or listed as ephemeral, with a reason.
- **Consequences:**
  - No macOS minimum, and no outside-the-root store to delete in PE-12.
  - **Measured on macOS (design E7.2):** a non-persistent `WKWebView` wrote no web data and no marker; the OS still created `$(getconf DARWIN_USER_CACHE_DIR)<bundle id>/com.apple.metalfe/` (and, for ADE, `com.apple.metal/<n>_<n>/functions.{data,list}`), shared per bundle id and holding no engagement data. These are named exemption patterns in the isolation test (owner-approved grammar, design O8) and must hold no marker. Revision 1's "writes nothing persistent" was wrong.
  - Windows (WebView2 InPrivate) and Linux (ephemeral WebKitGTK) are measured by the same probe on wry in slice 0; each finding becomes an owner-approved exemption or a fix before slice 1.
  - Saved window state is not exempt: the isolation test requires the `.savedState` folder to be absent.
  - Non-persisted localStorage keys reset when an engagement instance restarts.
