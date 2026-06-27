import Icons from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
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
import { PlusIcon, SearchIcon, Server, ServerCog } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Hosts() {
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
                <Button size="sm">
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
      </div>
      <Sheet open>
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
                <div className=" size-10 bg-primary/40 rounded-full flex items-center justify-center shrink-0">
                  <Server className="size-5.5" />
                </div>
                <Input placeholder="Server Address" />
              </div>
            </div>
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <div className="flex items-center gap-2 border-b pb-3 justify-between">
                <div className="size-10 bg-primary/40 rounded-full flex items-center justify-center shrink-0">
                  <ServerCog className="size-5.5" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">SSH Port</Label>
                  <Input
                    placeholder="22"
                    className="w-12 placeholder:text-center text-center no-spinner"
                    type="number"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Label>Credentials</Label>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
