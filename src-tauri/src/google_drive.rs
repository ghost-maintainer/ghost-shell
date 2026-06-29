use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tauri::{AppHandle, Manager, State};
use url::Url;

use crate::AppState;
use crate::vault;

const SERVICE: &str = "GhostShell";
const ACCOUNT: &str = "google-backup-config";

const DEFAULT_CLIENT_ID: &str = "1098670188981-dgnb63p2f6jflqppcr1f0d36m3e08f88.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET: &str = "GOCSPX-v13U3n79z28f_dE888pZ2f_88sF";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupConfig {
    pub enabled: bool,
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: Option<String>,
    pub interval_hours: u32,
    pub last_backup: Option<String>,
}

fn config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push("backup_config.json");
    Ok(path)
}

pub fn load_config(app: &AppHandle) -> BackupConfig {
    let mut config = {
        let mut loaded = None;
        // Try keyring first
        if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
            if let Ok(payload) = entry.get_password() {
                if let Ok(cfg) = serde_json::from_str::<BackupConfig>(&payload) {
                    loaded = Some(cfg);
                }
            }
        }
        // Try file fallback
        if loaded.is_none() {
            if let Ok(path) = config_file_path(app) {
                if path.exists() {
                    if let Ok(payload) = fs::read_to_string(path) {
                        if let Ok(cfg) = serde_json::from_str::<BackupConfig>(&payload) {
                            loaded = Some(cfg);
                        }
                    }
                }
            }
        }
        loaded.unwrap_or_else(|| BackupConfig {
            enabled: false,
            client_id: String::new(),
            client_secret: String::new(),
            refresh_token: None,
            interval_hours: 1,
            last_backup: None,
        })
    };

    // If client ID or secret are empty, resolve to default developer credentials
    if config.client_id.trim().is_empty() {
        config.client_id = DEFAULT_CLIENT_ID.to_string();
    }
    if config.client_secret.trim().is_empty() {
        config.client_secret = DEFAULT_CLIENT_SECRET.to_string();
    }

    config
}

pub fn save_config(app: &AppHandle, config: &BackupConfig) -> Result<(), String> {
    let payload = serde_json::to_string(config).map_err(|e| e.to_string())?;
    // Save to keyring
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        let _ = entry.set_password(&payload);
    }
    // Save to file fallback
    let path = config_file_path(app)?;
    fs::write(path, payload).map_err(|e| e.to_string())?;
    Ok(())
}

async fn start_oauth_listener(port: u16) -> Result<String, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Failed to bind local OAuth port {}: {}", port, e))?;
    
    let accept_future = async {
        loop {
            let (mut stream, _) = match listener.accept().await {
                Ok(s) => s,
                Err(_) => continue,
            };
            
            let mut buffer = [0; 2048];
            if let Ok(size) = stream.read(&mut buffer).await {
                let request = String::from_utf8_lossy(&buffer[..size]);
                let request_line = request.lines().next().unwrap_or("");
                if request_line.starts_with("GET ") {
                    let parts: Vec<&str> = request_line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let path = parts[1];
                        let full_url = format!("http://localhost:{}{}", port, path);
                        if let Ok(url) = Url::parse(&full_url) {
                            let mut auth_code = None;
                            for (key, val) in url.query_pairs() {
                                if key == "code" {
                                    auth_code = Some(val.into_owned());
                                }
                            }
                            
                            if let Some(code) = auth_code {
                                let response_body = r#"
                                    <!DOCTYPE html>
                                    <html>
                                    <head>
                                        <title>GhostShell Authentication Successful</title>
                                        <style>
                                            body {
                                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                                background-color: #0f172a;
                                                color: #f8fafc;
                                                display: flex;
                                                flex-direction: column;
                                                align-items: center;
                                                justify-content: center;
                                                height: 100vh;
                                                margin: 0;
                                            }
                                            .container {
                                                background-color: #1e293b;
                                                padding: 2.5rem;
                                                border-radius: 1rem;
                                                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
                                                text-align: center;
                                                border: 1px solid #334155;
                                            }
                                            h1 { color: #38bdf8; margin-top: 0; }
                                            p { margin-bottom: 2rem; color: #94a3b8; }
                                            .badge {
                                                background-color: #0f172a;
                                                color: #10b981;
                                                padding: 0.5rem 1rem;
                                                border-radius: 9999px;
                                                font-weight: 600;
                                                font-size: 0.875rem;
                                            }
                                        </style>
                                    </head>
                                    <body>
                                        <div class="container">
                                            <h1>Authentication Successful!</h1>
                                            <p>GhostShell has successfully connected to your Google account.</p>
                                            <span class="badge">You can close this tab now</span>
                                        </div>
                                    </body>
                                    </html>
                                "#;
                                
                                let response = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                    response_body.len(),
                                    response_body
                                );
                                let _ = stream.write_all(response.as_bytes()).await;
                                let _ = stream.flush().await;
                                return Ok(code);
                            }
                        }
                    }
                }
            }
        }
    };

    match tokio::time::timeout(tokio::time::Duration::from_secs(300), accept_future).await {
        Ok(res) => res,
        Err(_) => Err("Authentication timed out (5 minutes). Please try again.".to_string()),
    }
}

pub async fn get_access_token(client_id: &str, client_secret: &str, refresh_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh request failed: {}", body));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token json: {}", e))?;

    let access_token = data["access_token"]
        .as_str()
        .ok_or_else(|| "Google token response did not contain access_token")?;

    Ok(access_token.to_string())
}

pub async fn find_backup_file(access_token: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://www.googleapis.com/drive/v3/files")
        .query(&[
            ("q", "name='ghost-shell-backup.enc' and trashed=false"),
            ("fields", "files(id,name)"),
        ])
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        return Err(format!("Find backup file failed: {}", err));
    }

    let res_json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let files = res_json["files"].as_array();
    
    if let Some(files) = files {
        if !files.is_empty() {
            if let Some(id) = files[0]["id"].as_str() {
                return Ok(Some(id.to_string()));
            }
        }
    }
    
    Ok(None)
}

pub async fn upload_backup_file(app: &AppHandle, access_token: &str) -> Result<(), String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    path.push("vault.enc");
    if !path.exists() {
        return Err("No vault data file found to back up. Please create hosts or keys first.".to_string());
    }

    let file_bytes = fs::read(&path).map_err(|e| format!("Failed to read vault.enc: {}", e))?;
    let file_id = find_backup_file(access_token).await?;

    let client = reqwest::Client::new();
    if let Some(id) = file_id {
        let url = format!("https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media", id);
        let response = client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/octet-stream")
            .body(file_bytes)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let err = response.text().await.unwrap_or_default();
            return Err(format!("Failed to update Google Drive backup: {}", err));
        }
    } else {
        let metadata = serde_json::json!({
            "name": "ghost-shell-backup.enc"
        });

        let form = reqwest::multipart::Form::new()
            .part("metadata", reqwest::multipart::Part::text(metadata.to_string())
                .mime_str("application/json")
                .map_err(|e| e.to_string())?)
            .part("file", reqwest::multipart::Part::bytes(file_bytes)
                .mime_str("application/octet-stream")
                .map_err(|e| e.to_string())?);

        let response = client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            .header("Authorization", format!("Bearer {}", access_token))
            .multipart(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let err = response.text().await.unwrap_or_default();
            return Err(format!("Failed to create Google Drive backup: {}", err));
        }
    }

    Ok(())
}

pub async fn download_backup_file(access_token: &str) -> Result<Vec<u8>, String> {
    let file_id = find_backup_file(access_token).await?
        .ok_or_else(|| "No backup file found on Google Drive.".to_string())?;

    let client = reqwest::Client::new();
    let url = format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", file_id);
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        return Err(format!("Failed to download backup: {}", err));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

#[tauri::command]
pub fn get_backup_config(app: AppHandle) -> BackupConfig {
    load_config(&app)
}

#[tauri::command]
pub fn save_backup_config(app: AppHandle, config: BackupConfig) -> Result<(), String> {
    let mut current = load_config(&app);
    current.enabled = config.enabled;
    current.interval_hours = config.interval_hours;
    
    // Save Client ID and Secret if user provided custom values
    current.client_id = config.client_id.trim().to_string();
    current.client_secret = config.client_secret.trim().to_string();
    
    save_config(&app, &current)
}

#[tauri::command]
pub async fn start_google_auth(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    // 1. Save inputs if supplied (otherwise client_id/client_secret will be empty, and load_config will overlay defaults)
    let mut config = load_config(&app);
    config.client_id = client_id.trim().to_string();
    config.client_secret = client_secret.trim().to_string();
    save_config(&app, &config)?;

    // 2. Load config again to ensure we have the correct resolved client credentials
    let config = load_config(&app);
    let resolved_client_id = config.client_id.clone();
    let resolved_client_secret = config.client_secret.clone();

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://127.0.0.1:48281/oauth2callback&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent",
        resolved_client_id
    );

    // Open browser for OAuth
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(&auth_url, None::<String>).map_err(|e| e.to_string())?;
    }

    // Await redirect callback with a 5-minute timeout
    let auth_code = start_oauth_listener(48281).await?;

    let client = reqwest::Client::new();
    let params = [
        ("code", auth_code.as_str()),
        ("client_id", resolved_client_id.as_str()),
        ("client_secret", resolved_client_secret.as_str()),
        ("redirect_uri", "http://127.0.0.1:48281/oauth2callback"),
        ("grant_type", "authorization_code"),
    ];

    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    if !response.status().is_success() {
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("Google OAuth token exchange failed: {}", err_body));
    }

    let token_data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let refresh_token = token_data["refresh_token"]
        .as_str()
        .ok_or_else(|| "Google did not return a refresh token. If you previously connected, please remove GhostShell from your Google account security settings and try again.")?
        .to_string();

    let access_token = token_data["access_token"]
        .as_str()
        .ok_or_else(|| "Google did not return an access token.")?
        .to_string();

    let mut config = load_config(&app);
    config.refresh_token = Some(refresh_token);
    config.enabled = true;
    save_config(&app, &config)?;

    // Initial backup on login setup
    if let Err(e) = upload_backup_file(&app, &access_token).await {
        println!("Initial auto-backup error: {}", e);
    } else {
        let mut config = load_config(&app);
        config.last_backup = Some(chrono::Local::now().to_rfc3339());
        let _ = save_config(&app, &config);
    }

    Ok("Connected successfully to Google Drive!".to_string())
}

#[tauri::command]
pub fn disconnect_google(app: AppHandle) -> Result<(), String> {
    let mut config = load_config(&app);
    config.enabled = false;
    config.refresh_token = None;
    config.last_backup = None;
    
    // Clear custom credentials so defaults are used next time
    config.client_id = String::new();
    config.client_secret = String::new();
    
    save_config(&app, &config)?;
    
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

#[tauri::command]
pub async fn check_backup_on_drive(app: AppHandle) -> Result<Option<String>, String> {
    let config = load_config(&app);
    let refresh_token = match &config.refresh_token {
        Some(t) => t,
        None => return Ok(None),
    };

    let access_token = get_access_token(&config.client_id, &config.client_secret, refresh_token).await?;
    let file_id = find_backup_file(&access_token).await?;
    Ok(file_id)
}

#[tauri::command]
pub async fn perform_manual_backup(app: AppHandle) -> Result<String, String> {
    let config = load_config(&app);
    let refresh_token = config.refresh_token.ok_or("Not authenticated with Google Drive.")?;

    let access_token = get_access_token(&config.client_id, &config.client_secret, &refresh_token).await?;
    upload_backup_file(&app, &access_token).await?;

    let now = chrono::Local::now();
    let mut config = load_config(&app);
    config.last_backup = Some(now.to_rfc3339());
    save_config(&app, &config)?;

    Ok("Vault backed up successfully to Google Drive!".to_string())
}

#[tauri::command]
pub async fn restore_from_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    passphrase: Option<String>,
) -> Result<String, String> {
    let config = load_config(&app);
    let refresh_token = config.refresh_token.ok_or("Not authenticated with Google Drive.")?;

    let access_token = get_access_token(&config.client_id, &config.client_secret, &refresh_token).await?;
    let backup_bytes = download_backup_file(&access_token).await?;

    let key_guard = state.master_key.lock().unwrap();
    let key = key_guard.as_ref().ok_or("Locked")?;
    let salt_guard = state.salt.lock().unwrap();
    let salt = salt_guard.as_ref().ok_or("Locked")?;

    let imported_vault = vault::decrypt_vault_bytes(&backup_bytes, key, passphrase.as_deref())?;
        
    let path = state.get_vault_path(&app)?;
    let mut current_vault = if path.exists() {
        vault::decrypt_vault_with_key(&path, key)?
    } else {
        vault::VaultData::default()
    };
    
    let mut keys_imported = 0;
    let mut hosts_imported = 0;
    
    for mut imported_key in imported_vault.keys {
        if current_vault.keys.iter().any(|k| k.name == imported_key.name && k.public_key == imported_key.public_key) {
            continue; 
        }
        imported_key.id = current_vault.keys.iter().map(|k| k.id).max().unwrap_or(0) + 1;
        current_vault.keys.push(imported_key);
        keys_imported += 1;
    }
    
    for mut imported_host in imported_vault.hosts {
        if current_vault.hosts.iter().any(|h| h.name == imported_host.name && h.address == imported_host.address && h.username == imported_host.username) {
            continue;
        }
        imported_host.id = current_vault.hosts.iter().map(|h| h.id).max().unwrap_or(0) + 1;
        current_vault.hosts.push(imported_host);
        hosts_imported += 1;
    }
    
    let encrypted_bytes = vault::encrypt_vault(&current_vault, key, salt)?;
    fs::write(&path, encrypted_bytes).map_err(|e| e.to_string())?;
    
    Ok(format!("Successfully merged {} keys and {} hosts from Google Drive backup.", keys_imported, hosts_imported))
}

pub async fn run_backup_loop(app: AppHandle) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

        let config = get_backup_config(app.clone());
        if !config.enabled {
            continue;
        }

        let refresh_token = match &config.refresh_token {
            Some(t) => t,
            None => continue,
        };

        let last_backup_time = config.last_backup.as_ref()
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&chrono::Local));

        let now = chrono::Local::now();
        let should_backup = match last_backup_time {
            None => true,
            Some(last_time) => {
                let diff = now.signed_duration_since(last_time);
                diff.num_hours() >= config.interval_hours as i64
            }
        };

        if should_backup {
            match get_access_token(&config.client_id, &config.client_secret, refresh_token).await {
                Ok(access_token) => {
                    match upload_backup_file(&app, &access_token).await {
                        Ok(()) => {
                            let mut config = load_config(&app);
                            config.last_backup = Some(now.to_rfc3339());
                            let _ = save_config(&app, &config);
                            println!("Periodic Google Drive auto-backup completed successfully.");
                        }
                        Err(e) => {
                            eprintln!("Periodic Google Drive auto-backup upload failed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Periodic Google Drive auto-backup token refresh failed: {}", e);
                }
            }
        }
    }
}
