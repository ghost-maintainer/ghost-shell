import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./css/main.css";
import "@xterm/xterm/css/xterm.css";
import { ThemeProvider } from "./provider/theme-provider";
import { TooltipProvider } from "./components/ui/tooltip";
import { initProductionGuards } from "./lib/production-guard";

initProductionGuards();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="ghost-shell-theme">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
