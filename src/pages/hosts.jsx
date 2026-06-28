import Icons from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupButton,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import DashboardLayout from "@/layouts/dashboard";
import {
  ClipboardIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Server,
  ServerCog,
  ServerCogIcon,
  TerminalIcon,
  TrashIcon,
  UserIcon,
  Save,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { invoke } from "@tauri-apps/api/core";

export default function Hosts() {
  const [hosts, setHosts] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  
  const [showPassword, setShowPassword] = React.useState(false);
  const [openAddHosts, setOpenAddHosts] = React.useState(false);

  // Form & Sheet Mode States
  const [sheetMode, setSheetMode] = React.useState("add"); // "add" | "edit"
  const [selectedHost, setSelectedHost] = React.useState(null);
  const [hostName, setHostName] = React.useState("");
  const [hostAddress, setHostAddress] = React.useState("");
  const [hostPort, setHostPort] = React.useState("22");
  const [hostUsername, setHostUsername] = React.useState("");
  const [hostPassword, setHostPassword] = React.useState("");

  const handleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const loadHosts = async () => {
    try {
      const list = await invoke("get_hosts");
      setHosts(list || []);
    } catch (err) {
      console.error("Failed to load hosts:", err);
    }
  };

  React.useEffect(() => {
    loadHosts();
  }, []);

  const handleAddHost = async () => {
    if (!hostAddress || !hostUsername) {
      alert("Address and Username are required.");
      return;
    }

    const entry = {
      id: sheetMode === "edit" ? selectedHost.id : 0,
      name: hostName || hostAddress,
      address: hostAddress,
      port: parseInt(hostPort) || 22,
      username: hostUsername,
      password: hostPassword || null,
      key_id: null,
      created_at: sheetMode === "edit" ? selectedHost.created_at : new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString().split("T")[0],
      os: "Linux",
    };

    try {
      await invoke("add_host", { entry });
      setOpenAddHosts(false);
      clearForm();
      loadHosts();
    } catch (err) {
      alert("Failed to save host: " + err);
    }
  };


  const clearForm = () => {
    setHostName("");
    setHostAddress("");
    setHostPort("22");
    setHostUsername("");
    setHostPassword("");
    setSelectedHost(null);
  };

  const filteredHosts = hosts.filter((h) =>
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row gap-2 items-center justify-between">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput 
              placeholder="Search hosts" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>
          <div className="flex flex-col gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSheetMode("add");
                    clearForm();
                    setOpenAddHosts(true);
                  }}
                >
                  <PlusIcon />
                  <span>Add Hosts</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Add New Hosts</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {filteredHosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-sidebar border rounded-lg">
            <ServerCogIcon className="size-8 text-muted-foreground mb-2 animate-bounce" />
            <p className="text-sm font-medium text-foreground">No hosts found</p>
            <p className="text-xs text-muted-foreground">Add a secure SSH host connection to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredHosts.map((host, index) => (
              <div
                className="border bg-sidebar rounded-lg px-3 py-2 flex flex-row gap-2"
                key={index}
              >
                <div className="size-10 bg-primary/30 rounded-md flex items-center justify-center shrink-0 border border-primary/50">
                  <ServerCogIcon className="size-5 text-primary-foreground" />
                </div>
                <div className="flex flex-col space-y-1 items-start justify-center flex-1">
                  <p className="text-sm font-medium leading-none text-foreground">
                    {host.name}
                  </p>
                  <p className="text-xs leading-none text-foreground/80">
                    {host.username}@{host.address}:{host.port}
                  </p>
                </div>
                <div className="flex flex-col space-y-1 items-end justify-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-xs"
                        variant="outline"
                        className="rounded-xs cursor-pointer"
                      >
                        <MoreHorizontalIcon className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="bottom"
                      align="end"
                      className="rounded-xs w-fit px-2 space-y-1"
                    >
                      <DropdownMenuItem className="cursor-pointer">
                        <TerminalIcon className="size-3.5" />
                        <span className="text-sm text-muted-foreground shrink-0">Connect to Host</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="cursor-pointer"
                        onSelect={() => {
                          setSelectedHost(host);
                          setHostName(host.name);
                          setHostAddress(host.address);
                          setHostPort(host.port.toString());
                          setHostUsername(host.username);
                          setHostPassword(host.password || "");
                          setSheetMode("edit");
                          setOpenAddHosts(true);
                        }}
                      >
                        <EditIcon className="size-3.5" />
                        <span className="text-sm text-muted-foreground shrink-0">Edit</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={openAddHosts} onOpenChange={(open) => !open && clearForm() || setOpenAddHosts(open)}>
        <SheetContent className="rounded-l-xl overflow-hidden flex flex-col h-full">
          <SheetHeader className="bg-muted">
            <SheetTitle>
              {sheetMode === "add" ? "Add Hosts" : "Edit Host"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "add" ? "Manage Hosts" : "Modify host connection details."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 py-2 px-3">
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <Label>Host Name</Label>
              <Input 
                placeholder="My Staging Server" 
                className="bg-background"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
              />
            </div>
            
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <Label>Address</Label>
              <div className="flex items-center gap-2">
                <div className="size-10 bg-primary rounded-full flex items-center justify-center shrink-0">
                  <Server className="size-5.5 text-primary-foreground" />
                </div>
                <Input 
                  placeholder="Server Address (e.g. 192.168.1.50)" 
                  className="bg-background"
                  value={hostAddress}
                  onChange={(e) => setHostAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-3">
              <div className="flex items-center gap-2 border-b pb-3 justify-between">
                <div className="size-10 bg-primary rounded-full flex items-center justify-center shrink-0">
                  <ServerCog className="size-5.5 text-primary-foreground" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">SSH Port</Label>
                  <Input
                    placeholder="22"
                    className="w-16 placeholder:text-center text-center no-spinner bg-background"
                    type="number"
                    value={hostPort}
                    onChange={(e) => setHostPort(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Label>Credentials</Label>
                <div className="flex flex-col space-y-4">
                  <InputGroup className="bg-background">
                    <InputGroupAddon>
                      <UserIcon />
                    </InputGroupAddon>
                    <InputGroupInput 
                      placeholder="Username" 
                      value={hostUsername}
                      onChange={(e) => setHostUsername(e.target.value)}
                    />
                  </InputGroup>
                  <InputGroup className="bg-background">
                    <InputGroupAddon>
                      <LockIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder="Password (optional)"
                      type={showPassword ? "text" : "password"}
                      value={hostPassword}
                      onChange={(e) => setHostPassword(e.target.value)}
                    />
                    <InputGroupButton type="button" onClick={handleShowPassword}>
                      {showPassword ? (
                        <EyeIcon className="size-4" />
                      ) : (
                        <EyeOffIcon className="size-4" />
                      )}
                    </InputGroupButton>
                  </InputGroup>
                </div>
              </div>
            </div>
          </div>
          <SheetFooter className="bg-muted flex-row gap-2 py-2.5 px-3">
            <Button className="flex-1" onClick={handleAddHost}>
              <Save />
              Save Host
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                setOpenAddHosts(false);
                clearForm();
              }}
            >
              <X />
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
