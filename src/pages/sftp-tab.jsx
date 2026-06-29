import React from "react";
import DashboardLayout from "@/layouts/dashboard";
import { Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Folder,
  FolderOpen,
  File,
  FilePlus,
  ArrowLeft,
  Search,
  RefreshCw,
  FolderPlus,
  Trash2,
  Pencil,
  Loader2,
  Lock,
  X,
  Check,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Copy,
  Info,
  Network,
  Download,
  AlertTriangle,
} from "lucide-react";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

const TRANSFER_DISMISS_MS = 3500;

// Persistent SFTP Tab State to keep connections alive on React unmount (tab changes)
const sftpGlobalState = {
  pane1: null,
  pane2: null,
  transfers: [],
};

// Simple memory cache for directory listings (stale-while-revalidate)
const sftpDirectoryCache = new Map();

const SFTP_DRAG_MIME = "application/x-ghost-shell-sftp";

function joinRemotePath(dir, name) {
  if (!dir || dir === ".") {
    return name.startsWith("/") ? name : `/${name}`;
  }
  if (dir === "/") return `/${name}`;
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

function readDragPayload(event, fallbackRef) {
  if (fallbackRef?.current) {
    return fallbackRef.current;
  }

  const candidates = [SFTP_DRAG_MIME, "text/plain", "text"];
  for (const type of candidates) {
    try {
      const raw = event.dataTransfer.getData(type);
      if (raw) return JSON.parse(raw);
    } catch {
      /* try next type */
    }
  }

  try {
    for (const type of event.dataTransfer.types || []) {
      const raw = event.dataTransfer.getData(type);
      if (raw?.includes("fromPane")) return JSON.parse(raw);
    }
  } catch {
    /* ignore malformed payloads */
  }

  return null;
}

const POINTER_DRAG_THRESHOLD = 6;

export default function SftpTab() {
  const dragPayloadRef = React.useRef(null);
  const pane1Ref = React.useRef(null);
  const pane2Ref = React.useRef(null);
  const pointerDragSessionRef = React.useRef(null);
  const dropTargetPaneRef = React.useRef(null);
  const suppressRowClickRef = React.useRef(false);
  const executePaneTransferRef = React.useRef(null);
  const activeTransferKeysRef = React.useRef(new Set());
  const transferDismissTimersRef = React.useRef(new Map());
  // Hosts database
  const [hosts, setHosts] = React.useState([]);
  const [searchHostQuery, setSearchHostQuery] = React.useState("");

  // Pane States initialized from global cache if available
  const [pane1, setPane1] = React.useState(
    () =>
      sftpGlobalState.pane1 || {
        id: "pane-1",
        host: null,
        showSelectHostList: false,
        path: "",
        history: [],
        historyIndex: 0,
        files: [],
        loading: false,
        error: "",
        filter: "",
        showHidden: false,
        selected: new Set(),
      },
  );

  const [pane2, setPane2] = React.useState(
    () =>
      sftpGlobalState.pane2 || {
        id: "pane-2",
        host: null,
        showSelectHostList: false,
        path: "",
        history: [],
        historyIndex: 0,
        files: [],
        loading: false,
        error: "",
        filter: "",
        showHidden: false,
        selected: new Set(),
      },
  );

  // Prompt / Credentials State
  const [authPrompt, setAuthPrompt] = React.useState({
    visible: false,
    paneId: "",
    host: null,
    type: "password", // "password" | "passphrase"
    value: "",
  });

  // Right-Click Context Menu State
  const menuRef = React.useRef(null);
  const [contextMenu, setContextMenu] = React.useState({
    visible: false,
    x: 0,
    y: 0,
    paneId: "",
    file: null,
  });

  // Dialog state — replaces native prompt()/confirm()/alert() which are
  // unreliable inside Tauri's WebView. One of:
  // "rename" | "newFolder" | "newFile" | "delete" | "alert"
  const [dialog, setDialog] = React.useState({
    type: null,
    paneId: "",
    file: null,
    value: "",
    title: "",
    message: "",
  });

  const closeDialog = React.useCallback(
    () => setDialog((prev) => ({ ...prev, type: null })),
    [],
  );

  const showAlert = React.useCallback((title, message) => {
    setDialog({
      type: "alert",
      paneId: "",
      file: null,
      value: "",
      title,
      message,
    });
  }, []);

  // Active transfers initialized from global cache if available
  const [transfers, setTransfers] = React.useState(
    () => sftpGlobalState.transfers || [],
  );
  const [dropTargetPaneId, setDropTargetPaneId] = React.useState(null);
  const [pointerDrag, setPointerDrag] = React.useState(null);

  pane1Ref.current = pane1;
  pane2Ref.current = pane2;

  const getPaneById = React.useCallback(
    (paneId) => (paneId === "pane-1" ? pane1Ref.current : pane2Ref.current),
    [],
  );

  const scheduleTransferRemoval = React.useCallback((transferId) => {
    const existing = transferDismissTimersRef.current.get(transferId);
    if (existing) window.clearTimeout(existing);

    const timer = window.setTimeout(() => {
      transferDismissTimersRef.current.delete(transferId);
      setTransfers((prev) => prev.filter((t) => t.id !== transferId));
    }, TRANSFER_DISMISS_MS);

    transferDismissTimersRef.current.set(transferId, timer);
  }, []);

  React.useEffect(() => {
    return () => {
      transferDismissTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      transferDismissTimersRef.current.clear();
    };
  }, []);

  const finishTransfer = React.useCallback(
    (transferId, transferKey, status, error) => {
      if (transferKey) activeTransferKeysRef.current.delete(transferKey);
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? {
                ...t,
                status,
                percentage: status === "completed" ? 100 : t.percentage,
                error: error || t.error,
              }
            : t,
        ),
      );
      scheduleTransferRemoval(transferId);
    },
    [scheduleTransferRemoval],
  );

  const beginTransfer = React.useCallback((transferKey, transfer) => {
    if (transferKey && activeTransferKeysRef.current.has(transferKey)) {
      return null;
    }
    if (transferKey) activeTransferKeysRef.current.add(transferKey);
    setTransfers((prev) => [...prev, transfer]);
    return transfer.id;
  }, []);

  // Synchronize state updates to global state so they survive tab changes
  React.useEffect(() => {
    sftpGlobalState.pane1 = pane1;
  }, [pane1]);

  React.useEffect(() => {
    sftpGlobalState.pane2 = pane2;
  }, [pane2]);

  React.useEffect(() => {
    sftpGlobalState.transfers = transfers;
  }, [transfers]);

  // Fetch hosts list on load
  const loadHosts = React.useCallback(async () => {
    try {
      const res = await invoke("get_hosts");
      setHosts(res || []);
    } catch (err) {
      console.error("Failed to load hosts:", err);
    }
  }, []);

  React.useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  // Load directory files for a specific pane
  const loadDir = React.useCallback(async (paneId, pathStr) => {
    const setPane = paneId === "pane-1" ? setPane1 : setPane2;
    const cacheKey = `${paneId}:${pathStr}`;
    const cached = sftpDirectoryCache.get(cacheKey);

    if (cached) {
      // Instantly load cached files (0ms UI latency)
      setPane((prev) => ({
        ...prev,
        files: cached.files,
        path: pathStr,
        loading: false,
        error: "",
      }));
    } else {
      // Show full-pane spinner overlay only if no cache is found
      setPane((prev) => ({ ...prev, loading: true, error: "" }));
    }

    try {
      const files = await invoke("sftp_list_dir", {
        connectionId: paneId,
        path: pathStr,
      });

      // Update cache
      sftpDirectoryCache.set(cacheKey, {
        files: files || [],
        timestamp: Date.now(),
      });

      setPane((prev) => ({
        ...prev,
        files: files || [],
        path: pathStr,
        loading: false,
        selected: new Set(),
        error: "",
      }));
    } catch (err) {
      const hasCache = sftpDirectoryCache.has(cacheKey);
      setPane((prev) => ({
        ...prev,
        loading: false,
        ...(hasCache ? {} : { error: String(err) }),
      }));
      if (hasCache) {
        console.warn(
          `Background directory refresh failed for ${pathStr}:`,
          err,
        );
      }
    }
  }, []);

  // Connect to a host
  const connectHost = async (paneId, host, overrideCredentials = null) => {
    const setPane = paneId === "pane-1" ? setPane1 : setPane2;

    setPane((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const homePath = await invoke("sftp_connect", {
        connectionId: paneId,
        hostId: host.id,
        password: overrideCredentials?.password || null,
        passphrase: overrideCredentials?.passphrase || null,
      });

      // Clear any prompts
      setAuthPrompt({
        visible: false,
        paneId: "",
        host: null,
        type: "password",
        value: "",
      });

      // Initialize path to remote home directory
      setPane((prev) => ({
        ...prev,
        host,
        path: homePath,
        history: [homePath],
        historyIndex: 0,
        selected: new Set(),
        showSelectHostList: false,
      }));

      loadDir(paneId, homePath);
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("NeedPassword")) {
        setAuthPrompt({
          visible: true,
          paneId,
          host,
          type: "password",
          value: "",
        });
        setPane((prev) => ({ ...prev, loading: false }));
      } else if (errMsg.includes("NeedPassphrase")) {
        setAuthPrompt({
          visible: true,
          paneId,
          host,
          type: "passphrase",
          value: "",
        });
        setPane((prev) => ({ ...prev, loading: false }));
      } else {
        setPane((prev) => ({
          ...prev,
          error: errMsg,
          loading: false,
        }));
      }
    }
  };

  const handlePromptSubmit = (e) => {
    e.preventDefault();
    if (!authPrompt.host) return;

    const creds = {};
    if (authPrompt.type === "password") {
      creds.password = authPrompt.value;
    } else {
      creds.passphrase = authPrompt.value;
    }

    connectHost(authPrompt.paneId, authPrompt.host, creds);
  };

  // Directory Navigation Helpers
  const navigateTo = (paneId, targetPath) => {
    const setPane = paneId === "pane-1" ? setPane1 : setPane2;
    const pane = paneId === "pane-1" ? pane1 : pane2;

    const newHistory = [
      ...pane.history.slice(0, pane.historyIndex + 1),
      targetPath,
    ];
    const newIndex = newHistory.length - 1;

    setPane((prev) => ({
      ...prev,
      history: newHistory,
      historyIndex: newIndex,
    }));

    loadDir(paneId, targetPath);
  };

  const goBack = (paneId) => {
    const pane = paneId === "pane-1" ? pane1 : pane2;
    const setPane = paneId === "pane-1" ? setPane1 : setPane2;

    if (pane.historyIndex > 0) {
      const newIndex = pane.historyIndex - 1;
      const targetPath = pane.history[newIndex];
      setPane((prev) => ({ ...prev, historyIndex: newIndex }));
      loadDir(paneId, targetPath);
    }
  };

  const goForward = (paneId) => {
    const pane = paneId === "pane-1" ? pane1 : pane2;
    const setPane = paneId === "pane-1" ? setPane1 : setPane2;

    if (pane.historyIndex < pane.history.length - 1) {
      const newIndex = pane.historyIndex + 1;
      const targetPath = pane.history[newIndex];
      setPane((prev) => ({ ...prev, historyIndex: newIndex }));
      loadDir(paneId, targetPath);
    }
  };

  // Drag and drop — ref + text/plain for WebView2 (Windows) / WKWebView (macOS) / WebKitGTK (Linux)
  const handleDragStart = (e, paneId, file) => {
    const payload = {
      fromPane: paneId,
      fileName: file.name,
      isDir: Boolean(file.is_dir),
    };

    dragPayloadRef.current = payload;
    const encoded = JSON.stringify(payload);

    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.dropEffect = "copy";
    e.dataTransfer.setData("text/plain", encoded);
    e.dataTransfer.setData(SFTP_DRAG_MIME, encoded);

    if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 16, 16);
    }
  };

  const handleDragEnd = () => {
    setDropTargetPaneId(null);
    window.setTimeout(() => {
      dragPayloadRef.current = null;
    }, 0);
  };

  const handleDragOver = (e, toPaneId) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    setDropTargetPaneId(toPaneId);
  };

  const handleDragLeave = (e, paneId) => {
    e.stopPropagation();
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setDropTargetPaneId((prev) => (prev === paneId ? null : prev));
  };

  const startFileCopy = async (
    fromPaneId,
    fromPath,
    toPaneId,
    toPath,
    fileName,
  ) => {
    const fromPane = getPaneById(fromPaneId);
    const toPane = getPaneById(toPaneId);
    if (!fromPane?.host || !toPane?.host) return;

    const transferKey = `copy:${fromPaneId}:${fromPath}->${toPaneId}:${toPath}`;
    const transferId = Math.random().toString(36).substring(7);
    const channel = new Channel();

    const startedId = beginTransfer(transferKey, {
      id: transferId,
      kind: "copy",
      fileName,
      fromHost: fromPane.host.name || fromPane.host.address,
      toHost: toPane.host.name || toPane.host.address,
      percentage: 0,
      bytesMoved: 0,
      totalSize: 0,
      status: "running",
    });
    if (!startedId) return;

    sftpDirectoryCache.delete(`${toPaneId}:${toPane.path}`);

    channel.onmessage = (msg) => {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? {
                ...t,
                percentage: msg.percentage,
                bytesMoved: msg.bytes_moved,
                totalSize: msg.total_size,
              }
            : t,
        ),
      );
    };

    try {
      await invoke("sftp_copy_file", {
        fromConnectionId: fromPaneId,
        fromPath,
        toConnectionId: toPaneId,
        toPath,
        progressChannel: channel,
      });

      finishTransfer(transferId, transferKey, "completed");
      loadDir(toPaneId, toPane.path);
    } catch (err) {
      finishTransfer(transferId, transferKey, "failed", String(err));
      showAlert("Transfer failed", String(err));
    }
  };

  const startDownload = async (paneId, remotePath, fileName, isDir) => {
    const pane = getPaneById(paneId);
    if (!pane?.host) return;

    const transferKey = `download:${paneId}:${remotePath}`;
    const transferId = Math.random().toString(36).substring(7);
    const channel = new Channel();
    const suggestedName = isDir ? `${fileName}.zip` : fileName;

    const startedId = beginTransfer(transferKey, {
      id: transferId,
      kind: "download",
      fileName,
      fromHost: pane.host.name || pane.host.address,
      toHost: "Local disk",
      percentage: 0,
      bytesMoved: 0,
      totalSize: 0,
      status: "running",
    });
    if (!startedId) return;

    channel.onmessage = (msg) => {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? {
                ...t,
                percentage: msg.percentage,
                bytesMoved: msg.bytes_moved,
                totalSize: msg.total_size,
              }
            : t,
        ),
      );
    };

    try {
      await invoke("sftp_download", {
        connectionId: paneId,
        remotePath,
        isDir,
        suggestedName,
        progressChannel: channel,
      });

      finishTransfer(transferId, transferKey, "completed");
    } catch (err) {
      const message = String(err);
      finishTransfer(transferId, transferKey, "failed", message);
      if (!message.toLowerCase().includes("cancelled")) {
        showAlert("Download failed", message);
      }
    }
  };

  executePaneTransferRef.current = (fromPaneId, toPaneId, fileName, isDir) => {
    if (fromPaneId === toPaneId) return;

    const fromPane = getPaneById(fromPaneId);
    const toPane = getPaneById(toPaneId);

    if (!fromPane?.host || !toPane?.host) return;

    const fromPath = joinRemotePath(fromPane.path, fileName);
    const toPath = joinRemotePath(toPane.path, fileName);

    if (isDir) {
      showAlert(
        "Not supported",
        "Folder copying is not supported via drag and drop yet. Please copy files.",
      );
      return;
    }

    startFileCopy(fromPaneId, fromPath, toPaneId, toPath, fileName);
  };

  const executePaneTransfer = (...args) =>
    executePaneTransferRef.current?.(...args);

  const handleDrop = async (e, toPaneId) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPaneId(null);

    const payload = readDragPayload(e, dragPayloadRef);
    dragPayloadRef.current = null;

    if (!payload?.fromPane || !payload.fileName) return;

    executePaneTransfer(
      payload.fromPane,
      toPaneId,
      payload.fileName,
      Boolean(payload.isDir),
    );
  };

  const handleRowPointerDown = (e, paneId, file) => {
    if (e.button !== 0) return;
    pointerDragSessionRef.current = {
      paneId,
      file,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  };

  React.useEffect(() => {
    const resetDragStyles = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMouseMove = (e) => {
      const session = pointerDragSessionRef.current;
      if (!session || e.buttons !== 1) return;

      if (!session.active) {
        const dist = Math.hypot(
          e.clientX - session.startX,
          e.clientY - session.startY,
        );
        if (dist < POINTER_DRAG_THRESHOLD) return;
        session.active = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }

      setPointerDrag({
        fromPaneId: session.paneId,
        file: session.file,
        x: e.clientX,
        y: e.clientY,
      });

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const paneEl = el?.closest("[data-sftp-pane]");
      const hoverPane = paneEl?.getAttribute("data-sftp-pane");
      const nextTarget =
        hoverPane && hoverPane !== session.paneId ? hoverPane : null;
      dropTargetPaneRef.current = nextTarget;
      setDropTargetPaneId(nextTarget);
    };

    const onMouseUp = () => {
      const session = pointerDragSessionRef.current;
      resetDragStyles();

      if (session?.active) {
        suppressRowClickRef.current = true;
        const toPaneId = dropTargetPaneRef.current;
        if (toPaneId) {
          executePaneTransferRef.current?.(
            session.paneId,
            toPaneId,
            session.file.name,
            Boolean(session.file.is_dir),
          );
        }
      }

      pointerDragSessionRef.current = null;
      dropTargetPaneRef.current = null;
      setPointerDrag(null);
      setDropTargetPaneId(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      resetDragStyles();
    };
  }, []);

  // Context Menu Actions
  const handleContextMenu = (e, paneId, file) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      paneId,
      file,
    });
  };

  // Right-click on empty space inside a connected pane → menu with no file
  // (New Folder / New File / Refresh / Select All …).
  const handlePaneContextMenu = (e, paneId) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      paneId,
      file: null,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // Keep the context menu fully on-screen: clamp its position to the viewport
  // after it renders (so items near the bottom/right edge stay clickable).
  React.useLayoutEffect(() => {
    if (!contextMenu.visible || !menuRef.current) return;
    const el = menuRef.current;
    const { offsetWidth: w, offsetHeight: h } = el;
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(contextMenu.x, window.innerWidth - w - margin),
    );
    const top = Math.max(
      margin,
      Math.min(contextMenu.y, window.innerHeight - h - margin),
    );
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [contextMenu.visible, contextMenu.x, contextMenu.y, contextMenu.file]);

  React.useEffect(() => {
    const handleGlobalClick = () => closeContextMenu();
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Listen for "edit and auto-sync" results emitted by the backend watcher.
  React.useEffect(() => {
    const unlisteners = [];

    listen("sftp://edit-synced", (event) => {
      const { connection_id: connectionId, remote_path: remotePath } =
        event.payload || {};
      const pane = getPaneById(connectionId);
      // If the saved file lives in the directory we're currently viewing, refresh it.
      if (pane?.host && remotePath) {
        const parent = remotePath.slice(0, remotePath.lastIndexOf("/")) || "/";
        if (parent === pane.path) {
          sftpDirectoryCache.delete(`${connectionId}:${pane.path}`);
          loadDir(connectionId, pane.path);
        }
      }
    }).then((un) => unlisteners.push(un));

    listen("sftp://edit-error", (event) => {
      const { name, error } = event.payload || {};
      showAlert(
        "Auto-sync failed",
        `Could not save ${name || "file"}: ${error || "unknown error"}`,
      );
    }).then((un) => unlisteners.push(un));

    return () => unlisteners.forEach((un) => un());
  }, [getPaneById, loadDir, showAlert]);

  // Open a remote file in the local system editor with live auto-sync (Termius
  // style). The backend downloads it to a temp file and re-uploads on every save.
  const startEdit = async (paneId, file) => {
    const pane = getPaneById(paneId);
    if (!pane?.host) return;

    const remotePath = joinRemotePath(pane.path, file.name);
    const transferKey = `edit:${paneId}:${remotePath}`;
    const transferId = Math.random().toString(36).substring(7);

    const startedId = beginTransfer(transferKey, {
      id: transferId,
      kind: "edit",
      fileName: file.name,
      fromHost: pane.host.name || pane.host.address,
      toHost: "Local editor",
      percentage: 100,
      bytesMoved: 0,
      totalSize: 0,
      status: "running",
    });

    try {
      const localPath = await invoke("sftp_edit_file", {
        connectionId: paneId,
        remotePath,
        fileName: file.name,
      });
      await openPath(localPath);
      if (startedId) finishTransfer(transferId, transferKey, "completed");
    } catch (err) {
      if (startedId)
        finishTransfer(transferId, transferKey, "failed", String(err));
      showAlert("Could not open file", String(err));
    }
  };

  const handleOpen = () => {
    const { paneId, file } = contextMenu;
    if (!file) return;
    const pane = paneId === "pane-1" ? pane1 : pane2;

    if (file.is_dir) {
      const targetPath =
        pane.path === "/" ? `/${file.name}` : `${pane.path}/${file.name}`;
      navigateTo(paneId, targetPath);
    } else {
      startEdit(paneId, file);
    }
    closeContextMenu();
  };

  const handleCopyTarget = () => {
    const { paneId, file } = contextMenu;
    if (!file) return;

    if (file.is_dir) {
      showAlert(
        "Not supported",
        "Folder copying between panes is not supported yet. Download the folder instead.",
      );
      closeContextMenu();
      return;
    }

    const fromPane = paneId === "pane-1" ? pane1 : pane2;
    const toPaneId = paneId === "pane-1" ? "pane-2" : "pane-1";
    const toPane = toPaneId === "pane-1" ? pane1 : pane2;

    if (!toPane.host) {
      showAlert(
        "Target not connected",
        "The target pane is not connected to a host.",
      );
      closeContextMenu();
      return;
    }

    const fromPath = joinRemotePath(fromPane.path, file.name);
    const toPath = joinRemotePath(toPane.path, file.name);

    startFileCopy(paneId, fromPath, toPaneId, toPath, file.name);
    closeContextMenu();
  };

  const handleDownload = () => {
    const { paneId, file } = contextMenu;
    if (!file) return;

    const pane = paneId === "pane-1" ? pane1 : pane2;
    const remotePath = joinRemotePath(pane.path, file.name);
    startDownload(paneId, remotePath, file.name, Boolean(file.is_dir));
    closeContextMenu();
  };

  // The handlers below open a dialog; the actual SFTP call runs on confirm.
  const handleCreateFolder = () => {
    const { paneId } = contextMenu;
    setDialog({
      type: "newFolder",
      paneId,
      file: null,
      value: "",
      title: "",
      message: "",
    });
    closeContextMenu();
  };

  const handleCreateFile = () => {
    const { paneId } = contextMenu;
    setDialog({
      type: "newFile",
      paneId,
      file: null,
      value: "",
      title: "",
      message: "",
    });
    closeContextMenu();
  };

  const handleDelete = () => {
    const { paneId, file } = contextMenu;
    if (!file) return;
    setDialog({
      type: "delete",
      paneId,
      file,
      value: "",
      title: "",
      message: "",
    });
    closeContextMenu();
  };

  const handleRename = () => {
    const { paneId, file } = contextMenu;
    if (!file) return;
    setDialog({
      type: "rename",
      paneId,
      file,
      value: file.name,
      title: "",
      message: "",
    });
    closeContextMenu();
  };

  // Confirm executors invoked from the dialog footer buttons.
  const confirmCreateFolder = async () => {
    const { paneId, value } = dialog;
    const folderName = value.trim();
    if (!folderName) return;
    const pane = getPaneById(paneId);
    closeDialog();

    sftpDirectoryCache.delete(`${paneId}:${pane.path}`);
    const targetPath = joinRemotePath(pane.path, folderName);
    try {
      await invoke("sftp_create_dir", {
        connectionId: paneId,
        path: targetPath,
      });
      loadDir(paneId, pane.path);
    } catch (err) {
      showAlert("Failed to create folder", String(err));
    }
  };

  const confirmCreateFile = async () => {
    const { paneId, value } = dialog;
    const fileName = value.trim();
    if (!fileName) return;
    const pane = getPaneById(paneId);
    closeDialog();

    sftpDirectoryCache.delete(`${paneId}:${pane.path}`);
    const targetPath = joinRemotePath(pane.path, fileName);
    try {
      await invoke("sftp_create_file", {
        connectionId: paneId,
        path: targetPath,
      });
      loadDir(paneId, pane.path);
    } catch (err) {
      showAlert("Failed to create file", String(err));
    }
  };

  const confirmDelete = async () => {
    const { paneId, file } = dialog;
    if (!file) return;
    const pane = getPaneById(paneId);
    closeDialog();

    sftpDirectoryCache.delete(`${paneId}:${pane.path}`);
    const targetPath = joinRemotePath(pane.path, file.name);
    try {
      await invoke("sftp_delete", {
        connectionId: paneId,
        path: targetPath,
        isDir: file.is_dir,
      });
      loadDir(paneId, pane.path);
    } catch (err) {
      showAlert("Failed to delete", String(err));
    }
  };

  const confirmRename = async () => {
    const { paneId, file, value } = dialog;
    if (!file) return;
    const newName = value.trim();
    const pane = getPaneById(paneId);

    if (!newName || newName === file.name) {
      closeDialog();
      return;
    }
    closeDialog();

    sftpDirectoryCache.delete(`${paneId}:${pane.path}`);
    const srcPath = joinRemotePath(pane.path, file.name);
    const destPath = joinRemotePath(pane.path, newName);
    try {
      await invoke("sftp_rename", {
        connectionId: paneId,
        src: srcPath,
        dest: destPath,
      });
      loadDir(paneId, pane.path);
    } catch (err) {
      showAlert("Failed to rename", String(err));
    }
  };

  // Helper formatting size bytes
  const formatBytes = (bytes) => {
    if (bytes === 0) return "--";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatUnixTime = (secs) => {
    if (!secs) return "--";
    return new Date(secs * 1000).toLocaleString();
  };

  // Render selection screen or file view for a pane
  const renderPane = (paneId) => {
    const pane = paneId === "pane-1" ? pane1 : pane2;
    const setPane = paneId === "pane-1" ? setPane1 : setPane2;
    const activeHost = pane.host;

    // 1. Connection/Loading Screen
    if (pane.loading && !activeHost) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-foreground p-6 select-none animate-in fade-in duration-200">
          <Loader2 className="animate-spin size-9 text-primary mb-3" />
          <h3 className="text-xs font-semibold">Connecting to SFTP Host...</h3>
          <p className="text-[10px] text-muted-foreground">
            Establishing secure subsystem tunnel
          </p>
        </div>
      );
    }

    // 2. Unconnected Initial Placeholder
    if (!activeHost && !pane.showSelectHostList) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-foreground p-6 select-none text-center animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 text-primary">
            <Network className="size-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Connect to host</h3>
          <p className="text-xs text-muted-foreground max-w-xs mt-1.5 leading-relaxed">
            Start by connecting to a saved host to manage your files with SFTP.
          </p>
          <Button
            onClick={() =>
              setPane((prev) => ({ ...prev, showSelectHostList: true }))
            }
            className="mt-5 cursor-pointer"
          >
            Select host
          </Button>
        </div>
      );
    }

    // 3. Select Host List view
    if (!activeHost && pane.showSelectHostList) {
      const filteredHosts = hosts.filter(
        (h) =>
          h.name.toLowerCase().includes(searchHostQuery.toLowerCase()) ||
          h.address.toLowerCase().includes(searchHostQuery.toLowerCase()),
      );

      return (
        <div className="flex flex-col h-full bg-background border border-border rounded-lg p-5 text-foreground select-none animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer"
                onClick={() =>
                  setPane((prev) => ({ ...prev, showSelectHostList: false }))
                }
              >
                <ArrowLeft className="size-4" />
              </Button>
              <div>
                <h2 className="text-sm font-semibold">Select Host</h2>
                <span className="text-xs text-muted-foreground">
                  Choose a saved connection
                </span>
              </div>
            </div>
            <div className="relative w-44">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search hosts..."
                className="pl-8 h-8 text-xs bg-sidebar"
                value={searchHostQuery}
                onChange={(e) => setSearchHostQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredHosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-lg border-border text-muted-foreground p-4">
                <HardDrive className="size-7 mb-2 opacity-50 text-primary" />
                <p className="text-xs font-semibold">No hosts found</p>
                <p className="text-xs">Add hosts from the Hosts page first.</p>
              </div>
            ) : (
              filteredHosts.map((h) => (
                <div
                  key={h.id}
                  onClick={() => connectHost(paneId, h)}
                  className="flex items-center gap-3 p-3 bg-sidebar hover:bg-muted/40 border border-border rounded-lg cursor-pointer transition-colors group"
                >
                  <div className="size-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    {h.os?.toLowerCase().includes("ubuntu") ? "U" : "S"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {h.name || h.address}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {h.username}@{h.address}:{h.port}
                    </p>
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // 4. Connected SFTP Directory list view
    const filteredFiles = pane.files.filter((f) => {
      if (!pane.showHidden && f.name.startsWith(".")) return false;
      return f.name.toLowerCase().includes(pane.filter.toLowerCase());
    });

    return (
      <div
        data-sftp-pane={paneId}
        className={cn(
          "flex flex-col h-full bg-background text-foreground select-none relative animate-in fade-in duration-200",
          dropTargetPaneId === paneId && "ring-2 ring-inset ring-primary/40",
        )}
        onDragOver={(e) => handleDragOver(e, paneId)}
        onDragLeave={(e) => handleDragLeave(e, paneId)}
        onDrop={(e) => handleDrop(e, paneId)}
      >
        {dropTargetPaneId === paneId && (
          <div className="pointer-events-none absolute inset-0 z-20 bg-primary/5 border-2 border-dashed border-primary/30 flex items-center justify-center">
            <span className="text-xs font-medium text-primary bg-background/90 px-3 py-1 rounded-md border border-primary/20">
              Drop to copy here
            </span>
          </div>
        )}

        {/* Full-Pane Loading Screen Overlay */}
        {pane.loading && pane.files.length === 0 && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-[0.5px] flex flex-col items-center justify-center z-30 pointer-events-auto">
            <Loader2 className="animate-spin size-8 text-primary mb-2" />
            <span className="text-xs text-muted-foreground font-medium">
              Loading folder...
            </span>
          </div>
        )}

        {/* Navigation / Control Header */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-sidebar shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Back / Forward History */}
            <ButtonGroup>
              <Button
                variant="outline"
                size="icon-xs"
                disabled={pane.historyIndex === 0}
                onClick={() => goBack(paneId)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                disabled={pane.historyIndex === pane.history.length - 1}
                onClick={() => goForward(paneId)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </ButtonGroup>

            <InputGroup className="max-h-6">
              <InputGroupAddon>
                <Folder className="size-3.5 text-primary shrink-0" />
              </InputGroupAddon>
              <InputGroupInput
                className="text-xs!"
                value={pane.path}
                onChange={(e) => setPane({ ...pane, path: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    navigateTo(paneId, pane.path);
                  }
                }}
              />
            </InputGroup>
          </div>

          {/* Filtering and Actions */}
          <div className="flex items-center gap-2 ml-2">
            <ButtonGroup>
              <InputGroup className="max-h-6">
                <InputGroupAddon>
                  <RefreshCw className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Filter..."
                  className="text-xs w-30 placeholder:text-xs"
                  value={pane.filter}
                  onChange={(e) => setPane({ ...pane, filter: e.target.value })}
                />
              </InputGroup>
              <Button
                size="icon-xs"
                className="cursor-pointer border-y border-primary"
                onClick={() => loadDir(paneId, pane.path)}
                disabled={pane.loading}
              >
                <RefreshCw
                  className={`size-3.5 ${pane.loading ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                variant="destructive"
                size="icon-xs"
                className="cursor-pointer border-destructive/40"
                onClick={() => {
                  invoke("sftp_disconnect", { connectionId: paneId });
                  setPane((prev) => ({ ...prev, host: null, files: [] }));
                }}
              >
                <X className="size-3.5" />
              </Button>
            </ButtonGroup>
          </div>
        </div>

        {/* Directory Listing table */}
        <div
          className="flex-1 overflow-auto min-h-0 relative"
          onDragOver={(e) => handleDragOver(e, paneId)}
          onDrop={(e) => handleDrop(e, paneId)}
          onContextMenu={(e) => handlePaneContextMenu(e, paneId)}
        >
          {pane.error ? (
            <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-xs m-3 rounded-lg flex flex-col gap-2 leading-relaxed">
              <span className="font-semibold text-sm">Connection Error</span>
              <span>{pane.error}</span>
              <Button
                variant="destructive"
                size="sm"
                className="w-fit cursor-pointer"
                onClick={() => loadDir(paneId, pane.path)}
              >
                Retry
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-semibold sticky top-0 z-20 border-b border-border">
                <tr>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Date Modified</th>
                  <th className="py-2.5 px-4">Size</th>
                  <th className="py-2.5 px-4 w-20">Kind</th>
                </tr>
              </thead>
              <tbody>
                {/* Parent directory navigate dot row */}
                {pane.path !== "/" && pane.path !== "" && (
                  <tr
                    onDoubleClick={() => {
                      const parts = pane.path.split("/").filter(Boolean);
                      parts.pop();
                      const parent = "/" + parts.join("/");
                      navigateTo(paneId, parent);
                    }}
                    className="border-b border-border/10 hover:bg-sidebar/35 cursor-pointer text-muted-foreground"
                  >
                    <td className="py-3 px-4 flex items-center gap-2 font-semibold">
                      <Folder className="size-4 text-blue-400 shrink-0" />
                      <span>..</span>
                    </td>
                    <td className="py-3 px-4">--</td>
                    <td className="py-3 px-4">--</td>
                    <td className="py-3 px-4 text-muted-foreground/60">
                      parent
                    </td>
                  </tr>
                )}

                {filteredFiles.map((f) => {
                  const isSelected = pane.selected.has(f.name);
                  return (
                    <tr
                      key={f.name}
                      onMouseDown={(e) => handleRowPointerDown(e, paneId, f)}
                      onContextMenu={(e) => handleContextMenu(e, paneId, f)}
                      onDoubleClick={() => {
                        if (f.is_dir) {
                          const target =
                            pane.path === "/"
                              ? `/${f.name}`
                              : `${pane.path}/${f.name}`;
                          navigateTo(paneId, target);
                        }
                      }}
                      onClick={() => {
                        if (suppressRowClickRef.current) {
                          suppressRowClickRef.current = false;
                          return;
                        }
                        const nextSelected = new Set(pane.selected);
                        if (nextSelected.has(f.name)) {
                          nextSelected.delete(f.name);
                        } else {
                          nextSelected.add(f.name);
                        }
                        setPane((prev) => ({
                          ...prev,
                          selected: nextSelected,
                        }));
                      }}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/30 cursor-grab active:cursor-grabbing transition-colors",
                        isSelected && "bg-primary/10",
                      )}
                    >
                      <td className="py-2.5 px-4 font-medium">
                        <div className="flex items-center gap-3">
                          {f.is_dir ? (
                            <Folder className="size-4.5 text-primary shrink-0" />
                          ) : (
                            <File className="size-4.5 text-blue-500 shrink-0" />
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold truncate text-foreground leading-normal">
                              {f.name}
                            </span>
                            <span className="text-[9px] text-muted-foreground/80 font-mono leading-none pt-0.5">
                              {f.permissions}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground font-mono">
                        {formatUnixTime(f.modified)}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground font-mono">
                        {f.is_dir ? "--" : formatBytes(f.size)}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground/60">
                        {f.is_dir ? "folder" : "file"}
                      </td>
                    </tr>
                  );
                })}

                {filteredFiles.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground text-xs"
                    >
                      Directory is empty
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout
      sidebar={false}
      className="p-0 flex flex-col h-full min-h-0 select-none overflow-hidden"
    >
      {pointerDrag && (
        <div
          className="fixed z-[100] pointer-events-none flex items-center gap-2 rounded-md border border-primary/30 bg-popover px-2.5 py-1.5 text-xs font-medium text-foreground shadow-lg"
          style={{ left: pointerDrag.x + 14, top: pointerDrag.y + 14 }}
        >
          {pointerDrag.file.is_dir ? (
            <Folder className="size-3.5 text-blue-400 shrink-0" />
          ) : (
            <File className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="max-w-[220px] truncate">
            {pointerDrag.file.name}
          </span>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 h-full min-h-0 bg-background divide-x divide-border">
        <div className="h-full min-h-0 overflow-hidden">
          {renderPane("pane-1")}
        </div>
        <div className="h-full min-h-0 overflow-hidden">
          {renderPane("pane-2")}
        </div>
      </div>

      {/* Transfers bottom section */}
      {transfers.length > 0 && (
        <div className="bg-sidebar border-t border-border p-3 max-h-36 overflow-y-auto shrink-0 select-none">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Info className="size-3 text-primary" /> Active File Transfers
            </span>
            <Button
              variant="ghost"
              className="h-4 text-[9px] px-1 text-muted-foreground cursor-pointer"
              onClick={() => setTransfers([])}
            >
              Clear Transfers
            </Button>
          </div>
          <div className="space-y-2.5">
            {transfers.map((t) => (
              <div key={t.id} className="text-[10px] text-foreground space-y-1">
                <div className="flex justify-between font-semibold">
                  <span className="truncate max-w-[300px]">
                    {t.kind === "download" ? (
                      <>
                        Downloading{" "}
                        <span className="text-primary font-mono">
                          {t.fileName}
                        </span>{" "}
                        from{" "}
                        <span className="text-muted-foreground">
                          {t.fromHost}
                        </span>
                      </>
                    ) : t.kind === "edit" ? (
                      <>
                        Opening{" "}
                        <span className="text-primary font-mono">
                          {t.fileName}
                        </span>{" "}
                        for editing
                      </>
                    ) : (
                      <>
                        Transferring{" "}
                        <span className="text-primary font-mono">
                          {t.fileName}
                        </span>{" "}
                        ({t.fromHost} → {t.toHost})
                      </>
                    )}
                  </span>
                  <span className="font-mono">
                    {t.status === "completed" ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                        <Check className="size-3" />{" "}
                        {t.kind === "edit" ? "Opened" : "Done"}
                      </span>
                    ) : t.status === "failed" ? (
                      <span
                        className="text-destructive font-bold"
                        title={t.error || undefined}
                      >
                        Failed
                      </span>
                    ) : t.kind === "edit" ? (
                      <span className="text-primary font-bold">Opening…</span>
                    ) : (
                      `${t.percentage}% (${formatBytes(t.bytesMoved)} of ${formatBytes(t.totalSize)})`
                    )}
                  </span>
                </div>
                <div className="w-full bg-sidebar/85 rounded-full h-1.5 border border-border/30 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 ${
                      t.status === "completed"
                        ? "bg-emerald-500"
                        : t.status === "failed"
                          ? "bg-destructive"
                          : "bg-primary"
                    }`}
                    style={{ width: `${t.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt credentials Modal */}
      {authPrompt.visible && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <form
            onSubmit={handlePromptSubmit}
            className="border bg-sidebar p-5 rounded-xl max-w-sm w-full shadow-lg space-y-4 m-4 animate-in zoom-in-95 duration-200"
          >
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="size-4 text-primary" /> Authentication required
            </h3>
            <div className="space-y-1.5">
              <p className="text-xs text-foreground">
                Enter target{" "}
                {authPrompt.type === "password"
                  ? "password"
                  : "private key passphrase"}{" "}
                for{" "}
                <span className="font-semibold text-primary">
                  {authPrompt.host.name || authPrompt.host.address}
                </span>
                :
              </p>
              <Input
                type="password"
                placeholder={
                  authPrompt.type === "password" ? "Password" : "Passphrase"
                }
                value={authPrompt.value}
                onChange={(e) =>
                  setAuthPrompt({ ...authPrompt, value: e.target.value })
                }
                className="h-9 text-xs focus:ring-primary/40"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs cursor-pointer"
                onClick={() => {
                  const setPane =
                    authPrompt.paneId === "pane-1" ? setPane1 : setPane2;
                  setPane((prev) => ({ ...prev, host: null, error: "" }));
                  setAuthPrompt({
                    visible: false,
                    paneId: "",
                    host: null,
                    type: "password",
                    value: "",
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs cursor-pointer"
              >
                Unlock & Connect
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Context Menu */}
      {contextMenu.visible &&
        (() => {
          const menuPane = getPaneById(contextMenu.paneId);
          const setMenuPane =
            contextMenu.paneId === "pane-1" ? setPane1 : setPane2;
          const fileCount = menuPane?.files?.length || 0;
          const allSelected =
            fileCount > 0 && menuPane.selected?.size === fileCount;
          const itemClass =
            "px-3 py-1.5 text-xs text-foreground hover:bg-muted text-left font-medium cursor-pointer flex items-center gap-2.5";

          return (
            <div
              ref={menuRef}
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg w-52 py-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col"
            >
              {contextMenu.file && (
                <>
                  <button onClick={handleOpen} className={itemClass}>
                    {contextMenu.file.is_dir ? (
                      <FolderOpen className="size-3.5 text-primary shrink-0" />
                    ) : (
                      <Pencil className="size-3.5 text-primary shrink-0" />
                    )}
                    {contextMenu.file.is_dir ? "Open" : "Open & edit"}
                  </button>
                  <button onClick={handleDownload} className={itemClass}>
                    <Download className="size-3.5 text-primary shrink-0" />
                    Download{contextMenu.file.is_dir ? " as ZIP" : ""}
                  </button>
                  <button onClick={handleCopyTarget} className={itemClass}>
                    <Copy className="size-3.5 text-primary shrink-0" />
                    Copy to other pane
                  </button>
                  <button onClick={handleRename} className={itemClass}>
                    <Pencil className="size-3.5 text-primary shrink-0" />
                    Rename
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left font-medium cursor-pointer flex items-center gap-2.5"
                  >
                    <Trash2 className="size-3.5 shrink-0" />
                    Delete
                  </button>
                  <hr className="border-border/40 my-1" />
                </>
              )}

              <button
                onClick={() => {
                  loadDir(contextMenu.paneId, menuPane.path);
                  closeContextMenu();
                }}
                className={itemClass}
              >
                <RefreshCw className="size-3.5 text-primary shrink-0" />
                Refresh
              </button>
              <button onClick={handleCreateFolder} className={itemClass}>
                <FolderPlus className="size-3.5 text-primary shrink-0" />
                New Folder
              </button>
              <button onClick={handleCreateFile} className={itemClass}>
                <FilePlus className="size-3.5 text-primary shrink-0" />
                New File
              </button>
              <button
                onClick={() => {
                  setMenuPane((prev) => ({
                    ...prev,
                    showHidden: !prev.showHidden,
                  }));
                  closeContextMenu();
                }}
                className={itemClass}
              >
                {menuPane?.showHidden ? (
                  <EyeOff className="size-3.5 text-primary shrink-0" />
                ) : (
                  <Eye className="size-3.5 text-primary shrink-0" />
                )}
                {menuPane?.showHidden
                  ? "Hide Hidden Files"
                  : "Show Hidden Files"}
              </button>
              <button
                onClick={() => {
                  setMenuPane((prev) => ({
                    ...prev,
                    selected: allSelected
                      ? new Set()
                      : new Set(prev.files.map((f) => f.name)),
                  }));
                  closeContextMenu();
                }}
                className={itemClass}
              >
                {allSelected ? (
                  <Square className="size-3.5 text-primary shrink-0" />
                ) : (
                  <CheckSquare className="size-3.5 text-primary shrink-0" />
                )}
                {allSelected ? "Deselect All" : "Select All"}
              </button>
              <hr className="border-border/40 my-1.5" />
              <button
                onClick={closeContextMenu}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted text-left font-medium cursor-pointer flex items-center gap-2.5"
              >
                <X className="size-3.5 shrink-0" />
                Close
              </button>
            </div>
          );
        })()}

      {/* Rename / New Folder / New File / Delete / Alert dialogs */}
      <Dialog
        open={!!dialog.type}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent showCloseButton={false}>
          {dialog.type === "rename" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                confirmRename();
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Pencil className="size-4 text-primary" /> Rename
                </DialogTitle>
                <DialogDescription>
                  Renaming{" "}
                  <span className="font-semibold text-foreground">
                    {dialog.file?.name}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                value={dialog.value}
                onChange={(e) =>
                  setDialog((prev) => ({ ...prev, value: e.target.value }))
                }
                className="h-9 text-xs"
                placeholder="New name"
              />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={closeDialog}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="cursor-pointer">
                  Rename
                </Button>
              </DialogFooter>
            </form>
          )}

          {(dialog.type === "newFolder" || dialog.type === "newFile") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                dialog.type === "newFolder"
                  ? confirmCreateFolder()
                  : confirmCreateFile();
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {dialog.type === "newFolder" ? (
                    <FolderPlus className="size-4 text-primary" />
                  ) : (
                    <FilePlus className="size-4 text-primary" />
                  )}
                  {dialog.type === "newFolder" ? "New Folder" : "New File"}
                </DialogTitle>
                <DialogDescription>
                  Enter a name for the new{" "}
                  {dialog.type === "newFolder" ? "folder" : "file"}.
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                value={dialog.value}
                onChange={(e) =>
                  setDialog((prev) => ({ ...prev, value: e.target.value }))
                }
                className="h-9 text-xs"
                placeholder={
                  dialog.type === "newFolder" ? "Folder name" : "File name"
                }
              />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={closeDialog}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="cursor-pointer">
                  Create
                </Button>
              </DialogFooter>
            </form>
          )}

          {dialog.type === "delete" && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base text-destructive">
                  <Trash2 className="size-4" /> Delete{" "}
                  {dialog.file?.is_dir ? "folder" : "file"}
                </DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-foreground">
                    {dialog.file?.name}
                  </span>
                  ? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={closeDialog}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="cursor-pointer"
                  onClick={confirmDelete}
                >
                  Delete
                </Button>
              </DialogFooter>
            </div>
          )}

          {dialog.type === "alert" && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-amber-500" />{" "}
                  {dialog.title || "Notice"}
                </DialogTitle>
                <DialogDescription className="break-words">
                  {dialog.message}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  size="sm"
                  className="cursor-pointer"
                  onClick={closeDialog}
                >
                  OK
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
