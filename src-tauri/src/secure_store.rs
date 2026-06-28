use keyring::Entry;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SERVICE: &str = "GhostShell";
const ACCOUNT: &str = "vault-session";
const SESSION_FILE: &str = "session.dat";
const PAYLOAD_LEN: usize = 48; // 32-byte key + 16-byte salt

fn session_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(SESSION_FILE);
    Ok(path)
}

fn encode(key: &[u8; 32], salt: &[u8; 16]) -> String {
    let mut buf = [0u8; PAYLOAD_LEN];
    buf[..32].copy_from_slice(key);
    buf[32..].copy_from_slice(salt);
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

fn decode(payload: &str) -> Result<([u8; 32], [u8; 16]), String> {
    let payload = payload.trim();
    if payload.len() != PAYLOAD_LEN * 2 {
        return Err("Invalid stored session length".to_string());
    }

    let mut buf = [0u8; PAYLOAD_LEN];
    for (i, chunk) in payload.as_bytes().chunks(2).enumerate() {
        if i >= PAYLOAD_LEN {
            break;
        }
        let hex = std::str::from_utf8(chunk).map_err(|e| e.to_string())?;
        buf[i] = u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?;
    }

    let mut key = [0u8; 32];
    let mut salt = [0u8; 16];
    key.copy_from_slice(&buf[..32]);
    salt.copy_from_slice(&buf[32..]);
    Ok((key, salt))
}

fn save_to_keyring(payload: &str) {
    if let Ok(entry) = Entry::new(SERVICE, ACCOUNT) {
        let _ = entry.set_password(payload);
    }
}

fn load_from_keyring() -> Option<([u8; 32], [u8; 16])> {
    let entry = Entry::new(SERVICE, ACCOUNT).ok()?;
    let payload = entry.get_password().ok()?;
    decode(&payload).ok()
}

fn load_from_file(app: &AppHandle) -> Option<([u8; 32], [u8; 16])> {
    let path = session_file_path(app).ok()?;
    let payload = fs::read_to_string(path).ok()?;
    decode(&payload).ok()
}

pub fn save_session(app: &AppHandle, key: &[u8; 32], salt: &[u8; 16]) -> Result<(), String> {
    let payload = encode(key, salt);
    let path = session_file_path(app)?;
    fs::write(&path, &payload).map_err(|e| e.to_string())?;
    save_to_keyring(&payload);
    Ok(())
}

pub fn load_session(app: &AppHandle) -> Option<([u8; 32], [u8; 16])> {
    load_from_keyring().or_else(|| load_from_file(app))
}

pub fn clear_session(app: &AppHandle) -> Result<(), String> {
    if let Ok(entry) = Entry::new(SERVICE, ACCOUNT) {
        match entry.delete_credential() {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {}
            Err(_) => {}
        }
    }

    if let Ok(path) = session_file_path(app) {
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
