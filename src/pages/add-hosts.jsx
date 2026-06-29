import React from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import DashboardLayout from "@/layouts/dashboard";
import { SearchIcon, Server, Terminal, Play } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTerminals } from "@/hooks/use-terminals";
import { Button } from "@/components/ui/button";

export default function AddHosts() {
  const { openSession } = useTerminals();
  const [hosts, setHosts] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [hostStatuses, setHostStatuses] = React.useState({});

  const loadHosts = async () => {
    try {
      const list = await invoke("get_hosts");
      setHosts(list || []);
      // Check reachability for all hosts
      list.forEach((h) => {
        setHostStatuses((prev) => ({ ...prev, [h.id]: "checking" }));
        checkReachability(h);
      });
    } catch (err) {
      console.error("Failed to load hosts:", err);
    }
  };

  const checkReachability = async (host) => {
    try {
      const online = await invoke("check_host_reachability", {
        address: host.address,
        port: host.port,
      });
      setHostStatuses((prev) => ({
        ...prev,
        [host.id]: online ? "online" : "offline",
      }));
    } catch {
      setHostStatuses((prev) => ({
        ...prev,
        [host.id]: "offline",
      }));
    }
  };

  React.useEffect(() => {
    loadHosts();
  }, []);

  const filteredHosts = hosts.filter((h) =>
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout sidebar={false}>
      <div className="mt-8 w-full max-w-4xl mx-auto space-y-6 px-4">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-foreground">Quick Launch Session</h2>
          <p className="text-xs text-muted-foreground">
            Select any stored host connection to quickly start a new terminal session.
          </p>
        </div>

        <InputGroup className="max-w-xl mx-auto h-11 rounded-full shadow-sm bg-sidebar">
          <InputGroupAddon>
            <SearchIcon className="size-5 text-muted-foreground ml-1" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search by name, address, or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-sm"
          />
        </InputGroup>

        <div className="h-[480px] rounded-xl border bg-sidebar/50 max-w-3xl mx-auto flex flex-col overflow-hidden shadow-inner">
          <div className="flex-1 overflow-y-auto p-6">
            {filteredHosts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <Server className="size-12 text-muted-foreground/30 mb-3 animate-pulse" />
                <p className="text-sm font-semibold text-foreground">
                  {hosts.length === 0 ? "No Hosts Stored" : "No Matching Hosts"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  {hosts.length === 0 
                    ? "Go to the Hosts page to add a new server connection." 
                    : "Try searching with a different host name, IP address, or user."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredHosts.map((host) => (
                  <div
                    key={host.id}
                    onClick={() => openSession(host)}
                    className="group border border-border/80 bg-sidebar hover:border-primary/50 rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                        <Terminal className="size-5 text-primary group-hover:text-primary-foreground transition-all duration-300" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground leading-none">
                            {host.name}
                          </span>
                          <span
                            className={`size-2 rounded-full shrink-0 ${
                              hostStatuses[host.id] === "online"
                                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                                : hostStatuses[host.id] === "offline"
                                  ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                                  : "bg-muted-foreground/40 animate-pulse"
                            }`}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground leading-none">
                          {host.username}@{host.address}:{host.port}
                        </p>
                      </div>
                    </div>
                    
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-all duration-200 rounded-lg size-7 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSession(host);
                      }}
                    >
                      <Play className="size-3.5 fill-current" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
