// Import types for specta to export
#[allow(unused_imports)]
use applib::*;

fn main() {
    specta::export::ts("src/app/src/server-lib/save-parsing-types.ts").unwrap();
}
