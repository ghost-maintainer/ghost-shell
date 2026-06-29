import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, ServerIcon, ClockIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getSessionLog, deleteSessionLog, stripAnsi } from "@/lib/session-history";

function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export default function LogDetails() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = React.useState(null);
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const rec = getSessionLog(sessionId);
    if (!rec) {
      setLoading(false);
      return;
    }
    setRecord(rec);

    const logFileName = rec.logFileName || sessionId;
    invoke("get_session_log_content", { sessionId: logFileName })
      .then((txt) => {
        setContent(txt || "");
      })
      .catch((err) => {
        console.error("Failed to load session log content:", err);
        setContent("Failed to load session log content from disk.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId]);

  const handleDelete = () => {
    deleteSessionLog(sessionId);
    navigate("/dashboard/logs");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading session log...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!record) {
    return (
      <DashboardLayout>
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">Session log not found.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/logs")}>
            <ArrowLeft className="size-3.5 mr-1" /> Back to Logs
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col gap-4 min-h-0">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => navigate("/dashboard/logs")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate flex items-center gap-2">
                <ServerIcon className="size-3.5 text-muted-foreground" />
                {record.hostName}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {record.username}@{record.hostAddress}:{record.port}
              </p>
            </div>
          </div>

          <Button
            variant="destructive"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" />
            Delete Log
          </Button>
        </div>

        <div className="border bg-sidebar rounded-xl p-4 flex items-center gap-6 shrink-0 text-xs text-muted-foreground shadow-sm">
          <div className="flex items-center gap-1.5">
            <ClockIcon className="size-3.5" />
            <span>Started: {formatDate(record.startedAt)}</span>
          </div>
          {record.endedAt && (
            <div className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5" />
              <span>Ended: {formatDate(record.endedAt)}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-[#141414] border border-[#27272a] rounded-xl p-4">
          <pre className="text-xs font-mono text-[#e5e5e5] whitespace-pre-wrap break-words leading-relaxed">
            {stripAnsi(content) || "No log content recorded."}
          </pre>
        </div>
      </div>
    </DashboardLayout>
  );
}
