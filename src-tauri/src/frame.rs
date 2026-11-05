//! The daemon's wire framing: `"<payload byte length>\n<JSON>"`, length in UTF-8 bytes
//! (same as `encodeMessage` in `src/ipc/protocol.ts`).

pub fn encode_frame(json: &str) -> Vec<u8> {
    let mut out = format!("{}\n", json.len()).into_bytes();
    out.extend_from_slice(json.as_bytes());
    out
}

#[derive(Default)]
pub struct FrameDecoder {
    buffer: Vec<u8>,
    expected: Option<usize>,
}

impl FrameDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, String> {
        self.buffer.extend_from_slice(chunk);
        let mut messages = Vec::new();
        loop {
            let expected = match self.expected {
                Some(n) => n,
                None => {
                    let Some(newline) = self.buffer.iter().position(|&b| b == b'\n') else {
                        break;
                    };
                    let header = &self.buffer[..newline];
                    if header.is_empty() || !header.iter().all(u8::is_ascii_digit) {
                        return Err(format!(
                            "invalid frame header: {:?}",
                            String::from_utf8_lossy(header)
                        ));
                    }
                    let n = std::str::from_utf8(header)
                        .ok()
                        .and_then(|s| s.parse().ok())
                        .ok_or("frame length overflow")?;
                    self.buffer.drain(..=newline);
                    self.expected = Some(n);
                    n
                }
            };
            if self.buffer.len() < expected {
                break;
            }
            let payload: Vec<u8> = self.buffer.drain(..expected).collect();
            self.expected = None;
            messages.push(String::from_utf8(payload).map_err(|e| e.to_string())?);
        }
        Ok(messages)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_uses_byte_length() {
        assert_eq!(
            encode_frame("{\"t\":\"é\"}"),
            b"10\n{\"t\":\"\xc3\xa9\"}".to_vec()
        );
    }

    #[test]
    fn decodes_frame_split_across_chunks() {
        let mut d = FrameDecoder::new();
        assert_eq!(d.push(b"7\n{\"a\"").unwrap(), Vec::<String>::new());
        assert_eq!(d.push(b":1}").unwrap(), vec!["{\"a\":1}"]);
    }

    #[test]
    fn decodes_two_frames_in_one_chunk() {
        let mut d = FrameDecoder::new();
        let mut chunk = encode_frame("{}");
        chunk.extend(encode_frame("[]"));
        assert_eq!(d.push(&chunk).unwrap(), vec!["{}", "[]"]);
    }

    #[test]
    fn splits_inside_multibyte_char() {
        let original = "{\"t\":\"é\"}";
        let frame = encode_frame(original);
        let cut = frame.iter().position(|&b| b == 0xc3).unwrap() + 1;
        let mut d = FrameDecoder::new();
        assert!(d.push(&frame[..cut]).unwrap().is_empty());
        assert_eq!(d.push(&frame[cut..]).unwrap(), vec![original]);
    }

    #[test]
    fn rejects_non_numeric_header() {
        assert!(FrameDecoder::new().push(b"x\n{}").is_err());
    }
}
