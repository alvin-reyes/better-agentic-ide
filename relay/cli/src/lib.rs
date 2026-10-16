//! The relay's test client: logs in with an identity key and reports what the relay
//! says. `ws://` is allowed so tests can use localhost; the `wss://`-only rule belongs
//! to the phone's QR parser.

use std::path::Path;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use relay_core::{login_message, signed_host};
use relay_protocol::{Bytes, Control, DecodeError, DeviceKey, PairInfo, Role};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::http::Uri;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

/// Something the relay told this client.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Event {
    /// The login was accepted.
    Welcome {
        pairs: Vec<PairInfo>,
        online: Vec<DeviceKey>,
    },
    /// A paired peer came online or left.
    Presence { peer: DeviceKey, online: bool },
    /// The relay closed the connection, with its close code and reason (0 and empty
    /// when it gave none). A refused login is 4401 `login_refused`.
    Closed { code: u16, reason: String },
}

/// Why the client stopped.
#[derive(Debug)]
pub enum ClientError {
    /// The URL has no host name.
    BadUrl,
    /// The WebSocket failed.
    Socket(tokio_tungstenite::tungstenite::Error),
    /// The relay sent something that isn't a control message this client knows.
    Protocol,
    /// The connection is gone.
    Disconnected,
}

impl std::fmt::Display for ClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClientError::BadUrl => write!(f, "the relay URL has no host"),
            ClientError::Socket(e) => write!(f, "socket error: {e}"),
            ClientError::Protocol => write!(f, "unexpected message from the relay"),
            ClientError::Disconnected => write!(f, "disconnected"),
        }
    }
}

impl std::error::Error for ClientError {}

impl From<tokio_tungstenite::tungstenite::Error> for ClientError {
    fn from(e: tokio_tungstenite::tungstenite::Error) -> Self {
        ClientError::Socket(e)
    }
}

/// The host name a login is signed over: the one this client dialled, without port,
/// as `relay_core::signed_host` normalises it.
pub fn host_of(url: &str) -> Result<String, ClientError> {
    let uri: Uri = url.parse().map_err(|_| ClientError::BadUrl)?;
    uri.host()
        .filter(|h| !h.is_empty())
        .map(signed_host)
        .ok_or(ClientError::BadUrl)
}

/// A logged-in (or refused) connection to the relay.
pub struct Client {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    closed: bool,
    /// A close that came before the challenge, handed out by the first `next_event`.
    early_close: Option<Event>,
}

/// How long `close` waits for the relay to answer the close.
pub const CLOSE_WAIT: std::time::Duration = std::time::Duration::from_secs(5);

fn closed_event(frame: Option<CloseFrame>) -> Event {
    let (code, reason) = frame
        .map(|f| (u16::from(f.code), f.reason.to_string()))
        .unwrap_or((0, String::new()));
    Event::Closed { code, reason }
}

impl Client {
    /// Connects, answers the challenge with a login signed over the host in `url`, and
    /// returns. The relay's answer, `welcome` or a refusal, is the first `next_event`;
    /// so is a close that came instead of the challenge.
    pub async fn connect(url: &str, role: Role, key: &SigningKey) -> Result<Client, ClientError> {
        let host = host_of(url)?;
        let (mut ws, _) = tokio_tungstenite::connect_async(url).await?;
        let c = loop {
            match ws.next().await {
                Some(Ok(Message::Text(text))) => match Control::from_json(&text) {
                    Ok(Control::Challenge { c }) => break c.0,
                    _ => return Err(ClientError::Protocol),
                },
                Some(Ok(Message::Close(frame))) => {
                    return Ok(Client {
                        ws,
                        closed: false,
                        early_close: Some(closed_event(frame)),
                    })
                }
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                Some(Ok(_)) | None => return Err(ClientError::Disconnected),
                Some(Err(e)) => return Err(e.into()),
            }
        };
        let login = Control::Login {
            id: Bytes(key.verifying_key().to_bytes()),
            role,
            sig: Bytes(key.sign(&login_message(&c, &host, role)).to_bytes()),
        };
        ws.send(Message::text(login.to_json())).await?;
        Ok(Client {
            ws,
            closed: false,
            early_close: None,
        })
    }

    /// The next `welcome`, `presence` or close. A `v: 1` message of a type this client
    /// doesn't know is skipped. Reading also answers the relay's pings; a client that
    /// stops reading stops answering them.
    pub async fn next_event(&mut self) -> Result<Event, ClientError> {
        if let Some(event) = self.early_close.take() {
            self.closed = true;
            return Ok(event);
        }
        if self.closed {
            return Err(ClientError::Disconnected);
        }
        loop {
            let msg = match self.ws.next().await {
                Some(Ok(msg)) => msg,
                Some(Err(e)) => return Err(e.into()),
                None => return Err(ClientError::Disconnected),
            };
            match msg {
                Message::Text(text) => {
                    return match Control::from_json(&text) {
                        Err(DecodeError::UnknownType(_)) => continue,
                        Ok(Control::Welcome { pairs, online }) => {
                            Ok(Event::Welcome { pairs, online })
                        }
                        Ok(Control::Presence { peer, online }) => {
                            Ok(Event::Presence { peer, online })
                        }
                        _ => Err(ClientError::Protocol),
                    };
                }
                Message::Close(frame) => {
                    self.closed = true;
                    return Ok(closed_event(frame));
                }
                _ => continue,
            }
        }
    }

    /// Closes the connection cleanly, waiting at most `CLOSE_WAIT` for the relay.
    pub async fn close(self) {
        self.close_within(CLOSE_WAIT).await
    }

    /// Closes the connection, waiting at most `wait` for the relay to answer.
    pub async fn close_within(mut self, wait: std::time::Duration) {
        let _ = tokio::time::timeout(wait, async {
            let _ = self.ws.close(None).await;
            // Drain until the relay's close arrives, so the close is seen at once.
            while let Some(Ok(_)) = self.ws.next().await {}
        })
        .await;
    }
}

/// Reads an Ed25519 key from `path` (32 bytes as unpadded base64url), creating one if
/// the file is missing. On unix, a key file that group or others can access is refused.
pub fn load_or_create_key(path: &Path) -> std::io::Result<SigningKey> {
    match std::fs::read_to_string(path) {
        Ok(text) => {
            check_private(path)?;
            let raw = URL_SAFE_NO_PAD
                .decode(text.trim())
                .map_err(|_| invalid_key())?;
            let seed: [u8; 32] = raw.try_into().map_err(|_| invalid_key())?;
            Ok(SigningKey::from_bytes(&seed))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let key = SigningKey::generate(&mut rand::rngs::OsRng);
            write_private(path, &URL_SAFE_NO_PAD.encode(key.to_bytes()))?;
            Ok(key)
        }
        Err(e) => Err(e),
    }
}

fn invalid_key() -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, "not a key file")
}

#[cfg(unix)]
fn check_private(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mode = std::fs::metadata(path)?.permissions().mode();
    if mode & 0o077 != 0 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            format!(
                "{} is readable by others (mode {:o}); chmod 600 it",
                path.display(),
                mode & 0o777
            ),
        ));
    }
    Ok(())
}

#[cfg(not(unix))]
fn check_private(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

/// Writes `text` to a temporary file beside `path`, then renames it into place, so a
/// failed write never leaves a partial key file.
fn write_private(path: &Path, text: &str) -> std::io::Result<()> {
    use std::io::Write;
    let name = path
        .file_name()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"))?;
    let mut tmp_name = std::ffi::OsString::from(".");
    tmp_name.push(name);
    tmp_name.push(format!(".{}.tmp", std::process::id()));
    let tmp = path.with_file_name(tmp_name);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let written = options.open(&tmp).and_then(|mut f| {
        f.write_all(text.as_bytes())?;
        f.sync_all()
    });
    let result = written.and_then(|()| std::fs::rename(&tmp, path));
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

    #[test]
    fn the_signed_host_drops_scheme_port_and_path() {
        assert_eq!(host_of("ws://localhost:8080/").unwrap(), "localhost");
        assert_eq!(host_of("wss://relay.fly.dev").unwrap(), "relay.fly.dev");
        assert!(host_of("not a url").is_err());
    }

    #[test]
    fn the_signed_host_is_lower_cased_without_ipv6_brackets() {
        assert_eq!(host_of("ws://Relay.Fly.Dev/").unwrap(), "relay.fly.dev");
        assert_eq!(host_of("ws://[::1]:8080/").unwrap(), "::1");
        assert_eq!(host_of("wss://relay.fly.dev./").unwrap(), "relay.fly.dev");
    }

    #[test]
    fn a_missing_key_file_is_created_and_then_reused() {
        let dir = std::env::temp_dir().join(format!("relay-cli-key-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("id.key");
        let _ = std::fs::remove_file(&path);

        let first = load_or_create_key(&path).unwrap();
        let again = load_or_create_key(&path).unwrap();
        assert_eq!(first.to_bytes(), again.to_bytes());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_corrupt_key_file_is_an_error() {
        let dir = std::env::temp_dir().join(format!("relay-cli-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("id.key");
        std::fs::write(&path, "AAAA").unwrap();
        assert!(load_or_create_key(&path).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// A one-connection WebSocket server on 127.0.0.1 that runs `script`, for tests.
    async fn scripted<F, Fut>(script: F) -> String
    where
        F: FnOnce(WebSocketStream<TcpStream>) -> Fut + Send + 'static,
        Fut: std::future::Future<Output = ()> + Send,
    {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            let ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
            script(ws).await;
        });
        format!("ws://localhost:{port}/")
    }

    /// Sends a challenge and reads the login.
    async fn challenge_and_login(ws: &mut WebSocketStream<TcpStream>) {
        let challenge = Control::Challenge { c: Bytes([5; 32]) };
        ws.send(Message::text(challenge.to_json())).await.unwrap();
        loop {
            if let Some(Ok(Message::Text(_))) = ws.next().await {
                return;
            }
        }
    }

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[1; 32])
    }

    #[tokio::test]
    async fn an_unknown_type_is_skipped() {
        let url = scripted(|mut ws| async move {
            challenge_and_login(&mut ws).await;
            let future = "{\"v\":1,\"t\":\"from_the_future\",\"x\":1}";
            ws.send(Message::text(future)).await.unwrap();
            let presence = Control::Presence {
                peer: Bytes([2; 32]),
                online: true,
            };
            ws.send(Message::text(presence.to_json())).await.unwrap();
            let _ = ws.next().await;
        })
        .await;
        let mut client = Client::connect(&url, Role::Phone, &key()).await.unwrap();
        assert_eq!(
            client.next_event().await.unwrap(),
            Event::Presence {
                peer: Bytes([2; 32]),
                online: true
            }
        );
    }

    #[tokio::test]
    async fn a_close_before_the_challenge_keeps_its_code() {
        let url = scripted(|mut ws| async move {
            let frame = CloseFrame {
                code: CloseCode::from(4401),
                reason: "login_refused".into(),
            };
            let _ = ws.send(Message::Close(Some(frame))).await;
            let _ = ws.next().await;
        })
        .await;
        let mut client = Client::connect(&url, Role::Phone, &key()).await.unwrap();
        assert_eq!(
            client.next_event().await.unwrap(),
            Event::Closed {
                code: 4401,
                reason: "login_refused".into()
            }
        );
    }

    #[tokio::test]
    async fn close_gives_up_on_a_relay_that_never_answers() {
        let url = scripted(|mut ws| async move {
            challenge_and_login(&mut ws).await;
            // Never read again, so the client's close is never answered.
            tokio::time::sleep(Duration::from_secs(30)).await;
            drop(ws);
        })
        .await;
        let client = Client::connect(&url, Role::Phone, &key()).await.unwrap();
        let started = std::time::Instant::now();
        client.close_within(Duration::from_millis(200)).await;
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[test]
    fn a_key_file_others_can_read_is_refused() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("relay-cli-open-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("id.key");
        std::fs::write(&path, URL_SAFE_NO_PAD.encode([1u8; 32])).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        let err = load_or_create_key(&path).unwrap_err();
        assert!(err.to_string().contains("id.key"), "{err}");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert!(load_or_create_key(&path).is_ok());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn creating_a_key_leaves_only_the_key_file() {
        let dir = std::env::temp_dir().join(format!("relay-cli-only-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        load_or_create_key(&dir.join("id.key")).unwrap();
        let names: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![std::ffi::OsString::from("id.key")]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
