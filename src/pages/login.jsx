import logo from "@/assets/app-icon.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const navigate = useNavigate();
  const handleShowPassphrase = () => {
    setShowPassphrase(!showPassphrase);
  };
  const handleLogin = () => {
    navigate("/dashboard/hosts");
  };
  return (
    <div className="flex flex-col items-center justify-center h-svh space-y-3">
      <img src={logo} alt="logo" className="size-18" />
      <div className="text-center space-y-1">
        <p className="text-lg text-foreground leading-none">Enter your passphrase to login</p>
        <p className="text-xs text-muted-foreground leading-none">
          Key is required to encrypt and decrypt you data.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center space-y-2 bg-sidebar max-w-sm w-full p-4 rounded-lg">
        <InputGroup>
          <InputGroupAddon>
            <LockIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Enter your passphrase"
            className="w-full"
            type={showPassphrase ? "text" : "password"}
          />
          <InputGroupButton onClick={handleShowPassphrase}>
            {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroup>
        <div className="px-4 py-2 w-full">
        <Button className="w-full" size="lg" onClick={handleLogin}>
          Login
        </Button>
        </div>
      </div>
    </div>
  );
}