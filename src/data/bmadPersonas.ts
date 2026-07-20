export interface BmadPersona {
  id: string;
  title: string;
  command: string; // typed into the terminal to activate the agent
}

export const BMAD_PERSONAS: BmadPersona[] = [
  { id: "analyst",   title: "Analyst",         command: "/BMad:agents:analyst" },
  { id: "pm",        title: "Product Manager", command: "/BMad:agents:pm" },
  { id: "ux-expert", title: "UX Expert",       command: "/BMad:agents:ux-expert" },
  { id: "architect", title: "Architect",       command: "/BMad:agents:architect" },
  { id: "po",        title: "Product Owner",   command: "/BMad:agents:po" },
  { id: "sm",        title: "Scrum Master",    command: "/BMad:agents:sm" },
  { id: "dev",       title: "Developer",       command: "/BMad:agents:dev" },
  { id: "qa",        title: "QA",              command: "/BMad:agents:qa" },
];

export const BMAD_PHASES = ["Planning", "Dev cycle"] as const;
