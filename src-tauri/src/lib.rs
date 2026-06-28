mod secure_store;
mod ssh;
mod vault;

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
fn try_auto_unlock(state: State<'_, AppState>) -> bool {
    if state.master_key.lock().unwrap().is_some() {
        return true;
    }

    let Some((key, salt)) = secure_store::load_session() else {
        return false;
    };

    *state.master_key.lock().unwrap() = Some(key);
    *state.salt.lock().unwrap() = Some(salt);
    true
}

#[tauri::command]
fn unlock(app: AppHandle, state: State<'_, AppState>, passphrase: String) -> Result<bool, String> {
    let path = state.get_vault_path(&app)?;
    
    if !path.exists() {
        // First-time setup!
        let mut salt = [0u8; 16];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut salt);
        
        let key = vault::derive_key(&passphrase, &salt);
        let initial_vault = vault::VaultData::default();
        
        let encrypted_bytes = vault::encrypt_vault(&initial_vault, &key, &salt)?;
        std::fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;
        
        *state.master_key.lock().unwrap() = Some(key);
        *state.salt.lock().unwrap() = Some(salt);
        secure_store::save_session(&key, &salt)?;
        return Ok(true);
    }
    
    // Decrypt existing file
    match vault::decrypt_vault_file(&path, &passphrase) {
        Ok((_vault_data, key, salt)) => {
            *state.master_key.lock().unwrap() = Some(key);
            *state.salt.lock().unwrap() = Some(salt);
            secure_store::save_session(&key, &salt)?;
            Ok(true)
        }
        Err(e) => Err(e),
    }
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
    secure_store::clear_session()?;
    
    let path = state.get_vault_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
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
    std::fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;
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
        std::fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;

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
    std::fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;
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
    std::fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;
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
    std::fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;
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
    std::fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;
    
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(not(debug_assertions))]
                let _ = window.eval(
                    "document.addEventListener('contextmenu',function(e){e.preventDefault();},{capture:true});",
                );
            }
            Ok(())
        })
        .manage(AppState {
            master_key: Mutex::new(None),
            salt: Mutex::new(None),
        })
        .manage(ssh::SshManager::default())
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
            delete_host,
            export_vault,
            import_vault,
            ssh_connect,
            ssh_write,
            ssh_resize,
            ssh_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
