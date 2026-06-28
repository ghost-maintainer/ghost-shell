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
  PlusIcon,
  Save,
  SearchIcon,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function KeyChain() {
  const [openAddKey, setOpenAddKey] = React.useState(false);
  const [openGenerateKey, setOpenGenerateKey] = React.useState(false);
  const [showPassphrase, setShowPassphrase] = React.useState(false);

  const [keyType, setKeyType] = React.useState("rsa");

  const [rsaKeySize, setRsaKeySize] = React.useState("4096");
  const [ecdsaKeySize, setEcdsaKeySize] = React.useState("521");

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between gap-4">
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search keys..." />
        </InputGroup>

        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenAddKey(true)}
              >
                <PlusIcon />
                Add Key
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add an existing key pair</TooltipContent>
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

      {/* -------------------- ADD KEY -------------------- */}

      <Sheet open={openAddKey} onOpenChange={setOpenAddKey}>
        <SheetContent className="rounded-l-xl overflow-hidden">
          <SheetHeader className="bg-muted">
            <SheetTitle>Add Key</SheetTitle>
            <SheetDescription>
              Import an existing SSH key pair.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <div className="space-y-4 rounded-lg bg-muted p-4">
              <Input placeholder="Key name" className="bg-background" />
              <Textarea
                placeholder="Private key"
                className="bg-background min-h-32"
              />
              <Textarea
                placeholder="Public key"
                className="bg-background min-h-24"
              />
              <Textarea
                placeholder="Certificate (optional)"
                className="bg-background min-h-24"
              />
            </div>
          </div>
          <SheetFooter className="bg-muted flex-row gap-2 py-2.5">
            <Button className="flex-1">
              <Save />
              Save
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setOpenAddKey(false)}
            >
              <X />
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* -------------------- GENERATE KEY -------------------- */}

      <Sheet open={openGenerateKey} onOpenChange={setOpenGenerateKey}>
        <SheetContent className="rounded-l-xl overflow-hidden">
          <SheetHeader className="bg-muted">
            <SheetTitle>Generate SSH Key</SheetTitle>
            <SheetDescription>
              Generate a new SSH public/private key pair.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 overflow-y-auto space-y-4">
            <div className="space-y-6 rounded-lg bg-muted p-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input
                  placeholder="My Production Server"
                  className="bg-background"
                />
              </div>
              <Tabs value={keyType} onValueChange={setKeyType}>
                <div className="space-y-2">
                  <Label>Key Type</Label>
                  <TabsList className="grid w-full grid-cols-3 bg-background">
                    <TabsTrigger value="rsa">RSA</TabsTrigger>
                    <TabsTrigger value="ed25519">Ed25519</TabsTrigger>
                    <TabsTrigger value="ecdsa">ECDSA</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="rsa" className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Compatible with almost every SSH server.
                  </p>
                  <div className="space-y-2">
                    <Label>Key Size</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {["1024", "2048", "4096"].map((size) => (
                        <Button
                          key={size}
                          type="button"
                          variant={rsaKeySize === size ? "default" : "outline"}
                          onClick={() => setRsaKeySize(size)}
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
                  <LockIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Enter a passphrase"
                  className="bg-background"
                  type={showPassphrase ? "text" : "password"}
                />
                <InputGroupButton
                  onClick={() => setShowPassphrase(!showPassphrase)}
                >
                  {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroup>
              <p className="text-xs text-muted-foreground">
                Enter a passphrase to protect your private key.
              </p>
              <div className="flex flex-row justify-between gap-2 mt-2">
                <Label className="text-sm text-muted-foreground" htmlFor="save-passphrase-switch">
                  Save passphrase
                </Label>
                <Switch id="save-passphrase-switch" />
              </div>
            </div>
          </div>
          <SheetFooter className="bg-muted flex-row gap-2 py-2.5">
            <Button size="sm" className="flex-1">
              <KeyIcon />
              Generate
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => setOpenGenerateKey(false)}
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
