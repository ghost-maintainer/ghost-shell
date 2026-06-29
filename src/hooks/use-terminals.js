import React from "react";
import { TerminalContext } from "../context/terminal-context";

export function useTerminals() {
  const ctx = React.useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminals must be used within TerminalProvider");
  }
  return ctx;
}
