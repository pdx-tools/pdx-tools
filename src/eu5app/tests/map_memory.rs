//! Reading the map must never hold a whole hemisphere. This test counts every
//! allocation, so it lives in its own test binary.

use eu5app::game_data::OptimizedMapBundle;
use std::alloc::{GlobalAlloc, Layout, System};
use std::io::Write;
use std::sync::atomic::{AtomicUsize, Ordering};

struct Counting;

static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let live = LIVE.fetch_add(layout.size(), Ordering::Relaxed) + layout.size();
        PEAK.fetch_max(live, Ordering::Relaxed);
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        LIVE.fetch_sub(layout.size(), Ordering::Relaxed);
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: Counting = Counting;

const HEMISPHERE_BYTES: usize = 8192 * 8192 * 2;

#[test]
fn reading_the_map_never_holds_a_hemisphere() {
    let zip = map_zip();
    let bundle = OptimizedMapBundle::open(zip.as_slice()).unwrap();

    let before = LIVE.load(Ordering::Relaxed);
    PEAK.store(before, Ordering::Relaxed);
    let index = bundle.read_map(|_| {}).unwrap();
    let peak = PEAK.load(Ordering::Relaxed) - before;

    assert_eq!(index.len(), 1);
    assert!(
        peak < HEMISPHERE_BYTES / 8,
        "reading the map took {peak} bytes at its peak"
    );
}

/// A map bundle whose hemispheres are all location 0, as zstd frames of
/// run-length blocks.
fn map_zip() -> Vec<u8> {
    let mut frame = vec![0x28, 0xb5, 0x2f, 0xfd, 0, (17 - 10) << 3];
    let block = 128 << 10;
    for i in 0..HEMISPHERE_BYTES / block {
        let last = u32::from(i + 1 == HEMISPHERE_BYTES / block);
        let header = (block as u32) << 3 | 1 << 1 | last;
        frame.extend_from_slice(&header.to_le_bytes()[..3]);
        frame.push(0);
    }

    let mut archive = rawzip::ZipArchiveWriter::new(std::io::Cursor::new(Vec::new()));
    for name in ["locations-0.r16", "locations-1.r16"] {
        let (mut entry, _) = archive
            .new_file(name)
            .compression_method(rawzip::CompressionMethod::ZSTD)
            .start()
            .unwrap();
        entry.write_all(&frame).unwrap();
        let descriptor = rawzip::DataDescriptorOutput::new(0, HEMISPHERE_BYTES as u64);
        entry.finish(descriptor).unwrap();
    }
    archive.finish().unwrap().into_inner()
}
