// Define the common presentation-layer DTO pair:
//
// - a workspace-facing struct used by workspace aggregation code,
// - a serialized UI-facing struct exported across the WASM boundary,
// - and the `Present` implementation that converts between them.
//
// Field syntax is intentionally explicit:
//
// - `field: Type` copies the workspace field through unchanged.
// - `field: SourceType => OutputType` calls `Present::present` for that field.
//
// The macro supports named-field structs and enums whose variants are unit or
// named-field. Workspace structs may carry simple generics/lifetimes, while
// output DTOs stay owned and non-generic.
macro_rules! present_dto {
    (
        $workspace_vis:vis mod workspace;
        $presentation_vis:vis mod presentation;

        $(
            $(#[$attr:meta])*
            $vis:vis $name:ident $(< $($gen:tt),+ >)? {
                $($field:ident : $raw_ty:ty $(=> $out_ty:ty)?),* $(,)?
            }
        )+
    ) => {
        $workspace_vis mod workspace {
            use super::*;

            $(
                #[derive(Debug, Clone)]
                $vis struct $name $(< $($gen),+ >)? {
                    $(pub $field: $raw_ty,)*
                }
            )+
        }

        $presentation_vis mod presentation {
            use super::*;

            $(
                crate::presentation::present_dto!(@namespace_output_struct
                    [$(#[$attr])*]
                    [$vis]
                    [$name]
                    []
                    $($field : $raw_ty $(=> $out_ty)?),*
                );
            )+
        }

        $(
            impl $(< $($gen),+ >)? crate::presentation::Present
                for workspace::$name $(< $($gen),+ >)?
            {
                type Output = presentation::$name;

                fn present(
                    self,
                    ctx: &crate::presentation::LocalizationContext<'_, '_>,
                ) -> Self::Output {
                    crate::presentation::present_dto!(@namespace_present_expr
                        self ctx $name [] $($field $(=> $out_ty)?),*
                    )
                }
            }
        )+
    };
    (@namespace_output_struct
        [$($attr:tt)*]
        [$vis:vis]
        [$name:ident]
        [$($out_fields:tt)*]
    ) => {
        $($attr)*
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        #[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
        #[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
        #[serde(rename_all = "camelCase")]
        $vis struct $name {
            $($out_fields)*
        }
    };
    (@namespace_output_struct
        [$($attr:tt)*]
        [$vis:vis]
        [$name:ident]
        [$($out_fields:tt)*]
        $field:ident : $raw_ty:ty => $out_ty:ty $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@namespace_output_struct
            [$($attr)*]
            [$vis]
            [$name]
            [$($out_fields)* pub $field: $out_ty,]
            $($($rest)*)?
        );
    };
    (@namespace_output_struct
        [$($attr:tt)*]
        [$vis:vis]
        [$name:ident]
        [$($out_fields:tt)*]
        $field:ident : $raw_ty:ty $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@namespace_output_struct
            [$($attr)*]
            [$vis]
            [$name]
            [$($out_fields)* pub $field: $raw_ty,]
            $($($rest)*)?
        );
    };
    (@namespace_present_expr
        $self:ident
        $ctx:ident
        $out:ident
        [$($present_fields:tt)*]
    ) => {
        presentation::$out { $($present_fields)* }
    };
    (@namespace_present_expr
        $self:ident
        $ctx:ident
        $out:ident
        [$($present_fields:tt)*]
        $field:ident => $out_ty:ty $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@namespace_present_expr
            $self
            $ctx
            $out
            [$($present_fields)* $field: $self.$field.present($ctx),]
            $($($rest)*)?
        )
    };
    (@namespace_present_expr
        $self:ident
        $ctx:ident
        $out:ident
        [$($present_fields:tt)*]
        $field:ident $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@namespace_present_expr
            $self
            $ctx
            $out
            [$($present_fields)* $field: $self.$field,]
            $($($rest)*)?
        )
    };
    // Workspace/output pair with no workspace generics.
    (
        $(#[$attr:meta])*
        $raw_vis:vis workspace $raw:ident => $out_vis:vis $out:ident {
            $($field:ident : $raw_ty:ty $(=> $out_ty:ty)?),* $(,)?
        }
    ) => {
        crate::presentation::present_dto!(@expand
            [$(#[$attr])*] [$raw_vis] [$raw] [] [$out_vis] [$out] [] [
                $($field : $raw_ty $(=> $out_ty)?),*
            ]
        );
    };
    // Workspace/output pair where the workspace struct has lifetimes or type parameters.
    // The same generic tokens are used on the `impl Present for Raw<...>`.
    (
        $(#[$attr:meta])*
        $raw_vis:vis workspace $raw:ident < $($gen:tt),+ > => $out_vis:vis $out:ident {
            $($field:ident : $raw_ty:ty $(=> $out_ty:ty)?),* $(,)?
        }
    ) => {
        crate::presentation::present_dto!(@expand
            [$(#[$attr])*] [$raw_vis] [$raw] [<$($gen),+>] [$out_vis] [$out] [<$($gen),+>] [
                $($field : $raw_ty $(=> $out_ty)?),*
            ]
        );
    };
    // Shared expansion: emit the workspace struct, delegate output-struct field
    // construction to the recursive arms below, then emit `Present`.
    (
        @expand
        [$($attr:tt)*]
        [$raw_vis:vis]
        [$raw:ident]
        [$($generics:tt)*]
        [$out_vis:vis]
        [$out:ident]
        [$($raw_generics:tt)*]
        [$($field:ident : $raw_ty:ty $(=> $out_ty:ty)?),*]
    ) => {
        #[derive(Debug, Clone)]
        $raw_vis struct $raw $($generics)* {
            $($raw_vis $field: $raw_ty,)*
        }

        crate::presentation::present_dto!(@output_struct
            [$($attr)*]
            [$out_vis]
            [$out]
            []
            $($field : $raw_ty $(=> $out_ty)?),*
        );

        impl $($generics)* crate::presentation::Present for $raw $($raw_generics)* {
            type Output = $out;

            fn present(
                self,
                ctx: &crate::presentation::LocalizationContext<'_, '_>,
            ) -> Self::Output {
                crate::presentation::present_dto!(@present_expr
                    self ctx $out [] $($field $(=> $out_ty)?),*
                )
            }
        }
    };
    // Base case after output fields have been accumulated.
    (@output_struct
        [$($attr:tt)*]
        [$out_vis:vis]
        [$out:ident]
        [$($out_fields:tt)*]
    ) => {
        $($attr)*
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        #[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
        #[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
        #[serde(rename_all = "camelCase")]
        $out_vis struct $out {
            $($out_fields)*
        }
    };
    // Output field for transformed fields: use the explicit output type after
    // `=>`.
    (@output_struct
        [$($attr:tt)*]
        [$out_vis:vis]
        [$out:ident]
        [$($out_fields:tt)*]
        $field:ident : $raw_ty:ty => $out_ty:ty $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@output_struct
            [$($attr)*]
            [$out_vis]
            [$out]
            [$($out_fields)* pub $field: $out_ty,]
            $($($rest)*)?
        );
    };
    // Output field for pass-through fields: use the workspace type unchanged.
    (@output_struct
        [$($attr:tt)*]
        [$out_vis:vis]
        [$out:ident]
        [$($out_fields:tt)*]
        $field:ident : $raw_ty:ty $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@output_struct
            [$($attr)*]
            [$out_vis]
            [$out]
            [$($out_fields)* pub $field: $raw_ty,]
            $($($rest)*)?
        );
    };
    // Base case after `Present::present` struct fields have been accumulated.
    (@present_expr
        $self:ident
        $ctx:ident
        $out:ident
        [$($present_fields:tt)*]
    ) => {
        $out { $($present_fields)* }
    };
    // Transformed field: call `present(ctx)`.
    (@present_expr
        $self:ident
        $ctx:ident
        $out:ident
        [$($present_fields:tt)*]
        $field:ident => $out_ty:ty $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@present_expr
            $self
            $ctx
            $out
            [$($present_fields)* $field: $self.$field.present($ctx),]
            $($($rest)*)?
        )
    };
    // Pass-through field: move the workspace field directly.
    (@present_expr
        $self:ident
        $ctx:ident
        $out:ident
        [$($present_fields:tt)*]
        $field:ident $(, $($rest:tt)*)?
    ) => {
        crate::presentation::present_dto!(@present_expr
            $self
            $ctx
            $out
            [$($present_fields)* $field: $self.$field,]
            $($($rest)*)?
        )
    };

    // Enum-only module-namespace form. Field syntax inside variants mirrors
    // the struct form: `name: Ty` for pass-through, `name: Raw => Out` to
    // call `.present(ctx)`. Variants must end with a trailing comma.
    (
        $workspace_vis:vis mod workspace;
        $presentation_vis:vis mod presentation;

        $(
            $(#[$attr:meta])*
            $vis:vis enum $name:ident {
                $($variants:tt)*
            }
        )+
    ) => {
        $workspace_vis mod workspace {
            use super::*;
            $(
                crate::presentation::present_dto!(@enum_ws_emit
                    [$vis] [$name] [] $($variants)*
                );
            )+
        }

        $presentation_vis mod presentation {
            use super::*;
            $(
                crate::presentation::present_dto!(@enum_pr_emit
                    [$(#[$attr])*] [$vis] [$name] [] $($variants)*
                );
            )+
        }

        $(
            impl crate::presentation::Present for workspace::$name {
                type Output = presentation::$name;

                fn present(
                    self,
                    ctx: &crate::presentation::LocalizationContext<'_, '_>,
                ) -> Self::Output {
                    crate::presentation::present_dto!(@enum_match
                        self ctx [$name] [] $($variants)*
                    )
                }
            }
        )+
    };

    // ------- Workspace enum emission (drop `=> OutTy` parts) -------
    (@enum_ws_emit [$vis:vis] [$name:ident] [$($acc:tt)*]) => {
        #[derive(Debug, Clone)]
        $vis enum $name {
            $($acc)*
        }
    };
    (@enum_ws_emit [$vis:vis] [$name:ident] [$($acc:tt)*]
        $variant:ident, $($rest:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_ws_emit
            [$vis] [$name] [$($acc)* $variant,] $($rest)*
        );
    };
    (@enum_ws_emit [$vis:vis] [$name:ident] [$($acc:tt)*]
        $variant:ident {
            $($field:ident : $raw_ty:ty $(=> $out_ty:ty)?),* $(,)?
        }, $($rest:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_ws_emit
            [$vis] [$name]
            [$($acc)* $variant { $($field: $raw_ty,)* },]
            $($rest)*
        );
    };

    // ------- Presentation enum emission (use OutTy where present) -------
    (@enum_pr_emit [$($attr:tt)*] [$vis:vis] [$name:ident] [$($acc:tt)*]) => {
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        #[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
        #[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
        $($attr)*
        $vis enum $name {
            $($acc)*
        }
    };
    (@enum_pr_emit [$($attr:tt)*] [$vis:vis] [$name:ident] [$($acc:tt)*]
        $variant:ident, $($rest:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_pr_emit
            [$($attr)*] [$vis] [$name] [$($acc)* $variant,] $($rest)*
        );
    };
    (@enum_pr_emit [$($attr:tt)*] [$vis:vis] [$name:ident] [$($acc:tt)*]
        $variant:ident {
            $($field:ident : $raw_ty:ty $(=> $out_ty:ty)?),* $(,)?
        }, $($rest:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_pr_variant_fields
            [$($attr)*] [$vis] [$name] [$($acc)*] [$variant] []
            [$($rest)*]
            $($field : $raw_ty $(=> $out_ty)?,)*
        );
    };

    // Walk a single variant's fields, replacing transformed types.
    (@enum_pr_variant_fields
        [$($attr:tt)*] [$vis:vis] [$name:ident] [$($acc:tt)*]
        [$variant:ident] [$($vacc:tt)*]
        [$($rest:tt)*]
    ) => {
        crate::presentation::present_dto!(@enum_pr_emit
            [$($attr)*] [$vis] [$name]
            [$($acc)* $variant { $($vacc)* },]
            $($rest)*
        );
    };
    (@enum_pr_variant_fields
        [$($attr:tt)*] [$vis:vis] [$name:ident] [$($acc:tt)*]
        [$variant:ident] [$($vacc:tt)*]
        [$($rest:tt)*]
        $field:ident : $raw_ty:ty => $out_ty:ty, $($more:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_pr_variant_fields
            [$($attr)*] [$vis] [$name] [$($acc)*]
            [$variant] [$($vacc)* $field: $out_ty,]
            [$($rest)*]
            $($more)*
        );
    };
    (@enum_pr_variant_fields
        [$($attr:tt)*] [$vis:vis] [$name:ident] [$($acc:tt)*]
        [$variant:ident] [$($vacc:tt)*]
        [$($rest:tt)*]
        $field:ident : $raw_ty:ty, $($more:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_pr_variant_fields
            [$($attr)*] [$vis] [$name] [$($acc)*]
            [$variant] [$($vacc)* $field: $raw_ty,]
            [$($rest)*]
            $($more)*
        );
    };

    // ------- Match expression: workspace -> presentation -------
    (@enum_match $self:ident $ctx:ident [$name:ident] [$($arms:tt)*]) => {
        match $self {
            $($arms)*
        }
    };
    (@enum_match $self:ident $ctx:ident [$name:ident] [$($arms:tt)*]
        $variant:ident, $($rest:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_match
            $self $ctx [$name]
            [$($arms)* workspace::$name::$variant => presentation::$name::$variant,]
            $($rest)*
        )
    };
    (@enum_match $self:ident $ctx:ident [$name:ident] [$($arms:tt)*]
        $variant:ident {
            $($field:ident : $raw_ty:ty $(=> $out_ty:ty)?),* $(,)?
        }, $($rest:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_match_variant_fields
            $self $ctx [$name] [$($arms)*] [$variant] [] []
            [$($rest)*]
            $($field $(=> $out_ty)?,)*
        )
    };

    (@enum_match_variant_fields
        $self:ident $ctx:ident
        [$name:ident] [$($arms:tt)*] [$variant:ident]
        [$($bindings:tt)*] [$($exprs:tt)*]
        [$($rest:tt)*]
    ) => {
        crate::presentation::present_dto!(@enum_match
            $self $ctx [$name]
            [$($arms)*
                workspace::$name::$variant { $($bindings)* } =>
                    presentation::$name::$variant { $($exprs)* },
            ]
            $($rest)*
        )
    };
    (@enum_match_variant_fields
        $self:ident $ctx:ident
        [$name:ident] [$($arms:tt)*] [$variant:ident]
        [$($bindings:tt)*] [$($exprs:tt)*]
        [$($rest:tt)*]
        $field:ident => $out_ty:ty, $($more:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_match_variant_fields
            $self $ctx [$name] [$($arms)*] [$variant]
            [$($bindings)* $field,]
            [$($exprs)* $field: $field.present($ctx),]
            [$($rest)*]
            $($more)*
        )
    };
    (@enum_match_variant_fields
        $self:ident $ctx:ident
        [$name:ident] [$($arms:tt)*] [$variant:ident]
        [$($bindings:tt)*] [$($exprs:tt)*]
        [$($rest:tt)*]
        $field:ident, $($more:tt)*
    ) => {
        crate::presentation::present_dto!(@enum_match_variant_fields
            $self $ctx [$name] [$($arms)*] [$variant]
            [$($bindings)* $field,]
            [$($exprs)* $field,]
            [$($rest)*]
            $($more)*
        )
    };
}

pub(crate) use present_dto;
