use std::fs;
use std::path::Path;

/// Fetch an eu4 save file. Save files can be quite large, so the save files are not stored in the
/// repo. Instead they are stored in a public S3 bucket. This function will check if the file has
/// been cached, else fetch it from the S3 bucket. Previous implementations used git lfs, but had
/// to be migrated away as we ran out of the monthly free bandwidth (1GB) on day 1 (and even git
/// lfs caching was used). The S3 implementation used is backblaze, which provides 1GB free
/// download per day, so I'm not anticipating paying more than a few cents a year to maintain this
/// repository of saves.
pub fn request<S: AsRef<str>>(input: S) -> Vec<u8> {
    let reffed = input.as_ref();
    let cache_dir = Path::new("..").join("..").join("assets").join("eu4-saves");
    let cache = cache_dir.join(reffed);
    if cache.exists() {
        println!("cache hit: {}", reffed);
        fs::read(cache).unwrap()
    } else {
        let url = format!("https://cdn-dev.pdx.tools/eu4-saves/{}", reffed);

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
                        return fs::read(&cache).unwrap();
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
