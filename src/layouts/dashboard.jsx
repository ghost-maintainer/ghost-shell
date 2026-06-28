import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { useTheme } from "@/provider/theme-provider";
import { useSecurity } from "@/provider/security-provider";
import {
  Download,
  LogsIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  Trash2,
  Upload,
  ServerIcon,
  LockIcon,
  PlusIcon,
  Folders,
  SettingsIcon,
} from "lucide-react";
import logo from "@/assets/app-icon.png";
import Icons from "@/components/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openWebsite } from "@/lib/utils";
import { env } from "@/config/env";
import { useTerminals } from "@/hooks/use-terminals";

export default function DashboardLayout({ children, sidebar = true }) {
  const { theme, setTheme } = useTheme();
  const { lock, wipeData } = useSecurity();
  const { sessions, activeId, setActive, closeSession } = useTerminals();
  const [showWipeConfirm, setShowWipeConfirm] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const MENU_ITEMS = [
    {
      label: "Hosts",
      icon: ServerIcon,
      href: "/dashboard/hosts",
    },
    {
      label: "Keychain",
      icon: LockIcon,
      href: "/dashboard/keys",
    },
    {
      label: "Logs",
      icon: LogsIcon,
      href: "/dashboard/logs",
    },
    {
      label: "Settings",
      icon: SettingsIcon,
      href: "/dashboard/settings",
    }
  ];
  const TABS_ITEMS = [
    {
      label: "Hosts",
      icon: ServerIcon,
      href: "/dashboard/hosts",
    },
    {
      label: "SFTP",
      icon: Folders,
      href: "/dashboard/sftp",
    },
  ]
  const handleNavigate = (href) => {
    setActive(null);
    navigate(href);
  };
  return (
    <div className="flex flex-col h-svh overflow-hidden">
      <header
        className="h-10 border-b border-primary dark:border-muted bg-sidebar flex items-center justify-between pl-18"
        data-tauri-drag-region
      >
        <section
          className="flex items-center justify-start py-2 flex-1 pr-3 h-full"
          data-tauri-drag-region
        >
          <div
            className="flex-1 mt-auto flex flex-row gap-2 overflow-x-auto min-w-0"
            data-tauri-drag-region
          >
            {TABS_ITEMS.map((item, index) => {
              return (
                <button
                  key={index}
                  className="text-xs px-2 py-2 bg-card leading-none rounded-t-sm flex flex-row items-center justify-center gap-1 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground cursor-pointer border-primary dark:border-muted  border data-[active=false]:border-b-background dark:data-[active=false]:border-b-sidebar pb-1.5 shrink-0"
                  onClick={() => handleNavigate(item.href)}
                  data-active={
                    !activeId && location.pathname.startsWith(item.href)
                  }
                >
                  <item.icon className="size-3" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
            {sessions.map((session) => (
              <button
                key={session.id}
                className="text-xs max-w-44 px-2 py-2 bg-card leading-none rounded-t-sm flex flex-row items-center justify-center gap-1.5 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground cursor-pointer border-primary dark:border-muted border data-[active=false]:border-b-background dark:data-[active=false]:border-b-sidebar pb-1.5 shrink-0 group"
                onClick={() => setActive(session.id)}
                data-active={activeId === session.id}
              >
                <span
                  className={`size-2 rounded-full shrink-0 ${
                    session.status === "connected"
                      ? "bg-green-500"
                      : session.status === "connecting"
                        ? "bg-yellow-400"
                        : session.status === "error"
                          ? "bg-red-500"
                          : "bg-zinc-400"
                  }`}
                />
                <span className="text-xs font-medium truncate">
                  {session.title}
                </span>
                <span
                  role="button"
                  className="opacity-60 hover:opacity-100 ml-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(session.id);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                className="rounded-xs cursor-pointer"
                onClick={() => handleNavigate("/dashboard/add-hosts")}
              >
                <PlusIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="py-1 rounded-xs">
              <p className="text-xs">Add Host</p>
            </TooltipContent>
          </Tooltip>
        </section>
        <section className="flex items-center justify-end gap-2 pr-2">
          <ButtonGroup>
            <Button
              variant={theme === "light" ? "default" : "outline"}
              size="xs"
              className="cursor-pointer"
              onClick={() => setTheme("light")}
            >
              <SunIcon />
            </Button>
            <ButtonGroupSeparator />
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="xs"
              className="cursor-pointer"
              onClick={() => setTheme("dark")}
            >
              <MoonIcon />
            </Button>
            <ButtonGroupSeparator />
            <Button
              variant={theme === "system" ? "default" : "outline"}
              size="xs"
              className="cursor-pointer"
              onClick={() => setTheme("system")}
            >
              <MonitorIcon />
            </Button>
          </ButtonGroup>
        </section>
      </header>
      {sidebar ? (
        <div className="h-[calc(100vh-40px)] p-3 flex flex-row gap-3">
          <aside className="w-48 h-full rounded-sm border bg-sidebar overflow-hidden flex flex-col">
            <div className="h-12 border-b bg-muted flex items-center px-4 gap-2">
              <img src={logo} alt="logo" className="w-10 h-10" />
              <h1 className="text-xl font-semibold">Ghost Shell</h1>
            </div>
            <div className="flex-1 px-2 py-4">
              <ul className="space-y-2">
                {MENU_ITEMS.map((item, index) => {
                  const active = location.pathname.startsWith(item.href);
                  return (
                    <li key={index}>
                      <Button
                        variant={active ? "default" : "outline"}
                        className="w-full rounded-xs justify-start gap-2"
                        onClick={() => handleNavigate(item.href)}
                      >
                        <item.icon className="size-3.5" />
                        <span className="text-sm font-medium">
                          {item.label}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="p-2 flex flex-col gap-1 items-center justify-center bg-muted">
              <Button
                variant={
                  location.pathname.startsWith("/dashboard/export-data")
                    ? "default"
                    : "outline"
                }
                className="w-full rounded-xs justify-start gap-2"
                onClick={() => handleNavigate("/dashboard/export-data")}
              >
                <Download />
                <span>Export Data</span>
              </Button>
              <Button
                variant={
                  location.pathname.startsWith("/dashboard/import-data")
                    ? "default"
                    : "outline"
                }
                className="w-full rounded-xs justify-start gap-2"
                onClick={() => handleNavigate("/dashboard/import-data")}
              >
                <Upload />
                <span>Import Data</span>
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xs justify-start gap-2"
                onClick={() => openWebsite(env.github)}
              >
                <Icons.github className="text-foreground size-4" />
                <span>Visit GitHub</span>
              </Button>
              <Button
                variant="destructive"
                className="w-full rounded-xs justify-start gap-2"
                onClick={() => setShowWipeConfirm(true)}
              >
                <Trash2 />
                <span className="text-xs">Wipe Data</span>
              </Button>
            </div>
          </aside>
          <main id="app-main" className="flex-1 min-h-0 min-w-0">
            {children}
          </main>
        </div>
      ) : (
        <main id="app-main" className="flex-1 p-3 min-h-0 min-w-0">
          {children}
        </main>
      )}
      {showWipeConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="border bg-sidebar p-6 rounded-xl max-w-md w-full shadow-lg space-y-4 m-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-destructive">
              Wipe All Secure Data?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you absolutely sure you want to proceed? This will permanently
              delete all your saved hosts, credentials, public/private keys, and
              encryption settings. This action is irreversible.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setShowWipeConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowWipeConfirm(false);
                  wipeData();
                }}
              >
                Wipe Everything
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
