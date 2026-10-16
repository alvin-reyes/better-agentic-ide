//! The relay's test client: logs in with an identity key and reports what the relay
//! says. `ws://` is allowed so tests can use localhost; the `wss://`-only rule belongs
//! to the phone's QR parser.

use std::path::Path;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use relay_core::{login_message, signed_host};
use relay_protocol::{Bytes, Control, DeviceKey, PairInfo, Role};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::http::Uri;
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
}

impl Client {
    /// Connects, answers the challenge with a login signed over the host in `url`, and
    /// returns. The relay's answer, `welcome` or a refusal, is the first `next_event`.
    pub async fn connect(url: &str, role: Role, key: &SigningKey) -> Result<Client, ClientError> {
        let host = host_of(url)?;
        let (mut ws, _) = tokio_tungstenite::connect_async(url).await?;
        let c = loop {
            match ws.next().await {
                Some(Ok(Message::Text(text))) => match Control::from_json(&text) {
                    Ok(Control::Challenge { c }) => break c.0,
                    _ => return Err(ClientError::Protocol),
                },
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
        Ok(Client { ws, closed: false })
    }

    /// The next `welcome`, `presence` or close. Reading also answers the relay's
    /// pings; a client that stops reading stops answering them.
    pub async fn next_event(&mut self) -> Result<Event, ClientError> {
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
                    let (code, reason) = frame
                        .map(|f| (u16::from(f.code), f.reason.to_string()))
                        .unwrap_or((0, String::new()));
                    return Ok(Event::Closed { code, reason });
                }
                _ => continue,
            }
        }
    }

    /// Closes the connection cleanly.
    pub async fn close(mut self) {
        let _ = self.ws.close(None).await;
        // Drain until the relay's close arrives, so the close is seen at once.
        while let Some(Ok(_)) = self.ws.next().await {}
    }
}

/// Reads an Ed25519 key from `path` (32 bytes as unpadded base64url), creating one if
/// the file is missing.
pub fn load_or_create_key(path: &Path) -> std::io::Result<SigningKey> {
    match std::fs::read_to_string(path) {
        Ok(text) => {
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

fn write_private(path: &Path, text: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
