import { Panel, Group, Separator } from "react-resizable-panels";
import type { PaneNode } from "../stores/tabStore";
import TerminalPane from "./TerminalPane";

interface PaneContainerProps {
  node: PaneNode;
  tabId: string;
}

export default function PaneContainer({ node, tabId }: PaneContainerProps) {
  if (node.type === "pane") {
    return <TerminalPane paneId={node.pane.id} tabId={tabId} />;
  }

  const direction = node.direction === "horizontal" ? "horizontal" : "vertical";

  return (
    <Group orientation={direction}>
      {node.children.map((child, i) => (
        <div key={i} className="contents">
          {i > 0 && (
            <Separator
              className="group"
              style={{
                width: direction === "horizontal" ? "6px" : undefined,
                height: direction === "vertical" ? "6px" : undefined,
                backgroundColor: "transparent",
                cursor: direction === "horizontal" ? "col-resize" : "row-resize",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--accent-subtle)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div
                style={{
                  width: direction === "horizontal" ? "2px" : "32px",
                  height: direction === "horizontal" ? "32px" : "2px",
                  borderRadius: "1px",
                  backgroundColor: "var(--border-strong)",
                  transition: "background-color 0.15s ease",
                }}
              />
            </Separator>
          )}
          <Panel minSize={10}>
            <PaneContainer node={child} tabId={tabId} />
          </Panel>
        </div>
      ))}
    </Group>
  );
}
