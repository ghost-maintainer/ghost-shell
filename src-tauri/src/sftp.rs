use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use russh::client;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::AppState;

pub struct SftpConnection {
    pub sftp: Arc<SftpSession>,
    #[allow(dead_code)]
    pub handle: client::Handle<crate::ssh::ClientHandler>,
}

#[derive(Default)]
pub struct SftpManager {
    pub connections: Mutex<HashMap<String, SftpConnection>>,
    // Live "edit and auto-sync" watchers, keyed by "<connection_id>|<remote_path>".
    // The flag is flipped to false to stop the background polling task.
    pub editors: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
struct EditSyncEvent {
    connection_id: String,
    remote_path: String,
    name: String,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct SftpFile {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u32,
    pub permissions: String,
}

#[derive(Clone, Serialize)]
pub struct TransferProgress {
    pub percentage: u32,
    pub bytes_moved: u64,
    pub total_size: u64,
}

fn get_permissions_string(mode: Option<u32>, is_dir: bool) -> String {
    let mode = mode.unwrap_or(0);
    let mut chars = vec!['-'; 10];
    if is_dir {
        chars[0] = 'd';
    }

    // User permissions
    if mode & 0o400 != 0 { chars[1] = 'r'; }
    if mode & 0o200 != 0 { chars[2] = 'w'; }
    if mode & 0o100 != 0 { chars[3] = 'x'; }

    // Group permissions
    if mode & 0o040 != 0 { chars[4] = 'r'; }
    if mode & 0o020 != 0 { chars[5] = 'w'; }
    if mode & 0o010 != 0 { chars[6] = 'x'; }

    // Other permissions
    if mode & 0o004 != 0 { chars[7] = 'r'; }
    if mode & 0o002 != 0 { chars[8] = 'w'; }
    if mode & 0o001 != 0 { chars[9] = 'x'; }

    chars.into_iter().collect()
}

struct RemoteArchiveEntry {
    remote_path: String,
    archive_path: String,
    size: u64,
}

fn join_remote_path(base: &str, name: &str) -> String {
    if base.ends_with('/') {
        format!("{base}{name}")
    } else {
        format!("{base}/{name}")
    }
}

fn entry_is_dir(mode: Option<u32>) -> bool {
    mode.map(|m| (m & 0o170000) == 0o040000).unwrap_or(false)
}

fn pick_save_path(app: &AppHandle, title: &str, file_name: &str) -> Result<PathBuf, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let file_name = file_name.to_string();
    let title = title.to_string();
    app.run_on_main_thread(move || {
        let res = rfd::FileDialog::new()
            .set_title(&title)
            .set_file_name(&file_name)
            .save_file();
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Save cancelled by user".to_string())
}

async fn remote_path_exists(sftp: &SftpSession, path: &str) -> Result<bool, String> {
    match sftp.metadata(path).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

async fn collect_remote_tree(
    sftp: &SftpSession,
    root_dir: &str,
    root_prefix: &str,
    entries: &mut Vec<RemoteArchiveEntry>,
) -> Result<(), String> {
    let mut queue = vec![(root_dir.to_string(), root_prefix.to_string())];

    while let Some((dir_path, archive_prefix)) = queue.pop() {
        let items = sftp.read_dir(&dir_path).await.map_err(|e| e.to_string())?;

        for item in items {
            let name = item.file_name().to_string();
            if name == "." || name == ".." {
                continue;
            }

            let remote_path = join_remote_path(&dir_path, &name);
            let archive_path = if archive_prefix.is_empty() {
                name.clone()
            } else {
                format!("{archive_prefix}/{name}")
            };

            let mode = item.metadata().permissions;
            if entry_is_dir(mode) {
                queue.push((remote_path, archive_path));
            } else {
                let size = item.metadata().size.unwrap_or(0);
                entries.push(RemoteArchiveEntry {
                    remote_path,
                    archive_path,
                    size,
                });
            }
        }
    }

    Ok(())
}

async fn stream_remote_to_local(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &Path,
    progress_channel: &Channel<TransferProgress>,
) -> Result<(), String> {
    let meta = sftp
        .metadata(remote_path)
        .await
        .map_err(|e| format!("Failed to read remote metadata: {e}"))?;
    let total_size = meta.size.unwrap_or(0);

    let mut remote = sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("Failed to open remote file: {e}"))?;
    let mut local = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| format!("Failed to create local file: {e}"))?;

    let mut progress_failed = false;
    let mut buffer = [0u8; 65536];
    let mut bytes_moved = 0u64;

    loop {
        let n = remote
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read remote file: {e}"))?;
        if n == 0 {
            break;
        }
        local
            .write_all(&buffer[..n])
            .await
            .map_err(|e| format!("Failed to write local file: {e}"))?;
        bytes_moved += n as u64;

        let percentage = if total_size > 0 {
            ((bytes_moved * 100) / total_size) as u32
        } else {
            100
        };

        if !progress_failed {
            if progress_channel.send(TransferProgress {
                percentage,
                bytes_moved,
                total_size,
            }).is_err() {
                progress_failed = true;
            }
        }
    }

    local
        .flush()
        .await
        .map_err(|e| format!("Failed to finalize local file: {e}"))?;

    let local_size = tokio::fs::metadata(local_path)
        .await
        .map_err(|e| format!("Failed to verify local file: {e}"))?
        .len();

    if local_size != total_size {
        let _ = tokio::fs::remove_file(local_path).await;
        return Err(format!(
            "Download verification failed: expected {total_size} bytes, wrote {local_size} bytes"
        ));
    }

    Ok(())
}

/// Download a remote file to a local path without progress reporting.
/// Used by the "edit and auto-sync" workflow.
async fn download_remote_to_local(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &Path,
) -> Result<(), String> {
    let mut remote = sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("Failed to open remote file: {e}"))?;
    let mut local = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| format!("Failed to create local file: {e}"))?;

    let mut buffer = [0u8; 65536];
    loop {
        let n = remote
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read remote file: {e}"))?;
        if n == 0 {
            break;
        }
        local
            .write_all(&buffer[..n])
            .await
            .map_err(|e| format!("Failed to write local file: {e}"))?;
    }

    local
        .flush()
        .await
        .map_err(|e| format!("Failed to finalize local file: {e}"))?;

    Ok(())
}

/// Upload a local file to a remote path (overwriting), without progress reporting.
/// Used to push edits back to the server during the auto-sync workflow.
async fn stream_local_to_remote(
    sftp: &SftpSession,
    local_path: &Path,
    remote_path: &str,
) -> Result<(), String> {
    let mut local = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("Failed to open local file: {e}"))?;
    let mut remote = sftp
        .create(remote_path)
        .await
        .map_err(|e| format!("Failed to open remote file for writing: {e}"))?;

    let mut buffer = [0u8; 65536];
    loop {
        let n = local
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read local file: {e}"))?;
        if n == 0 {
            break;
        }
        remote
            .write_all(&buffer[..n])
            .await
            .map_err(|e| format!("Failed to write remote file: {e}"))?;
    }

    remote
        .flush()
        .await
        .map_err(|e| format!("Failed to finalize remote file: {e}"))?;
    remote
        .shutdown()
        .await
        .map_err(|e| format!("Failed to close remote file: {e}"))?;

    Ok(())
}

async fn download_dir_as_zip(
    sftp: &SftpSession,
    remote_dir: &str,
    local_path: &Path,
    progress_channel: &Channel<TransferProgress>,
) -> Result<(), String> {
    let base_name = Path::new(remote_dir)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("download")
        .to_string();

    let mut entries = Vec::new();
    collect_remote_tree(sftp, remote_dir, &base_name, &mut entries).await?;

    if entries.is_empty() {
        return Err("Folder is empty — nothing to download".to_string());
    }

    let total_size: u64 = entries.iter().map(|e| e.size).sum();
    let file = std::fs::File::create(local_path)
        .map_err(|e| format!("Failed to create zip file: {e}"))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut progress_failed = false;
    let mut bytes_moved = 0u64;

    for entry in entries {
        let mut remote = sftp
            .open(&entry.remote_path)
            .await
            .map_err(|e| format!("Failed to open {}: {e}", entry.remote_path))?;

        zip.start_file(&entry.archive_path, options)
            .map_err(|e| format!("Failed to add {} to zip: {e}", entry.archive_path))?;

        let mut buffer = [0u8; 65536];
        loop {
            let n = remote
                .read(&mut buffer)
                .await
                .map_err(|e| format!("Failed to read {}: {e}", entry.remote_path))?;
            if n == 0 {
                break;
            }
            zip.write_all(&buffer[..n])
                .map_err(|e| format!("Failed to write zip entry: {e}"))?;
            bytes_moved += n as u64;

            let percentage = if total_size > 0 {
                ((bytes_moved * 100) / total_size) as u32
            } else {
                100
            };

            if !progress_failed {
                if progress_channel.send(TransferProgress {
                    percentage,
                    bytes_moved,
                    total_size,
                }).is_err() {
                    progress_failed = true;
                }
            }
        }
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize zip file: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn sftp_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    manager: State<'_, SftpManager>,
    connection_id: String,
    host_id: usize,
    password: Option<String>,
    passphrase: Option<String>,
) -> Result<String, String> {
    // Disconnect existing if any
    {
        let mut conns = manager.connections.lock().unwrap();
        conns.remove(&connection_id);
    }

    // 1. Load host configuration
    let (host, key_entry) = crate::ssh::load_host(&app, &state, host_id)?;
    let saved_passphrase = key_entry.as_ref().and_then(|k| k.passphrase.clone());
    let key_pem = key_entry.as_ref().map(|k| k.private_key.clone());
    let password = password.or(host.password.clone());

    let addr = format!("{}:{}", host.address, host.port);
    let config = Arc::new(client::Config::default());

    // 2. SSH TCP Handshake
    let mut handle = client::connect(config, addr.as_str(), crate::ssh::ClientHandler)
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    // 3. Authenticate Session
    crate::ssh::authenticate(
        &mut handle,
        &host,
        key_pem.as_deref(),
        saved_passphrase.as_deref(),
        password.as_deref(),
        passphrase.as_deref(),
    )
    .await?;

    // 4. Open Channel and request "sftp" subsystem
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open channel: {e}"))?;

    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("Failed to request subsystem sftp: {e}"))?;

    // 5. Initialize SftpSession
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("Failed to create SFTP session: {e}"))?;

    let home_path = sftp
        .canonicalize(".")
        .await
        .map_err(|e| format!("Failed to resolve remote home: {e}"))?;

    // 6. Save connection
    manager.connections.lock().unwrap().insert(
        connection_id,
        SftpConnection {
            sftp: Arc::new(sftp),
            handle,
        },
    );

    Ok(home_path)
}

#[tauri::command]
pub fn sftp_disconnect(manager: State<'_, SftpManager>, connection_id: String) {
    // Stop any live edit-sync watchers tied to this connection.
    {
        let prefix = format!("{connection_id}|");
        let mut editors = manager.editors.lock().unwrap();
        editors.retain(|key, flag| {
            if key.starts_with(&prefix) {
                flag.store(false, Ordering::SeqCst);
                false
            } else {
                true
            }
        });
    }

    let mut conns = manager.connections.lock().unwrap();
    conns.remove(&connection_id);
}

#[tauri::command]
pub async fn sftp_list_dir(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
) -> Result<Vec<SftpFile>, String> {
    let sftp = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        conn.sftp.clone()
    };

    let target_path = if path.is_empty() || path == "." {
        sftp.canonicalize(".").await.map_err(|e| e.to_string())?
    } else {
        path
    };

    let entries = sftp.read_dir(&target_path).await.map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    for entry in entries {
        let name = entry.file_name().to_string();
        if name == "." || name == ".." {
            continue;
        }

        let permissions_val = entry.metadata().permissions;
        let mode = permissions_val.unwrap_or(0);
        let is_dir = (mode & 0o170000) == 0o040000;

        let size = entry.metadata().size.unwrap_or(0);
        let modified = entry.metadata().mtime.unwrap_or(0);
        let perm_str = get_permissions_string(permissions_val, is_dir);

        files.push(SftpFile {
            name,
            is_dir,
            size,
            modified,
            permissions: perm_str,
        });
    }

    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(files)
}

#[tauri::command]
pub async fn sftp_create_dir(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let sftp = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        conn.sftp.clone()
    };

    sftp.create_dir(&path).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_create_file(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let sftp = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        conn.sftp.clone()
    };

    if remote_path_exists(&sftp, &path).await? {
        return Err(format!("A file or folder named '{path}' already exists"));
    }

    let mut file = sftp.create(&path).await.map_err(|e| e.to_string())?;
    file.shutdown().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Download a remote file to a local temp path, open-able by the system editor,
/// and spawn a background task that re-uploads the file whenever it changes on
/// disk (Termius-style "edit and auto-sync"). Returns the local temp path.
#[tauri::command]
pub async fn sftp_edit_file(
    app: AppHandle,
    manager: State<'_, SftpManager>,
    connection_id: String,
    remote_path: String,
    file_name: String,
) -> Result<String, String> {
    let sftp = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        conn.sftp.clone()
    };

    // Build a local temp path: <tmp>/ghost-shell-edits/<connection_id>/<file_name>
    let mut dir = std::env::temp_dir();
    dir.push("ghost-shell-edits");
    dir.push(&connection_id);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create temp directory: {e}"))?;

    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("download")
        .to_string();
    let mut local_path = dir;
    local_path.push(&safe_name);

    download_remote_to_local(&sftp, &remote_path, &local_path).await?;

    let initial_mtime = tokio::fs::metadata(&local_path)
        .await
        .ok()
        .and_then(|m| m.modified().ok());

    // Register (or replace) the watcher flag for this file.
    let key = format!("{connection_id}|{remote_path}");
    let flag = Arc::new(AtomicBool::new(true));
    {
        let mut editors = manager.editors.lock().unwrap();
        if let Some(old) = editors.insert(key.clone(), flag.clone()) {
            old.store(false, Ordering::SeqCst);
        }
    }

    // Background poller: watch the local file's mtime and push changes back.
    let watch_local = local_path.clone();
    let watch_remote = remote_path.clone();
    let watch_conn = connection_id.clone();
    let watch_name = safe_name.clone();
    tauri::async_runtime::spawn(async move {
        let mut last_mtime = initial_mtime;
        while flag.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if !flag.load(Ordering::SeqCst) {
                break;
            }

            let current = match tokio::fs::metadata(&watch_local).await {
                Ok(m) => m.modified().ok(),
                // File was removed locally — stop watching.
                Err(_) => break,
            };

            if current != last_mtime {
                last_mtime = current;
                let result = stream_local_to_remote(&sftp, &watch_local, &watch_remote).await;
                let event = EditSyncEvent {
                    connection_id: watch_conn.clone(),
                    remote_path: watch_remote.clone(),
                    name: watch_name.clone(),
                    error: result.err(),
                };
                let channel = if event.error.is_some() {
                    "sftp://edit-error"
                } else {
                    "sftp://edit-synced"
                };
                let _ = app.emit(channel, event);
            }
        }
    });

    Ok(local_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn sftp_delete(
    manager: State<'_, SftpManager>,
    connection_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let sftp = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        conn.sftp.clone()
    };

    if is_dir {
        sftp.remove_dir(&path).await.map_err(|e| e.to_string())?;
    } else {
        sftp.remove_file(&path).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn sftp_rename(
    manager: State<'_, SftpManager>,
    connection_id: String,
    src: String,
    dest: String,
) -> Result<(), String> {
    let sftp = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        conn.sftp.clone()
    };

    sftp.rename(&src, &dest).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sftp_copy_file(
    manager: State<'_, SftpManager>,
    from_connection_id: String,
    from_path: String,
    to_connection_id: String,
    to_path: String,
    progress_channel: Channel<TransferProgress>,
) -> Result<(), String> {
    let sftp_from = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&from_connection_id).ok_or("Source connection not found")?;
        conn.sftp.clone()
    };

    let sftp_to = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns.get(&to_connection_id).ok_or("Target connection not found")?;
        conn.sftp.clone()
    };

    let meta = sftp_from.metadata(&from_path).await.map_err(|e| e.to_string())?;
    let total_size = meta.size.unwrap_or(0);

    if remote_path_exists(&sftp_to, &to_path).await? {
        return Err(format!(
            "Destination already exists: {to_path}. Delete or rename it first."
        ));
    }

    if from_connection_id == to_connection_id && from_path == to_path {
        return Err("Source and destination paths are the same".to_string());
    }

    let mut src_file = sftp_from.open(&from_path).await.map_err(|e| e.to_string())?;
    let mut dest_file = sftp_to.create(&to_path).await.map_err(|e| e.to_string())?;

    let mut progress_failed = false;
    let mut buffer = [0u8; 65536];
    let mut bytes_moved = 0;

    loop {
        let n = src_file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        dest_file.write_all(&buffer[..n]).await.map_err(|e| e.to_string())?;
        bytes_moved += n as u64;

        let percentage = if total_size > 0 {
            ((bytes_moved * 100) / total_size) as u32
        } else {
            100
        };

        if !progress_failed {
            if progress_channel.send(TransferProgress {
                percentage,
                bytes_moved,
                total_size,
            }).is_err() {
                progress_failed = true;
            }
        }
    }

    let dest_meta = sftp_to
        .metadata(&to_path)
        .await
        .map_err(|e| format!("Copy finished but verification failed: {e}"))?;
    let dest_size = dest_meta.size.unwrap_or(0);

    if dest_size != total_size {
        let _ = sftp_to.remove_file(&to_path).await;
        return Err(format!(
            "Copy verification failed: expected {total_size} bytes, destination has {dest_size} bytes"
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn sftp_download(
    app: AppHandle,
    manager: State<'_, SftpManager>,
    connection_id: String,
    remote_path: String,
    is_dir: bool,
    suggested_name: String,
    progress_channel: Channel<TransferProgress>,
) -> Result<String, String> {
    let sftp = {
        let conns = manager.connections.lock().unwrap();
        let conn = conns
            .get(&connection_id)
            .ok_or("Connection not found")?;
        conn.sftp.clone()
    };

    let mut local_path = pick_save_path(&app, "Save Download As", &suggested_name)?;

    if is_dir {
        if local_path.extension().and_then(|e| e.to_str()) != Some("zip") {
            local_path.set_extension("zip");
        }
        download_dir_as_zip(&sftp, &remote_path, &local_path, &progress_channel).await?;
    } else {
        stream_remote_to_local(&sftp, &remote_path, &local_path, &progress_channel).await?;
    }

    Ok(local_path.to_string_lossy().to_string())
}
