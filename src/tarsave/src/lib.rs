pub struct TarSave<'a> {
    pub meta: &'a [u8],
    pub gamestate: &'a [u8],
    pub ai: &'a [u8],
}

fn is_tarsave(data: &[u8]) -> bool {
    matches!(
        data,
        [b'a', b'i', ..]
            | [b'm', b'e', b't', b'a', ..]
            | [b'g', b'a', b'm', b'e', b's', b't', b'a', b't', b'e', ..]
    )
}

pub fn extract_tarsave(data: &[u8]) -> Option<TarSave> {
    if !is_tarsave(data) {
        return None;
    }

    let mut archive = tar::Archive::new(data);
    let entries = archive.entries().ok()?;
    let mut gamestate: &[u8] = &[];
    let mut ai: &[u8] = &[];
    let mut meta: &[u8] = &[];
    for entry in entries {
        let entry = entry.ok()?;
        let pos = entry.raw_file_position() as usize;
        let len = entry.size() as usize;
        let file_data = data.get(pos..pos + len)?;
        if let Ok(path) = entry.path() {
            if let Some(path) = path.to_str() {
                match path {
                    "gamestate" => gamestate = file_data,
                    "meta" => meta = file_data,
                    "ai" => ai = file_data,
                    _ => {}
                }
            }
        }
    }

    Some(TarSave {
        meta,
        gamestate,
        ai,
    })
}
