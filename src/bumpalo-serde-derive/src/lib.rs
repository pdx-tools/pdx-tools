use proc_macro::{Span, TokenStream};
use quote::{format_ident, quote};
use syn::{Data, DeriveInput, Fields, LifetimeParam, Lit, Meta, Type, parse_macro_input};

#[proc_macro_derive(ArenaDeserialize, attributes(arena))]
pub fn derive_arena_deserialize(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);

    match expand_arena_deserialize(&input) {
        Ok(tokens) => tokens,
        Err(err) => err.to_compile_error().into(),
    }
}

fn expand_arena_deserialize(input: &DeriveInput) -> syn::Result<TokenStream> {
    let name = &input.ident;
    let data = &input.data;

    // Determine the arena lifetime to use
    let arena_lifetime = determine_arena_lifetime(&input.generics);

    match data {
        Data::Struct(data_struct) => match &data_struct.fields {
            Fields::Named(fields) => expand_struct_with_named_fields(
                name,
                &input.generics,
                &fields.named,
                &arena_lifetime,
            ),
            Fields::Unnamed(fields) => expand_struct_with_unnamed_fields(
                name,
                &input.generics,
                &fields.unnamed,
                &arena_lifetime,
            ),
            Fields::Unit => expand_unit_struct(name, &input.generics, &arena_lifetime),
        },
        Data::Enum(data_enum) => expand_enum(input, name, data_enum, &arena_lifetime),
        Data::Union(_) => Err(syn::Error::new_spanned(
            input,
            "ArenaDeserialize does not support unions",
        )),
    }
}

fn expand_struct_with_named_fields(
    name: &syn::Ident,
    generics: &syn::Generics,
    fields: &syn::punctuated::Punctuated<syn::Field, syn::Token![,]>,
    arena_lifetime: &str,
) -> syn::Result<TokenStream> {
    let field_info: Vec<FieldInfo> = fields
        .iter()
        .map(parse_field_attributes)
        .collect::<syn::Result<Vec<_>>>()?;

    let visitor_name = format_ident!("{}Visitor", name);

    // Generate field enum variants
    let field_enums: Vec<_> = field_info
        .iter()
        .enumerate()
        .map(|(i, _info)| {
            let variant_name = format_ident!("Field{}", i);
            quote! { #variant_name }
        })
        .collect();

    // Generate field name array for deserialization
    let field_names: Vec<_> = field_info.iter().map(|info| &info.name).collect();

    // Generate field enum match patterns
    let field_enum_match: Vec<_> = field_info
        .iter()
        .enumerate()
        .flat_map(|(i, info)| {
            let variant_name = format_ident!("Field{}", i);
            let field_name = &info.name;
            let mut matches = vec![quote! { #field_name => Ok(__Field::#variant_name) }];

            // Add aliases
            for alias in &info.aliases {
                matches.push(quote! { #alias => Ok(__Field::#variant_name) });
            }

            matches
        })
        .collect();

    // Generate field initialization for the visitor
    let field_initializations: Vec<_> = field_info
        .iter()
        .map(|info| {
            let field_name = &info.ident;
            if info.duplicated {
                quote! {
                    let mut #field_name = bumpalo::collections::Vec::new_in(__allocator);
                }
            } else {
                quote! {
                    let mut #field_name = None;
                }
            }
        })
        .collect();

    // Generate field handling using enum variants
    let field_handling: Vec<_> = field_info
        .iter()
        .enumerate()
        .map(|(i, info)| -> syn::Result<_> {
            let field_name = &info.ident;
            let field_type = &info.ty;
            let field_str = &info.name;
            let variant_name = format_ident!("Field{}", i);

            if info.duplicated {
                if info.deserialize_with.is_some() {
                    return Err(syn::Error::new_spanned(
                        &info.ident,
                        "duplicated attribute cannot be combined with deserialize_with",
                    ));
                }
                if !is_slice_reference(field_type, arena_lifetime) {
                    return Err(syn::Error::new_spanned(
                        field_type,
                        "duplicated attribute requires a slice reference field like &'arena [T]",
                    ));
                }
                let element_type = get_slice_element_type(field_type).ok_or_else(|| {
                    syn::Error::new_spanned(
                        field_type,
                        "duplicated attribute requires a slice element type",
                    )
                })?;

                Ok(quote! {
                    __Field::#variant_name => {
                        #field_name.push(
                            __map.next_value_seed(
                                bumpalo_serde::ArenaSeed::<#element_type>::new(__allocator)
                            )?
                        );
                    }
                })
            } else {
                let deserialize_logic = if let Some(deserialize_with) = &info.deserialize_with {
                    quote! {
                        #field_name = Some({
                            struct CustomFieldSeed<'bump> {
                                allocator: &'bump bumpalo::Bump,
                            }

                            impl<'de, 'bump> serde::de::DeserializeSeed<'de> for CustomFieldSeed<'bump> {
                                type Value = #field_type;

                                fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
                                where
                                    D: serde::Deserializer<'de>,
                                {
                                    #deserialize_with(deserializer, self.allocator)
                                }
                            }

                            __map.next_value_seed(CustomFieldSeed { allocator: __allocator })?
                        });
                    }
                } else if is_slice_reference(field_type, arena_lifetime) {
                    if let Some(element_type) = get_slice_element_type(field_type) {
                        quote! {
                            #field_name = Some(__map.next_value_seed(
                                bumpalo_serde::SliceDeserializer::<#element_type>::new(__allocator)
                            )?);
                        }
                    } else {
                        quote! {
                            #field_name = Some(__map.next_value_seed(bumpalo_serde::ArenaSeed::new(__allocator))?);
                        }
                    }
                } else {
                    // The field type decides how it deserializes through its
                    // `ArenaDeserialize` impl. Types with no arena data
                    // implement it as a pass-through to `Deserialize`.
                    quote! {
                        #field_name = Some(__map.next_value_seed(bumpalo_serde::ArenaSeed::new(__allocator))?);
                    }
                };

                Ok(quote! {
                    __Field::#variant_name => {
                        if #field_name.is_some() {
                            return Err(serde::de::Error::duplicate_field(#field_str));
                        }
                        #deserialize_logic
                    }
                })
            }
        })
        .collect::<syn::Result<Vec<_>>>()?;

    // Generate field extraction with defaults
    let field_extractions: Vec<_> = field_info
        .iter()
        .map(|info| {
            let field_name = &info.ident;
            if info.duplicated {
                quote! {
                    let #field_name = #field_name.into_bump_slice();
                }
            } else if info.has_default {
                quote! {
                    let #field_name = #field_name.unwrap_or_default();
                }
            } else if is_option_type(&info.ty) {
                // For Option types without default, None is a valid value
                quote! {
                    let #field_name = #field_name.unwrap_or(None);
                }
            } else {
                quote! {
                    let #field_name = #field_name.ok_or_else(|| serde::de::Error::missing_field(stringify!(#field_name)))?;
                }
            }
        })
        .collect();

    // Generate struct construction
    let field_assignments: Vec<_> = field_info
        .iter()
        .map(|info| {
            let field_name = &info.ident;
            quote! { #field_name }
        })
        .collect();

    // Handle generics and lifetime
    let (_impl_generics, ty_generics, _where_clause) = generics.split_for_impl();
    let arena_lifetime_syn =
        syn::Lifetime::new(&format!("'{}", arena_lifetime), Span::call_site().into());

    // Create new generics with arena lifetime
    let mut new_generics = generics.clone();
    // Only add arena lifetime if it doesn't already exist
    if !generics
        .lifetimes()
        .any(|lt| lt.lifetime.ident == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let deser_request = quote! {
        __deserializer.deserialize_identifier(__FieldVisitor)
    };

    let output = quote! {
        impl #new_impl_generics bumpalo_serde::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
            fn deserialize_in_arena<'de, D>(deserializer: D, allocator: &#arena_lifetime_syn bumpalo::Bump) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                #[allow(non_camel_case_types)]
                enum __Field {
                    #(#field_enums),* ,
                    __ignore,
                }

                struct __FieldVisitor;
                impl<'de> ::serde::de::Visitor<'de> for __FieldVisitor {
                    type Value = __Field;
                    fn expecting(
                        &self,
                        __formatter: &mut ::std::fmt::Formatter,
                    ) -> ::std::fmt::Result {
                        write!(__formatter, "field identifier")
                    }
                    fn visit_str<__E>(
                        self,
                        __value: &str,
                    ) -> ::std::result::Result<Self::Value, __E>
                    where
                        __E: ::serde::de::Error,
                    {
                        match __value {
                            #(#field_enum_match),* ,
                            _ => Ok(__Field::__ignore),
                        }
                    }

                }

                impl<'de> serde::Deserialize<'de> for __Field {
                    #[inline]
                    fn deserialize<__D>(
                        __deserializer: __D,
                    ) -> std::result::Result<Self, __D::Error>
                    where
                        __D: ::serde::Deserializer<'de>,
                    {
                        #deser_request
                    }
                }

                struct #visitor_name<#arena_lifetime_syn> {
                    allocator: &#arena_lifetime_syn bumpalo::Bump,
                }

                impl<'de, #arena_lifetime_syn> serde::de::Visitor<'de> for #visitor_name<#arena_lifetime_syn> {
                    type Value = #name #ty_generics;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                        formatter.write_str(concat!("struct ", stringify!(#name)))
                    }

                    fn visit_map<V>(self, mut __map: V) -> Result<#name #ty_generics, V::Error>
                    where
                        V: serde::de::MapAccess<'de>,
                    {
                        let __allocator = self.allocator;
                        #(
                            #field_initializations
                        )*

                        while let Some(__key) = __map.next_key::<__Field>()? {
                            match __key {
                                #(#field_handling)*
                                __Field::__ignore => {
                                    // Skip unknown fields
                                    __map.next_value::<serde::de::IgnoredAny>()?;
                                }
                            }
                        }

                        #(#field_extractions)*

                        Ok(#name {
                            #(#field_assignments,)*
                        })
                    }
                }

                const FIELDS: &'static [&'static str] = &[#(stringify!(#field_names)),*];
                deserializer.deserialize_struct(
                    stringify!(#name),
                    FIELDS,
                    #visitor_name { allocator }
                )
            }
        }
    };

    Ok(output.into())
}

fn expand_struct_with_unnamed_fields(
    name: &syn::Ident,
    generics: &syn::Generics,
    fields: &syn::punctuated::Punctuated<syn::Field, syn::Token![,]>,
    arena_lifetime: &str,
) -> syn::Result<TokenStream> {
    if fields.len() != 1 {
        return Err(syn::Error::new_spanned(
            fields,
            "Tuple structs with multiple fields are not supported",
        ));
    }

    let field = fields.first().unwrap();
    let field_type = &field.ty;
    let (_impl_generics, ty_generics, _where_clause) = generics.split_for_impl();
    let arena_lifetime_syn =
        syn::Lifetime::new(&format!("'{}", arena_lifetime), Span::call_site().into());

    let mut new_generics = generics.clone();
    // Only add arena lifetime if it doesn't already exist
    if !generics
        .lifetimes()
        .any(|lt| lt.lifetime.ident == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let deserialize_impl = quote! {
        let inner = <bumpalo_serde::ArenaSeed::<#field_type> as serde::de::DeserializeSeed>::deserialize(bumpalo_serde::ArenaSeed::<#field_type>::new(allocator), deserializer)?;
        Ok(#name(inner))
    };

    let output = quote! {
            impl #new_impl_generics bumpalo_serde::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
            fn deserialize_in_arena<'de, D>(deserializer: D, allocator: &#arena_lifetime_syn bumpalo::Bump) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                #deserialize_impl
            }
        }
    };
    Ok(output.into())
}

fn expand_unit_struct(
    name: &syn::Ident,
    generics: &syn::Generics,
    arena_lifetime: &str,
) -> syn::Result<TokenStream> {
    let (_impl_generics, ty_generics, _where_clause) = generics.split_for_impl();
    let arena_lifetime_syn =
        syn::Lifetime::new(&format!("'{}", arena_lifetime), Span::call_site().into());

    let mut new_generics = generics.clone();
    // Only add arena lifetime if it doesn't already exist
    if !generics
        .lifetimes()
        .any(|lt| lt.lifetime.ident == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let output = quote! {
        impl #new_impl_generics bumpalo_serde::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
            fn deserialize_in_arena<'de, D>(deserializer: D, _allocator: &#arena_lifetime_syn bumpalo::Bump) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                serde::Deserialize::deserialize(deserializer).map(|_: ()| #name)
            }
        }
    };

    Ok(output.into())
}

/// Expand an enum with only unit variants.
///
/// The generated impl reads a variant identifier and maps it to a variant.
/// Supported attributes:
///
/// - `#[arena(rename_all = "...")]` on the enum
/// - `#[arena(rename = "...")]` on a variant
/// - `#[arena(other)]` on one variant, which receives unknown identifiers
///
/// Enums with data-carrying variants are not supported. Write the
/// `ArenaDeserialize` impl by hand for those.
fn expand_enum(
    input: &DeriveInput,
    name: &syn::Ident,
    data_enum: &syn::DataEnum,
    arena_lifetime: &str,
) -> syn::Result<TokenStream> {
    let rename_all = parse_enum_attributes(input)?;

    let mut variants = Vec::new();
    let mut other_variant: Option<syn::Ident> = None;
    for variant in &data_enum.variants {
        if !matches!(variant.fields, Fields::Unit) {
            return Err(syn::Error::new_spanned(
                variant,
                "ArenaDeserialize supports only unit variants in enums. \
                 Implement ArenaDeserialize by hand for enums that carry data.",
            ));
        }

        let attrs = parse_variant_attributes(variant)?;
        if attrs.other {
            if other_variant.is_some() {
                return Err(syn::Error::new_spanned(
                    variant,
                    "Only one variant can have the `other` attribute",
                ));
            }
            other_variant = Some(variant.ident.clone());
        }

        let serialized = attrs.rename.unwrap_or_else(|| {
            let ident = variant.ident.to_string();
            match rename_all {
                Some(rule) => rule.apply(&ident),
                None => ident,
            }
        });
        variants.push((variant.ident.clone(), serialized));
    }

    let generics = &input.generics;
    let (_impl_generics, ty_generics, _where_clause) = generics.split_for_impl();
    let arena_lifetime_syn =
        syn::Lifetime::new(&format!("'{}", arena_lifetime), Span::call_site().into());

    let mut new_generics = generics.clone();
    // Only add arena lifetime if it doesn't already exist
    if !generics
        .lifetimes()
        .any(|lt| lt.lifetime.ident == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let name_str = name.to_string();
    let variant_idents: Vec<_> = variants.iter().map(|(ident, _)| ident).collect();
    let variant_names: Vec<_> = variants.iter().map(|(_, s)| s.as_str()).collect();
    let variant_bytes: Vec<_> = variants
        .iter()
        .map(|(_, s)| syn::LitByteStr::new(s.as_bytes(), Span::call_site().into()))
        .collect();
    let tags: Vec<_> = (0..variants.len())
        .map(|i| format_ident!("Variant{}", i))
        .collect();

    let unknown_arm = match &other_variant {
        Some(_) => quote! { _ => Ok(__Variant::__Other) },
        None => quote! {
            _ => Err(serde::de::Error::unknown_variant(__value, VARIANTS))
        },
    };
    let unknown_bytes_arm = match &other_variant {
        Some(_) => quote! { _ => Ok(__Variant::__Other) },
        None => quote! {
            _ => {
                let __value = String::from_utf8_lossy(__value);
                Err(serde::de::Error::unknown_variant(&__value, VARIANTS))
            }
        },
    };
    let other_match_arm = other_variant
        .as_ref()
        .map(|ident| quote! { __Variant::__Other => #name::#ident, });

    let output = quote! {
        impl #new_impl_generics bumpalo_serde::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
            fn deserialize_in_arena<'de, D>(deserializer: D, _allocator: &#arena_lifetime_syn bumpalo::Bump) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                const VARIANTS: &[&str] = &[#(#variant_names),*];

                enum __Variant {
                    #(#tags,)*
                    __Other,
                }

                struct __VariantVisitor;

                impl<'de> serde::de::Visitor<'de> for __VariantVisitor {
                    type Value = __Variant;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                        formatter.write_str("variant identifier")
                    }

                    fn visit_str<E>(self, __value: &str) -> Result<Self::Value, E>
                    where
                        E: serde::de::Error,
                    {
                        match __value {
                            #(#variant_names => Ok(__Variant::#tags),)*
                            #unknown_arm
                        }
                    }

                    fn visit_bytes<E>(self, __value: &[u8]) -> Result<Self::Value, E>
                    where
                        E: serde::de::Error,
                    {
                        match __value {
                            #(#variant_bytes => Ok(__Variant::#tags),)*
                            #unknown_bytes_arm
                        }
                    }
                }

                impl<'de> serde::Deserialize<'de> for __Variant {
                    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
                    where
                        D: serde::Deserializer<'de>,
                    {
                        deserializer.deserialize_identifier(__VariantVisitor)
                    }
                }

                struct __Visitor;

                impl<'de> serde::de::Visitor<'de> for __Visitor {
                    type Value = #name;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                        formatter.write_str(concat!("enum ", #name_str))
                    }

                    fn visit_enum<A>(self, data: A) -> Result<Self::Value, A::Error>
                    where
                        A: serde::de::EnumAccess<'de>,
                    {
                        let (variant, access) = serde::de::EnumAccess::variant::<__Variant>(data)?;
                        serde::de::VariantAccess::unit_variant(access)?;
                        Ok(match variant {
                            #(__Variant::#tags => #name::#variant_idents,)*
                            #other_match_arm
                            // Unreachable when no variant is marked `other`:
                            // the identifier visitor returns an error instead.
                            #[allow(unreachable_patterns)]
                            __Variant::__Other => unreachable!(),
                        })
                    }
                }

                deserializer.deserialize_enum(#name_str, VARIANTS, __Visitor)
            }
        }
    };

    Ok(output.into())
}

#[derive(Clone, Copy)]
enum RenameRule {
    Lowercase,
    Uppercase,
    PascalCase,
    CamelCase,
    SnakeCase,
    ScreamingSnakeCase,
    KebabCase,
    ScreamingKebabCase,
}

impl RenameRule {
    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "lowercase" => Self::Lowercase,
            "UPPERCASE" => Self::Uppercase,
            "PascalCase" => Self::PascalCase,
            "camelCase" => Self::CamelCase,
            "snake_case" => Self::SnakeCase,
            "SCREAMING_SNAKE_CASE" => Self::ScreamingSnakeCase,
            "kebab-case" => Self::KebabCase,
            "SCREAMING-KEBAB-CASE" => Self::ScreamingKebabCase,
            _ => return None,
        })
    }

    /// Apply the rule to a variant name written in PascalCase.
    fn apply(self, variant: &str) -> String {
        match self {
            Self::Lowercase => variant.to_ascii_lowercase(),
            Self::Uppercase => variant.to_ascii_uppercase(),
            Self::PascalCase => variant.to_owned(),
            Self::CamelCase => {
                let mut chars = variant.chars();
                match chars.next() {
                    Some(first) => first.to_ascii_lowercase().to_string() + chars.as_str(),
                    None => String::new(),
                }
            }
            Self::SnakeCase => join_words(variant, '_', false),
            Self::ScreamingSnakeCase => join_words(variant, '_', true),
            Self::KebabCase => join_words(variant, '-', false),
            Self::ScreamingKebabCase => join_words(variant, '-', true),
        }
    }
}

/// Split a PascalCase name at each uppercase letter and join the words.
fn join_words(variant: &str, separator: char, upper: bool) -> String {
    let mut out = String::with_capacity(variant.len() + 4);
    for (i, ch) in variant.char_indices() {
        if ch.is_ascii_uppercase() && i > 0 {
            out.push(separator);
        }
        out.push(if upper {
            ch.to_ascii_uppercase()
        } else {
            ch.to_ascii_lowercase()
        });
    }
    out
}

fn parse_enum_attributes(input: &DeriveInput) -> syn::Result<Option<RenameRule>> {
    let mut rename_all = None;
    for attr in &input.attrs {
        if !attr.path().is_ident("arena") {
            continue;
        }
        let Meta::List(meta_list) = &attr.meta else {
            return Err(syn::Error::new_spanned(
                attr,
                "Invalid arena attribute format",
            ));
        };
        let nested = meta_list.parse_args_with(
            syn::punctuated::Punctuated::<Meta, syn::Token![,]>::parse_terminated,
        )?;
        for meta in nested {
            match &meta {
                Meta::NameValue(nv) if nv.path.is_ident("rename_all") => {
                    let syn::Expr::Lit(syn::ExprLit {
                        lit: Lit::Str(s), ..
                    }) = &nv.value
                    else {
                        return Err(syn::Error::new_spanned(
                            &nv.value,
                            "rename_all expects a string literal",
                        ));
                    };
                    rename_all =
                        Some(RenameRule::parse(&s.value()).ok_or_else(|| {
                            syn::Error::new_spanned(s, "Unknown rename_all rule")
                        })?);
                }
                _ => {
                    return Err(syn::Error::new_spanned(meta, "Unknown arena attribute"));
                }
            }
        }
    }
    Ok(rename_all)
}

struct VariantAttributes {
    rename: Option<String>,
    other: bool,
}

fn parse_variant_attributes(variant: &syn::Variant) -> syn::Result<VariantAttributes> {
    let mut rename = None;
    let mut other = false;
    for attr in &variant.attrs {
        if !attr.path().is_ident("arena") {
            continue;
        }
        let Meta::List(meta_list) = &attr.meta else {
            return Err(syn::Error::new_spanned(
                attr,
                "Invalid arena attribute format",
            ));
        };
        let nested = meta_list.parse_args_with(
            syn::punctuated::Punctuated::<Meta, syn::Token![,]>::parse_terminated,
        )?;
        for meta in nested {
            match &meta {
                Meta::NameValue(nv) if nv.path.is_ident("rename") => {
                    let syn::Expr::Lit(syn::ExprLit {
                        lit: Lit::Str(s), ..
                    }) = &nv.value
                    else {
                        return Err(syn::Error::new_spanned(
                            &nv.value,
                            "rename expects a string literal",
                        ));
                    };
                    rename = Some(s.value());
                }
                Meta::Path(path) if path.is_ident("other") => {
                    other = true;
                }
                _ => {
                    return Err(syn::Error::new_spanned(meta, "Unknown arena attribute"));
                }
            }
        }
    }
    Ok(VariantAttributes { rename, other })
}

struct FieldInfo {
    ident: syn::Ident,
    name: String,
    ty: syn::Type,
    aliases: Vec<String>,
    has_default: bool,
    deserialize_with: Option<syn::Path>,
    duplicated: bool,
}

fn parse_field_attributes(field: &syn::Field) -> syn::Result<FieldInfo> {
    let ident = field.ident.as_ref().unwrap().clone();
    let name = ident.to_string();
    let ty = field.ty.clone();
    let mut aliases = Vec::new();
    let mut has_default = false;
    let mut deserialize_with = None;
    let mut duplicated = false;

    for attr in &field.attrs {
        if attr.path().is_ident("arena") {
            match &attr.meta {
                Meta::List(meta_list) => {
                    let nested = meta_list.parse_args_with(
                        syn::punctuated::Punctuated::<Meta, syn::Token![,]>::parse_terminated,
                    )?;

                    for meta in nested {
                        match meta {
                            Meta::NameValue(nv) if nv.path.is_ident("alias") => {
                                if let syn::Expr::Lit(syn::ExprLit {
                                    lit: Lit::Str(s), ..
                                }) = &nv.value
                                {
                                    aliases.push(s.value());
                                }
                            }
                            Meta::Path(path) if path.is_ident("default") => {
                                has_default = true;
                            }
                            Meta::NameValue(nv) if nv.path.is_ident("deserialize_with") => {
                                if let syn::Expr::Lit(syn::ExprLit {
                                    lit: Lit::Str(s), ..
                                }) = &nv.value
                                {
                                    deserialize_with =
                                        Some(syn::parse_str::<syn::Path>(&s.value())?);
                                }
                            }
                            Meta::Path(path) if path.is_ident("duplicated") => {
                                duplicated = true;
                            }
                            _ => {
                                return Err(syn::Error::new_spanned(
                                    meta,
                                    "Unknown arena attribute",
                                ));
                            }
                        }
                    }
                }
                Meta::Path(path) if path.is_ident("default") => {
                    has_default = true;
                }
                _ => {
                    return Err(syn::Error::new_spanned(
                        attr,
                        "Invalid arena attribute format",
                    ));
                }
            }
        }
    }

    Ok(FieldInfo {
        ident,
        name,
        ty,
        aliases,
        has_default,
        deserialize_with,
        duplicated,
    })
}

/// Determine the arena lifetime for the struct.
/// Returns the lifetime identifier string (e.g., "bump", "a", "arena").
///
/// If the struct has existing lifetime parameters, uses the first one as the arena lifetime.
/// Otherwise, creates and returns "bump".
fn determine_arena_lifetime(generics: &syn::Generics) -> String {
    // Check if there's an existing lifetime parameter
    if let Some(lifetime_param) = generics.lifetimes().next() {
        lifetime_param.lifetime.ident.to_string()
    } else {
        "bump".to_string()
    }
}

fn is_option_type(ty: &Type) -> bool {
    match ty {
        Type::Path(type_path) => {
            if let Some(segment) = type_path.path.segments.last() {
                segment.ident == "Option"
            } else {
                false
            }
        }
        _ => false,
    }
}

fn is_slice_reference(ty: &Type, arena_lifetime: &str) -> bool {
    match ty {
        Type::Reference(type_ref) => {
            // Check if it's a reference to a slice with arena lifetime
            if let Some(lifetime) = &type_ref.lifetime {
                if lifetime.ident == arena_lifetime {
                    matches!(*type_ref.elem, Type::Slice(_))
                } else {
                    false
                }
            } else {
                false
            }
        }
        _ => false,
    }
}

fn get_slice_element_type(ty: &Type) -> Option<&Type> {
    match ty {
        Type::Reference(type_ref) => {
            if let Type::Slice(slice_type) = &*type_ref.elem {
                Some(&*slice_type.elem)
            } else {
                None
            }
        }
        _ => None,
    }
}
