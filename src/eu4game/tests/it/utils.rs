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
    let cache = Path::new("..")
        .join("..")
        .join("assets")
        .join("eu4-saves")
        .join(reffed);
    if cache.exists() {
        println!("cache hit: {}", reffed);
        fs::read(cache).unwrap()
    } else {
        let url = format!(
            "https://eu4saves-test-cases.s3.us-west-002.backblazeb2.com/{}",
            reffed
        );
        let resp = attohttpc::get(&url).send().unwrap();

        if !resp.is_success() {
            panic!("expected a 200 code from s3");
        } else {
            let data = resp.bytes().unwrap();
            std::fs::create_dir_all(cache.parent().unwrap()).unwrap();
            std::fs::write(&cache, &data).unwrap();
            data
        }
    }
}
