//! The EU5 binary format.
//!
//! EU5 does not write the same binary format as the other Clausewitz games:
//!
//! - Nearly every key and string value in the body of a save is an index into
//!   a per save string table (the `string_lookup` zip entry) and not a game
//!   token. A 1.4 gamestate holds 28 game tokens and 13 million lookups.
//! - Almost every number is a variable width fixed point lexeme with five
//!   decimal places, and not an IEEE double.
//! - From SAV03 a color is the lookup string `rgb` followed by a block of
//!   channels. An older save writes a dedicated `RGB` lexeme.
//!
//! [`Eu5BinaryFormat`] decodes these lexemes. It takes the place of the
//! general purpose format that jomini supplies, so that the hot paths can be
//! written for the lexemes that EU5 writes.
//!
//! The header version of a save does say which lexemes to expect. Measured
//! over the gamestate of one save of each generation:
//!
//! | Header | Save | Keys | Numbers | Colors |
//! | --- | --- | --- | --- | --- |
//! | 1 | 1.0.0 | 3.8M game tokens, no lookup | 2.6M `F64` | `RGB` lexeme |
//! | 2 | 1.3.11 | 10.4M game tokens, 3.2M lookups | 7.6M fixed point | `RGB` lexeme |
//! | 3 | 1.4 | 28 game tokens, 13.7M lookups | 6.7M fixed point | `rgb` lookup |
//!
//! The format does not branch on the version, because a format that accepts
//! every lexeme costs nothing more. Each decision reads one table that maps a
//! lexeme to its [`Class`], so a lexeme that a generation never writes is only
//! an unused row. A version parameter would instead double the code of the
//! deserializer, which this crate also compiles to wasm.

use crate::Eu5Flavor;
use jomini::{
    Encoding, Error, ParserSource,
    binary::{
        BinaryFlavor, BinaryFormat, BinaryFormatContext, BinarySourceExt, FailedResolveStrategy,
        LexemeId, PdxVisitor, TokenResolver,
    },
};
use serde::de::Error as _;
use std::borrow::Cow;

/// What a lexeme means.
///
/// The class fits in a byte so that one table read replaces a chain of
/// comparisons against three dozen lexeme ids.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
enum Class {
    /// A game token. The id is the whole value.
    Token,
    Open,
    Close,
    Equal,
    /// A length prefixed string.
    Str,
    EmptyStr,
    U32,
    I32,
    U64,
    I64,
    F32,
    F64,
    Bool,
    Rgb,
    /// An index into the string table, in one, two, three, or four bytes.
    Lookup1,
    Lookup2,
    Lookup3,
    Lookup4,
    /// A fixed point number with five decimal places. The id holds the width
    /// and the sign of the payload.
    Fixed5,
}

/// The largest lexeme that EU5 writes. Anything above it is a game token.
const MAX_LEXEME: usize = LexemeId::STR_SAV03.0 as usize;

/// The class of every lexeme that EU5 writes.
static CLASSES: [Class; MAX_LEXEME + 1] = {
    let mut t = [Class::Token; MAX_LEXEME + 1];
    t[LexemeId::OPEN.0 as usize] = Class::Open;
    t[LexemeId::CLOSE.0 as usize] = Class::Close;
    t[LexemeId::EQUAL.0 as usize] = Class::Equal;
    t[LexemeId::QUOTED.0 as usize] = Class::Str;
    t[LexemeId::UNQUOTED.0 as usize] = Class::Str;
    t[LexemeId::STR_SAV03.0 as usize] = Class::Str;
    t[LexemeId::EMPTY_STRING.0 as usize] = Class::EmptyStr;
    t[LexemeId::U32.0 as usize] = Class::U32;
    t[LexemeId::I32.0 as usize] = Class::I32;
    t[LexemeId::U64.0 as usize] = Class::U64;
    t[LexemeId::I64.0 as usize] = Class::I64;
    t[LexemeId::F32.0 as usize] = Class::F32;
    t[LexemeId::F64.0 as usize] = Class::F64;
    t[LexemeId::BOOL.0 as usize] = Class::Bool;
    t[LexemeId::RGB.0 as usize] = Class::Rgb;
    t[LexemeId::LOOKUP_U8.0 as usize] = Class::Lookup1;
    t[LexemeId::LOOKUP_U8_ALT.0 as usize] = Class::Lookup1;
    t[LexemeId::LOOKUP_U8_SAV03.0 as usize] = Class::Lookup1;
    t[LexemeId::LOOKUP_U16.0 as usize] = Class::Lookup2;
    t[LexemeId::LOOKUP_U16_ALT.0 as usize] = Class::Lookup2;
    t[LexemeId::LOOKUP_U16_SAV03.0 as usize] = Class::Lookup2;
    t[LexemeId::LOOKUP_U24.0 as usize] = Class::Lookup3;
    t[LexemeId::LOOKUP_U24_ALT.0 as usize] = Class::Lookup3;
    t[LexemeId::LOOKUP_U24_SAV03.0 as usize] = Class::Lookup3;
    t[LexemeId::LOOKUP_U32.0 as usize] = Class::Lookup4;
    t[LexemeId::LOOKUP_U32_ALT.0 as usize] = Class::Lookup4;
    t[LexemeId::LOOKUP_U32_SAV03.0 as usize] = Class::Lookup4;

    let mut offset = 0;
    while offset <= LexemeId::FIXED5_I56.0 - LexemeId::FIXED5_ZERO.0 {
        t[(LexemeId::FIXED5_ZERO.0 + offset) as usize] = Class::Fixed5;
        offset += 1;
    }
    t
};

/// The payload length of every fixed width EU5 lexeme.
///
/// A zero entry is a lexeme with no payload, or a lexeme whose payload has a
/// variable length and needs a branch of its own: a string or an `RGB` block.
/// The skip loop reads this table by lexeme id, so it is kept separate from
/// [`CLASSES`].
static PAYLOAD_SIZES: [u8; MAX_LEXEME + 1] = {
    let mut t = [0u8; MAX_LEXEME + 1];
    t[LexemeId::U32.0 as usize] = 4;
    t[LexemeId::I32.0 as usize] = 4;
    t[LexemeId::F32.0 as usize] = 4;
    t[LexemeId::BOOL.0 as usize] = 1;
    t[LexemeId::U64.0 as usize] = 8;
    t[LexemeId::I64.0 as usize] = 8;
    t[LexemeId::F64.0 as usize] = 8;
    t[LexemeId::LOOKUP_U8.0 as usize] = 1;
    t[LexemeId::LOOKUP_U8_ALT.0 as usize] = 1;
    t[LexemeId::LOOKUP_U8_SAV03.0 as usize] = 1;
    t[LexemeId::LOOKUP_U16.0 as usize] = 2;
    t[LexemeId::LOOKUP_U16_ALT.0 as usize] = 2;
    t[LexemeId::LOOKUP_U16_SAV03.0 as usize] = 2;
    t[LexemeId::LOOKUP_U24.0 as usize] = 3;
    t[LexemeId::LOOKUP_U24_ALT.0 as usize] = 3;
    t[LexemeId::LOOKUP_U24_SAV03.0 as usize] = 3;
    t[LexemeId::LOOKUP_U32.0 as usize] = 4;
    t[LexemeId::LOOKUP_U32_ALT.0 as usize] = 4;
    t[LexemeId::LOOKUP_U32_SAV03.0 as usize] = 4;

    // A fixed point lexeme carries its width in its id: the first holds a zero
    // with no payload, then one to seven bytes of magnitude, then the same
    // widths again for a negative value.
    let mut offset = 0;
    while offset <= LexemeId::FIXED5_I56.0 - LexemeId::FIXED5_ZERO.0 {
        let width = if offset > 7 { offset - 7 } else { offset };
        t[(LexemeId::FIXED5_ZERO.0 + offset) as usize] = width as u8;
        offset += 1;
    }
    t
};

#[inline]
fn class(id: LexemeId) -> Class {
    match CLASSES.get(id.0 as usize) {
        Some(class) => *class,
        None => Class::Token,
    }
}

#[inline]
fn payload_size(id: LexemeId) -> usize {
    match PAYLOAD_SIZES.get(id.0 as usize) {
        Some(size) => *size as usize,
        None => 0,
    }
}

/// The width and the sign of a fixed point lexeme.
///
/// Only call it for a lexeme of class [`Class::Fixed5`].
#[inline]
fn fixed5(id: LexemeId) -> (usize, bool) {
    let offset = id.0.wrapping_sub(LexemeId::FIXED5_ZERO.0);
    let negative = offset > 7;
    let width = if negative { offset - 7 } else { offset };
    (usize::from(width), negative)
}

/// Build the little endian `i64` of a fixed point value from the eight bytes
/// that follow its lexeme, of which only the first `width` belong to it.
#[inline]
fn fixed5_value(data: [u8; 8], width: usize, negative: bool) -> [u8; 8] {
    // A mask takes the magnitude without a variable length copy. The width is
    // never more than seven, so the shift is always in range.
    let mask = (1u64 << (width * 8)) - 1;
    let magnitude = (u64::from_le_bytes(data) & mask) as i64;
    let sign = 1i64 - i64::from(negative) * 2;
    (magnitude * sign).to_le_bytes()
}

#[inline]
fn read_fixed5(source: &mut ParserSource<'_>, id: LexemeId) -> Result<[u8; 8], Error> {
    let (width, negative) = fixed5(id);
    let mut data = [0u8; 8];
    data[..width].copy_from_slice(source.take_bytes(width)?);
    Ok(fixed5_value(data, width, negative))
}

/// Read the index of a lookup whose class is already known.
#[inline]
fn read_lookup(source: &mut ParserSource<'_>, class: Class) -> Result<u32, Error> {
    match class {
        Class::Lookup1 => Ok(u32::from(source.take::<1>()?[0])),
        Class::Lookup2 => Ok(u32::from(u16::from_le_bytes(*source.take::<2>()?))),
        Class::Lookup3 => {
            let b = source.take::<3>()?;
            Ok(u32::from_le_bytes([b[0], b[1], b[2], 0]))
        }
        _ => Ok(u32::from_le_bytes(*source.take::<4>()?)),
    }
}

/// The lowest lookup lexeme. Every lookup is within 32 of it, so one 32 bit
/// mask answers whether a lexeme is a lookup without a table read.
const LOOKUP_BASE: u16 = LexemeId::LOOKUP_U16.0;

const LOOKUP_MASK: u32 = {
    let ids = [
        LexemeId::LOOKUP_U8,
        LexemeId::LOOKUP_U8_ALT,
        LexemeId::LOOKUP_U8_SAV03,
        LexemeId::LOOKUP_U16,
        LexemeId::LOOKUP_U16_ALT,
        LexemeId::LOOKUP_U16_SAV03,
        LexemeId::LOOKUP_U24,
        LexemeId::LOOKUP_U24_ALT,
        LexemeId::LOOKUP_U24_SAV03,
        LexemeId::LOOKUP_U32,
        LexemeId::LOOKUP_U32_ALT,
        LexemeId::LOOKUP_U32_SAV03,
    ];

    let mut mask = 0u32;
    let mut i = 0;
    while i < ids.len() {
        mask |= 1 << (ids[i].0 - LOOKUP_BASE);
        i += 1;
    }
    mask
};

/// Whether the lexeme holds an index into the string table of the save.
#[inline]
const fn is_lookup_id(id: LexemeId) -> bool {
    let offset = id.0.wrapping_sub(LOOKUP_BASE);
    offset < 32 && (LOOKUP_MASK >> offset) & 1 == 1
}

/// Whether the lexeme holds a length prefixed string.
#[inline]
const fn is_str_id(id: LexemeId) -> bool {
    matches!(
        id,
        LexemeId::QUOTED | LexemeId::UNQUOTED | LexemeId::STR_SAV03
    )
}

/// Whether the lexeme holds a fixed point number.
#[inline]
const fn is_fixed5_id(id: LexemeId) -> bool {
    id.0 >= LexemeId::FIXED5_ZERO.0 && id.0 <= LexemeId::FIXED5_I56.0
}

#[cold]
fn unexpected_structural(source: &ParserSource<'_>) -> Error {
    Error::custom(format_args!(
        "unexpected structural token at offset {}",
        source.position()
    ))
}

/// The value of [`Eu5BinaryFormat::rgb_index`] when the save has no `rgb` entry
/// in its string table. No real index can collide with it, because a table
/// never holds four billion entries.
const NO_RGB: u32 = u32::MAX;

/// The EU5 binary format.
///
/// Create one for each save and hand it to a
/// [`BinaryFormatDeserializer`](jomini::binary::BinaryFormatDeserializer).
#[derive(Debug, Clone)]
pub struct Eu5BinaryFormat<'res, RES> {
    resolver: &'res RES,
    flavor: Eu5Flavor,
    on_failed_resolve: FailedResolveStrategy,
    rgb_index: u32,
}

impl<'res, RES> Eu5BinaryFormat<'res, RES>
where
    RES: TokenResolver,
{
    /// Create a format that ignores a token it cannot resolve.
    pub fn new(resolver: &'res RES) -> Self {
        Self::with_failed_resolve(resolver, FailedResolveStrategy::Ignore)
    }

    /// Create a format with a given behavior for a token it cannot resolve.
    pub fn with_failed_resolve(
        resolver: &'res RES,
        on_failed_resolve: FailedResolveStrategy,
    ) -> Self {
        Self {
            resolver,
            flavor: Eu5Flavor::new(),
            on_failed_resolve,
            rgb_index: find_rgb(resolver),
        }
    }

    #[inline]
    fn resolve_token<'de, V>(&self, token: u16, visitor: V) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        match self.resolver.resolve(token) {
            Some(id) => visitor.visit_str(id),
            None => self.unresolved(u32::from(token), visitor),
        }
    }

    #[inline]
    fn resolve_lookup<'de, V>(&self, index: u32, visitor: V) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        match self.resolver.lookup(index) {
            Some(value) => visitor.visit_str(value),
            None => self.unresolved(index, visitor),
        }
    }

    #[cold]
    fn unresolved<'de, V>(&self, id: u32, visitor: V) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        match self.on_failed_resolve {
            FailedResolveStrategy::Error => Err(Error::custom(format_args!(
                "unable to resolve binary id: 0x{id:x}"
            ))),
            FailedResolveStrategy::Stringify => visitor.visit_string(format!("0x{id:x}")),
            FailedResolveStrategy::Ignore => {
                visitor.visit_borrowed_str("__internal_identifier_ignore")
            }
        }
    }
}

/// Find the index of `rgb` in the string table of the save, so that a color
/// costs no string comparison while the body is read.
///
/// A table holds tens of thousands of entries against the tens of millions of
/// lookups in the body, so one scan is free.
fn find_rgb(resolver: &impl TokenResolver) -> u32 {
    let mut index = 0u32;
    while let Some(value) = resolver.lookup(index) {
        if value == "rgb" {
            return index;
        }
        index += 1;
    }

    NO_RGB
}

/// An identifier that the fast path read from the window.
enum FastIdentifier {
    /// An index into the string table of the save.
    Lookup(u32),
    /// A game token.
    Token(u16),
}

/// Read an identifier that fits in the window, without the general dispatch.
///
/// A key is a game token or a lookup and nothing else. Over 95% of the keys of
/// a 1.4 save are an 8 or 16 bit lookup, and nearly every key of an older
/// save is a game token, so both earn a path that takes the lexeme and its
/// payload from one window chunk.
#[inline]
fn read_fast_identifier(source: &mut ParserSource<'_>) -> Option<FastIdentifier> {
    let d = *source.window().first_chunk::<4>()?;
    let id = LexemeId::new(u16::from_le_bytes([d[0], d[1]]));
    match class(id) {
        Class::Token => {
            source.advance(2);
            Some(FastIdentifier::Token(id.0))
        }
        Class::Lookup2 => {
            source.advance(4);
            Some(FastIdentifier::Lookup(u32::from(u16::from_le_bytes([
                d[2], d[3],
            ]))))
        }
        Class::Lookup1 => {
            source.advance(3);
            Some(FastIdentifier::Lookup(u32::from(d[2])))
        }
        _ => None,
    }
}

impl<RES> Eu5BinaryFormat<'_, RES>
where
    RES: TokenResolver,
{
    /// Decode the value that `id` names, reading its payload from the source.
    ///
    /// `COLOR` asks for the SAV03 color: the lookup string `rgb` followed by
    /// a block of channels. Only an untyped value can be one, so the key and
    /// the string paths use `false` and pay nothing for it.
    #[inline]
    fn dispatch<'de, V, const COLOR: bool>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        id: LexemeId,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let class = class(id);
        match class {
            Class::Lookup1 | Class::Lookup2 | Class::Lookup3 | Class::Lookup4 => {
                let (format, source) = cx.parts();
                let index = read_lookup(source, class)?;
                if COLOR
                    && index == format.rgb_index
                    && source.peek_lexeme_id()? == Some(LexemeId::OPEN)
                {
                    return visitor.visit_rgb(source.read_rgb()?);
                }
                format.resolve_lookup(index, visitor)
            }
            Class::Fixed5 => {
                let (format, source) = cx.parts();
                let data = read_fixed5(source, id)?;
                visitor.visit_f64(format.flavor.visit_f64(data))
            }
            Class::U32 => visitor.visit_u32(u32::from_le_bytes(*cx.source().take::<4>()?)),
            Class::I32 => visitor.visit_i32(i32::from_le_bytes(*cx.source().take::<4>()?)),
            Class::Str => {
                let (format, source) = cx.parts();
                let data = source.read_bstr()?;
                match format.flavor.decode(data) {
                    Cow::Borrowed(x) => visitor.visit_str(x),
                    Cow::Owned(x) => visitor.visit_string(x),
                }
            }
            Class::EmptyStr => visitor.visit_borrowed_str(""),
            Class::Bool => visitor.visit_bool(cx.source().take::<1>()?[0] != 0),
            Class::U64 => visitor.visit_u64(u64::from_le_bytes(*cx.source().take::<8>()?)),
            Class::I64 => visitor.visit_i64(i64::from_le_bytes(*cx.source().take::<8>()?)),
            Class::F64 => {
                let (format, source) = cx.parts();
                let data = *source.take::<8>()?;
                visitor.visit_f64(format.flavor.visit_f64(data))
            }
            Class::F32 => {
                let (format, source) = cx.parts();
                let data = *source.take::<4>()?;
                visitor.visit_f32(format.flavor.visit_f32(data))
            }
            Class::Rgb => visitor.visit_rgb(cx.source().read_rgb()?),
            Class::Open => cx.visit_open_seq(visitor),
            Class::Close | Class::Equal => Err(unexpected_structural(cx.source())),
            Class::Token => cx.format().resolve_token(id.0, visitor),
        }
    }
}

impl<RES> BinaryFormat for Eu5BinaryFormat<'_, RES>
where
    RES: TokenResolver,
{
    #[inline]
    fn decode_scalar<'a>(&self, data: &'a [u8]) -> Cow<'a, str> {
        self.flavor.decode(data)
    }

    fn skip_value(cx: &mut BinaryFormatContext<'_, '_, Self>) -> Result<(), Error> {
        let rgb_index = cx.format().rgb_index;
        skip(cx.source(), rgb_index)
    }

    #[inline]
    fn deserialize_identifier<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let (format, source) = cx.parts();
        match read_fast_identifier(source) {
            Some(FastIdentifier::Lookup(index)) => return format.resolve_lookup(index, visitor),
            Some(FastIdentifier::Token(token)) => return format.resolve_token(token, visitor),
            None => {}
        }

        let id = cx.source().read_lexeme_id()?;
        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_str<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let (format, source) = cx.parts();
        let id = source.read_lexeme_id()?;
        if is_str_id(id) {
            let data = source.read_bstr()?;
            return match format.flavor.decode(data) {
                Cow::Borrowed(x) => visitor.visit_str(x),
                Cow::Owned(x) => visitor.visit_string(x),
            };
        }

        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_bytes<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let source = cx.source();
        let id = source.read_lexeme_id()?;
        if is_str_id(id) {
            return visitor.visit_bytes(source.read_bstr()?);
        }

        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_f64<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        // A fixed point lexeme is the common number of an EU5 save: a 1.4
        // gamestate holds 6.7 million of them against 16 doubles. An older
        // save is the other way around, so both get a path out of the window.
        let (format, source) = cx.parts();
        if let Some(d) = source.window().first_chunk::<10>().copied() {
            let id = LexemeId::new(u16::from_le_bytes([d[0], d[1]]));
            let payload = [d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9]];
            if id == LexemeId::F64 {
                let value = format.flavor.visit_f64(payload);
                source.advance(10);
                return visitor.visit_f64(value);
            }

            if is_fixed5_id(id) {
                let (width, negative) = fixed5(id);
                let value = format
                    .flavor
                    .visit_f64(fixed5_value(payload, width, negative));
                source.advance(2 + width);
                return visitor.visit_f64(value);
            }
        }

        let id = source.read_lexeme_id()?;
        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_u32<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let source = cx.source();
        if let Some(d) = source.window().first_chunk::<6>()
            && LexemeId::new(u16::from_le_bytes([d[0], d[1]])) == LexemeId::U32
        {
            let value = u32::from_le_bytes([d[2], d[3], d[4], d[5]]);
            source.advance(6);
            return visitor.visit_u32(value);
        }

        let id = source.read_lexeme_id()?;
        if is_lookup_id(id) {
            return visitor.visit_u32(read_lookup(source, class(id))?);
        }

        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_i32<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let source = cx.source();
        if let Some(d) = source.window().first_chunk::<6>()
            && LexemeId::new(u16::from_le_bytes([d[0], d[1]])) == LexemeId::I32
        {
            let value = i32::from_le_bytes([d[2], d[3], d[4], d[5]]);
            source.advance(6);
            return visitor.visit_i32(value);
        }

        let id = source.read_lexeme_id()?;
        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_u64<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let source = cx.source();
        if let Some(d) = source.window().first_chunk::<10>()
            && LexemeId::new(u16::from_le_bytes([d[0], d[1]])) == LexemeId::U64
        {
            let value = u64::from_le_bytes([d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9]]);
            source.advance(10);
            return visitor.visit_u64(value);
        }

        let id = source.read_lexeme_id()?;
        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_i64<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let source = cx.source();
        if let Some(d) = source.window().first_chunk::<10>()
            && LexemeId::new(u16::from_le_bytes([d[0], d[1]])) == LexemeId::I64
        {
            let value = i64::from_le_bytes([d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9]]);
            source.advance(10);
            return visitor.visit_i64(value);
        }

        let id = source.read_lexeme_id()?;
        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_bool<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let source = cx.source();
        if let Some(d) = source.window().first_chunk::<3>()
            && LexemeId::new(u16::from_le_bytes([d[0], d[1]])) == LexemeId::BOOL
        {
            let value = d[2] != 0;
            source.advance(3);
            return visitor.visit_bool(value);
        }

        let id = source.read_lexeme_id()?;
        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_f32<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        let id = cx.source().read_lexeme_id()?;
        Self::dispatch::<V, false>(cx, id, visitor)
    }

    #[inline]
    fn deserialize_any<'de, V>(
        cx: &mut BinaryFormatContext<'_, 'de, Self>,
        visitor: V,
    ) -> Result<V::Value, Error>
    where
        V: PdxVisitor<'de>,
    {
        // An untyped value is the only place a SAV03 color can arrive,
        // because a color asks for a sequence and the deserializer sends a
        // value that does not open a container here.
        let id = cx.source().read_lexeme_id()?;
        Self::dispatch::<V, true>(cx, id, visitor)
    }
}

/// Skip the next value, container and all.
///
/// A save holds large subtrees that no model reads, so this is one of the
/// hottest paths of a parse.
fn skip(source: &mut ParserSource<'_>, rgb_index: u32) -> Result<(), Error> {
    let id = source.read_lexeme_id()?;
    if id == LexemeId::OPEN {
        return skip_container(source);
    }

    // From SAV03 a color is the lookup string `rgb` followed by a separate
    // block of channels. The string and the block are one value, so a
    // skip that stops after the string leaves the block to be read as the next
    // key.
    if is_lookup_id(id) {
        let index = read_lookup(source, class(id))?;
        if index == rgb_index && source.peek_lexeme_id()? == Some(LexemeId::OPEN) {
            source.take::<2>()?;
            return skip_container(source);
        }
        return Ok(());
    }

    skip_payload(source, id)
}

/// Skip the rest of a container whose opening delimiter is already read.
fn skip_container(source: &mut ParserSource<'_>) -> Result<(), Error> {
    // The fast loop walks the current window with a local cursor, so that
    // skipping a lexeme is register arithmetic. Sending the source pointer
    // through memory for every lexeme dominated the instruction count of this
    // loop.
    let mut depth = 1u32;
    loop {
        // The borrow of the window ends with this statement, so the source can
        // be advanced below. The source never changes while `base` is read, so
        // the pointer stays valid.
        let base = source.window().as_ptr();
        let len = source.window_len();
        let mut i = 0usize;

        // A ten byte tail margin means a lexeme id and its largest fixed
        // payload are always in bounds, so the loop needs no bounds check.
        while i + 10 <= len {
            // SAFETY: `i + 10 <= len` from the loop condition.
            let id = LexemeId::new(u16::from_le_bytes(unsafe {
                [*base.add(i), *base.add(i + 1)]
            }));
            match class(id) {
                Class::Open => {
                    i += 2;
                    depth += 1;
                }
                Class::Close => {
                    i += 2;
                    depth -= 1;
                    if depth == 0 {
                        // SAFETY: `i <= len`.
                        unsafe { source.advance_unchecked(i) };
                        return Ok(());
                    }
                }
                Class::Str => {
                    // Layout: [id:2][len:2][bytes:len]. The length is in bounds
                    // through the margin, the bytes may not be, and then the
                    // careful path below takes over. Skipping a string here
                    // rather than leaving the loop is what keeps a string heavy
                    // subtree out of a refill for every string.
                    // SAFETY: `i + 4 <= len` from the margin.
                    let str_len =
                        u16::from_le_bytes(unsafe { [*base.add(i + 2), *base.add(i + 3)] })
                            as usize;
                    let total = 4 + str_len;
                    if i + total > len {
                        break;
                    }
                    i += total;
                }
                // Rare and variable width. The careful path handles it.
                Class::Rgb => break,
                _ => i += 2 + payload_size(id),
            }
        }

        // Commit what the fast loop consumed, then take one careful step over
        // the window boundary.
        // SAFETY: `i <= len`.
        unsafe { source.advance_unchecked(i) };
        source.refill()?;
        skip_step(source, &mut depth)?;
        if depth == 0 {
            return Ok(());
        }
    }
}

#[cold]
fn skip_step(source: &mut ParserSource<'_>, depth: &mut u32) -> Result<(), Error> {
    let id = source.read_lexeme_id()?;
    match id {
        LexemeId::OPEN => {
            *depth += 1;
            Ok(())
        }
        LexemeId::CLOSE => {
            *depth -= 1;
            Ok(())
        }
        _ => skip_payload(source, id),
    }
}

/// Skip the payload of one lexeme that does not open or close a container.
fn skip_payload(source: &mut ParserSource<'_>, id: LexemeId) -> Result<(), Error> {
    match id {
        LexemeId::QUOTED | LexemeId::UNQUOTED | LexemeId::STR_SAV03 => {
            source.read_bstr()?;
            Ok(())
        }
        LexemeId::RGB => source.read_rgb().map(|_| ()),
        // A const size take for each width keeps this off the variable length
        // path, because a save skips millions of scalars.
        _ => match payload_size(id) {
            0 => Ok(()),
            1 => source.take::<1>().map(|_| ()).map_err(Error::from),
            2 => source.take::<2>().map(|_| ()).map_err(Error::from),
            3 => source.take::<3>().map(|_| ()).map_err(Error::from),
            4 => source.take::<4>().map(|_| ()).map_err(Error::from),
            5 => source.take::<5>().map(|_| ()).map_err(Error::from),
            6 => source.take::<6>().map(|_| ()).map_err(Error::from),
            7 => source.take::<7>().map(|_| ()).map_err(Error::from),
            _ => source.take::<8>().map(|_| ()).map_err(Error::from),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::binary::{BinaryFormatDeserializer, Rgb};
    use serde::Deserialize;

    /// A resolver for the string table only, like the body of a SAV03 save,
    /// where nearly every key and string value is a lookup.
    struct LookupResolver(&'static [&'static str]);

    impl TokenResolver for LookupResolver {
        fn resolve(&self, _token: u16) -> Option<&str> {
            None
        }

        fn lookup(&self, index: u32) -> Option<&str> {
            self.0.get(index as usize).copied()
        }
    }

    fn id(lexeme: LexemeId) -> [u8; 2] {
        lexeme.0.to_le_bytes()
    }

    /// A 16 bit lookup, the form that holds most of a SAV03 save.
    fn lookup16(index: u16) -> Vec<u8> {
        let mut out = Vec::from(id(LexemeId::LOOKUP_U16_SAV03));
        out.extend_from_slice(&index.to_le_bytes());
        out
    }

    fn u32_value(value: u32) -> Vec<u8> {
        let mut out = Vec::from(id(LexemeId::U32));
        out.extend_from_slice(&value.to_le_bytes());
        out
    }

    fn from_binary<'de, T: Deserialize<'de>>(
        data: &'de [u8],
        resolver: &'de LookupResolver,
    ) -> Result<T, Error> {
        BinaryFormatDeserializer::from_slice(data, Eu5BinaryFormat::new(resolver)).deserialize()
    }

    /// Every lexeme is either a class that EU5 writes or a game token, and the
    /// payload table must agree with the class about which lexemes have a fixed
    /// width payload.
    #[test]
    fn class_and_payload_agree() {
        for raw in 0..=u16::MAX {
            let lexeme = LexemeId::new(raw);
            let size = payload_size(lexeme);
            match class(lexeme) {
                Class::Token | Class::Open | Class::Close | Class::Equal | Class::EmptyStr => {
                    assert_eq!(size, 0, "0x{raw:04x} must have no payload")
                }
                // A string and a color carry a length that the id does not hold.
                Class::Str | Class::Rgb => assert_eq!(size, 0, "0x{raw:04x} is variable width"),
                Class::Lookup1 => assert_eq!(size, 1),
                Class::Lookup2 => assert_eq!(size, 2),
                Class::Lookup3 => assert_eq!(size, 3),
                Class::Lookup4 => assert_eq!(size, 4),
                Class::Bool => assert_eq!(size, 1),
                Class::U32 | Class::I32 | Class::F32 => assert_eq!(size, 4),
                Class::U64 | Class::I64 | Class::F64 => assert_eq!(size, 8),
                Class::Fixed5 => {
                    let (width, _) = fixed5(lexeme);
                    assert_eq!(size, width, "0x{raw:04x} fixed point width");
                    assert!(width <= 7);
                }
            }
        }
    }

    /// The mask that the hot paths use must say the same as the class table.
    #[test]
    fn lookup_mask_matches_the_class_table() {
        for raw in 0..=u16::MAX {
            let lexeme = LexemeId::new(raw);
            let by_class = matches!(
                class(lexeme),
                Class::Lookup1 | Class::Lookup2 | Class::Lookup3 | Class::Lookup4
            );
            assert_eq!(is_lookup_id(lexeme), by_class, "0x{raw:04x}");
            assert_eq!(
                is_str_id(lexeme),
                class(lexeme) == Class::Str,
                "0x{raw:04x}"
            );
            assert_eq!(
                is_fixed5_id(lexeme),
                class(lexeme) == Class::Fixed5,
                "0x{raw:04x}"
            );
        }
    }

    /// The fixed point lexemes hold a value with five decimal places, and the
    /// width and the sign come from the id.
    #[test]
    fn fixed_point_widths() {
        assert_eq!(fixed5(LexemeId::FIXED5_ZERO), (0, false));
        assert_eq!(fixed5(LexemeId::FIXED5_U8), (1, false));
        assert_eq!(fixed5(LexemeId::FIXED5_U56), (7, false));
        assert_eq!(fixed5(LexemeId::FIXED5_I8), (1, true));
        assert_eq!(fixed5(LexemeId::FIXED5_I56), (7, true));
    }

    #[test]
    fn deserialize_fixed_point() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            zero: f64,
            small: f64,
            large: f64,
            negative: f64,
        }

        let resolver = LookupResolver(&["zero", "small", "large", "negative"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&id(LexemeId::FIXED5_ZERO));
        data.extend_from_slice(&lookup16(1));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&id(LexemeId::FIXED5_U8));
        data.push(100);
        data.extend_from_slice(&lookup16(2));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&id(LexemeId::FIXED5_U24));
        data.extend_from_slice(&[0x40, 0x42, 0x0f]);
        data.extend_from_slice(&lookup16(3));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&id(LexemeId::FIXED5_I16));
        data.extend_from_slice(&1000u16.to_le_bytes());

        let actual: Data = from_binary(&data, &resolver).unwrap();
        assert_eq!(
            actual,
            Data {
                zero: 0.0,
                small: 0.001,
                large: 10.0,
                negative: -0.01,
            }
        );
    }

    /// From SAV03 a color is the lookup string `rgb` and a block of channels,
    /// where an older save writes the `RGB` lexeme.
    #[test]
    fn color_from_a_lookup_header() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            color: (u32, u32, u32),
        }

        let resolver = LookupResolver(&["color", "rgb"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&lookup16(1));
        data.extend_from_slice(&id(LexemeId::OPEN));
        data.extend_from_slice(&u32_value(187));
        data.extend_from_slice(&u32_value(180));
        data.extend_from_slice(&u32_value(0));
        data.extend_from_slice(&id(LexemeId::CLOSE));

        let actual: Data = from_binary(&data, &resolver).unwrap();
        assert_eq!(
            actual,
            Data {
                color: (187, 180, 0)
            }
        );
    }

    /// A color block belongs to the value that the `rgb` string starts, so a
    /// skip over an unread color must take the block with it. Without this the
    /// block becomes the next key.
    #[test]
    fn skip_over_a_color_header() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            after: u32,
        }

        let resolver = LookupResolver(&["color2", "rgb", "after"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&lookup16(1));
        data.extend_from_slice(&id(LexemeId::OPEN));
        data.extend_from_slice(&u32_value(234));
        data.extend_from_slice(&u32_value(234));
        data.extend_from_slice(&u32_value(234));
        data.extend_from_slice(&id(LexemeId::CLOSE));
        data.extend_from_slice(&lookup16(2));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&u32_value(7));

        let actual: Data = from_binary(&data, &resolver).unwrap();
        assert_eq!(actual, Data { after: 7 });
    }

    /// The string `rgb` on its own is still a string. Only a block after it
    /// makes it a color.
    #[test]
    fn a_plain_rgb_string_is_not_a_color() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            name: String,
        }

        let resolver = LookupResolver(&["name", "rgb"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&lookup16(1));

        let actual: Data = from_binary(&data, &resolver).unwrap();
        assert_eq!(
            actual,
            Data {
                name: String::from("rgb")
            }
        );
    }

    /// An older save writes a color as the `RGB` lexeme, and the format must
    /// still read it.
    #[test]
    fn color_from_the_rgb_lexeme() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            color: (u32, u32, u32),
        }

        let resolver = LookupResolver(&["color"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&id(LexemeId::RGB));
        data.extend_from_slice(&id(LexemeId::OPEN));
        data.extend_from_slice(&u32_value(1));
        data.extend_from_slice(&u32_value(2));
        data.extend_from_slice(&u32_value(3));
        data.extend_from_slice(&id(LexemeId::CLOSE));

        let actual: Data = from_binary(&data, &resolver).unwrap();
        assert_eq!(actual, Data { color: (1, 2, 3) });
    }

    /// A save with no `rgb` entry must not take any index for a color.
    #[test]
    fn a_save_without_a_color_header() {
        let resolver = LookupResolver(&["alpha", "beta"]);
        assert_eq!(find_rgb(&resolver), NO_RGB);

        let resolver = LookupResolver(&["alpha", "rgb", "beta"]);
        assert_eq!(find_rgb(&resolver), 1);
    }

    /// A skip must step over every lexeme that EU5 writes, whatever its width.
    #[test]
    fn skip_every_width() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            after: u32,
        }

        let resolver = LookupResolver(&["ignored", "after", "text"]);
        let widths: Vec<Vec<u8>> = vec![
            {
                let mut x = Vec::from(id(LexemeId::BOOL));
                x.push(1);
                x
            },
            u32_value(5),
            {
                let mut x = Vec::from(id(LexemeId::I64));
                x.extend_from_slice(&(-5i64).to_le_bytes());
                x
            },
            {
                let mut x = Vec::from(id(LexemeId::QUOTED));
                x.extend_from_slice(&4u16.to_le_bytes());
                x.extend_from_slice(b"text");
                x
            },
            {
                let mut x = Vec::from(id(LexemeId::FIXED5_U40));
                x.extend_from_slice(&[1, 2, 3, 4, 5]);
                x
            },
            {
                let mut x = Vec::from(id(LexemeId::RGB));
                x.extend_from_slice(&id(LexemeId::OPEN));
                x.extend_from_slice(&u32_value(1));
                x.extend_from_slice(&u32_value(2));
                x.extend_from_slice(&u32_value(3));
                x.extend_from_slice(&id(LexemeId::CLOSE));
                x
            },
            lookup16(2),
        ];

        for width in widths {
            let mut data = Vec::new();
            data.extend_from_slice(&lookup16(0));
            data.extend_from_slice(&id(LexemeId::EQUAL));
            data.extend_from_slice(&width);
            data.extend_from_slice(&lookup16(1));
            data.extend_from_slice(&id(LexemeId::EQUAL));
            data.extend_from_slice(&u32_value(9));

            let actual: Data = from_binary(&data, &resolver).unwrap();
            assert_eq!(actual, Data { after: 9 }, "skipping {width:02x?}");
        }
    }

    /// A skip must also step over a whole subtree.
    #[test]
    fn skip_a_container() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            after: u32,
        }

        let resolver = LookupResolver(&["ignored", "after", "inner"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&id(LexemeId::OPEN));
        data.extend_from_slice(&lookup16(2));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&id(LexemeId::OPEN));
        data.extend_from_slice(&u32_value(1));
        data.extend_from_slice(&id(LexemeId::CLOSE));
        data.extend_from_slice(&id(LexemeId::CLOSE));
        data.extend_from_slice(&lookup16(1));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&u32_value(3));

        let actual: Data = from_binary(&data, &resolver).unwrap();
        assert_eq!(actual, Data { after: 3 });
    }

    /// An unresolved lookup must be an error when the caller asks for one.
    #[test]
    fn unresolved_lookup() {
        #[derive(Deserialize, PartialEq, Debug)]
        struct Data {
            name: String,
        }

        let resolver = LookupResolver(&["name"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::EQUAL));
        data.extend_from_slice(&lookup16(9));

        let format = Eu5BinaryFormat::with_failed_resolve(&resolver, FailedResolveStrategy::Error);
        let result: Result<Data, Error> =
            BinaryFormatDeserializer::from_slice(&data, format).deserialize();
        result.unwrap_err();

        let format =
            Eu5BinaryFormat::with_failed_resolve(&resolver, FailedResolveStrategy::Stringify);
        let actual: Data = BinaryFormatDeserializer::from_slice(&data, format)
            .deserialize()
            .unwrap();
        assert_eq!(
            actual,
            Data {
                name: String::from("0x9")
            }
        );
    }

    /// The fixed point reader and the window fast path must agree.
    #[test]
    fn fixed_point_value_matches_the_slow_path() {
        for raw in LexemeId::FIXED5_ZERO.0..=LexemeId::FIXED5_I56.0 {
            let lexeme = LexemeId::new(raw);
            let (width, negative) = fixed5(lexeme);
            let payload = [1u8, 2, 3, 4, 5, 6, 7, 8];
            let fast = fixed5_value(payload, width, negative);

            let mut stream = Vec::from(id(lexeme));
            stream.extend_from_slice(&payload[..width]);
            let mut source = ParserSource::from_slice(&stream);
            let read = source.read_lexeme_id().unwrap();
            let slow = read_fixed5(&mut source, read).unwrap();
            assert_eq!(fast, slow, "0x{raw:04x}");
        }
    }

    /// A color block can carry a fourth alpha channel, as `color3` and
    /// `unit_color2` do.
    #[test]
    fn rgb_with_an_alpha_channel() {
        let mut data = Vec::new();
        data.extend_from_slice(&lookup16(0));
        data.extend_from_slice(&id(LexemeId::OPEN));
        data.extend_from_slice(&u32_value(1));
        data.extend_from_slice(&u32_value(2));
        data.extend_from_slice(&u32_value(3));
        data.extend_from_slice(&u32_value(4));
        data.extend_from_slice(&id(LexemeId::CLOSE));

        let mut source = ParserSource::from_slice(&data[4..]);
        assert_eq!(
            source.read_rgb().unwrap(),
            Rgb {
                r: 1,
                g: 2,
                b: 3,
                a: Some(4)
            }
        );
    }
}
