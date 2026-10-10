![ci](https://github.com/rakaly/jomini/workflows/ci/badge.svg)

# EU5 Save

EU5 Save is a library to ergonomically work with Europa Universalis V (EU5) saves (ironman + debug).

Save models are deserialized into an arena through [arena-serde](../arena-serde), so a whole save is freed in constant time when the arena drops.

```rust,ignore
use arena_serde::{Arena, ArenaDeserialize};
use eu5save::{models::Gamestate, BasicTokenResolver, Eu5File, SaveContentKind, SaveResolver};

let file = std::fs::File::open("assets/saves/eu5/debug-1.0.eu5").unwrap();
let file = Eu5File::from_file(file).unwrap();
let arena = Arena::new();

// Ironman saves need a token resolver. The data to construct one is not
// distributed here.
let tokens = std::fs::read("assets/tokens/eu5.txt").unwrap();
let resolver = BasicTokenResolver::from_text_lines(tokens.as_slice()).unwrap();

let save = match file.gamestate().unwrap() {
    SaveContentKind::Text(mut txt) => {
        Gamestate::deserialize_in_arena(&mut txt.deserializer(), &arena).unwrap()
    }
    SaveContentKind::Binary(mut bin) => {
        let resolver = SaveResolver::from_file(&file, &resolver).unwrap();
        Gamestate::deserialize_in_arena(&mut bin.deserializer(&resolver), &arena).unwrap()
    }
};
println!("{}", save.metadata.date.game_fmt());
```

## Ironman

Ironman saves are supported through a provided `TokenResolver`. Per PDS counsel, the data to construct such a `TokenResolver` is not distributed here.
