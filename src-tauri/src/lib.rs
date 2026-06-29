mod secure_store;
mod ssh;
mod vault;
mod google_drive;
mod supabase;
mod sftp;

fn trigger_cloud_sync(app: &AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = supabase::push_vault_bytes(&app_clone).await {
            eprintln!("Auto cloud sync failed: {}", e);
        } else {
            println!("Auto cloud sync completed successfully.");
        }
    });
}

fn write_vault_file(app: &AppHandle, path: &std::path::Path, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    trigger_cloud_sync(app);
    Ok(())
}

use std::fs;
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::{ipc::Channel, AppHandle, Manager, State};

pub struct AppState {
    pub master_key: Mutex<Option<[u8; 32]>>,
    pub salt: Mutex<Option<[u8; 16]>>,
}

impl AppState {
    pub(crate) fn get_vault_path(&self, app: &AppHandle) -> Result<PathBuf, String> {
        let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        path.push("vault.enc");
        Ok(path)
    }
}

#[tauri::command]
fn is_unlocked(state: State<'_, AppState>) -> bool {
    state.master_key.lock().unwrap().is_some()
}

#[tauri::command]
fn vault_exists(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.get_vault_path(&app)?.exists())
}

#[tauri::command]
fn try_auto_unlock(app: AppHandle, state: State<'_, AppState>) -> bool {
    if state.master_key.lock().unwrap().is_some() {
        return true;
    }

    let Some((key, salt)) = secure_store::load_session(&app) else {
        return false;
    };

    *state.master_key.lock().unwrap() = Some(key);
    *state.salt.lock().unwrap() = Some(salt);
    true
}

#[tauri::command]
async fn unlock(app: AppHandle, state: State<'_, AppState>, passphrase: String) -> Result<bool, String> {
    let path = state.get_vault_path(&app)?;
    
    // Check if we are logged in to Supabase cloud sync
    let supabase_config = supabase::load_config(&app);
    let is_logged_in = supabase_config.session_token.is_some();

    let mut vault_data = if path.exists() {
        // Load local vault
        let (data, _, _) = vault::decrypt_vault_file(&path, &passphrase)?;
        data
    } else {
        vault::VaultData::default()
    };

    let (key, salt);

    if is_logged_in {
        // Pull, verify profile password, and merge row-by-row
        let (derived_key, derived_salt) = supabase::pull_and_merge_vault(&app, &passphrase, &mut vault_data).await?;
        key = derived_key;
        salt = derived_salt;
    } else {
        // Offline mode
        if path.exists() {
            let (_, derived_key, derived_salt) = vault::decrypt_vault_file(&path, &passphrase)?;
            key = derived_key;
            salt = derived_salt;
        } else {
            // First time setup offline
            let mut rand_salt = [0u8; 16];
            rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut rand_salt);
            key = vault::derive_key(&passphrase, &rand_salt);
            salt = rand_salt;
        }
    }

    // Encrypt and save vault locally
    let encrypted_bytes = vault::encrypt_vault(&vault_data, &key, &salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;

    // Save session keys to memory and secure store
    *state.master_key.lock().unwrap() = Some(key);
    *state.salt.lock().unwrap() = Some(salt);
    secure_store::save_session(&app, &key, &salt)?;

    // Sync back up if cloud login is active
    if is_logged_in {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let _ = supabase::push_vault_bytes(&app_clone).await;
        });
    }

    Ok(true)
}

#[tauri::command]
async fn change_master_password(
    app: AppHandle,
    state: State<'_, AppState>,
    old_passphrase: String,
    new_passphrase: String,
) -> Result<(), String> {
    let current_salt = *state.salt.lock().unwrap();
    let current_key = *state.master_key.lock().unwrap();

    let (k, s) = match (current_key, current_salt) {
        (Some(k), Some(s)) => (k, s),
        _ => return Err("Vault is locked".to_string()),
    };

    let derived_old_key = vault::derive_key(&old_passphrase, &s);
    if derived_old_key != k {
        return Err("Incorrect current master password".to_string());
    }

    let path = state.get_vault_path(&app)?;
    let vault_data = if path.exists() {
        vault::decrypt_vault_with_key(&path, &k)?
    } else {
        vault::VaultData::default()
    };

    let mut new_salt = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut new_salt);
    let new_key = vault::derive_key(&new_passphrase, &new_salt);

    let encrypted_bytes = vault::encrypt_vault(&vault_data, &new_key, &new_salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;

    *state.master_key.lock().unwrap() = Some(new_key);
    *state.salt.lock().unwrap() = Some(new_salt);
    secure_store::save_session(&app, &new_key, &new_salt)?;

    let supabase_config = supabase::load_config(&app);
    if supabase_config.session_token.is_some() {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let _ = supabase::push_vault_bytes(&app_clone).await;
        });
    }

    Ok(())
}

#[tauri::command]
fn lock(state: State<'_, AppState>, ssh: State<'_, ssh::SshManager>) -> Result<(), String> {
    ssh.disconnect_all();
    *state.master_key.lock().unwrap() = None;
    *state.salt.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
fn wipe_data(app: AppHandle, state: State<'_, AppState>, ssh: State<'_, ssh::SshManager>) -> Result<(), String> {
    ssh.disconnect_all();
    *state.master_key.lock().unwrap() = None;
    *state.salt.lock().unwrap() = None;
    secure_store::clear_session(&app)?;
    
    let path = state.get_vault_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    let mut logs_path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    logs_path.push("logs");
    if logs_path.exists() {
        let _ = std::fs::remove_dir_all(logs_path);
    }

    Ok(())
}

#[tauri::command]
fn get_keys(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<vault::KeyChainEntry>, String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    
    let path = state.get_vault_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let vault_data = vault::decrypt_vault_with_key(&path, key)?;
    Ok(vault_data.keys)
}

#[tauri::command]
fn add_key(app: AppHandle, state: State<'_, AppState>, entry: vault::KeyChainEntry) -> Result<(), String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;
    
    let path = state.get_vault_path(&app)?;
    let mut vault_data = if path.exists() {
        vault::decrypt_vault_with_key(&path, key)?
    } else {
        vault::VaultData::default()
    };
    
    let mut entry = entry;
    if entry.id == 0 {
        entry.id = vault_data.keys.iter().map(|k| k.id).max().unwrap_or(0) + 1;
    } else {
        vault_data.keys.retain(|k| k.id != entry.id);
    }
    
    vault_data.keys.push(entry);
    
    let encrypted_bytes = vault::encrypt_vault(&vault_data, key, salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;
    Ok(())
}

#[tauri::command]
async fn generate_key(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    key_type: String,
    size: String,
    passphrase: Option<String>,
    save_passphrase: bool,
) -> Result<vault::KeyChainEntry, String> {
    // Copy the key material out of the guards so we don't hold a non-Send
    // MutexGuard across the .await below.
    let (key, salt) = {
        let key_guard = state.master_key.lock().unwrap();
        let key = *key_guard.as_ref().ok_or("Locked")?;
        let salt_guard = state.salt.lock().unwrap();
        let salt = *salt_guard.as_ref().ok_or("Locked")?;
        (key, salt)
    };

    let path = state.get_vault_path(&app)?;
    let app_clone = app.clone();

    // RSA generation is CPU-bound and can take several seconds. Run the whole
    // generate + encrypt + write on a blocking thread so the UI (and the
    // loading spinner) stays responsive instead of freezing the main thread.
    let entry = tauri::async_runtime::spawn_blocking(move || -> Result<vault::KeyChainEntry, String> {
        let (priv_key, pub_key) = vault::generate_ssh_key(&key_type, &size)?;

        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let mut vault_data = if path.exists() {
            vault::decrypt_vault_with_key(&path, &key)?
        } else {
            vault::VaultData::default()
        };

        let new_id = vault_data.keys.iter().map(|k| k.id).max().unwrap_or(0) + 1;

        let entry = vault::KeyChainEntry {
            id: new_id,
            name,
            key_type,
            size,
            private_key: priv_key,
            public_key: pub_key,
            passphrase: if save_passphrase { passphrase } else { None },
            certificate: None,
            created_at: now.clone(),
            updated_at: now,
        };

        vault_data.keys.push(entry.clone());

        let encrypted_bytes = vault::encrypt_vault(&vault_data, &key, &salt)?;
        write_vault_file(&app_clone, &path, encrypted_bytes)?;

        Ok(entry)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(entry)
}

#[tauri::command]
fn delete_key(app: AppHandle, state: State<'_, AppState>, id: usize) -> Result<(), String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;
    
    let path = state.get_vault_path(&app)?;
    if !path.exists() {
        return Ok(());
    }
    
    let mut vault_data = vault::decrypt_vault_with_key(&path, key)?;
    vault_data.keys.retain(|k| k.id != id);
    
    let encrypted_bytes = vault::encrypt_vault(&vault_data, key, salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;
    Ok(())
}

#[tauri::command]
fn get_hosts(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<vault::HostEntry>, String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    
    let path = state.get_vault_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let vault_data = vault::decrypt_vault_with_key(&path, key)?;
    Ok(vault_data.hosts)
}

#[tauri::command]
fn add_host(app: AppHandle, state: State<'_, AppState>, entry: vault::HostEntry) -> Result<(), String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;
    
    let path = state.get_vault_path(&app)?;
    let mut vault_data = if path.exists() {
        vault::decrypt_vault_with_key(&path, key)?
    } else {
        vault::VaultData::default()
    };
    
    let mut entry = entry;
    if entry.id == 0 {
        entry.id = vault_data.hosts.iter().map(|h| h.id).max().unwrap_or(0) + 1;
    } else {
        vault_data.hosts.retain(|h| h.id != entry.id);
    }
    
    vault_data.hosts.push(entry);
    
    let encrypted_bytes = vault::encrypt_vault(&vault_data, key, salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;
    Ok(())
}

#[tauri::command]
fn save_host_password(
    app: AppHandle,
    state: State<'_, AppState>,
    host_id: usize,
    password: String,
) -> Result<(), String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;

    let path = state.get_vault_path(&app)?;
    let mut vault_data = vault::decrypt_vault_with_key(&path, key)?;

    let host = vault_data
        .hosts
        .iter_mut()
        .find(|h| h.id == host_id)
        .ok_or("Host not found")?;

    host.password = Some(password);
    host.updated_at = chrono::Local::now().format("%Y-%m-%d").to_string();

    let encrypted_bytes = vault::encrypt_vault(&vault_data, key, salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;
    Ok(())
}

#[tauri::command]
fn save_key_passphrase(
    app: AppHandle,
    state: State<'_, AppState>,
    key_id: usize,
    passphrase: String,
) -> Result<(), String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;

    let path = state.get_vault_path(&app)?;
    let mut vault_data = vault::decrypt_vault_with_key(&path, key)?;

    let entry = vault_data
        .keys
        .iter_mut()
        .find(|k| k.id == key_id)
        .ok_or("Key not found")?;

    entry.passphrase = Some(passphrase);
    entry.updated_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let encrypted_bytes = vault::encrypt_vault(&vault_data, key, salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;
    Ok(())
}

#[tauri::command]
fn delete_host(app: AppHandle, state: State<'_, AppState>, id: usize) -> Result<(), String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;
    
    let path = state.get_vault_path(&app)?;
    if !path.exists() {
        return Ok(());
    }
    
    let mut vault_data = vault::decrypt_vault_with_key(&path, key)?;
    vault_data.hosts.retain(|h| h.id != id);
    
    let encrypted_bytes = vault::encrypt_vault(&vault_data, key, salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;
    Ok(())
}

#[tauri::command]
fn export_vault(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;
    
    let path = state.get_vault_path(&app)?;
    if !path.exists() {
        return Err("No vault data found to export".to_string());
    }
    
    let vault_data = vault::decrypt_vault_with_key(&path, key)?;
    let export_bytes = vault::encrypt_vault(&vault_data, key, salt)?;
    
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let res = rfd::FileDialog::new()
            .set_title("Export Vault Data")
            .set_file_name("ghost-shell-backup.enc".to_string())
            .save_file();
        let _ = tx.send(res);
    }).map_err(|e| e.to_string())?;
    
    let file_path = rx.recv().map_err(|e| e.to_string())?.ok_or("Export cancelled by user")?;
    
    std::fs::write(&file_path, export_bytes).map_err(|e| e.to_string())?;
    
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn import_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    bytes: Vec<u8>,
    passphrase: Option<String>,
) -> Result<String, String> {
    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;

    let imported_vault = vault::decrypt_vault_bytes(&bytes, key, passphrase.as_deref())?;
        
    let path = state.get_vault_path(&app)?;
    let mut current_vault = if path.exists() {
        vault::decrypt_vault_with_key(&path, key)?
    } else {
        vault::VaultData::default()
    };
    
    let mut keys_imported = 0;
    let mut hosts_imported = 0;
    
    for mut imported_key in imported_vault.keys {
        imported_key.id = current_vault.keys.iter().map(|k| k.id).max().unwrap_or(0) + 1;
        current_vault.keys.push(imported_key);
        keys_imported += 1;
    }
    
    for mut imported_host in imported_vault.hosts {
        imported_host.id = current_vault.hosts.iter().map(|h| h.id).max().unwrap_or(0) + 1;
        current_vault.hosts.push(imported_host);
        hosts_imported += 1;
    }
    
    let encrypted_bytes = vault::encrypt_vault(&current_vault, key, salt)?;
    write_vault_file(&app, &path, encrypted_bytes)?;
    
    Ok(format!("Successfully imported {} keys and {} hosts.", keys_imported, hosts_imported))
}

#[tauri::command]
async fn ssh_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    ssh: State<'_, ssh::SshManager>,
    session_id: String,
    host_id: usize,
    cols: u32,
    rows: u32,
    password: Option<String>,
    passphrase: Option<String>,
    on_event: Channel<ssh::SshEvent>,
) -> Result<(), String> {
    ssh::connect(
        app,
        state,
        ssh,
        session_id,
        host_id,
        cols,
        rows,
        password,
        passphrase,
        on_event,
    )
    .await
}

#[tauri::command]
fn ssh_write(ssh: State<'_, ssh::SshManager>, session_id: String, data: Vec<u8>) -> Result<(), String> {
    ssh.write(&session_id, data)
}

#[tauri::command]
fn ssh_resize(
    ssh: State<'_, ssh::SshManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    ssh.resize(&session_id, cols, rows)
}

#[tauri::command]
fn ssh_disconnect(ssh: State<'_, ssh::SshManager>, session_id: String) -> Result<(), String> {
    ssh.disconnect(&session_id);
    Ok(())
}

#[tauri::command]
fn append_session_log(app: AppHandle, session_id: String, chunk: String) -> Result<(), String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    path.push("logs");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(format!("{}.log", session_id));
    
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
        
    file.write_all(chunk.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_session_log_content(app: AppHandle, session_id: String) -> Result<String, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    path.push("logs");
    path.push(format!("{}.log", session_id));
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session_log_file(app: AppHandle, session_id: String) -> Result<(), String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    path.push("logs");
    path.push(format!("{}.log", session_id));
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}


#[tauri::command]
async fn check_host_reachability(address: String, port: u16) -> bool {
    use std::net::ToSocketAddrs;
    use tokio::net::TcpStream;
    use std::time::Duration;

    let addr_str = format!("{}:{}", address, port);
    let socket_addrs = tokio::task::spawn_blocking(move || {
        addr_str.to_socket_addrs().map(|iter| iter.collect::<Vec<_>>())
    }).await;

    let Ok(Ok(addrs)) = socket_addrs else {
        return false;
    };

    for addr in addrs {
        if tokio::time::timeout(Duration::from_millis(1500), TcpStream::connect(&addr)).await.is_ok() {
            return true;
        }
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(_window) = app.get_webview_window("main") {
                #[cfg(not(debug_assertions))]
                let _ = _window.eval(
                    "document.addEventListener('contextmenu',function(e){e.preventDefault();},{capture:true});",
                );
            }
            
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                google_drive::run_backup_loop(app_handle).await;
            });

            Ok(())
        })
        .manage(AppState {
            master_key: Mutex::new(None),
            salt: Mutex::new(None),
        })
        .manage(ssh::SshManager::default())
        .manage(sftp::SftpManager::default())
        .invoke_handler(tauri::generate_handler![
            is_unlocked,
            vault_exists,
            try_auto_unlock,
            unlock,
            lock,
            wipe_data,
            get_keys,
            add_key,
            generate_key,
            delete_key,
            get_hosts,
            add_host,
            save_host_password,
            save_key_passphrase,
            delete_host,
            export_vault,
            import_vault,
            ssh_connect,
            ssh_write,
            ssh_resize,
            ssh_disconnect,
            append_session_log,
            get_session_log_content,
            delete_session_log_file,
            check_host_reachability,
            google_drive::get_backup_config,
            google_drive::save_backup_config,
            google_drive::start_google_auth,
            google_drive::disconnect_google,
            google_drive::check_backup_on_drive,
            google_drive::perform_manual_backup,
            google_drive::restore_from_backup,
            supabase::get_cloud_status,
            supabase::set_offline_mode,
            supabase::start_supabase_auth,
            supabase::logout_supabase,
            supabase::supabase_login_email,
            supabase::supabase_register_email,
            supabase::supabase_send_reset_password,
            supabase::supabase_await_reset_redirect,
            supabase::supabase_update_password,
            supabase::supabase_update_email,
            supabase::supabase_wipe_cloud_data,
            supabase::sync_logs,
            supabase::sync_single_log,
            supabase::supabase_delete_log,
            change_master_password,
            sftp::sftp_connect,
            sftp::sftp_disconnect,
            sftp::sftp_list_dir,
            sftp::sftp_create_dir,
            sftp::sftp_create_file,
            sftp::sftp_edit_file,
            sftp::sftp_delete,
            sftp::sftp_rename,
            sftp::sftp_copy_file,
            sftp::sftp_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
