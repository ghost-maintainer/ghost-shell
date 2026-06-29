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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
  KeyIcon,
  Loader2,
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
import { useTerminals } from "@/hooks/use-terminals";

export default function Hosts() {
  const { openSession } = useTerminals();
  const [hosts, setHosts] = React.useState([]);
  const [keys, setKeys] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  
  const [showPassword, setShowPassword] = React.useState(false);
  const [openAddHosts, setOpenAddHosts] = React.useState(false);
  const [openGenerateKey, setOpenGenerateKey] = React.useState(false);

  // Form & Sheet Mode States
  const [sheetMode, setSheetMode] = React.useState("add"); // "add" | "edit"
  const [selectedHost, setSelectedHost] = React.useState(null);
  const [hostToDelete, setHostToDelete] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  
  const [hostName, setHostName] = React.useState("");
  const [hostAddress, setHostAddress] = React.useState("");
  const [hostPort, setHostPort] = React.useState("22");
  const [hostUsername, setHostUsername] = React.useState("");
  const [hostPassword, setHostPassword] = React.useState("");
  const [hostKeyId, setHostKeyId] = React.useState(null);
  
  const [keyDropdownOpen, setKeyDropdownOpen] = React.useState(false);
  const [hostStatuses, setHostStatuses] = React.useState({});

  // Generate Key Form States
  const [genName, setGenName] = React.useState("");
  const [genPassphrase, setGenPassphrase] = React.useState("");
  const [genSavePassphrase, setGenSavePassphrase] = React.useState(false);
  const [showGenPassphrase, setShowGenPassphrase] = React.useState(false);
  const [keyType, setKeyType] = React.useState("rsa");
  const [rsaKeySize, setRsaKeySize] = React.useState("4096");
  const [ecdsaKeySize, setEcdsaKeySize] = React.useState("521");

  const [loading, setLoading] = React.useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = React.useState(false);

  const handleShowPassword = () => {
    setShowPassword(!showPassword);
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

  const loadHosts = async () => {
    try {
      const list = await invoke("get_hosts");
      setHosts(list || []);
      list.forEach((h) => {
        setHostStatuses((prev) => ({ ...prev, [h.id]: "checking" }));
        checkReachability(h);
      });
    } catch (err) {
      console.error("Failed to load hosts:", err);
    }
  };

  const loadKeys = async () => {
    try {
      const list = await invoke("get_keys");
      setKeys(list || []);
    } catch (err) {
      console.error("Failed to load keys:", err);
    }
  };

  React.useEffect(() => {
    loadHosts();
    loadKeys();
  }, []);

  React.useEffect(() => {
    if (hosts.length === 0) return;
    const interval = setInterval(() => {
      hosts.forEach((h) => {
        checkReachability(h);
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [hosts]);

  const handleAddHost = async () => {
    setAttemptedSubmit(true);
    if (!hostAddress || !hostUsername) {
      alert("Address and Username are required.");
      return;
    }

    setLoading(true);

    const entry = {
      id: sheetMode === "edit" ? selectedHost.id : 0,
      name: hostName || hostAddress,
      address: hostAddress,
      port: parseInt(hostPort) || 22,
      username: hostUsername,
      password: hostPassword || null,
      key_id: hostKeyId,
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
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!genName) {
      alert("Key name is required.");
      return;
    }
    
    const size = keyType === "rsa" ? rsaKeySize : keyType === "ecdsa" ? ecdsaKeySize : "";
    setLoading(true);
    try {
      const newKey = await invoke("generate_key", {
        name: genName,
        keyType: keyType,
        size: size,
        passphrase: genPassphrase || null,
        savePassphrase: genSavePassphrase,
      });
      setOpenGenerateKey(false);
      clearGenStates();
      await loadKeys();
      // Auto-select the newly generated key
      setHostKeyId(newKey.id);
    } catch (err) {
      alert("Failed to generate key: " + err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHost = async () => {
    if (!hostToDelete) return;
    setDeleting(true);
    try {
      await invoke("delete_host", { id: hostToDelete.id });
      setHostToDelete(null);
      loadHosts();
    } catch (err) {
      alert("Failed to delete host: " + err);
    } finally {
      setDeleting(false);
    }
  };

  const clearForm = () => {
    setHostName("");
    setHostAddress("");
    setHostPort("22");
    setHostUsername("");
    setHostPassword("");
    setHostKeyId(null);
    setSelectedHost(null);
    setAttemptedSubmit(false);
  };

  const clearGenStates = () => {
    setGenName("");
    setGenPassphrase("");
    setGenSavePassphrase(false);
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
            <p className="text-sm font-medium text-foreground">
              No hosts found
            </p>
            <p className="text-xs text-muted-foreground">
              Add a secure SSH host connection to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredHosts.map((host) => (
              <div
                className="border bg-sidebar rounded-lg px-3 py-2 flex flex-row gap-2 cursor-pointer"
                key={host.id}
                onClick={() => openSession(host)}
              >
                <div className="size-10 bg-primary rounded-md flex items-center justify-center shrink-0 border border-primary/50">
                  <ServerCogIcon className="size-5 text-primary-foreground" />
                </div>
                <div className="flex flex-col space-y-1 items-start justify-center flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium leading-none text-foreground">
                      {host.name}
                    </p>
                    <div
                      className={`size-2 rounded-full shrink-0 ${
                        hostStatuses[host.id] === "online"
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                          : hostStatuses[host.id] === "offline"
                            ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                            : "bg-muted-foreground/40 animate-pulse"
                      }`}
                      title={
                        hostStatuses[host.id] === "online"
                          ? "Reachable"
                          : hostStatuses[host.id] === "offline"
                            ? "Unreachable"
                            : "Checking reachability..."
                      }
                    />
                  </div>
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
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() => openSession(host)}
                      >
                        <TerminalIcon className="size-3.5" />
                        <span className="text-sm text-muted-foreground shrink-0">
                          Connect to Host
                        </span>
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
                          setHostKeyId(host.key_id || null);
                          setSheetMode("edit");
                          setOpenAddHosts(true);
                        }}
                      >
                        <EditIcon className="size-3.5" />
                        <span className="text-sm text-muted-foreground shrink-0">
                          Edit Host
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer text-destructive focus:text-destructive"
                        onSelect={() => setHostToDelete(host)}
                      >
                        <TrashIcon className="size-3.5 text-destructive" />
                        <span className="text-sm text-destructive shrink-0">
                          Delete Host
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* -------------------- ADD / EDIT HOST SHEET -------------------- */}
      <Sheet
        open={openAddHosts}
        onOpenChange={(open) =>
          !loading && ((!open && clearForm()) || setOpenAddHosts(open))
        }
      >
        <SheetContent
          className="rounded-l-xl overflow-hidden flex flex-col h-full"
          onPointerDownOutside={(e) => loading && e.preventDefault()}
          onEscapeKeyDown={(e) => loading && e.preventDefault()}
        >
          <SheetHeader className="bg-muted">
            <SheetTitle>
              {sheetMode === "add" ? "Add Hosts" : "Edit Host"}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "add"
                ? "Manage Hosts"
                : "Modify host connection details."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 py-2 px-3">
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <Label>Host Name</Label>
              <Input
                placeholder="My Staging Server"
                className="bg-background"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                disabled={loading}
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
                  disabled={loading}
                  aria-invalid={attemptedSubmit && !hostAddress ? "true" : "false"}
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
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Label>Credentials</Label>
                <div className="flex flex-col space-y-3">
                  <InputGroup className="bg-background">
                    <InputGroupAddon>
                      <UserIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder="Username"
                      value={hostUsername}
                      onChange={(e) => setHostUsername(e.target.value)}
                      disabled={loading}
                      aria-invalid={attemptedSubmit && !hostUsername ? "true" : "false"}
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
                      disabled={loading}
                    />
                    <InputGroupButton
                      type="button"
                      onClick={handleShowPassword}
                      disabled={loading}
                    >
                      {showPassword ? (
                        <EyeIcon className="size-4" />
                      ) : (
                        <EyeOffIcon className="size-4" />
                      )}
                    </InputGroupButton>
                  </InputGroup>

                  {/* Focus-triggered SSH Key Selector */}
                  <div className="flex flex-col gap-1.5 relative">
                    <Label className="text-xs text-muted-foreground">
                      SSH Key Pair (Optional)
                    </Label>
                    <Input
                      placeholder={
                        keys.length === 0
                          ? "No keys available (Click Create a Key)"
                          : "Select key pair..."
                      }
                      value={keys.find((k) => k.id === hostKeyId)?.name || ""}
                      onFocus={() => setKeyDropdownOpen(true)}
                      onBlur={() => {
                        // Small delay to allow click events to fire before blurring
                        setTimeout(() => setKeyDropdownOpen(false), 200);
                      }}
                      readOnly
                      disabled={loading}
                      className="bg-background cursor-pointer text-xs"
                    />
                    {keyDropdownOpen && (
                      <div className="absolute top-[56px] left-0 right-0 z-50 border bg-popover text-popover-foreground rounded-md shadow-md max-h-48 overflow-y-auto p-1 space-y-1">
                        {keys.length > 0 && (
                          <div
                            className="px-2 py-1 text-[10px] font-semibold text-muted-foreground border-b mb-1"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            Available Keychains
                          </div>
                        )}
                        {keys.map((k) => (
                          <div
                            key={k.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setHostKeyId(k.id);
                              setKeyDropdownOpen(false);
                            }}
                            className={`px-2 py-1 text-xs rounded-sm cursor-pointer flex items-center justify-between ${
                              hostKeyId === k.id
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "hover:bg-accent hover:text-accent-foreground text-foreground"
                            }`}
                          >
                            <span>{k.name}</span>
                            <span className="opacity-70 uppercase text-[9px]">
                              ({k.type})
                            </span>
                          </div>
                        ))}
                        {hostKeyId && (
                          <div
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setHostKeyId(null);
                              setKeyDropdownOpen(false);
                            }}
                            className="px-2 py-1 text-xs rounded-sm text-destructive hover:bg-destructive/10 cursor-pointer font-medium"
                          >
                            None (Clear key)
                          </div>
                        )}
                        <div
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setKeyDropdownOpen(false);
                            setOpenGenerateKey(true);
                          }}
                          className="px-2 py-1 text-xs rounded-sm text-primary hover:bg-primary/10 cursor-pointer font-bold border-t flex items-center gap-1 mt-1"
                        >
                          <PlusIcon className="size-3.5" />
                          Create a Key
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <SheetFooter className="bg-muted flex-row gap-2 py-2.5 px-3">
            <Button
              className="flex-1"
              onClick={handleAddHost}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {loading ? "Saving Host..." : "Save Host"}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                setOpenAddHosts(false);
                clearForm();
              }}
              disabled={loading}
            >
              <X />
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* -------------------- DYNAMIC GENERATE KEY SHEET -------------------- */}
      <Sheet
        open={openGenerateKey}
        onOpenChange={(open) =>
          !loading && ((!open && clearGenStates()) || setOpenGenerateKey(open))
        }
      >
        <SheetContent
          className="rounded-l-xl overflow-hidden flex flex-col h-full z-[100]"
          onPointerDownOutside={(e) => loading && e.preventDefault()}
          onEscapeKeyDown={(e) => loading && e.preventDefault()}
        >
          <SheetHeader className="bg-muted">
            <SheetTitle>Generate SSH Key</SheetTitle>
            <SheetDescription>
              Generate a new SSH public/private key pair to link to this host.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 overflow-y-auto space-y-4 flex-1">
            <div className="space-y-6 rounded-lg bg-muted p-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input
                  placeholder="My Production Server"
                  className="bg-background"
                  value={genName}
                  onChange={(e) => setGenName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Tabs value={keyType} onValueChange={setKeyType}>
                <div className="space-y-2">
                  <Label>Key Type</Label>
                  <TabsList className="grid w-full grid-cols-3 bg-background">
                    <TabsTrigger value="rsa" disabled={loading}>
                      RSA
                    </TabsTrigger>
                    <TabsTrigger value="ed25519" disabled={loading}>
                      Ed25519
                    </TabsTrigger>
                    <TabsTrigger value="ecdsa" disabled={loading}>
                      ECDSA
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="rsa" className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Compatible with almost every SSH server. (Sizes less than
                    2048 are blocked for security).
                  </p>
                  <div className="space-y-2">
                    <Label>Key Size</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {["2048", "4096"].map((size) => (
                        <Button
                          key={size}
                          type="button"
                          variant={rsaKeySize === size ? "default" : "outline"}
                          onClick={() => setRsaKeySize(size)}
                          disabled={loading}
                        >
                          {size}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="ecdsa" className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Faster than RSA with strong security.
                  </p>
                  <div className="space-y-2">
                    <Label>Curve</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {["256", "384", "521"].map((size) => (
                        <Button
                          key={size}
                          type="button"
                          variant={
                            ecdsaKeySize === size ? "default" : "outline"
                          }
                          onClick={() => setEcdsaKeySize(size)}
                          disabled={loading}
                        >
                          {size}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="ed25519" className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Recommended for modern systems. Fast, compact, and highly
                    secure.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
            <div className="flex flex-col gap-2 bg-muted p-4 rounded-lg">
              <Label>Passphrase</Label>
              <InputGroup>
                <InputGroupAddon>
                  <LockIcon className="size-4" />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Enter a passphrase (optional)"
                  className="bg-background"
                  type={showGenPassphrase ? "text" : "password"}
                  value={genPassphrase}
                  onChange={(e) => setGenPassphrase(e.target.value)}
                  disabled={loading}
                />
                <InputGroupButton
                  onClick={() => setShowGenPassphrase(!showGenPassphrase)}
                  disabled={loading}
                >
                  {showGenPassphrase ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </InputGroupButton>
              </InputGroup>
              <p className="text-xs text-muted-foreground">
                Enter a passphrase to protect your private key.
              </p>
              <div className="flex flex-row justify-between gap-2 mt-2">
                <Label
                  className="text-sm text-muted-foreground"
                  htmlFor="save-passphrase-switch"
                >
                  Save passphrase
                </Label>
                <Switch
                  id="save-passphrase-switch"
                  checked={genSavePassphrase}
                  onCheckedChange={setGenSavePassphrase}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
          <SheetFooter className="bg-muted flex-row gap-2 py-2.5">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleGenerateKey}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin size-4 animate-duration-1000" />
              ) : (
                <KeyIcon className="size-4" />
              )}
              {loading ? "Generating..." : "Generate"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => {
                setOpenGenerateKey(false);
                clearGenStates();
              }}
              disabled={loading}
            >
              <X className="size-4" />
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* -------------------- DELETE CONFIRMATION -------------------- */}
      {hostToDelete && (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-destructive/20 rounded-md flex items-center justify-center shrink-0 border border-destructive/40">
                <TrashIcon className="size-5 text-destructive" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">
                  Delete host
                </p>
                <p className="text-xs text-muted-foreground">
                  This will permanently remove "{hostToDelete.name}". This
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex flex-row gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteHost}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="animate-spin size-4" />
                ) : (
                  <TrashIcon className="size-4" />
                )}
                {deleting ? "Deleting..." : "Delete"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setHostToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
