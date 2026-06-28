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

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/dashboard/hosts" element={<Hosts />} />
        <Route path="/dashboard/hosts/:hostID" element={<HostTab />} />
        <Route path="/dashboard/keys" element={<Keys />} />
        <Route path="/dashboard/sftp" element={<SftpTab />} />
        <Route path="/dashboard/add-hosts" element={<AddHosts />} />
        <Route path="/dashboard/logs" element={<Logs />} />
        <Route path="/dashboard/export-data" element={<ExportData />} />
        <Route path="/dashboard/import-data" element={<ImportData />} />
        <Route path="/dashboard/wipe-data" element={<WipeData />} />
        <Route path="/dashboard/settings" element={<Settings />} />
        <Route path="/dashboard/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/dashboard/login" />} />
      </Routes>
    </HashRouter>
  );
}
