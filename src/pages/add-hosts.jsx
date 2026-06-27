import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import DashboardLayout from "@/layouts/dashboard";
import { Search, SearchIcon } from "lucide-react";

export default function AddHosts() {
  return (
    <DashboardLayout sidebar={false}>
      <div className="mt-10 w-full space-y-4">
        <InputGroup className="max-w-xl mx-auto h-10 rounded-full">
          <InputGroupAddon>
            <SearchIcon className="size-6" />
          </InputGroupAddon>
          <InputGroupInput />
        </InputGroup>
        <div className=" h-120 rounded-lg border bg-muted max-w-[75%] mx-auto">

        </div>
      </div>
    </DashboardLayout>
  );
}
