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

export default function Hosts() {
  const [showPassword, setShowPassword] = React.useState(false);
  const [openAddHosts, setOpenAddHosts] = React.useState(false);
  const handleShowPassword = () => {
    setShowPassword(!showPassword);
  };
  const handleOpenAddHosts = () => {
    setOpenAddHosts(!openAddHosts);
  };
  const DEMO_DATA = [
    {
      id: 1,
      name: "Host 1",
      address: "192.168.1.1",
      port: 22,
      username: "root",
      password: "password",
      keyId: 1,
      createdAt: "2021-01-01",
      updatedAt: "2021-01-01",
      os: "Linux",
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: index + 2,
      name: `Host ${index + 2}`,
      address: `192.168.1.${index + 2}`,
      port: 22,
      username: "root",
      password: "password",
      keyId: index + 2,
      createdAt: "2021-01-01",
      updatedAt: "2021-01-01",
      os: "Linux",
    })),
  ];
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row gap-2 items-center justify-between">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search hosts" />
          </InputGroup>
          <div className="flex flex-col gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenAddHosts}
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
        <div className=" grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {DEMO_DATA.map((host, index) => (
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
                  {host.address}
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
                    <DropdownMenuItem className="cursor-pointer">
                      <ClipboardIcon className="size-3.5" />
                      <span className="text-sm text-muted-foreground shrink-0">Copy Public Key</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer">
                      <EditIcon className="size-3.5" />
                      <span className="text-sm text-muted-foreground shrink-0">Edit</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" variant="destructive">
                      <TrashIcon className="size-3.5" />
                      <span className="text-sm text-muted-foreground shrink-0">Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Sheet open={openAddHosts} onOpenChange={handleOpenAddHosts}>
        <SheetContent className="rounded-l-xl overflow-hidden">
          <SheetHeader className="bg-muted">
            <SheetTitle>Add Hosts</SheetTitle>
            <SheetDescription className="sr-only">
              Manage Hosts
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 py-2 px-3">
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <Label>Address</Label>
              <div className="flex items-center gap-2">
                <div className=" size-10 bg-primary rounded-full flex items-center justify-center shrink-0">
                  <Server className="size-5.5 text-primary-foreground" />
                </div>
                <Input placeholder="Server Address" className="bg-background" />
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
                    className="w-12 placeholder:text-center text-center no-spinner bg-background"
                    type="number"
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
                    <InputGroupInput placeholder="Username" />
                  </InputGroup>
                  <InputGroup className="bg-background">
                    <InputGroupAddon>
                      <LockIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      placeholder="Password"
                      type={showPassword ? "text" : "password"}
                    />
                    <InputGroupButton onClick={handleShowPassword}>
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
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
