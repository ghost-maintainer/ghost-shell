use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use russh::client::{self, Config, Handler};
use russh::keys::{decode_secret_key, PrivateKeyWithHashAlg};
use russh::{ChannelMsg, Disconnect};
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tokio::sync::mpsc;

use crate::vault::{self, HostEntry};
use crate::AppState;

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SshEvent {
    #[serde(rename = "status")]
    Status { stage: String, message: String },
    #[serde(rename = "connected")]
    Connected,
    #[serde(rename = "data")]
    Data { bytes: Vec<u8> },
    #[serde(rename = "closed")]
    Closed { message: String },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "needPassword")]
    NeedPassword,
    #[serde(rename = "needPassphrase")]
    NeedPassphrase,
}

pub(crate) enum SshCmd {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

pub struct SshManager {
    pub(crate) sessions: Mutex<HashMap<String, mpsc::UnboundedSender<SshCmd>>>,
}

impl Default for SshManager {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

impl SshManager {
    pub fn write(&self, session_id: &str, data: Vec<u8>) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let tx = sessions
            .get(session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        tx.send(SshCmd::Data(data))
            .map_err(|e| e.to_string())
    }

    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let tx = sessions
            .get(session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        tx.send(SshCmd::Resize { cols, rows })
            .map_err(|e| e.to_string())
    }

    pub fn disconnect(&self, session_id: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(tx) = sessions.remove(session_id) {
            let _ = tx.send(SshCmd::Close);
        }
    }

    pub fn disconnect_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for (_, tx) in sessions.drain() {
            let _ = tx.send(SshCmd::Close);
        }
    }
}

pub struct ClientHandler;

impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

fn emit(ch: &Channel<SshEvent>, event: SshEvent) -> Result<(), String> {
    ch.send(event).map_err(|e| e.to_string())
}

fn emit_status(ch: &Channel<SshEvent>, stage: &str, message: &str) -> Result<(), String> {
    emit(
        ch,
        SshEvent::Status {
            stage: stage.to_string(),
            message: message.to_string(),
        },
    )
}

pub(crate) fn load_host(
    app: &AppHandle,
    state: &State<'_, AppState>,
    host_id: usize,
) -> Result<(HostEntry, Option<vault::KeyChainEntry>), String> {
    let key_guard = state.master_key.lock().unwrap();
    let master = key_guard.as_ref().ok_or("Locked")?;

    let path = state.get_vault_path(app)?;
    if !path.exists() {
        return Err("Vault not found".to_string());
    }

    let vault = vault::decrypt_vault_with_key(&path, master)?;
    let host = vault
        .hosts
        .iter()
        .find(|h| h.id == host_id)
        .cloned()
        .ok_or_else(|| "Host not found".to_string())?;

    let key = host
        .key_id
        .and_then(|kid| vault.keys.iter().find(|k| k.id == kid).cloned());

    Ok((host, key))
}

pub(crate) async fn authenticate(
    session: &mut client::Handle<ClientHandler>,
    host: &HostEntry,
    key_pem: Option<&str>,
    saved_passphrase: Option<&str>,
    password: Option<&str>,
    passphrase: Option<&str>,
) -> Result<(), String> {
    let user = host.username.clone();
    let mut authenticated = false;

    if let Some(pem) = key_pem {
        let pp = passphrase.or(saved_passphrase);
        if pp.is_none() && pem.contains("ENCRYPTED") {
            return Err("NeedPassphrase".to_string());
        }

        let priv_key = match decode_secret_key(pem, pp) {
            Ok(k) => k,
            Err(_) => return Err("NeedPassphrase".to_string()),
        };

        let rsa_hash = session
            .best_supported_rsa_hash()
            .await
            .map_err(|e| e.to_string())?;

        let auth = session
            .authenticate_publickey(
                &user,
                PrivateKeyWithHashAlg::new(Arc::new(priv_key), rsa_hash.flatten()),
            )
            .await
            .map_err(|e| e.to_string())?;

        if auth.success() {
            authenticated = true;
        }
    }

    if !authenticated {
        if let Some(pw) = password {
            let auth = session
                .authenticate_password(&user, pw)
                .await
                .map_err(|e| e.to_string())?;
            if auth.success() {
                authenticated = true;
            }
        }
    }

    if authenticated {
        Ok(())
    } else if password.is_some() || passphrase.is_some() {
        Err("Authentication failed".to_string())
    } else {
        Err("NeedPassword".to_string())
    }
}

pub async fn connect(
    app: AppHandle,
    state: State<'_, AppState>,
    manager: State<'_, SshManager>,
    session_id: String,
    host_id: usize,
    cols: u32,
    rows: u32,
    password: Option<String>,
    passphrase: Option<String>,
    on_event: Channel<SshEvent>,
) -> Result<(), String> {
    manager.disconnect(&session_id);

    let (host, key_entry) = load_host(&app, &state, host_id)?;
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel();

    manager
        .sessions
        .lock()
        .unwrap()
        .insert(session_id.clone(), cmd_tx);

    let saved_passphrase = key_entry.as_ref().and_then(|k| k.passphrase.clone());
    let key_pem = key_entry.as_ref().map(|k| k.private_key.clone());
    let password = password.or(host.password.clone());

    tokio::spawn(async move {
        let result = run_session(
            &host,
            key_pem.as_deref(),
            saved_passphrase.as_deref(),
            password.as_deref(),
            passphrase.as_deref(),
            cols,
            rows,
            &on_event,
            &mut cmd_rx,
        )
        .await;

        if let Err(e) = result {
            if e.contains("ChannelClosed") || e.contains("callback") || e.contains("Callback") {
                return;
            }
            match e.as_str() {
                "NeedPassword" => { let _ = emit(&on_event, SshEvent::NeedPassword); }
                "NeedPassphrase" => { let _ = emit(&on_event, SshEvent::NeedPassphrase); }
                _ => {
                    let _ = emit(
                        &on_event,
                        SshEvent::Error {
                            message: e,
                        },
                    );
                }
            }
        }
    });

    Ok(())
}

async fn run_session(
    host: &HostEntry,
    key_pem: Option<&str>,
    saved_passphrase: Option<&str>,
    password: Option<&str>,
    passphrase: Option<&str>,
    cols: u32,
    rows: u32,
    on_event: &Channel<SshEvent>,
    cmd_rx: &mut mpsc::UnboundedReceiver<SshCmd>,
) -> Result<(), String> {
    emit_status(
        on_event,
        "resolve",
        &format!(
            "Connecting to {}@{}:{}",
            host.username, host.address, host.port
        ),
    )?;

    let addr = format!("{}:{}", host.address, host.port);
    let mut config = Config::default();
    config.keepalive_interval = Some(std::time::Duration::from_secs(10));
    config.keepalive_max = 3;
    let config = Arc::new(config);

    emit_status(on_event, "tcp", "Opening TCP connection...")?;
    let mut session = client::connect(config, addr.as_str(), ClientHandler)
        .await
        .map_err(|e| format!("TCP connect failed: {e}"))?;

    emit_status(on_event, "handshake", "SSH handshake / key exchange...")?;
    emit_status(on_event, "auth", "Authenticating...")?;
    authenticate(
        &mut session,
        host,
        key_pem,
        saved_passphrase,
        password,
        passphrase,
    )
    .await?;

    emit_status(on_event, "pty", "Requesting PTY...")?;
    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;

    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|e| e.to_string())?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| e.to_string())?;

    emit_status(on_event, "shell", "Shell ready")?;
    emit(on_event, SshEvent::Connected)?;

    let (mut read_half, write_half) = channel.split();

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(SshCmd::Data(data)) => {
                        let _ = write_half.data_bytes(data).await;
                    }
                    Some(SshCmd::Resize { cols, rows }) => {
                        let _ = write_half.window_change(cols, rows, 0, 0).await;
                    }
                    Some(SshCmd::Close) | None => {
                        let _ = session.disconnect(Disconnect::ByApplication, "", "").await;
                        let _ = emit(on_event, SshEvent::Closed { message: "Disconnected".to_string() });
                        return Ok(());
                    }
                }
            }
            msg = read_half.wait() => {
                match msg {
                    Some(ChannelMsg::Data { ref data }) => {
                        emit(on_event, SshEvent::Data { bytes: data.to_vec() })?;
                    }
                    Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        emit(on_event, SshEvent::Data { bytes: data.to_vec() })?;
                    }
                    Some(ChannelMsg::Close) | Some(ChannelMsg::Eof) => {
                        let _ = emit(on_event, SshEvent::Closed { message: "Connection closed by remote".to_string() });
                        return Ok(());
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        let _ = emit(on_event, SshEvent::Closed { message: format!("Process exited ({exit_status})") });
                        return Ok(());
                    }
                    None => {
                        let _ = emit(on_event, SshEvent::Closed { message: "Channel closed".to_string() });
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }
}
