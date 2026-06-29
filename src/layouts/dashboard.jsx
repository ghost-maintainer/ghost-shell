import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { useTheme } from "@/provider/theme-provider";
import { useSecurity } from "@/provider/security-provider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  LogOut,
  User,
  Key,
} from "lucide-react";
import logo from "@/assets/app-icon.png";
import Icons from "@/components/icons";
import { useLocation, useNavigate } from "react-router-dom";
import React from "react";
import { invoke } from "@/lib/tauri";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openWebsite } from "@/lib/utils";
import { env } from "@/config/env";
import { useTerminals } from "@/hooks/use-terminals";
import { cn } from "@/lib/utils";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

export default function DashboardLayout({ children, sidebar = true }) {
  const { theme, setTheme } = useTheme();
  const { wipeData } = useSecurity();
  const { sessions, activeId, setActive, closeSession } = useTerminals();
  const [showWipeConfirm, setShowWipeConfirm] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const terminalActive = Boolean(activeId);

  const [userEmail, setUserEmail] = React.useState("");
  const [isOnline, setIsOnline] = React.useState(false);

  React.useEffect(() => {
    invoke("get_cloud_status")
      .then((cfg) => {
        if (cfg) {
          setUserEmail(cfg.user_email || "");
          setIsOnline(Boolean(cfg.session_token && !cfg.is_offline));
        }
      })
      .catch(() => {});
  }, [location.pathname]); // refetch on navigation in case they just logged in

  const handleLogout = async () => {
    try {
      await invoke("logout_supabase").catch(() => {});
      await wipeData();
    } catch (err) {
      console.error("Logout and wipe failed:", err);
    }
  };

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
  ];
  const handleNavigate = (href) => {
    setActive(null);
    navigate(href);
  };

  const headerRef = React.useRef(null);
  const [visibleTabCount, setVisibleTabCount] = React.useState(10);

  React.useEffect(() => {
    if (sessions.length === 0) return;
    const calculateVisible = () => {
      if (!headerRef.current) return;
      const containerWidth = headerRef.current.getBoundingClientRect().width;

      const isMac =
        typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
      const staticWidth = (isMac ? 72 : 12) + 170 + 36 + 160 + 30;
      const available = containerWidth - staticWidth;

      const maxTabs = Math.max(1, Math.floor(available / 110));
      setVisibleTabCount(maxTabs);
    };

    calculateVisible();
    const observer = new ResizeObserver(calculateVisible);
    if (headerRef.current) {
      observer.observe(headerRef.current);
    }
    window.addEventListener("resize", calculateVisible);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", calculateVisible);
    };
  }, [sessions.length]);

  const visibleSessions = React.useMemo(() => {
    if (sessions.length <= visibleTabCount) return sessions;

    const activeIndex = sessions.findIndex((s) => s.id === activeId);
    if (activeIndex === -1 || activeIndex < visibleTabCount) {
      return sessions.slice(0, visibleTabCount);
    }

    const list = sessions.slice(0, visibleTabCount);
    list[visibleTabCount - 1] = sessions[activeIndex];
    return list;
  }, [sessions, activeId, visibleTabCount]);

  const hiddenSessions = React.useMemo(() => {
    if (sessions.length <= visibleTabCount) return [];
    const visibleIds = new Set(visibleSessions.map((s) => s.id));
    return sessions.filter((s) => !visibleIds.has(s.id));
  }, [sessions, visibleSessions, visibleTabCount]);

  const tabsClass = `text-xs flex flex-row items-center justify-center gap-1.5 px-3 py-2 pb-1 border rounded-t-sm border-b-0 data-[active=true]:bg-primary/20 max-w-[140px] min-w-[60px] truncate shrink`;

  return (
    <div className="flex flex-col h-svh">
      <header
        ref={headerRef}
        className={cn(
          "h-10 border-b border-primary dark:border-muted bg-sidebar flex items-center justify-between",
          IS_MAC ? "pl-18" : "pl-3",
        )}
        data-tauri-drag-region
      >
        <section
          className="flex items-center justify-start flex-1 pr-3 min-w-0 h-full py-0"
          data-tauri-drag-region
        >
          <div
            className="flex flex-1 flex-row gap-2 min-w-0 mt-auto"
            data-tauri-drag-region
          >
            {TABS_ITEMS.map((item, index) => {
              return (
                <button
                  key={index}
                  type="button"
                  data-tauri-drag-region={false}
                  className={tabsClass}
                  onClick={() => handleNavigate(item.href)}
                  data-active={
                    !activeId && location.pathname.startsWith(item.href)
                  }
                >
                  <item.icon className="size-3 my-auto" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
            {visibleSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                data-tauri-drag-region={false}
                className={tabsClass}
                onClick={() => setActive(session.id)}
                data-active={activeId === session.id}
              >
                <span
                  className={`size-2 my-auto rounded-full shrink-0 ${
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
                  className="opacity-60 hover:opacity-100 ml-0.5 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(session.id);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
            {hiddenSessions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-tauri-drag-region={false}
                    className="text-xs flex flex-row items-center justify-center gap-1.5 px-3 py-2 pb-1 border rounded-t-sm border-b-0 hover:bg-muted shrink-0 cursor-pointer"
                  >
                    <span className="font-semibold text-primary">
                      +{hiddenSessions.length} more
                    </span>
                    <svg
                      className="size-3 my-auto"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {hiddenSessions.map((session) => (
                    <DropdownMenuItem
                      key={session.id}
                      onClick={() => setActive(session.id)}
                      className={cn(
                        "flex items-center justify-between text-xs gap-2 py-1.5 cursor-pointer",
                        activeId === session.id
                          ? "bg-accent font-semibold"
                          : "",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
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
                        <span className="truncate">{session.title}</span>
                      </div>
                      <span
                        role="button"
                        className="opacity-60 hover:opacity-100 px-1 py-0.5 font-bold hover:text-red-500 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeSession(session.id);
                        }}
                      >
                        ×
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                data-tauri-drag-region={false}
                className="rounded-xs cursor-pointer shrink-0"
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
        <section
          className="flex items-center justify-end gap-2 pr-2 shrink-0"
          data-tauri-drag-region={false}
        >
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="xs"
                  className="cursor-pointer"
                  onClick={() => setTheme("light")}
                >
                  <SunIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="py-1 rounded-xs">
                <p className="text-xs">Light Mode</p>
              </TooltipContent>
            </Tooltip>
            <ButtonGroupSeparator />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="xs"
                  className="cursor-pointer"
                  onClick={() => setTheme("dark")}
                >
                  <MoonIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="py-1 rounded-xs">
                <p className="text-xs">Dark Mode</p>
              </TooltipContent>
            </Tooltip>
            <ButtonGroupSeparator />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  size="xs"
                  className="cursor-pointer"
                  onClick={() => setTheme("system")}
                >
                  <MonitorIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="py-1 rounded-xs">
                <p className="text-xs">System Mode</p>
              </TooltipContent>
            </Tooltip>
          </ButtonGroup>
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-row items-center justify-center size-8 hover:bg-muted/40 transition-colors border border-border outline-none text-left gap-2 min-w-0 rounded-full text-muted-foreground bg-background cursor-pointer"
                  >
                    <User className="size-3.5 my-auto" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent
                align="end"
                side="bottom"
                className="rounded-xs w-48 px-2 py-1.5 space-y-1"
              >
                {isOnline ? (
                  <DropdownMenuItem
                    onClick={() => navigate("/dashboard/password-update")}
                    className="cursor-pointer gap-2 py-1.5 text-xs"
                  >
                    <Key className="size-3.5 my-auto" />
                    <span>Password Update</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => navigate("/dashboard/login")}
                    className="cursor-pointer gap-2 py-1.5 text-xs font-semibold text-primary"
                  >
                    <User className="size-3.5 my-auto" />
                    <span>Sign In / Sync</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => navigate("/dashboard/master-password")}
                  className="cursor-pointer gap-2 py-1.5 text-xs"
                >
                  <LockIcon className="size-3.5 my-auto" />
                  <span>Master Password</span>
                </DropdownMenuItem>
                <div className="border-t my-1" />
                <DropdownMenuItem
                  onClick={() => navigate("/dashboard/export-data")}
                  className="cursor-pointer gap-2 py-1.5 text-xs"
                >
                  <Download className="size-3.5 my-auto" />
                  <span>Export Data</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/dashboard/import-data")}
                  className="cursor-pointer gap-2 py-1.5 text-xs"
                >
                  <Upload className="size-3.5 my-auto" />
                  <span>Import Data</span>
                </DropdownMenuItem>
                <div className="border-t my-1" />
                <DropdownMenuItem
                  onClick={() => setShowWipeConfirm(true)}
                  className="cursor-pointer gap-2 py-1.5 text-xs text-destructive hover:text-destructive"
                >
                  <LogOut className="size-3.5 my-auto" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent className="py-1 rounded-xs">
              <p className="text-xs">Manage Account</p>
            </TooltipContent>
          </Tooltip>
        </section>
      </header>

      <div
        id="app-content"
        className={cn(
          "flex-1 min-h-0 min-w-0 flex flex-col",
          terminalActive ? "overflow-hidden" : "",
        )}
      >
        {sidebar ? (
          <div
            className={cn(
              "flex flex-1 min-h-0 min-w-0 flex-row",
              terminalActive ? "" : "p-3 gap-3",
            )}
          >
            {!terminalActive && (
              <aside className="w-48 h-full rounded-sm border bg-sidebar overflow-hidden flex flex-col shrink-0">
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
                <div className="mt-auto"></div>
              </aside>
            )}
            <main
              id="app-main"
              className={cn(
                "flex-1 min-h-0 min-w-0",
                terminalActive ? "hidden" : "",
              )}
            >
              {children}
            </main>
          </div>
        ) : (
          <main
            id="app-main"
            className={cn(
              "flex-1 min-h-0 min-w-0",
              terminalActive ? "hidden" : "p-3",
            )}
          >
            {children}
          </main>
        )}
      </div>

      {showWipeConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="border bg-sidebar p-6 rounded-xl max-w-md w-full shadow-lg space-y-4 m-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-destructive">
              Logout & Clear Local Data?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to log out? This will completely wipe all
              local hosts, credentials, and terminal logs from this device. Your
              remote database data in Supabase remains safe.
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
                  handleLogout();
                }}
              >
                Logout and Wipe Local
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
