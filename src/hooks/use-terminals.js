import React from "react";
import { TerminalContext } from "@/provider/terminal-provider";

export function useTerminals() {
  const ctx = React.useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminals must be used within TerminalProvider");
  }
  return ctx;
}
