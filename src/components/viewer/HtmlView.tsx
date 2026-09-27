/**
 * Static render of an HTML file. The iframe sandbox has no allow-scripts and
 * no allow-same-origin, so the page can't run code or reach Tauri IPC — use
 * the Preview panel (Cmd+Shift+B) or a Browser tab for pages that need JS.
 */
export default function HtmlView({ content }: { content: string }) {
  return (
    <iframe
      title="HTML preview"
      sandbox=""
      srcDoc={content}
      style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#fff" }}
    />
  );
}
