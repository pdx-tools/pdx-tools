use jomini::binary::TokenResolver;

/// Builtin token resolver based on `VIC3_IRONMAN_TOKENS`
pub struct EnvTokens;

impl TokenResolver for EnvTokens {
    fn resolve(&self, token: u16) -> Option<&str> {
        include!(concat!(env!("OUT_DIR"), "/gen_tokens.rs"))
    }
}
