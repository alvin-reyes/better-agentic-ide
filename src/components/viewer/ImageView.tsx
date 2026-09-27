import { imageMime } from "../../lib/viewerKind";

/** Renders an image from base64 file bytes, letterboxed inside the pane. */
export default function ImageView({ path, data }: { path: string; data: string }) {
  return (
    <div style={{
      height: "100%", overflow: "auto", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "16px", backgroundColor: "var(--bg-primary)",
    }}>
      <img
        src={`data:${imageMime(path)};base64,${data}`}
        alt={path.split("/").pop() ?? "image"}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
      />
    </div>
  );
}
