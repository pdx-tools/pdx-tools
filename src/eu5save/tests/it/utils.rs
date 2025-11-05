use std::fs::File;
use std::path::Path;
use std::sync::{LazyLock, Mutex};

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
    let cache = Path::new("assets").join("eu5-saves").join(reffed);
    if cache.exists() {
        println!("cache hit: {}", reffed);
    } else {
        let guard = DATA.lock().unwrap();
        if cache.exists() {
            drop(guard);
            println!("cache hit: {}", reffed);
        } else {
            let url = format!(
                "https://eu4saves-test-cases.s3.us-west-002.backblazeb2.com/eu5/{}",
                reffed
            );
            let mut attempts = 0;
            loop {
                match attohttpc::get(&url).send() {
                    Ok(mut resp) => {
                        if !resp.is_success() {
                            panic!("expected a 200 code from s3");
                        } else {
                            std::fs::create_dir_all(cache.parent().unwrap()).unwrap();
                            let mut f = std::fs::File::create(&cache).unwrap();
                            std::io::copy(&mut resp, &mut f).unwrap();
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

pub fn inflate(file: File) -> Vec<u8> {
    let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
    let archive = rawzip::ZipArchive::from_file(file, &mut buf).unwrap();
    let mut entries = archive.entries(&mut buf);
    let entry = entries.next_entry().unwrap().unwrap();
    let wayfinder = entry.wayfinder();
    let mut output = Vec::with_capacity(wayfinder.uncompressed_size_hint() as usize);
    let zip_entry = archive.get_entry(wayfinder).unwrap();
    let inflater = flate2::read::DeflateDecoder::new(zip_entry.reader());
    let mut verifier = zip_entry.verifying_reader(inflater);
    std::io::copy(&mut verifier, &mut output).unwrap();
    output
}
