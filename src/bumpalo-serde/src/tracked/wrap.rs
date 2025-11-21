use super::{Chain, Track};

// Wrapper that attaches context to a `Visitor`, `SeqAccess` or `EnumAccess`.
pub struct Wrap<'a, 'b, 'buf, X> {
    pub(crate) delegate: X,
    pub(crate) chain: &'a Chain<'a>,
    pub(crate) track: &'b Track<'buf>,
}

// Wrapper that attaches context to a `VariantAccess`.
pub struct WrapVariant<'a, 'b, 'buf, X> {
    pub(crate) delegate: X,
    pub(crate) chain: Chain<'a>,
    pub(crate) track: &'b Track<'buf>,
}

impl<'a, 'b, 'buf, X> Wrap<'a, 'b, 'buf, X> {
    pub(crate) fn new(delegate: X, chain: &'a Chain<'a>, track: &'b Track<'buf>) -> Self {
        Wrap {
            delegate,
            chain,
            track,
        }
    }
}

impl<'a, 'b, 'buf, X> WrapVariant<'a, 'b, 'buf, X> {
    pub(crate) fn new(delegate: X, chain: Chain<'a>, track: &'b Track<'buf>) -> Self {
        WrapVariant {
            delegate,
            chain,
            track,
        }
    }
}
