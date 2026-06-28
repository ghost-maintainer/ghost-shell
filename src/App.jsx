import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Hosts from "./pages/hosts";
import Keys from "./pages/keychain";
import HostTab from "./pages/host-tab";
import SftpTab from "./pages/sftp-tab";
import AddHosts from "./pages/add-hosts";
import Logs from "./pages/logs";
import ExportData from "./pages/export-data";
import ImportData from "./pages/import-data";
import WipeData from "./pages/wipe-data";
import Settings from "./pages/settings";
import Login from "./pages/login";
import { SecurityProvider, useSecurity } from "./provider/security-provider";

function AuthGuard({ children }) {
  const { unlocked } = useSecurity();
  return unlocked ? children : <Navigate to="/dashboard/login" replace />;
}

export default function App() {
  return (
    <HashRouter>
      <SecurityProvider>
        <Routes>
          <Route path="/dashboard/hosts" element={<AuthGuard><Hosts /></AuthGuard>} />
          <Route path="/dashboard/hosts/:hostID" element={<AuthGuard><HostTab /></AuthGuard>} />
          <Route path="/dashboard/keys" element={<AuthGuard><Keys /></AuthGuard>} />
          <Route path="/dashboard/sftp" element={<AuthGuard><SftpTab /></AuthGuard>} />
          <Route path="/dashboard/add-hosts" element={<AuthGuard><AddHosts /></AuthGuard>} />
          <Route path="/dashboard/logs" element={<AuthGuard><Logs /></AuthGuard>} />
          <Route path="/dashboard/export-data" element={<AuthGuard><ExportData /></AuthGuard>} />
          <Route path="/dashboard/import-data" element={<AuthGuard><ImportData /></AuthGuard>} />
          <Route path="/dashboard/wipe-data" element={<AuthGuard><WipeData /></AuthGuard>} />
          <Route path="/dashboard/settings" element={<AuthGuard><Settings /></AuthGuard>} />
          <Route path="/dashboard/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/dashboard/login" />} />
        </Routes>
      </SecurityProvider>
    </HashRouter>
  );
}
