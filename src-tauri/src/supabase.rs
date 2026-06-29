use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tauri::{AppHandle, Manager};
use url::Url;
use rand::RngCore;
use crate::vault;

const SERVICE: &str = "GhostShell";
const SUPABASE_ACCOUNT: &str = "supabase-sync-config";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
    pub session_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user_email: Option<String>,
    pub user_id: Option<String>,
    pub is_offline: bool,
}

fn config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push("supabase_config.json");
    Ok(path)
}

fn decode_hex(hex: &str) -> Result<Vec<u8>, String> {
    let hex = hex.trim();
    if hex.len() % 2 != 0 {
        return Err("Invalid hex length".to_string());
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    let chars: Vec<char> = hex.chars().collect();
    for i in (0..hex.len()).step_by(2) {
        let byte_str: String = chars[i..i+2].iter().collect();
        let byte = u8::from_str_radix(&byte_str, 16).map_err(|e| e.to_string())?;
        bytes.push(byte);
    }
    Ok(bytes)
}

pub fn load_config(app: &AppHandle) -> SupabaseConfig {
    // Try keyring first
    if let Ok(entry) = keyring::Entry::new(SERVICE, SUPABASE_ACCOUNT) {
        if let Ok(payload) = entry.get_password() {
            if let Ok(cfg) = serde_json::from_str::<SupabaseConfig>(&payload) {
                return cfg;
            }
        }
    }
    // Try file fallback
    if let Ok(path) = config_file_path(app) {
        if path.exists() {
            if let Ok(payload) = fs::read_to_string(path) {
                if let Ok(cfg) = serde_json::from_str::<SupabaseConfig>(&payload) {
                    return cfg;
                }
            }
        }
    }
    // Default config
    SupabaseConfig {
        url: String::new(),
        anon_key: String::new(),
        session_token: None,
        refresh_token: None,
        user_email: None,
        user_id: None,
        is_offline: true, // Default to offline until setup
    }
}

pub fn save_config(app: &AppHandle, config: &SupabaseConfig) -> Result<(), String> {
    let payload = serde_json::to_string(config).map_err(|e| e.to_string())?;
    // Save to keyring
    if let Ok(entry) = keyring::Entry::new(SERVICE, SUPABASE_ACCOUNT) {
        let _ = entry.set_password(&payload);
    }
    // Save to file fallback
    let path = config_file_path(app)?;
    fs::write(path, payload).map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_query_param(request_line: &str, param: &str) -> Option<String> {
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() >= 2 {
        let path = parts[1];
        let full_url = format!("http://localhost{}", path);
        if let Ok(url) = Url::parse(&full_url) {
            for (key, val) in url.query_pairs() {
                if key == param {
                    return Some(val.replace('+', " "));
                }
            }
        }
    }
    None
}

async fn start_oauth_listener(port: u16) -> Result<(String, String), String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Failed to bind local OAuth port {}: {}", port, e))?;
    
    let accept_future = async {
        let mut access_token = None;
        let mut refresh_token = None;
        
        loop {
            let (mut stream, _) = match listener.accept().await {
                Ok(s) => s,
                Err(_) => continue,
            };
            
            let mut buffer = [0; 2048];
            if let Ok(size) = stream.read(&mut buffer).await {
                let request = String::from_utf8_lossy(&buffer[..size]);
                let request_line = request.lines().next().unwrap_or("");
                
                if request_line.starts_with("GET /callback") {
                    // Check if there is an error in query parameter
                    if request_line.contains("error=") {
                        let err_desc = extract_query_param(&request_line, "error_description")
                            .or_else(|| extract_query_param(&request_line, "error"))
                            .unwrap_or_else(|| "Authentication failed. Check your Supabase configuration.".to_string());
                        
                        let html = format!(r##"
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>GhostShell Sync Error</title>
                                <style>
                                    body {{
                                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                        background-color: #09090b;
                                        color: #f4f4f5;
                                        display: flex;
                                        flex-direction: column;
                                        align-items: center;
                                        justify-content: center;
                                        height: 100vh;
                                        margin: 0;
                                    }}
                                    .container {{
                                        display: flex;
                                        flex-direction: column;
                                        align-items: center;
                                        text-align: center;
                                        max-w: 24rem;
                                        padding: 1.5rem;
                                    }}
                                    h1 {{ color: #ef4444; margin-top: 0; font-size: 1.125rem; font-weight: 700; margin-bottom: 0.25rem; }}
                                    p {{ color: #a1a1aa; font-size: 0.875rem; line-height: 1.5; }}
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <svg class="logo" viewBox="0 0 100 100" width="64" height="64" style="margin-bottom: 1.25rem;">
                                        <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="none" stroke="#ef4444" stroke-width="6" stroke-linejoin="round"/>
                                        <path d="M35,38 L48,50 L35,62 M52,62 L65,62" fill="none" stroke="#ef4444" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                    <h1>Connection Failed</h1>
                                    <p>{}</p>
                                </div>
                            </body>
                            </html>
                        "##, err_desc);
                        
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );
                        let _ = stream.write_all(response.as_bytes()).await;
                        let _ = stream.flush().await;
                        return Err(err_desc);
                    }

                    // Otherwise render the flat redirect JS script
                    let html = r##"
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Syncing GhostShell...</title>
                            <style>
                                body {
                                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                    background-color: #09090b;
                                    color: #f4f4f5;
                                    display: flex;
                                    flex-direction: column;
                                    align-items: center;
                                    justify-content: center;
                                    height: 100vh;
                                    margin: 0;
                                }
                                .container {
                                    display: flex;
                                    flex-direction: column;
                                    align-items: center;
                                    text-align: center;
                                    max-w: 24rem;
                                    padding: 1.5rem;
                                }
                                h1 { color: #10b981; margin-top: 0; font-size: 1.125rem; font-weight: 700; margin-bottom: 0.25rem; }
                                p { color: #a1a1aa; font-size: 0.875rem; line-height: 1.5; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <svg id="logo-icon" viewBox="0 0 100 100" width="64" height="64" style="margin-bottom: 1.25rem;">
                                    <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="none" stroke="#10b981" stroke-width="6" stroke-linejoin="round"/>
                                    <path d="M35,38 L48,50 L35,62 M52,62 L65,62" fill="none" stroke="#10b981" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                <h1 id="header">Connecting Account...</h1>
                                <p id="desc">GhostShell is securely exchanging tokens. Please wait a moment.</p>
                            </div>
                            <script>
                                const hash = window.location.hash;
                                if (hash) {
                                    if (hash.includes("error=")) {
                                        const params = new URLSearchParams(hash.replace('#', '?'));
                                        const errMsg = params.get('error_description') || params.get('error') || 'OAuth authentication failed.';
                                        fetch('/token_error?error=' + encodeURIComponent(errMsg))
                                            .then(() => {
                                                document.getElementById('header').innerText = 'Connection Failed';
                                                document.getElementById('header').style.color = '#ef4444';
                                                document.getElementById('desc').innerText = errMsg;
                                                
                                                // Change logo border and terminal lines to red
                                                const polygons = document.getElementById('logo-icon').getElementsByTagName('polygon');
                                                const paths = document.getElementById('logo-icon').getElementsByTagName('path');
                                                if (polygons.length) polygons[0].setAttribute('stroke', '#ef4444');
                                                if (paths.length) paths[0].setAttribute('stroke', '#ef4444');
                                            });
                                    } else {
                                        fetch('/token_submit' + hash.replace('#', '?'))
                                            .then(res => {
                                                if (res.ok) {
                                                    document.getElementById('header').innerText = 'Connection Successful!';
                                                    document.getElementById('header').style.color = '#10b981';
                                                    document.getElementById('desc').innerText = 'GhostShell is authorized. You can close this window now.';
                                                } else {
                                                    fetch('/token_error?error=Token+submission+failed.');
                                                }
                                            })
                                            .catch(err => {
                                                fetch('/token_error?error=' + encodeURIComponent(err));
                                            });
                                    }
                                } else {
                                    fetch('/token_error?error=No+tokens+received.');
                                }
                            </script>
                        </body>
                        </html>
                    "##;
                    
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        html.len(),
                        html
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                } else if request_line.starts_with("GET /token_submit") {
                    let parts: Vec<&str> = request_line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let path = parts[1];
                        let full_url = format!("http://localhost:{}{}", port, path);
                        if let Ok(url) = Url::parse(&full_url) {
                            for (key, val) in url.query_pairs() {
                                if key == "access_token" {
                                    access_token = Some(val.into_owned());
                                } else if key == "refresh_token" {
                                    refresh_token = Some(val.into_owned());
                                }
                            }
                        }
                    }
                    
                    let body = "OK";
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                    
                    if access_token.is_some() && refresh_token.is_some() {
                        return Ok((access_token.unwrap(), refresh_token.unwrap()));
                    }
                } else if request_line.starts_with("GET /token_error") {
                    let err_msg = extract_query_param(&request_line, "error")
                        .unwrap_or_else(|| "OAuth error occurred.".to_string());
                    
                    let body = "OK";
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                    return Err(err_msg);
                }
            }
        }
    };

    match tokio::time::timeout(tokio::time::Duration::from_secs(300), accept_future).await {
        Ok(res) => res,
        Err(_) => Err("Authentication timed out (5 minutes). Please try again.".to_string()),
    }
}

pub async fn refresh_session(url: &str, anon_key: &str, refresh_token: &str) -> Result<(String, String, String, String), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "refresh_token": refresh_token
    });

    let response = client
        .post(format!("{}/auth/v1/token?grant_type=refresh_token", url))
        .header("apikey", anon_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh session: {}", e))?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        return Err(format!("Refresh token failed: {}", err));
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let new_access = data["access_token"].as_str().ok_or("No access token")?.to_string();
    let new_refresh = data["refresh_token"].as_str().ok_or("No refresh token")?.to_string();
    let email = data["user"]["email"].as_str().unwrap_or("unknown").to_string();
    let user_id = data["user"]["id"].as_str().ok_or("No user id")?.to_string();

    Ok((new_access, new_refresh, email, user_id))
}

pub async fn push_vault_bytes(app: &AppHandle) -> Result<(), String> {
    let mut config = load_config(app);
    if config.session_token.is_none() {
        return Ok(()); // Offline mode, skip push
    }
    let refresh_token = config.refresh_token.as_ref().unwrap();

    // Get master key and salt from memory State
    let state = app.state::<crate::AppState>();
    let master_key_opt = *state.master_key.lock().unwrap();
    let salt_opt = *state.salt.lock().unwrap();

    let (master_key, salt) = match (master_key_opt, salt_opt) {
        (Some(k), Some(s)) => (k, s),
        _ => return Ok(()), // Not unlocked, cannot sync
    };

    // Load local vault data
    let vault_path = state.get_vault_path(app)?;
    if !vault_path.exists() {
        return Ok(());
    }
    
    // Decrypt the vault using the in-memory master key
    let vault_data = vault::decrypt_vault_with_key(&vault_path, &master_key)?;

    // Refresh token first to get a valid access token
    let (new_access, new_refresh, email, user_id) = match refresh_session(&config.url, &config.anon_key, refresh_token).await {
        Ok(res) => res,
        Err(e) => return Err(format!("Failed to refresh Supabase session before sync: {}", e)),
    };
    config.session_token = Some(new_access.clone());
    config.refresh_token = Some(new_refresh);
    config.user_email = Some(email);
    config.user_id = Some(user_id.clone());
    save_config(app, &config)?;

    let client = reqwest::Client::new();

    // 1. Sync Profile (if not already pushed)
    let verify_payload = "GHOSTSHELL_VERIFY".to_string();
    let encrypted_verify = vault::encrypt_record(&verify_payload, &master_key)?;
    let salt_hex = salt.iter().map(|b| format!("{:02x}", b)).collect::<String>();

    let profile_body = serde_json::json!({
        "user_id": user_id,
        "salt": salt_hex,
        "password_verification": encrypted_verify
    });

    let profile_res = client
        .post(format!("{}/rest/v1/user_profiles", config.url))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", new_access))
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates")
        .json(&profile_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !profile_res.status().is_success() {
        let err = profile_res.text().await.unwrap_or_default();
        return Err(format!("Failed to sync user profile: {}", err));
    }

    // 2. Sync Hosts (Upsert host records)
    for host in &vault_data.hosts {
        let encrypted_host = vault::encrypt_record(host, &master_key)?;
        let host_body = serde_json::json!({
            "user_id": user_id,
            "host_id": host.id,
            "encrypted_data": encrypted_host
        });

        let host_res = client
            .post(format!("{}/rest/v1/user_hosts", config.url))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&host_body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !host_res.status().is_success() {
            let err = host_res.text().await.unwrap_or_default();
            return Err(format!("Failed to sync host: {}", err));
        }
    }

    // Clean up deleted hosts
    let local_host_ids: Vec<String> = vault_data.hosts.iter().map(|h| h.id.to_string()).collect();
    if local_host_ids.is_empty() {
        let _ = client
            .delete(format!("{}/rest/v1/user_hosts?user_id=eq.{}", config.url, user_id))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await;
    } else {
        let not_in_filter = format!("not.in.({})", local_host_ids.join(","));
        let _ = client
            .delete(format!("{}/rest/v1/user_hosts?user_id=eq.{}&host_id={}", config.url, user_id, not_in_filter))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await;
    }

    // 3. Sync Keys (Upsert key records)
    for key_entry in &vault_data.keys {
        let encrypted_key = vault::encrypt_record(key_entry, &master_key)?;
        let key_body = serde_json::json!({
            "user_id": user_id,
            "key_id": key_entry.id,
            "encrypted_data": encrypted_key
        });

        let key_res = client
            .post(format!("{}/rest/v1/user_keys", config.url))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&key_body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !key_res.status().is_success() {
            let err = key_res.text().await.unwrap_or_default();
            return Err(format!("Failed to sync SSH key: {}", err));
        }
    }

    // Clean up deleted keys
    let local_key_ids: Vec<String> = vault_data.keys.iter().map(|k| k.id.to_string()).collect();
    if local_key_ids.is_empty() {
        let _ = client
            .delete(format!("{}/rest/v1/user_keys?user_id=eq.{}", config.url, user_id))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await;
    } else {
        let not_in_filter = format!("not.in.({})", local_key_ids.join(","));
        let _ = client
            .delete(format!("{}/rest/v1/user_keys?user_id=eq.{}&key_id={}", config.url, user_id, not_in_filter))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await;
    }

    Ok(())
}

pub async fn cloud_profile_exists(url: &str, anon_key: &str, access_token: &str) -> Result<bool, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/rest/v1/user_profiles?select=user_id", url))
        .header("apikey", anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Ok(false);
    }

    let rows: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if let Some(arr) = rows.as_array() {
        return Ok(!arr.is_empty());
    }
    Ok(false)
}

pub async fn pull_and_merge_vault(
    app: &AppHandle,
    passphrase: &str,
    local_vault: &mut vault::VaultData,
) -> Result<([u8; 32], [u8; 16]), String> {
    let mut config = load_config(app);
    let refresh_token = config.refresh_token.as_ref().ok_or("No cloud sync refresh token found.")?;

    // Refresh session to get active access token
    let (new_access, new_refresh, email, user_id) = refresh_session(&config.url, &config.anon_key, refresh_token)
        .await
        .map_err(|e| format!("Authentication failed during sync pull: {}", e))?;
    config.session_token = Some(new_access.clone());
    config.refresh_token = Some(new_refresh);
    config.user_email = Some(email);
    config.user_id = Some(user_id.clone());
    save_config(app, &config)?;

    let client = reqwest::Client::new();

    // 1. Pull user profile verification
    let profile_resp = client
        .get(format!("{}/rest/v1/user_profiles?select=salt,password_verification", config.url))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", new_access))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !profile_resp.status().is_success() {
        let err = profile_resp.text().await.unwrap_or_default();
        return Err(format!("Failed to retrieve cloud sync profile: {}", err));
    }

    let profiles: serde_json::Value = profile_resp.json().await.map_err(|e| e.to_string())?;
    let profile_arr = profiles.as_array().ok_or("Invalid response format for cloud profile")?;

    let key;
    let mut salt = [0u8; 16];

    if !profile_arr.is_empty() {
        // Cloud profile exists - check master passcode verification
        let salt_hex = profile_arr[0]["salt"].as_str().ok_or("Missing salt in cloud profile")?;
        let verif_hex = profile_arr[0]["password_verification"].as_str().ok_or("Missing verification block in cloud profile")?;

        let salt_bytes = decode_hex(salt_hex).map_err(|e| format!("Invalid salt payload: {}", e))?;
        if salt_bytes.len() != 16 {
            return Err("Corrupted salt found in cloud profile.".to_string());
        }
        salt.copy_from_slice(&salt_bytes);

        key = vault::derive_key(passphrase, &salt);

        // Try decrypting verification block
        let verification: String = match vault::decrypt_record(verif_hex, &key) {
            Ok(v) => v,
            Err(_) => return Err("Invalid master passcode.".to_string()),
        };

        if verification != "GHOSTSHELL_VERIFY" {
            return Err("Invalid master passcode.".to_string());
        }

        // 2. Passcode validated! Now pull individual host rows
        let hosts_resp = client
            .get(format!("{}/rest/v1/user_hosts?select=host_id,encrypted_data", config.url))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if hosts_resp.status().is_success() {
            let cloud_hosts: serde_json::Value = hosts_resp.json().await.map_err(|e| e.to_string())?;
            if let Some(host_arr) = cloud_hosts.as_array() {
                for row in host_arr {
                    if let Some(enc_data) = row["encrypted_data"].as_str() {
                        if let Ok(host_entry) = vault::decrypt_record::<vault::HostEntry>(enc_data, &key) {
                            // Merge host row
                            if !local_vault.hosts.iter().any(|lh| lh.id == host_entry.id) {
                                local_vault.hosts.push(host_entry);
                            }
                        }
                    }
                }
            }
        }

        // 3. Pull individual key rows
        let keys_resp = client
            .get(format!("{}/rest/v1/user_keys?select=key_id,encrypted_data", config.url))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if keys_resp.status().is_success() {
            let cloud_keys: serde_json::Value = keys_resp.json().await.map_err(|e| e.to_string())?;
            if let Some(key_arr) = cloud_keys.as_array() {
                for row in key_arr {
                    if let Some(enc_data) = row["encrypted_data"].as_str() {
                        if let Ok(key_entry) = vault::decrypt_record::<vault::KeyChainEntry>(enc_data, &key) {
                            // Merge key row
                            if !local_vault.keys.iter().any(|lk| lk.id == key_entry.id) {
                                local_vault.keys.push(key_entry);
                            }
                        }
                    }
                }
            }
        }
    } else {
        // No profile found - fresh cloud account, define salt and derived key
        rand::thread_rng().fill_bytes(&mut salt);
        key = vault::derive_key(passphrase, &salt);
    }

    Ok((key, salt))
}

#[tauri::command]
pub fn get_cloud_status(app: AppHandle) -> SupabaseConfig {
    load_config(&app)
}

#[tauri::command]
pub fn set_offline_mode(app: AppHandle) -> Result<(), String> {
    let mut config = load_config(&app);
    config.is_offline = true;
    config.session_token = None;
    config.refresh_token = None;
    config.user_email = None;
    save_config(&app, &config)
}

#[tauri::command]
pub async fn start_supabase_auth(
    app: AppHandle,
    provider: String,
    url: String,
    anon_key: String,
) -> Result<bool, String> {
    let mut config = load_config(&app);
    config.url = url.trim().to_string();
    config.anon_key = anon_key.trim().to_string();
    config.is_offline = false;
    save_config(&app, &config)?;

    // Supabase oauth authorize endpoint redirecting to loopback callback
    let auth_url = format!(
        "{}/auth/v1/authorize?provider={}&redirect_to=http://localhost:48281/callback",
        config.url, provider
    );

    // Open browser for OAuth
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(&auth_url, None::<String>).map_err(|e| e.to_string())?;
    }

    // Await loopback server redirection response
    let (access_token, refresh_token) = start_oauth_listener(48281).await?;

    // Focus the desktop window automatically when auth completes
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    // Call /auth/v1/user to get email address
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/auth/v1/user", config.url))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let (email, user_id) = if response.status().is_success() {
        let user_data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let email = user_data["email"].as_str().unwrap_or("unknown").to_string();
        let user_id = user_data["id"].as_str().ok_or("No user id in profile")?.to_string();
        (email, user_id)
    } else {
        ("unknown".to_string(), "unknown".to_string())
    };

    let mut config = load_config(&app);
    config.session_token = Some(access_token.clone());
    config.refresh_token = Some(refresh_token);
    config.user_email = Some(email);
    config.user_id = Some(user_id);
    config.is_offline = false;
    save_config(&app, &config)?;

    // Try to check if cloud profile exists in Supabase
    let has_cloud_vault = cloud_profile_exists(&config.url, &config.anon_key, &access_token).await.unwrap_or(false);

    Ok(has_cloud_vault)
}

#[tauri::command]
pub fn logout_supabase(app: AppHandle) -> Result<(), String> {
    let mut config = load_config(&app);
    config.session_token = None;
    config.refresh_token = None;
    config.user_email = None;
    config.is_offline = true;
    save_config(&app, &config)?;

    // Delete temporary cloud vault file if any
    if let Ok(mut path) = app.path().app_local_data_dir() {
        path.push("vault.enc.cloud");
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn supabase_login_email(
    app: AppHandle,
    url: String,
    anon_key: String,
    email: String,
    password: String,
) -> Result<bool, String> {
    let url = url.trim().to_string();
    let anon_key = anon_key.trim().to_string();

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "email": email.trim(),
        "password": password
    });

    let response = client
        .post(format!("{}/auth/v1/token?grant_type=password", url))
        .header("apikey", &anon_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Login failed: {}", e))?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        let err_json: serde_json::Value = serde_json::from_str(&err).unwrap_or_default();
        let msg = err_json["error_description"]
            .as_str()
            .or_else(|| err_json["msg"].as_str())
            .unwrap_or("Invalid email or password.");
        return Err(msg.to_string());
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let access_token = data["access_token"].as_str().ok_or("No access token")?.to_string();
    let refresh_token = data["refresh_token"].as_str().ok_or("No refresh token")?.to_string();
    let user_email = data["user"]["email"].as_str().unwrap_or(&email).to_string();
    let user_id = data["user"]["id"].as_str().ok_or("No user id")?.to_string();

    let mut config = load_config(&app);
    config.url = url;
    config.anon_key = anon_key;
    config.session_token = Some(access_token.clone());
    config.refresh_token = Some(refresh_token);
    config.user_email = Some(user_email);
    config.user_id = Some(user_id);
    config.is_offline = false;
    save_config(&app, &config)?;

    // Try to check if cloud profile exists in Supabase
    let has_cloud_vault = cloud_profile_exists(&config.url, &config.anon_key, &access_token).await.unwrap_or(false);

    Ok(has_cloud_vault)
}

#[tauri::command]
pub async fn supabase_register_email(
    app: AppHandle,
    url: String,
    anon_key: String,
    email: String,
    password: String,
) -> Result<bool, String> {
    let url = url.trim().to_string();
    let anon_key = anon_key.trim().to_string();

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "email": email.trim(),
        "password": password
    });

    let response = client
        .post(format!("{}/auth/v1/signup", url))
        .header("apikey", &anon_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Registration failed: {}", e))?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        let err_json: serde_json::Value = serde_json::from_str(&err).unwrap_or_default();
        let msg = err_json["msg"]
            .as_str()
            .or_else(|| err_json["error_description"].as_str())
            .unwrap_or("Registration failed.");
        return Err(msg.to_string());
    }

    let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    
    let access_token_opt = data["access_token"].as_str();
    let refresh_token_opt = data["refresh_token"].as_str();
    let user_email = data["user"]["email"].as_str().unwrap_or(&email).to_string();
    let user_id = data["user"]["id"].as_str().unwrap_or("unknown").to_string();

    if let (Some(access_token), Some(refresh_token)) = (access_token_opt, refresh_token_opt) {
        let mut config = load_config(&app);
        config.url = url;
        config.anon_key = anon_key;
        config.session_token = Some(access_token.to_string());
        config.refresh_token = Some(refresh_token.to_string());
        config.user_email = Some(user_email);
        config.user_id = Some(user_id);
        config.is_offline = false;
        save_config(&app, &config)?;
        Ok(true) // Signed in immediately
    } else {
        // Confirmation email sent or session not active yet.
        Ok(false)
    }
}

#[tauri::command]
pub async fn supabase_send_reset_password(
    url: String,
    anon_key: String,
    email: String,
) -> Result<(), String> {
    let url = url.trim().to_string();
    let anon_key = anon_key.trim().to_string();
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "email": email.trim()
    });

    let response = client
        .post(format!("{}/auth/v1/recover", url))
        .header("apikey", &anon_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to send recovery email: {}", e))?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        let err_json: serde_json::Value = serde_json::from_str(&err).unwrap_or_default();
        let msg = err_json["msg"]
            .as_str()
            .or_else(|| err_json["error_description"].as_str())
            .unwrap_or("Password reset failed.");
        return Err(msg.to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn supabase_await_reset_redirect(
    app: AppHandle,
    url: String,
    anon_key: String,
) -> Result<(), String> {
    let url = url.trim().to_string();
    let anon_key = anon_key.trim().to_string();

    let (access_token, refresh_token) = start_oauth_listener(48281).await?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/auth/v1/user", url))
        .header("apikey", &anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let (email, user_id) = if response.status().is_success() {
        let user_data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let email = user_data["email"].as_str().unwrap_or("unknown").to_string();
        let user_id = user_data["id"].as_str().ok_or("No user id")?.to_string();
        (email, user_id)
    } else {
        ("unknown".to_string(), "unknown".to_string())
    };

    let mut config = load_config(&app);
    config.url = url;
    config.anon_key = anon_key;
    config.session_token = Some(access_token);
    config.refresh_token = Some(refresh_token);
    config.user_email = Some(email);
    config.user_id = Some(user_id);
    config.is_offline = false;
    save_config(&app, &config)?;

    Ok(())
}

#[tauri::command]
pub async fn supabase_update_password(
    app: AppHandle,
    new_password: String,
    current_password: Option<String>,
) -> Result<bool, String> {
    let config = load_config(&app);
    let access_token = config
        .session_token
        .as_ref()
        .ok_or("No active session found for password update.")?;

    if let Some(current) = current_password {
        let email = config
            .user_email
            .as_ref()
            .ok_or("No signed-in account email found.")?;

        let client = reqwest::Client::new();
        let verify_body = serde_json::json!({
            "email": email,
            "password": current
        });

        let verify_response = client
            .post(format!("{}/auth/v1/token?grant_type=password", config.url))
            .header("apikey", &config.anon_key)
            .header("Content-Type", "application/json")
            .json(&verify_body)
            .send()
            .await
            .map_err(|e| format!("Failed to verify current password: {}", e))?;

        if !verify_response.status().is_success() {
            return Err("Current password is incorrect.".to_string());
        }
    }

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "password": new_password
    });

    let response = client
        .put(format!("{}/auth/v1/user", config.url))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to update password: {}", e))?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        let err_json: serde_json::Value = serde_json::from_str(&err).unwrap_or_default();
        let msg = err_json["msg"]
            .as_str()
            .or_else(|| err_json["error_description"].as_str())
            .unwrap_or("Failed to update password.");
        return Err(msg.to_string());
    }

    let has_cloud_vault =
        cloud_profile_exists(&config.url, &config.anon_key, access_token)
            .await
            .unwrap_or(false);

    Ok(has_cloud_vault)
}

#[tauri::command]
pub async fn sync_logs(
    app: AppHandle,
    local_records: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut config = load_config(&app);
    if config.session_token.is_none() {
        return Ok(local_records); // Offline mode
    }
    let refresh_token = config.refresh_token.as_ref().unwrap();

    let state = app.state::<crate::AppState>();
    let master_key_opt = *state.master_key.lock().unwrap();
    let (master_key, _) = match (master_key_opt, *state.salt.lock().unwrap()) {
        (Some(k), Some(s)) => (k, s),
        _ => return Err("Vault is locked".to_string()),
    };

    // Refresh token first
    let (new_access, new_refresh, email, user_id) = match refresh_session(&config.url, &config.anon_key, refresh_token).await {
        Ok(res) => res,
        Err(e) => return Err(format!("Failed to refresh Supabase session before sync: {}", e)),
    };
    config.session_token = Some(new_access.clone());
    config.refresh_token = Some(new_refresh);
    config.user_email = Some(email);
    config.user_id = Some(user_id.clone());
    save_config(&app, &config)?;

    let client = reqwest::Client::new();
    let app_data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let logs_dir = app_data_dir.join("logs");

    // 1. Push local records
    for record in &local_records {
        let session_id = record.get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing 'id' in log record".to_string())?;

        // Read log content from disk file
        let log_file_path = logs_dir.join(format!("{}.log", session_id));
        let log_content = if log_file_path.exists() {
            std::fs::read_to_string(&log_file_path).unwrap_or_default()
        } else {
            String::new()
        };

        // Bundle log content into the record before encryption
        let mut full_record = record.clone();
        if let Some(obj) = full_record.as_object_mut() {
            obj.insert("log".to_string(), serde_json::Value::String(log_content));
        }

        let encrypted_log = vault::encrypt_record(&full_record, &master_key)?;
        let log_body = serde_json::json!({
            "user_id": user_id,
            "session_id": session_id,
            "encrypted_data": encrypted_log
        });

        let log_res = client
            .post(format!("{}/rest/v1/user_logs", config.url))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&log_body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !log_res.status().is_success() {
            let err = log_res.text().await.unwrap_or_default();
            return Err(format!("Failed to sync log {}: {}", session_id, err));
        }
    }

    // 2. Clean up deleted logs in the cloud
    let local_session_ids: Vec<String> = local_records
        .iter()
        .filter_map(|r| r.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    if local_session_ids.is_empty() {
        let _ = client
            .delete(format!("{}/rest/v1/user_logs?user_id=eq.{}", config.url, user_id))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await;
    } else {
        let ids_filter = local_session_ids.iter().map(|id| format!("\"{}\"", id)).collect::<Vec<_>>().join(",");
        let not_in_filter = format!("not.in.({})", ids_filter);
        let _ = client
            .delete(format!("{}/rest/v1/user_logs?user_id=eq.{}&session_id={}", config.url, user_id, not_in_filter))
            .header("apikey", &config.anon_key)
            .header("Authorization", format!("Bearer {}", new_access))
            .send()
            .await;
    }

    // 3. Pull all logs from Supabase
    let logs_resp = client
        .get(format!("{}/rest/v1/user_logs?select=session_id,encrypted_data&user_id=eq.{}", config.url, user_id))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", new_access))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut merged_records = Vec::new();

    if logs_resp.status().is_success() {
        let cloud_logs: serde_json::Value = logs_resp.json().await.map_err(|e| e.to_string())?;
        if let Some(log_arr) = cloud_logs.as_array() {
            // Ensure logs directory exists
            std::fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;

            for row in log_arr {
                if let Some(enc_data) = row["encrypted_data"].as_str() {
                    if let Ok(mut decrypted_record) = vault::decrypt_record::<serde_json::Value>(enc_data, &master_key) {
                        let session_id = decrypted_record.get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string();

                        if !session_id.is_empty() {
                            // Extract log content and write to disk file
                            let log_content = decrypted_record.get("log")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default();
                            
                            let log_file_path = logs_dir.join(format!("{}.log", session_id));
                            std::fs::write(&log_file_path, log_content).map_err(|e| e.to_string())?;

                            // Remove log content from metadata object
                            if let Some(obj) = decrypted_record.as_object_mut() {
                                obj.remove("log");
                            }
                            
                            merged_records.push(decrypted_record);
                        }
                    }
                }
            }
        }
    }

    Ok(merged_records)
}

#[tauri::command]
pub async fn supabase_update_email(
    app: AppHandle,
    new_email: String,
) -> Result<(), String> {
    let mut config = load_config(&app);
    let access_token = config.session_token.as_ref().ok_or("No active session found for email update.")?;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "email": new_email
    });

    let response = client
        .put(format!("{}/auth/v1/user", config.url))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to update email: {}", e))?;

    if !response.status().is_success() {
        let err = response.text().await.unwrap_or_default();
        let err_json: serde_json::Value = serde_json::from_str(&err).unwrap_or_default();
        let msg = err_json["msg"]
            .as_str()
            .or_else(|| err_json["error_description"].as_str())
            .unwrap_or("Failed to update email.");
        return Err(msg.to_string());
    }

    config.user_email = Some(new_email);
    save_config(&app, &config)?;

    Ok(())
}

#[tauri::command]
pub async fn supabase_wipe_cloud_data(app: AppHandle) -> Result<(), String> {
    let mut config = load_config(&app);
    let _session_token = config.session_token.as_ref().ok_or("No active session found for cloud wipe.")?;
    let refresh_token = config.refresh_token.as_ref().ok_or("No active refresh token found for cloud wipe.")?;
    let user_id = config.user_id.as_ref().ok_or("No active user ID found for cloud wipe.")?;

    // Refresh token first to get a valid access token
    let (new_access, new_refresh, _, _) = match refresh_session(&config.url, &config.anon_key, refresh_token).await {
        Ok(res) => res,
        Err(e) => return Err(format!("Failed to refresh Supabase session before wipe: {}", e)),
    };
    config.session_token = Some(new_access.clone());
    config.refresh_token = Some(new_refresh);
    save_config(&app, &config)?;

    let client = reqwest::Client::new();

    // 1. Delete user_logs
    let _ = client
        .delete(format!("{}/rest/v1/user_logs?user_id=eq.{}", config.url, user_id))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", new_access))
        .send()
        .await;

    // 2. Delete user_hosts
    let _ = client
        .delete(format!("{}/rest/v1/user_hosts?user_id=eq.{}", config.url, user_id))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", new_access))
        .send()
        .await;

    // 3. Delete user_keys
    let _ = client
        .delete(format!("{}/rest/v1/user_keys?user_id=eq.{}", config.url, user_id))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", new_access))
        .send()
        .await;

    // 4. Delete user_profiles
    let _ = client
        .delete(format!("{}/rest/v1/user_profiles?user_id=eq.{}", config.url, user_id))
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {}", new_access))
        .send()
        .await;

    // 5. Clear Supabase config session
    config.session_token = None;
    config.refresh_token = None;
    config.user_email = None;
    config.is_offline = true;
    save_config(&app, &config)?;

    // Delete temporary cloud vault files
    if let Ok(mut path) = app.path().app_local_data_dir() {
        path.push("vault.enc.cloud");
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    Ok(())
}



