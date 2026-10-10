import type { Gate } from "./bmadGates";
import { storyView, type StoryView } from "./storyState";
import type { StoryStatus } from "./bmadStories";
import type { Ticket } from "./bmadTicketTree";

/** v6 status → the board's story statuses. blocked/dropped have no v4 word;
 * they pass through rawStatus so the board shows what the plan actually said. */
export const TICKET_STATUS_TO_STORY: Record<string, StoryStatus> = {
  draft: "Draft", "ready-for-dev": "Draft",
  "in-progress": "InProgress", "in-review": "Review",
  built: "Done", done: "Done",
};

export function ticketView(ticket: Ticket, gates: Gate[]): StoryView {
  const status = ticket.status ? TICKET_STATUS_TO_STORY[ticket.status] ?? "unknown" : "Draft";
  return storyView(
    {
      file: ticket.file ?? "",
      id: ticket.id,
      title: ticket.title,
      status,
      rawStatus: ticket.status ?? "",
      acceptanceCriteria: ticket.acceptanceCriteria,
    },
    gates,
  );
}
