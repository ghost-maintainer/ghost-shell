import React from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SearchIcon,
  TerminalIcon,
  ClockIcon,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  listSessionHistory,
  previewLog,
  deleteSessionLog,
  triggerLogSync,
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
  const navigate = useNavigate();
  const [records, setRecords] = React.useState([]);
  const [search, setSearch] = React.useState("");

  const refresh = React.useCallback(() => {
    setRecords(listSessionHistory());
  }, []);

  React.useEffect(() => {
    refresh();
    triggerLogSync().catch(() => {});

    const handleSynced = () => {
      refresh();
    };
    window.addEventListener("logs-synced", handleSynced);
    const timer = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("logs-synced", handleSynced);
      clearInterval(timer);
    };
  }, [refresh]);

  const handleDelete = (id, e) => {
    e?.stopPropagation();
    deleteSessionLog(id);
    refresh();
  };

  const filtered = records.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.hostName?.toLowerCase().includes(q) ||
      r.hostAddress?.toLowerCase().includes(q) ||
      r.username?.toLowerCase().includes(q) ||
      r.preview?.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col gap-4 min-h-0">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="relative w-full max-w-sm">
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
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 ">
              {filtered.map((record) => (
                <div
                  key={record.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/dashboard/log-details/${record.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigate(`/dashboard/log-details/${record.id}`);
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
                    <div className="flex items-center gap-2 shrink-0">
                      {record.syncStatus === "uploading" && (
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                      )}
                      {record.syncStatus === "done" && (
                        <span className="size-2 rounded-full bg-green-500 shrink-0" title="Synced to cloud" />
                      )}
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
                    {previewLog(record.preview || "") || "No output yet"}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3" />
                      {formatDate(record.startedAt)}
                    </span>
                    <span>
                      {formatDuration(record.startedAt, record.endedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
