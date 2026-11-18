//! Reading the map must never hold a whole hemisphere. This test counts every
//! allocation, so it lives in its own test binary.

use eu5app::game_data::{OptimizedMapBundle, TILES_ENTRY};
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
    let map = bundle.load().unwrap();
    let peak = PEAK.load(Ordering::Relaxed) - before;

    assert_eq!(map.index.len(), 1);
    assert!(
        peak < HEMISPHERE_BYTES / 8,
        "reading the map took {peak} bytes at its peak"
    );
}

/// A map bundle whose tiles are all location 0
fn map_zip() -> Vec<u8> {
    let world = eu5app::hemisphere_size().world();
    let count = world.width / 16 * world.height / 16;
    let words = (0..count)
        .map(|tile| (count + tile) << 3)
        .chain((0..count).map(|_| 0));
    let bytes: Vec<u8> = words.flat_map(u32::to_le_bytes).collect();

    let mut archive = rawzip::ZipArchiveWriter::new(std::io::Cursor::new(Vec::new()));
    let (mut entry, _) = archive
        .new_file(TILES_ENTRY)
        .compression_method(rawzip::CompressionMethod::ZSTD)
        .start()
        .unwrap();
    let mut encoder = pdx_zstd::Encoder::new(&mut entry, 1).unwrap();
    encoder.write_all(&bytes).unwrap();
    encoder.finish().unwrap();
    let descriptor = rawzip::DataDescriptorOutput::new(0, bytes.len() as u64);
    entry.finish(descriptor).unwrap();
    archive.finish().unwrap().into_inner()
}
