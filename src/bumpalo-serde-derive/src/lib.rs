use proc_macro::{Span, TokenStream};
use quote::{format_ident, quote};
use syn::{Data, DeriveInput, Fields, LifetimeParam, Lit, Meta, Type, parse_macro_input};

#[proc_macro_derive(ArenaDeserialize, attributes(arena))]
pub fn derive_arena_deserialize(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);

    match expand_arena_deserialize(&input) {
        Ok(tokens) => tokens.into(),
        Err(err) => err.to_compile_error().into(),
    }
}

fn expand_arena_deserialize(input: &DeriveInput) -> syn::Result<TokenStream> {
    let name = &input.ident;
    let data = &input.data;

    // Determine the arena lifetime to use
    let arena_lifetime = determine_arena_lifetime(&input.generics);

    // Check if this is an owned type that should just forward to Deserialize
    if is_owned_type(input, &arena_lifetime) {
        return expand_owned_type_passthrough(name, &input.generics, &arena_lifetime);
    }

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
        Data::Enum(_) => expand_enum(name, &input.generics, &arena_lifetime),
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
        .map(|field| parse_field_attributes(field))
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

    // Generate field handling using enum variants
    let field_handling: Vec<_> = field_info
        .iter()
        .enumerate()
        .map(|(i, info)| {
            let field_name = &info.ident;
            let field_type = &info.ty;
            let field_str = &info.name;
            let variant_name = format_ident!("Field{}", i);

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

                        map.next_value_seed(CustomFieldSeed { allocator })?
                    });
                }
            } else if is_slice_reference(field_type, arena_lifetime) {
                if let Some(element_type) = get_slice_element_type(field_type) {
                    quote! {
                        #field_name = Some(map.next_value_seed(
                            arena_deserializer::SliceDeserializer::<#element_type>::new(allocator)
                        )?);
                    }
                } else {
                    quote! {
                        #field_name = Some(map.next_value_seed(arena_deserializer::ArenaSeed::new(allocator))?);
                    }
                }
            } else if is_arena_type(field_type, arena_lifetime) || is_option_with_arena_type(field_type, arena_lifetime) {
                quote! {
                    #field_name = Some(map.next_value_seed(arena_deserializer::ArenaSeed::new(allocator))?);
                }
            } else {
                quote! {
                    #field_name = Some(map.next_value()?);
                }
            };

            quote! {
                __Field::#variant_name => {
                    if #field_name.is_some() {
                        return Err(serde::de::Error::duplicate_field(#field_str));
                    }
                    #deserialize_logic
                }
            }
        })
        .collect();

    // Generate field extraction with defaults
    let field_extractions: Vec<_> = field_info
        .iter()
        .map(|info| {
            let field_name = &info.ident;
            if info.has_default {
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
        .any(|lt| lt.lifetime.ident.to_string() == arena_lifetime)
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
        impl #new_impl_generics arena_deserializer::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
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

                    fn visit_map<V>(self, mut map: V) -> Result<#name #ty_generics, V::Error>
                    where
                        V: serde::de::MapAccess<'de>,
                    {
                        let allocator = self.allocator;
                        #(
                            let mut #field_assignments = None;
                        )*

                        while let Some(key) = map.next_key::<__Field>()? {
                            match key {
                                #(#field_handling)*
                                __Field::__ignore => {
                                    // Skip unknown fields
                                    map.next_value::<serde::de::IgnoredAny>()?;
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
        .any(|lt| lt.lifetime.ident.to_string() == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let deserialize_impl = if is_arena_type(field_type, arena_lifetime) {
        quote! {
            let inner = <arena_deserializer::ArenaSeed::<#field_type> as serde::de::DeserializeSeed>::deserialize(arena_deserializer::ArenaSeed::<#field_type>::new(allocator), deserializer)?;
            Ok(#name(inner))
        }
    } else {
        quote! {
            let inner = serde::Deserialize::deserialize(deserializer)?;
            Ok(#name(inner))
        }
    };

    let output = quote! {
            impl #new_impl_generics arena_deserializer::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
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
        .any(|lt| lt.lifetime.ident.to_string() == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let output = quote! {
        impl #new_impl_generics arena_deserializer::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
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

fn expand_enum(
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
        .any(|lt| lt.lifetime.ident.to_string() == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let output = quote! {
        impl #new_impl_generics arena_deserializer::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
            fn deserialize_in_arena<'de, D>(deserializer: D, _allocator: &#arena_lifetime_syn bumpalo::Bump) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                // Enums don't need arena allocation, so we just pass through to serde
                serde::Deserialize::deserialize(deserializer)
            }
        }
    };

    Ok(output.into())
}

struct FieldInfo {
    ident: syn::Ident,
    name: String,
    ty: syn::Type,
    aliases: Vec<String>,
    has_default: bool,
    deserialize_with: Option<syn::Path>,
}

fn parse_field_attributes(field: &syn::Field) -> syn::Result<FieldInfo> {
    let ident = field.ident.as_ref().unwrap().clone();
    let name = ident.to_string();
    let ty = field.ty.clone();
    let mut aliases = Vec::new();
    let mut has_default = false;
    let mut deserialize_with = None;

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
    })
}

fn is_arena_type(ty: &Type, arena_lifetime: &str) -> bool {
    match ty {
        Type::Reference(type_ref) => {
            // Check for &'arena T where arena_lifetime matches
            if let Some(lifetime) = &type_ref.lifetime {
                lifetime.ident.to_string() == arena_lifetime
            } else {
                false
            }
        }
        Type::Path(type_path) => {
            // Check for bumpalo collections or types with arena lifetime
            if let Some(segment) = type_path.path.segments.first() {
                if segment.ident == "bumpalo" {
                    return true;
                }

                // Check if the type has generic parameters with arena lifetime
                if let syn::PathArguments::AngleBracketed(args) = &segment.arguments {
                    for arg in &args.args {
                        if let syn::GenericArgument::Lifetime(lt) = arg {
                            if lt.ident.to_string() == arena_lifetime {
                                return true;
                            }
                        }
                    }
                }

                // Check for types that might be custom structs/enums with ArenaDeserialize
                // We'll assume any non-standard library type implements ArenaDeserialize
                let type_name = segment.ident.to_string();
                if !matches!(
                    type_name.as_str(),
                    "String"
                        | "Vec"
                        | "HashMap"
                        | "HashSet"
                        | "BTreeMap"
                        | "BTreeSet"
                        | "i8"
                        | "i16"
                        | "i32"
                        | "i64"
                        | "i128"
                        | "isize"
                        | "u8"
                        | "u16"
                        | "u32"
                        | "u64"
                        | "u128"
                        | "usize"
                        | "f32"
                        | "f64"
                        | "bool"
                        | "char"
                        | "Option"
                        | "Result"
                ) {
                    return true; // Assume custom types implement ArenaDeserialize
                }

                // Handle the standard types that don't need arena
                false
            } else {
                false
            }
        }
        Type::Slice(_) => true, // Assume slice types need arena deserialization
        _ => {
            // Check if the type contains arena lifetime parameter
            let type_str = quote!(#ty).to_string();
            type_str.contains(&format!("'{}", arena_lifetime))
        }
    }
}

fn has_bump_lifetime(generics: &syn::Generics) -> bool {
    generics.lifetimes().any(|lt| lt.lifetime.ident == "bump")
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

fn is_option_with_arena_type(ty: &Type, arena_lifetime: &str) -> bool {
    match ty {
        Type::Path(type_path) => {
            if let Some(segment) = type_path.path.segments.last() {
                if segment.ident == "Option" {
                    // Check if the Option contains an arena type
                    if let syn::PathArguments::AngleBracketed(args) = &segment.arguments {
                        if let Some(syn::GenericArgument::Type(inner_type)) = args.args.first() {
                            return is_arena_type(inner_type, arena_lifetime);
                        }
                    }
                }
            }
            false
        }
        _ => false,
    }
}

fn is_slice_reference(ty: &Type, arena_lifetime: &str) -> bool {
    match ty {
        Type::Reference(type_ref) => {
            // Check if it's a reference to a slice with arena lifetime
            if let Some(lifetime) = &type_ref.lifetime {
                if lifetime.ident.to_string() == arena_lifetime {
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

fn is_owned_type(input: &DeriveInput, arena_lifetime: &str) -> bool {
    // Only consider types with no lifetime parameters as potentially owned
    if has_bump_lifetime(&input.generics) {
        return false;
    }

    match &input.data {
        Data::Struct(data_struct) => {
            match &data_struct.fields {
                Fields::Named(fields) => {
                    // Check if all fields are owned types (no arena types)
                    fields
                        .named
                        .iter()
                        .all(|field| !is_arena_type(&field.ty, arena_lifetime))
                }
                Fields::Unnamed(fields) => {
                    // Check if all fields are owned types (no arena types)
                    fields
                        .unnamed
                        .iter()
                        .all(|field| !is_arena_type(&field.ty, arena_lifetime))
                }
                Fields::Unit => true, // Unit structs are always owned
            }
        }
        Data::Enum(_) => true,   // Enums are typically owned
        Data::Union(_) => false, // We don't support unions anyway
    }
}

fn expand_owned_type_passthrough(
    name: &syn::Ident,
    generics: &syn::Generics,
    arena_lifetime: &str,
) -> syn::Result<TokenStream> {
    let (_impl_generics, ty_generics, _where_clause) = generics.split_for_impl();
    let arena_lifetime_syn =
        syn::Lifetime::new(&format!("'{}", arena_lifetime), Span::call_site().into());

    // Create new generics with arena lifetime
    let mut new_generics = generics.clone();
    // Only add arena lifetime if it doesn't already exist
    if !generics
        .lifetimes()
        .any(|lt| lt.lifetime.ident.to_string() == arena_lifetime)
    {
        new_generics.params.insert(
            0,
            syn::GenericParam::Lifetime(LifetimeParam::new(arena_lifetime_syn.clone())),
        );
    }
    let (new_impl_generics, _, new_where_clause) = new_generics.split_for_impl();

    let output = quote! {
        impl #new_impl_generics arena_deserializer::ArenaDeserialize<#arena_lifetime_syn> for #name #ty_generics #new_where_clause {
            fn deserialize_in_arena<'de, D>(deserializer: D, _allocator: &#arena_lifetime_syn bumpalo::Bump) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                Self::deserialize(deserializer)
            }
        }
    };

    Ok(output.into())
}
