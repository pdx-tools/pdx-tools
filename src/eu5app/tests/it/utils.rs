// Duplicate of eu5save/tests/it/utils.rs until a shared pdx-test-utils crate is warranted.
// Follow-up: extract to src/pdx-test-utils/ once a second consumer appears.

use std::fs::File;
use std::io::BufWriter;
use std::path::Path;
use std::sync::{LazyLock, Mutex};

use eu5app::game_data::game_install::Eu5GameInstall;
use eu5app::{Eu5LoadedSave, Eu5SaveLoader, Eu5Workspace};
use eu5save::models::Gamestate;
use eu5save::{BasicTokenResolver, Eu5File};
use highway::HighwayHash;
use jomini::binary::TokenResolver;
use pdx_map::LocationArrays;

static DATA: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

/// Fetch a save file. Save files can be quite large, so the save files are not stored in the
/// repo. Instead they are stored in a public S3 bucket. This function will check if the file has
/// been cached, else fetch it from the S3 bucket. Previous implementations used git lfs, but had
/// to be migrated away as we ran out of the monthly free bandwidth (1GB) on day 1 (and even git
/// lfs caching was used). The S3 implementation used is backblaze, which provides 1GB free
/// download per day, so I'm not anticipating paying more than a few cents a year to maintain this
/// repository of saves.
pub fn request_file<S: AsRef<str>>(input: S) -> File {
    let reffed = input.as_ref();
    let cache_dir = Path::new("..")
        .join("eu5save")
        .join("assets")
        .join("eu5-saves");
    let cache = cache_dir.join(reffed);
    if cache.exists() {
        println!("cache hit: {}", reffed);
    } else {
        let guard = DATA.lock().unwrap();
        if cache.exists() {
            drop(guard);
            println!("cache hit: {}", reffed);
        } else {
            let url = format!("https://cdn-dev.pdx.tools/eu5-saves/{}", reffed);
            let mut attempts = 0;
            loop {
                match attohttpc::get(&url).send() {
                    Ok(mut resp) => {
                        if !resp.is_success() {
                            panic!("expected a 200 code from s3");
                        } else {
                            // Atomic rename to avoid reading partial writes.
                            // Use temporary in same directory to avoid cross
                            // device rename issues.
                            std::fs::create_dir_all(&cache_dir).unwrap();
                            let mut tmp = tempfile::NamedTempFile::new_in(&cache_dir)
                                .expect("to create tempfile");
                            std::io::copy(&mut resp, &mut tmp).expect("to copy to tempfile");
                            tmp.persist(&cache).unwrap();
                            break;
                        }
                    }
                    Err(e) => {
                        if attempts > 4 {
                            panic!("errored retrieving from s3: {:?}", e)
                        } else {
                            attempts += 1;
                        }
                    }
                }
            }
        }
    }

    std::fs::File::open(cache).unwrap()
}

static TOKENS: LazyLock<BasicTokenResolver> = LazyLock::new(|| {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("assets")
        .join("tokens")
        .join("eu5.txt");
    let file_data = std::fs::read(&path).unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice()).unwrap();
    if resolver.is_empty() {
        eprintln!("EU5 binary tokens not loaded");
    }
    resolver
});

pub struct LoadedWorkspace {
    pub workspace: Eu5Workspace<'static>,
    #[allow(dead_code)]
    pub loaded_save: Eu5LoadedSave,
}

pub fn build_workspace(save_name: &str) -> Option<LoadedWorkspace> {
    let file = request_file(save_name);
    let file = Eu5File::from_file(file).unwrap();
    let is_binary = file.header().kind().is_binary();
    let resolver = &*TOKENS;
    if is_binary && resolver.is_empty() {
        eprintln!("{save_name}: EU5 binary tokens not loaded");
        return None;
    }

    let loader = Eu5SaveLoader::open(file, resolver).unwrap();
    let version = loader.meta().version;

    let bundle_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("assets")
        .join("game-bundles")
        .join(format!("eu5-{}.{}.zip", version.major, version.minor));
    let bundle_path_display = bundle_path.display();
    if !bundle_path.exists() {
        eprintln!(
            "{save_name}: missing {bundle_path_display}; run mise run admin:assets:sync to fetch"
        );
        return None;
    }

    let game_data = Eu5GameInstall::open(&bundle_path)
        .map(Eu5GameInstall::into_game_data)
        .unwrap();

    let mut loaded_save = loader.parse().unwrap();
    let gamestate = loaded_save.take_gamestate();
    // SAFETY: `gamestate` points into `loaded_save`'s arena. `LoadedWorkspace` owns both values
    // and declares `workspace` before `loaded_save`, so Rust drops the workspace before freeing
    // the arena.
    let gamestate = unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(gamestate) };
    let workspace = Eu5Workspace::new(gamestate, game_data).unwrap();

    Some(LoadedWorkspace {
        workspace,
        loaded_save,
    })
}

/// Hash all four GPU color/flag buffers from `LocationArrays` into a single hex string.
pub fn hash_location_arrays(arrays: &LocationArrays) -> String {
    let hasher = highway::HighwayHasher::new(highway::Key::default());
    let mut writer = BufWriter::with_capacity(0x8000, hasher);
    let h = writer.get_mut();
    let buffers = arrays.buffers();
    h.append(bytemuck::cast_slice(buffers.primary_colors()));
    h.append(bytemuck::cast_slice(buffers.secondary_colors()));
    h.append(bytemuck::cast_slice(buffers.owner_colors()));
    h.append(bytemuck::cast_slice(buffers.state_flags()));
    let result = writer.into_inner().unwrap().finalize256();
    format!(
        "0x{:016x}{:016x}{:016x}{:016x}",
        result[0], result[1], result[2], result[3]
    )
}
