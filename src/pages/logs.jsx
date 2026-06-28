import React from "react";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SearchIcon,
  TerminalIcon,
  ClockIcon,
  ServerIcon,
  Trash2,
  PlugZap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTerminals } from "@/hooks/use-terminals";
import {
  listSessionHistory,
  previewLog,
  getSessionLog,
  deleteSessionLog,
  stripAnsi,
} from "@/lib/session-history";

function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function formatDuration(startedAt, endedAt) {
  if (!endedAt) return "Active";
  const mins = Math.round((endedAt - startedAt) / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

const STATUS_LABEL = {
  active: "Active",
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  closed: "Closed",
  error: "Error",
};

export default function Logs() {
  const { openSession } = useTerminals();
  const [records, setRecords] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(null);
  const [selectedLog, setSelectedLog] = React.useState(null);

  const refresh = React.useCallback(() => {
    setRecords(listSessionHistory());
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    if (!selectedId) {
      setSelectedLog(null);
      return;
    }
    setSelectedLog(getSessionLog(selectedId));
  }, [selectedId, records]);

  const handleDelete = (id, e) => {
    e?.stopPropagation();
    deleteSessionLog(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const handleReconnect = async (record) => {
    try {
      const hosts = await invoke("get_hosts");
      let host = hosts.find((h) => h.id === record.hostId);
      if (!host) {
        host = {
          id: record.hostId,
          name: record.hostName,
          address: record.hostAddress,
          port: record.port,
          username: record.username,
          key_id: record.key_id ?? null,
        };
      }
      openSession(host);
      setSelectedId(null);
    } catch (err) {
      console.error("Failed to reconnect:", err);
    }
  };

  const filtered = records.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.hostName?.toLowerCase().includes(q) ||
      r.hostAddress?.toLowerCase().includes(q) ||
      r.username?.toLowerCase().includes(q) ||
      r.log?.toLowerCase().includes(q)
    );
  });

  const selected = selectedLog;

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col gap-4 min-h-0">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Session Logs</h2>
            <p className="text-xs text-muted-foreground">
              Complete terminal output · auto-deleted after 7 days
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="Search sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border rounded-lg bg-muted/20 text-muted-foreground gap-2">
            <TerminalIcon className="size-8 opacity-40" />
            <p className="text-sm">No session logs yet</p>
            <p className="text-xs">Connect to a host to start recording</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pb-2">
              {filtered.map((record) => (
                <div
                  key={record.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(record.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedId(record.id);
                    }
                  }}
                  className="text-left border rounded-lg p-4 bg-card hover:bg-muted/40 transition-colors space-y-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {record.hostName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {record.username}@{record.hostAddress}:{record.port}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          record.status === "active" ||
                          record.status === "connected"
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : record.status === "error"
                              ? "bg-red-500/15 text-red-600 dark:text-red-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABEL[record.status] ?? record.status}
                      </span>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDelete(record.id, e)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 font-mono">
                    {previewLog(record.log) || "No output yet"}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3" />
                      {formatDate(record.startedAt)}
                    </span>
                    <span>{formatDuration(record.startedAt, record.endedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl h-[85vh] flex flex-col border rounded-lg bg-background shadow-xl overflow-hidden">
            <div className="h-10 shrink-0 border-b bg-muted/80 px-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <ServerIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs font-medium truncate">
                  {selected?.hostName ?? "Session Log"}
                </span>
                <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                  {selected
                    ? `${selected.username}@${selected.hostAddress}:${selected.port} · ${formatDate(selected.startedAt)}`
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selected && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleReconnect(selected)}
                  >
                    <PlugZap className="size-3" />
                    Reconnect
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => handleDelete(selectedId)}
                >
                  <Trash2 className="size-3" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSelectedId(null)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-[#141414] p-4">
              <pre className="text-xs font-mono text-[#e5e5e5] whitespace-pre-wrap break-words leading-relaxed">
                {stripAnsi(selected?.log) || "No log content"}
              </pre>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
