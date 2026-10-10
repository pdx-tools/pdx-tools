Source: rakaly/jomini commit 4461f6e41b28cf7888e2a849858029f9fe4b5a52 (eu5save crate), MIT license.

Local compatibility change: omitted subunit morale defaults to zero, matching other optional numeric subunit fields. Explicit values remain unchanged. No save bytes are rewritten.
Cargo manifest uses explicit dependencies so this crate builds outside the upstream workspace.
