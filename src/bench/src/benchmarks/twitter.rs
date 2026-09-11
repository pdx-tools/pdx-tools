//! Measures the effect of arena deserialization on a standard JSON corpus.
//!
//! The corpus is `twitter.json` from serde's `json-benchmark` repository. Two
//! models of the same data are compared:
//!
//! - the heap model, which owns each field in a `String` or a `Vec`
//! - the arena model, which puts each field in a bump allocator and keeps only
//!   `&str` and slices
//!
//! Each model is read with `serde_json` and with `sonic-rs`, and each parse is
//! measured with and without the cost to release the memory. The heap model
//! frees one allocation for each string and each vector. The arena model frees
//! all of its data with a few calls to the system allocator.

use bumpalo::Bump;
use bumpalo_serde::ArenaSeed;
use jomini::binary::BinaryFlavor;
use serde::de::DeserializeSeed;
use std::io::Cursor;
use std::path::PathBuf;

pub mod encode;

/// The corpus, as serde's `json-benchmark` repository ships it.
pub const TWITTER_URL: &str =
    "https://raw.githubusercontent.com/serde-rs/json-benchmark/master/data/twitter.json";

/// The SHA-1 of the corpus, so that the measurements are of the same bytes on
/// every machine.
const TWITTER_SHA1: &str = "d7a60839b31986315797e7e328be0ded541f7d97";

/// The local copy of the corpus. It is not in the repository, so the file is
/// ignored by git.
fn twitter_cache_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join("twitter.json")
}

/// Reads the twitter corpus. The first run fetches it into the cache.
pub fn setup_twitter_data() -> Vec<u8> {
    let path = twitter_cache_path();
    if let Ok(data) = std::fs::read(&path) {
        return data;
    }

    let data = fetch_twitter_data(&path);
    std::fs::write(&path, &data)
        .unwrap_or_else(|err| panic!("Failed to write {}: {err}", path.display()));
    data
}

#[cfg(not(target_family = "wasm"))]
fn fetch_twitter_data(path: &std::path::Path) -> Vec<u8> {
    eprintln!("fetching {TWITTER_URL} into {}", path.display());
    let resp = attohttpc::get(TWITTER_URL)
        .send()
        .unwrap_or_else(|err| panic!("Failed to fetch {TWITTER_URL}: {err}"));
    if !resp.is_success() {
        panic!("Failed to fetch {TWITTER_URL}: HTTP {}", resp.status());
    }
    let data = resp
        .bytes()
        .unwrap_or_else(|err| panic!("Failed to read {TWITTER_URL}: {err}"));

    let mut hasher = sha1_smol::Sha1::new();
    hasher.update(&data);
    let actual = hasher.digest().to_string();
    if actual != TWITTER_SHA1 {
        panic!("SHA-1 of {TWITTER_URL} is {actual}, expected {TWITTER_SHA1}");
    }

    data
}

#[cfg(target_family = "wasm")]
fn fetch_twitter_data(path: &std::path::Path) -> Vec<u8> {
    panic!(
        "{} is missing and wasm can not fetch it; run the benchmark natively first",
        path.display()
    );
}

/// The heap model. Each string and each sequence is a separate allocation.
pub mod heap {
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    pub struct Twitter {
        pub statuses: Vec<Status>,
        pub search_metadata: SearchMetadata,
    }

    #[derive(Debug, Deserialize)]
    pub struct SearchMetadata {
        pub completed_in: f64,
        pub max_id: u64,
        pub max_id_str: String,
        pub next_results: String,
        pub query: String,
        pub refresh_url: String,
        pub count: u32,
        pub since_id: u64,
        pub since_id_str: String,
    }

    #[derive(Debug, Deserialize)]
    pub struct Status {
        pub metadata: Metadata,
        pub created_at: String,
        pub id: u64,
        pub id_str: String,
        pub text: String,
        pub source: String,
        pub truncated: bool,
        pub in_reply_to_status_id: Option<u64>,
        pub in_reply_to_status_id_str: Option<String>,
        pub in_reply_to_user_id: Option<u64>,
        pub in_reply_to_user_id_str: Option<String>,
        pub in_reply_to_screen_name: Option<String>,
        pub user: User,
        pub retweeted_status: Option<Box<Status>>,
        pub retweet_count: u32,
        pub favorite_count: u32,
        pub entities: Entities,
        pub favorited: bool,
        pub retweeted: bool,
        pub possibly_sensitive: Option<bool>,
        pub lang: String,
    }

    #[derive(Debug, Deserialize)]
    pub struct Metadata {
        pub result_type: String,
        pub iso_language_code: String,
    }

    #[derive(Debug, Deserialize)]
    pub struct User {
        pub id: u64,
        pub id_str: String,
        pub name: String,
        pub screen_name: String,
        pub location: String,
        pub description: String,
        pub url: Option<String>,
        pub entities: UserEntities,
        pub protected: bool,
        pub followers_count: u32,
        pub friends_count: u32,
        pub listed_count: u32,
        pub created_at: String,
        pub favourites_count: u32,
        pub utc_offset: Option<i32>,
        pub time_zone: Option<String>,
        pub geo_enabled: bool,
        pub verified: bool,
        pub statuses_count: u32,
        pub lang: String,
        pub contributors_enabled: bool,
        pub is_translator: bool,
        pub is_translation_enabled: bool,
        pub profile_background_color: String,
        pub profile_background_image_url: String,
        pub profile_background_image_url_https: String,
        pub profile_background_tile: bool,
        pub profile_image_url: String,
        pub profile_image_url_https: String,
        pub profile_banner_url: Option<String>,
        pub profile_link_color: String,
        pub profile_sidebar_border_color: String,
        pub profile_sidebar_fill_color: String,
        pub profile_text_color: String,
        pub profile_use_background_image: bool,
        pub default_profile: bool,
        pub default_profile_image: bool,
        pub following: bool,
        pub follow_request_sent: bool,
        pub notifications: bool,
    }

    #[derive(Debug, Deserialize)]
    pub struct UserEntities {
        pub url: Option<UserUrls>,
        pub description: UserUrls,
    }

    #[derive(Debug, Deserialize)]
    pub struct UserUrls {
        pub urls: Vec<Url>,
    }

    #[derive(Debug, Deserialize)]
    pub struct Entities {
        pub hashtags: Vec<Hashtag>,
        pub symbols: Vec<Hashtag>,
        pub urls: Vec<Url>,
        pub user_mentions: Vec<UserMention>,
        #[serde(default)]
        pub media: Vec<Media>,
    }

    #[derive(Debug, Deserialize)]
    pub struct Hashtag {
        pub text: String,
        pub indices: Vec<u32>,
    }

    #[derive(Debug, Deserialize)]
    pub struct Url {
        pub url: String,
        pub expanded_url: String,
        pub display_url: String,
        pub indices: Vec<u32>,
    }

    #[derive(Debug, Deserialize)]
    pub struct UserMention {
        pub screen_name: String,
        pub name: String,
        pub id: u64,
        pub id_str: String,
        pub indices: Vec<u32>,
    }

    #[derive(Debug, Deserialize)]
    pub struct Media {
        pub id: u64,
        pub id_str: String,
        pub indices: Vec<u32>,
        pub media_url: String,
        pub media_url_https: String,
        pub url: String,
        pub display_url: String,
        pub expanded_url: String,
        #[serde(rename = "type")]
        pub media_type: String,
        pub sizes: Sizes,
    }

    #[derive(Debug, Deserialize)]
    pub struct Sizes {
        pub medium: Size,
        pub small: Size,
        pub thumb: Size,
        pub large: Size,
    }

    #[derive(Debug, Deserialize)]
    pub struct Size {
        pub w: u32,
        pub h: u32,
        pub resize: String,
    }
}

/// The arena model. It has the same fields as the heap model, but all data is
/// in the bump allocator.
pub mod arena {
    use bumpalo_serde::ArenaDeserialize;

    #[derive(Debug, ArenaDeserialize)]
    pub struct Twitter<'bump> {
        pub statuses: &'bump [Status<'bump>],
        pub search_metadata: SearchMetadata<'bump>,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct SearchMetadata<'bump> {
        pub completed_in: f64,
        pub max_id: u64,
        pub max_id_str: &'bump str,
        pub next_results: &'bump str,
        pub query: &'bump str,
        pub refresh_url: &'bump str,
        pub count: u32,
        pub since_id: u64,
        pub since_id_str: &'bump str,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Status<'bump> {
        pub metadata: Metadata<'bump>,
        pub created_at: &'bump str,
        pub id: u64,
        pub id_str: &'bump str,
        pub text: &'bump str,
        pub source: &'bump str,
        pub truncated: bool,
        pub in_reply_to_status_id: Option<u64>,
        pub in_reply_to_status_id_str: Option<&'bump str>,
        pub in_reply_to_user_id: Option<u64>,
        pub in_reply_to_user_id_str: Option<&'bump str>,
        pub in_reply_to_screen_name: Option<&'bump str>,
        pub user: User<'bump>,
        pub retweeted_status: Option<&'bump Status<'bump>>,
        pub retweet_count: u32,
        pub favorite_count: u32,
        pub entities: Entities<'bump>,
        pub favorited: bool,
        pub retweeted: bool,
        pub possibly_sensitive: Option<bool>,
        pub lang: &'bump str,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Metadata<'bump> {
        pub result_type: &'bump str,
        pub iso_language_code: &'bump str,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct User<'bump> {
        pub id: u64,
        pub id_str: &'bump str,
        pub name: &'bump str,
        pub screen_name: &'bump str,
        pub location: &'bump str,
        pub description: &'bump str,
        pub url: Option<&'bump str>,
        pub entities: UserEntities<'bump>,
        pub protected: bool,
        pub followers_count: u32,
        pub friends_count: u32,
        pub listed_count: u32,
        pub created_at: &'bump str,
        pub favourites_count: u32,
        pub utc_offset: Option<i32>,
        pub time_zone: Option<&'bump str>,
        pub geo_enabled: bool,
        pub verified: bool,
        pub statuses_count: u32,
        pub lang: &'bump str,
        pub contributors_enabled: bool,
        pub is_translator: bool,
        pub is_translation_enabled: bool,
        pub profile_background_color: &'bump str,
        pub profile_background_image_url: &'bump str,
        pub profile_background_image_url_https: &'bump str,
        pub profile_background_tile: bool,
        pub profile_image_url: &'bump str,
        pub profile_image_url_https: &'bump str,
        pub profile_banner_url: Option<&'bump str>,
        pub profile_link_color: &'bump str,
        pub profile_sidebar_border_color: &'bump str,
        pub profile_sidebar_fill_color: &'bump str,
        pub profile_text_color: &'bump str,
        pub profile_use_background_image: bool,
        pub default_profile: bool,
        pub default_profile_image: bool,
        pub following: bool,
        pub follow_request_sent: bool,
        pub notifications: bool,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct UserEntities<'bump> {
        pub url: Option<UserUrls<'bump>>,
        pub description: UserUrls<'bump>,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct UserUrls<'bump> {
        pub urls: &'bump [Url<'bump>],
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Entities<'bump> {
        pub hashtags: &'bump [Hashtag<'bump>],
        pub symbols: &'bump [Hashtag<'bump>],
        pub urls: &'bump [Url<'bump>],
        pub user_mentions: &'bump [UserMention<'bump>],
        #[arena(default)]
        pub media: &'bump [Media<'bump>],
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Hashtag<'bump> {
        pub text: &'bump str,
        pub indices: &'bump [u32],
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Url<'bump> {
        pub url: &'bump str,
        pub expanded_url: &'bump str,
        pub display_url: &'bump str,
        pub indices: &'bump [u32],
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct UserMention<'bump> {
        pub screen_name: &'bump str,
        pub name: &'bump str,
        pub id: u64,
        pub id_str: &'bump str,
        pub indices: &'bump [u32],
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Media<'bump> {
        pub id: u64,
        pub id_str: &'bump str,
        pub indices: &'bump [u32],
        pub media_url: &'bump str,
        pub media_url_https: &'bump str,
        pub url: &'bump str,
        pub display_url: &'bump str,
        pub expanded_url: &'bump str,
        #[arena(alias = "type")]
        pub media_type: &'bump str,
        pub sizes: Sizes<'bump>,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Sizes<'bump> {
        pub medium: Size<'bump>,
        pub small: Size<'bump>,
        pub thumb: Size<'bump>,
        pub large: Size<'bump>,
    }

    #[derive(Debug, ArenaDeserialize)]
    pub struct Size<'bump> {
        pub w: u32,
        pub h: u32,
        pub resize: &'bump str,
    }
}

/// One encoding of the corpus, and the two ways to read it.
///
/// The trait carries the state that a format needs. jomini binary writes a 16
/// bit token in the place of a key, so it needs the table of the keys that the
/// corpus was written with.
pub trait Corpus {
    /// The name that the benchmark reports.
    fn name(&self) -> &'static str;

    /// The bytes of this encoding, for the throughput of the benchmark.
    fn data(&self) -> &[u8];

    fn heap(&self) -> heap::Twitter;

    fn arena<'bump>(&self, bump: &'bump Bump) -> arena::Twitter<'bump>;
}

/// The corpus as JSON, read with `serde_json`.
#[derive(Debug)]
pub struct SerdeJson(Vec<u8>);

impl Corpus for SerdeJson {
    fn name(&self) -> &'static str {
        "serde_json"
    }

    fn data(&self) -> &[u8] {
        &self.0
    }

    fn heap(&self) -> heap::Twitter {
        serde_json::from_slice(&self.0).expect("the corpus to match the heap model")
    }

    fn arena<'bump>(&self, bump: &'bump Bump) -> arena::Twitter<'bump> {
        let mut de = serde_json::Deserializer::from_slice(&self.0);
        ArenaSeed::new(bump)
            .deserialize(&mut de)
            .expect("the corpus to match the arena model")
    }
}

/// The corpus as JSON, read with `sonic-rs`.
#[cfg(not(target_family = "wasm"))]
#[derive(Debug)]
pub struct SonicRs(Vec<u8>);

#[cfg(not(target_family = "wasm"))]
impl Corpus for SonicRs {
    fn name(&self) -> &'static str {
        "sonic_rs"
    }

    fn data(&self) -> &[u8] {
        &self.0
    }

    fn heap(&self) -> heap::Twitter {
        sonic_rs::from_slice(&self.0).expect("the corpus to match the heap model")
    }

    fn arena<'bump>(&self, bump: &'bump Bump) -> arena::Twitter<'bump> {
        let mut de = sonic_rs::Deserializer::from_slice(&self.0);
        ArenaSeed::new(bump)
            .deserialize(&mut de)
            .expect("the corpus to match the arena model")
    }
}

/// The corpus in the Paradox binary format, read with jomini.
///
/// Each key is a 16 bit token, as a save of a game writes. The translation of
/// the corpus gives out the tokens and hands back the table that names them
/// again.
///
/// The corpus is read through a reader and not through a slice. A slice lets a
/// model borrow each string from the input, which no allocator can beat, but
/// then the whole input must stay in memory. A save arrives as a stream out of
/// a zip entry, where a borrow is not possible and every string must be copied
/// somewhere. The arena and the heap are the two places to copy it to, which is
/// the comparison that this benchmark makes.
#[derive(Debug)]
pub struct JominiBinary {
    data: Vec<u8>,
    tokens: encode::TokenTable,
}

impl Corpus for JominiBinary {
    fn name(&self) -> &'static str {
        "jomini_binary"
    }

    fn data(&self) -> &[u8] {
        &self.data
    }

    fn heap(&self) -> heap::Twitter {
        encode::TwitterFlavor
            .deserializer()
            .from_reader(Cursor::new(&self.data), &self.tokens)
            .deserialize()
            .expect("the corpus to match the heap model")
    }

    fn arena<'bump>(&self, bump: &'bump Bump) -> arena::Twitter<'bump> {
        let mut de = encode::TwitterFlavor
            .deserializer()
            .from_reader(Cursor::new(&self.data), &self.tokens);
        ArenaSeed::new(bump)
            .deserialize(&mut de)
            .expect("the corpus to match the arena model")
    }
}

pub fn setup_serde_json() -> SerdeJson {
    SerdeJson(setup_twitter_data())
}

#[cfg(not(target_family = "wasm"))]
pub fn setup_sonic_rs() -> SonicRs {
    SonicRs(setup_twitter_data())
}

pub fn setup_jomini_binary() -> JominiBinary {
    let document: serde_json::Value =
        serde_json::from_slice(&setup_twitter_data()).expect("the corpus to be JSON");
    let (data, tokens) = encode::to_binary(&document);
    JominiBinary { data, tokens }
}

/// Walks the heap model so that the parse result is used. The result must
/// equal the result of [`arena_checksum`].
pub fn heap_checksum(twitter: &heap::Twitter) -> u64 {
    fn status(status: &heap::Status) -> u64 {
        // The identifiers are large, so keep only the low bits to prevent an
        // overflow of the sum.
        (status.id & 0xffff)
            + status.text.len() as u64
            + status.user.screen_name.len() as u64
            + status.user.description.len() as u64
            + status.entities.hashtags.len() as u64
            + status.entities.urls.len() as u64
            + status.entities.user_mentions.len() as u64
            + status.entities.media.len() as u64
            + status.lang.len() as u64
    }

    let statuses: u64 = twitter
        .statuses
        .iter()
        .map(|s| status(s) + s.retweeted_status.as_deref().map_or(0, status))
        .sum();
    statuses + twitter.search_metadata.max_id_str.len() as u64
}

/// Walks the arena model. See [`heap_checksum`].
pub fn arena_checksum(twitter: &arena::Twitter) -> u64 {
    fn status(status: &arena::Status) -> u64 {
        // The identifiers are large, so keep only the low bits to prevent an
        // overflow of the sum.
        (status.id & 0xffff)
            + status.text.len() as u64
            + status.user.screen_name.len() as u64
            + status.user.description.len() as u64
            + status.entities.hashtags.len() as u64
            + status.entities.urls.len() as u64
            + status.entities.user_mentions.len() as u64
            + status.entities.media.len() as u64
            + status.lang.len() as u64
    }

    let statuses: u64 = twitter
        .statuses
        .iter()
        .map(|s| status(s) + s.retweeted_status.map_or(0, status))
        .sum();
    statuses + twitter.search_metadata.max_id_str.len() as u64
}

pub mod criterion {
    use super::Corpus;
    use bumpalo::Bump;
    use criterion::measurement::WallTime;
    use criterion::{BenchmarkGroup, Criterion, Throughput};
    use std::hint::black_box;
    use std::time::{Duration, Instant};

    /// Measures only the work to make the value. The value is released after
    /// each iteration, but outside of the measurement.
    fn time_parse<T>(iters: u64, mut parse: impl FnMut() -> T) -> Duration {
        let mut total = Duration::ZERO;
        for _ in 0..iters {
            let start = Instant::now();
            let value = black_box(parse());
            total += start.elapsed();
            drop(value);
        }
        total
    }

    /// Measures only the work to release the value.
    fn time_drop<T>(iters: u64, mut parse: impl FnMut() -> T) -> Duration {
        let mut total = Duration::ZERO;
        for _ in 0..iters {
            let value = black_box(parse());
            let start = Instant::now();
            drop(value);
            total += start.elapsed();
        }
        total
    }

    /// Adds the measurements of one encoding of the corpus.
    ///
    /// Each model has three measurements: the parse alone, the release alone,
    /// and both together. The arena model has a fourth measurement, which
    /// keeps one arena for all iterations.
    fn bench_corpus(group: &mut BenchmarkGroup<'_, WallTime>, corpus: &dyn Corpus) {
        let name = corpus.name();

        // Each encoding has its own length, so the throughput belongs to the
        // benchmarks of one corpus and not to the whole group.
        group.throughput(Throughput::Bytes(corpus.data().len() as u64));

        // The checksum walks the model, so that the parse result is used.
        let heap_model = || {
            let twitter = corpus.heap();
            black_box(super::heap_checksum(&twitter));
            twitter
        };

        // The arena, and not the model, owns the data. Therefore the benchmark
        // returns the arena and lets the model go out of scope.
        let arena_model = || {
            let bump = Bump::new();
            let checksum = {
                let twitter = corpus.arena(&bump);
                super::arena_checksum(&twitter)
            };
            black_box(checksum);
            bump
        };

        group.bench_function(format!("{name}/heap"), |b| {
            b.iter_custom(|iters| time_parse(iters, heap_model))
        });
        group.bench_function(format!("{name}/heap-drop"), |b| {
            b.iter_custom(|iters| time_drop(iters, heap_model))
        });
        group.bench_function(format!("{name}/heap+drop"), |b| b.iter(heap_model));

        group.bench_function(format!("{name}/arena"), |b| {
            b.iter_custom(|iters| time_parse(iters, arena_model))
        });
        group.bench_function(format!("{name}/arena-drop"), |b| {
            b.iter_custom(|iters| time_drop(iters, arena_model))
        });
        group.bench_function(format!("{name}/arena+drop"), |b| b.iter(arena_model));

        // The arena keeps its capacity between the iterations, which is the
        // usual pattern when a program parses many documents.
        group.bench_function(format!("{name}/arena-reset"), |b| {
            let mut bump = Bump::new();
            b.iter(|| {
                bump.reset();
                super::arena_checksum(&corpus.arena(&bump))
            })
        });
    }

    pub fn twitter_benchmark(c: &mut Criterion) {
        let mut group = c.benchmark_group("twitter");

        bench_corpus(&mut group, &super::setup_serde_json());

        #[cfg(not(target_family = "wasm"))]
        bench_corpus(&mut group, &super::setup_sonic_rs());

        bench_corpus(&mut group, &super::setup_jomini_binary());

        group.finish();
    }
}

/// Instruction counts for the same work.
///
/// A benchmark that returns the model excludes the cost to release it, because
/// the harness drops the return value outside of the measured function. A
/// benchmark that ends with a checksum includes that cost.
#[cfg(not(target_family = "wasm"))]
pub mod gungraun {
    use super::{Corpus, JominiBinary, SerdeJson, SonicRs, arena_checksum, heap, heap_checksum};
    use bumpalo::Bump;
    use gungraun::{library_benchmark, library_benchmark_group};

    fn heap_keep(corpus: &impl Corpus) -> (u64, heap::Twitter) {
        let twitter = corpus.heap();
        (heap_checksum(&twitter), twitter)
    }

    fn heap_drop(corpus: &impl Corpus) -> u64 {
        heap_checksum(&corpus.heap())
    }

    fn arena_keep(corpus: &impl Corpus) -> (u64, Bump) {
        let bump = Bump::new();
        let checksum = arena_checksum(&corpus.arena(&bump));
        (checksum, bump)
    }

    fn arena_drop(corpus: &impl Corpus) -> u64 {
        let bump = Bump::new();
        arena_checksum(&corpus.arena(&bump))
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_serde_json)]
    #[bench::twitter()]
    fn serde_json_heap(corpus: SerdeJson) -> (u64, heap::Twitter) {
        heap_keep(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_serde_json)]
    #[bench::twitter()]
    fn serde_json_heap_drop(corpus: SerdeJson) -> u64 {
        heap_drop(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_serde_json)]
    #[bench::twitter()]
    fn serde_json_arena(corpus: SerdeJson) -> (u64, Bump) {
        arena_keep(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_serde_json)]
    #[bench::twitter()]
    fn serde_json_arena_drop(corpus: SerdeJson) -> u64 {
        arena_drop(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_sonic_rs)]
    #[bench::twitter()]
    fn sonic_rs_heap(corpus: SonicRs) -> (u64, heap::Twitter) {
        heap_keep(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_sonic_rs)]
    #[bench::twitter()]
    fn sonic_rs_heap_drop(corpus: SonicRs) -> u64 {
        heap_drop(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_sonic_rs)]
    #[bench::twitter()]
    fn sonic_rs_arena(corpus: SonicRs) -> (u64, Bump) {
        arena_keep(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_sonic_rs)]
    #[bench::twitter()]
    fn sonic_rs_arena_drop(corpus: SonicRs) -> u64 {
        arena_drop(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_jomini_binary)]
    #[bench::twitter()]
    fn jomini_binary_heap(corpus: JominiBinary) -> (u64, heap::Twitter) {
        heap_keep(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_jomini_binary)]
    #[bench::twitter()]
    fn jomini_binary_heap_drop(corpus: JominiBinary) -> u64 {
        heap_drop(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_jomini_binary)]
    #[bench::twitter()]
    fn jomini_binary_arena(corpus: JominiBinary) -> (u64, Bump) {
        arena_keep(&corpus)
    }

    #[library_benchmark(setup = crate::benchmarks::twitter::setup_jomini_binary)]
    #[bench::twitter()]
    fn jomini_binary_arena_drop(corpus: JominiBinary) -> u64 {
        arena_drop(&corpus)
    }

    library_benchmark_group!(
        name = twitter_gungraun_benches,
        benchmarks = [
            serde_json_heap,
            serde_json_heap_drop,
            serde_json_arena,
            serde_json_arena_drop,
            sonic_rs_heap,
            sonic_rs_heap_drop,
            sonic_rs_arena,
            sonic_rs_arena_drop,
            jomini_binary_heap,
            jomini_binary_heap_drop,
            jomini_binary_arena,
            jomini_binary_arena_drop
        ]
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every encoding and every model must hold the same document.
    #[test]
    fn corpora_agree() {
        let json = setup_serde_json();
        let expected = heap_checksum(&json.heap());

        let mut corpora: Vec<Box<dyn Corpus>> =
            vec![Box::new(json), Box::new(setup_jomini_binary())];

        #[cfg(not(target_family = "wasm"))]
        corpora.push(Box::new(setup_sonic_rs()));

        for corpus in corpora {
            let bump = Bump::new();
            assert_eq!(expected, heap_checksum(&corpus.heap()), "{}", corpus.name());
            assert_eq!(
                expected,
                arena_checksum(&corpus.arena(&bump)),
                "{} arena",
                corpus.name()
            );
        }
    }
}
