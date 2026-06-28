import React from "react";
import DashboardLayout from "@/layouts/dashboard";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Save,
  SearchIcon,
  TrashIcon,
  X,
  CopyIcon,
  Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { invoke } from "@tauri-apps/api/core";

export default function KeyChain() {
  const [keys, setKeys] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  
  const [openAddKey, setOpenAddKey] = React.useState(false);
  const [openGenerateKey, setOpenGenerateKey] = React.useState(false);
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [keyType, setKeyType] = React.useState("rsa");
  const [rsaKeySize, setRsaKeySize] = React.useState("4096");
  const [ecdsaKeySize, setEcdsaKeySize] = React.useState("521");

  // Add/View/Edit Form States
  const [sheetMode, setSheetMode] = React.useState("add"); // "add" | "view" | "edit"
  const [selectedKey, setSelectedKey] = React.useState(null);
  const [keyToDelete, setKeyToDelete] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  const [addName, setAddName] = React.useState("");
  const [addPrivateKey, setAddPrivateKey] = React.useState("");
  const [addPublicKey, setAddPublicKey] = React.useState("");
  const [addCertificate, setAddCertificate] = React.useState("");
  const [addPassphrase, setAddPassphrase] = React.useState("");

  // Generate Key Form States
  const [genName, setGenName] = React.useState("");
  const [genPassphrase, setGenPassphrase] = React.useState("");
  const [genSavePassphrase, setGenSavePassphrase] = React.useState(false);

  const [loading, setLoading] = React.useState(false);

  const loadKeys = async () => {
    try {
      const list = await invoke("get_keys");
      setKeys(list || []);
    } catch (err) {
      console.error("Failed to load keys:", err);
    }
  };

  React.useEffect(() => {
    loadKeys();
  }, []);

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleAddKey = async () => {
    if (!addName || !addPrivateKey) {
      alert("Name and Private Key are required.");
      return;
    }

    setLoading(true);

    const isEdit = sheetMode === "edit" && selectedKey;

    let detectedType = "rsa";
    if (addPrivateKey.includes("EC PRIVATE KEY") || addPrivateKey.includes("ecdsa")) {
      detectedType = "ecdsa";
    } else if (addPrivateKey.includes("ed25519") || addPrivateKey.includes("ED25519")) {
      detectedType = "ed25519";
    }

    const today = new Date().toISOString().split("T")[0];

    const entry = {
      id: isEdit ? selectedKey.id : 0,
      name: addName,
      // Preserve original type/size when editing; otherwise use detected type.
      type: isEdit ? selectedKey.type : detectedType,
      size: isEdit ? selectedKey.size : detectedType === "rsa" ? "2048" : "256",
      private_key: addPrivateKey,
      public_key: addPublicKey,
      passphrase: addPassphrase || null,
      certificate: addCertificate || null,
      created_at: isEdit ? selectedKey.created_at : today,
      updated_at: today,
    };

    try {
      await invoke("add_key", { entry });
      setOpenAddKey(false);
      clearAddStates();
      loadKeys();
    } catch (err) {
      alert("Failed to save key: " + err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;
    setDeleting(true);
    try {
      await invoke("delete_key", { id: keyToDelete.id });
      setKeyToDelete(null);
      loadKeys();
    } catch (err) {
      alert("Failed to delete key: " + err);
    } finally {
      setDeleting(false);
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
      await invoke("generate_key", {
        name: genName,
        keyType: keyType,
        size: size,
        passphrase: genPassphrase || null,
        savePassphrase: genSavePassphrase,
      });
      setOpenGenerateKey(false);
      clearGenStates();
      loadKeys();
    } catch (err) {
      alert("Failed to generate key: " + err);
    } finally {
      setLoading(false);
    }
  };


  const clearAddStates = () => {
    setAddName("");
    setAddPrivateKey("");
    setAddPublicKey("");
    setAddCertificate("");
    setAddPassphrase("");
    setSelectedKey(null);
  };

  const clearGenStates = () => {
    setGenName("");
    setGenPassphrase("");
    setGenSavePassphrase(false);
  };

  const filteredKeys = keys.filter((k) =>
    k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <SearchIcon className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search keys..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSheetMode("add");
                    clearAddStates();
                    setOpenAddKey(true);
                  }}
                >
                  <PlusIcon />
                  Add Key
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import an existing key pair</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenGenerateKey(true)}
                >
                  <KeyIcon />
                  Generate Key
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generate a new SSH key pair</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </div>

        {filteredKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-sidebar border rounded-lg">
            <KeyIcon className="size-8 text-muted-foreground mb-2 animate-bounce" />
            <p className="text-sm font-medium text-foreground">No keys found</p>
            <p className="text-xs text-muted-foreground">
              Add or generate a secure SSH key to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {filteredKeys.map((key) => (
              <div
                key={key.id}
                className="border bg-sidebar rounded-lg px-3 py-2 flex flex-row gap-2"
              >
                <div className="size-10 bg-primary/30 rounded-md flex items-center justify-center shrink-0 border border-primary/50">
                  <KeyIcon className="size-5 text-primary-foreground" />
                </div>
                <div className="flex flex-col space-y-1 items-start justify-center flex-1">
                  <p className="text-sm font-medium leading-none text-foreground">
                    {key.name}
                  </p>
                  <p className="text-xs leading-none text-foreground/80 uppercase">
                    {key.type} {key.size ? `(${key.size}b)` : ""}
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
                      className="rounded-xs w-fit space-y-1"
                    >
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() => {
                          setSelectedKey(key);
                          setAddName(key.name);
                          setAddPrivateKey(key.private_key);
                          setAddPublicKey(key.public_key);
                          setAddCertificate(key.certificate || "");
                          setAddPassphrase(key.passphrase || "");
                          setSheetMode("view");
                          setOpenAddKey(true);
                        }}
                      >
                        <EyeIcon className="size-3.5" />
                        <span className="text-sm text-muted-foreground shrink-0">
                          View Details
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() => {
                          setSelectedKey(key);
                          setAddName(key.name);
                          setAddPrivateKey(key.private_key);
                          setAddPublicKey(key.public_key);
                          setAddCertificate(key.certificate || "");
                          setAddPassphrase(key.passphrase || "");
                          setSheetMode("edit");
                          setOpenAddKey(true);
                        }}
                      >
                        <Save className="size-3.5" />
                        <span className="text-sm text-muted-foreground shrink-0">
                          Edit
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer text-destructive focus:text-destructive"
                        onSelect={() => setKeyToDelete(key)}
                      >
                        <TrashIcon className="size-3.5 text-destructive" />
                        <span className="text-sm text-destructive shrink-0">
                          Delete
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

      {/* -------------------- ADD / VIEW KEY -------------------- */}
      <Sheet
        open={openAddKey}
        onOpenChange={(open) =>
          !loading && ((!open && clearAddStates()) || setOpenAddKey(open))
        }
      >
        <SheetContent
          className="rounded-l-xl overflow-hidden flex flex-col h-full"
          onPointerDownOutside={(e) => loading && e.preventDefault()}
          onEscapeKeyDown={(e) => loading && e.preventDefault()}
        >
          <SheetHeader className="bg-muted">
            <SheetTitle>
              {sheetMode === "add"
                ? "Add Key"
                : sheetMode === "edit"
                ? "Edit Key"
                : "View Key Details"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {sheetMode === "add"
                ? "Import an existing SSH key pair."
                : sheetMode === "edit"
                ? "Modify this SSH key pair."
                : "Secure information for this SSH key pair."}
            </SheetDescription>
          </SheetHeader>
          <div className="px-2 flex-1 overflow-y-auto space-y-3">
            <div className="space-y-3 px-2 ">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Key Name</Label>
                  {sheetMode === "view" && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6 cursor-pointer"
                      onClick={() => handleCopy(addName)}
                    >
                      <CopyIcon className="size-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Key name"
                  className="bg-background"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  readOnly={sheetMode === "view"}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Private Key</Label>
                  {sheetMode === "view" && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6 cursor-pointer"
                      onClick={() => handleCopy(addPrivateKey)}
                    >
                      <CopyIcon className="size-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Private key (PEM format)"
                  className="bg-background font-mono text-xs! h-34"
                  value={addPrivateKey}
                  onChange={(e) => setAddPrivateKey(e.target.value)}
                  readOnly={sheetMode === "view"}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Public Key</Label>
                  {sheetMode === "view" && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6 cursor-pointer"
                      onClick={() => handleCopy(addPublicKey)}
                    >
                      <CopyIcon className="size-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Public key"
                  className="bg-background font-mono text-xs! h-34"
                  value={addPublicKey}
                  onChange={(e) => setAddPublicKey(e.target.value)}
                  readOnly={sheetMode === "view"}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Certificate (Optional)</Label>
                  {sheetMode === "view" && addCertificate && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6 cursor-pointer"
                      onClick={() => handleCopy(addCertificate)}
                    >
                      <CopyIcon className="size-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Certificate (optional)"
                  className="bg-background font-mono text-xs! h-34"
                  value={addCertificate}
                  onChange={(e) => setAddCertificate(e.target.value)}
                  readOnly={sheetMode === "view"}
                  disabled={loading}
                />
              </div>
              {sheetMode !== "view" && (
                <div className="space-y-1">
                  <Label>Passphrase (Optional)</Label>
                  <Input
                    placeholder="Enter key passphrase if encrypted"
                    className="bg-background"
                    type="password"
                    value={addPassphrase}
                    onChange={(e) => setAddPassphrase(e.target.value)}
                    disabled={loading}
                  />
                </div>
              )}
              {sheetMode === "view" && addPassphrase && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-primary font-medium">
                      Passphrase
                    </Label>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6 cursor-pointer"
                      onClick={() => handleCopy(addPassphrase)}
                    >
                      <CopyIcon className="size-3 text-primary" />
                    </Button>
                  </div>
                  <Input
                    value={addPassphrase}
                    readOnly
                    className="bg-background font-mono text-xs text-primary"
                  />
                </div>
              )}
            </div>
          </div>
          <SheetFooter className="bg-muted flex-row gap-2 py-2.5">
            {sheetMode !== "view" ? (
              <>
                <Button
                  className="flex-1"
                  onClick={handleAddKey}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="animate-spin size-4" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {loading ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    setOpenAddKey(false);
                    clearAddStates();
                  }}
                  disabled={loading}
                >
                  <X className="size-4" />
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="flex-1"
                  onClick={() => setSheetMode("edit")}
                >
                  <Save className="size-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setOpenAddKey(false);
                    clearAddStates();
                  }}
                >
                  Close
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* -------------------- GENERATE KEY -------------------- */}
      <Sheet
        open={openGenerateKey}
        onOpenChange={(open) =>
          !loading && ((!open && clearGenStates()) || setOpenGenerateKey(open))
        }
      >
        <SheetContent
          className="rounded-l-xl overflow-hidden flex flex-col h-full"
          onPointerDownOutside={(e) => loading && e.preventDefault()}
          onEscapeKeyDown={(e) => loading && e.preventDefault()}
        >
          <SheetHeader className="bg-muted">
            <SheetTitle>Generate SSH Key</SheetTitle>
            <SheetDescription>
              Generate a new SSH public/private key pair.
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
                  type={showPassphrase ? "text" : "password"}
                  value={genPassphrase}
                  onChange={(e) => setGenPassphrase(e.target.value)}
                  disabled={loading}
                />
                <InputGroupButton
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  disabled={loading}
                >
                  {showPassphrase ? (
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
                <Loader2 className="animate-spin size-4" />
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
      {keyToDelete && (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-destructive/20 rounded-md flex items-center justify-center shrink-0 border border-destructive/40">
                <TrashIcon className="size-5 text-destructive" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Delete key</p>
                <p className="text-xs text-muted-foreground">
                  This will permanently remove "{keyToDelete.name}". This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex flex-row gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteKey}
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
                onClick={() => setKeyToDelete(null)}
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
