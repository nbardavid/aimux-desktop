//! Byte relay to the daemon's Unix socket. Framing only: payloads stay opaque JSON
//! strings, parsed and validated on the TS side.

use std::io::{Read, Write};
use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::frame::{encode_frame, FrameDecoder};

pub struct LinkWriter {
    stream: Mutex<UnixStream>,
    closed: Arc<AtomicBool>,
}

impl LinkWriter {
    pub fn send(&self, json: &str) -> std::io::Result<()> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "link closed",
            ));
        }
        let mut stream = self.stream.lock().unwrap_or_else(|e| e.into_inner());
        stream.write_all(&encode_frame(json))
    }
}

impl Drop for LinkWriter {
    // Wakes the reader thread so it reports the close and exits.
    fn drop(&mut self) {
        if let Ok(stream) = self.stream.get_mut() {
            let _ = stream.shutdown(Shutdown::Both);
        }
    }
}

pub fn spawn_link(
    path: &Path,
    on_message: impl Fn(String) + Send + 'static,
    on_close: impl Fn(String) + Send + 'static,
) -> std::io::Result<LinkWriter> {
    let stream = UnixStream::connect(path)?;
    let mut reader = stream.try_clone()?;
    let closed = Arc::new(AtomicBool::new(false));
    let reader_closed = closed.clone();
    std::thread::spawn(move || {
        let mut decoder = FrameDecoder::new();
        let mut buf = vec![0u8; 64 * 1024];
        let reason = loop {
            match reader.read(&mut buf) {
                Ok(0) => break "daemon closed the connection".to_string(),
                Ok(n) => match decoder.push(&buf[..n]) {
                    Ok(messages) => messages.into_iter().for_each(&on_message),
                    Err(err) => break format!("bad frame: {err}"),
                },
                Err(err) if err.kind() == std::io::ErrorKind::Interrupted => {}
                Err(err) => break format!("read error: {err}"),
            }
        };
        reader_closed.store(true, Ordering::SeqCst);
        let _ = reader.shutdown(Shutdown::Both);
        on_close(reason);
    });
    Ok(LinkWriter {
        stream: Mutex::new(stream),
        closed,
    })
}
