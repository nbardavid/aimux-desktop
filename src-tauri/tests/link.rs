use std::io::{Read, Write};
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

use aimux_desktop_lib::frame::encode_frame;
use aimux_desktop_lib::link::spawn_link;

fn socket_path(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("aimux-link-{}-{name}.sock", std::process::id()));
    let _ = std::fs::remove_file(&path);
    path
}

#[test]
fn relays_server_frames() {
    let path = socket_path("relay");
    let listener = UnixListener::bind(&path).unwrap();
    let (tx, rx) = mpsc::channel();
    let _writer = spawn_link(&path, move |m| tx.send(m).unwrap(), |_| {}).unwrap();
    let (mut server, _) = listener.accept().unwrap();
    server.write_all(&encode_frame("{\"a\":1}")).unwrap();
    server.write_all(&encode_frame("{\"b\":2}")).unwrap();
    let wait = Duration::from_secs(2);
    assert_eq!(rx.recv_timeout(wait).unwrap(), "{\"a\":1}");
    assert_eq!(rx.recv_timeout(wait).unwrap(), "{\"b\":2}");
}

#[test]
fn send_writes_a_frame() {
    let path = socket_path("send");
    let listener = UnixListener::bind(&path).unwrap();
    let writer = spawn_link(&path, |_| {}, |_| {}).unwrap();
    let (mut server, _) = listener.accept().unwrap();
    writer.send("{}").unwrap();
    let mut buf = [0u8; 4];
    server.read_exact(&mut buf).unwrap();
    assert_eq!(&buf, b"2\n{}");
}

#[test]
fn close_reported_once() {
    let path = socket_path("close");
    let listener = UnixListener::bind(&path).unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let (tx, rx) = mpsc::channel();
    let counter = calls.clone();
    let writer = spawn_link(
        &path,
        |_| {},
        move |reason| {
            counter.fetch_add(1, Ordering::SeqCst);
            tx.send(reason).unwrap();
        },
    )
    .unwrap();
    let (server, _) = listener.accept().unwrap();
    drop(server);
    rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(writer.send("{}").is_err());
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}
