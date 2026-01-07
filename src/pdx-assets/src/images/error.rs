use std::fmt;

#[derive(Debug)]
pub enum ImageError {
    ImageMagickFailed { command: String, stderr: String },
    ImageMagickNotFound { message: String },
    InvalidOperation { operation: String },
    Io(std::io::Error),
}

impl fmt::Display for ImageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ImageError::ImageMagickFailed { command, stderr } => {
                write!(f, "ImageMagick command failed: {} - {}", command, stderr)?;

                let stderr_lower = stderr.to_lowercase();
                if stderr_lower.contains("security policy") {
                    write!(
                        f,
                        "\n\nThis appears to be a security policy error. The system's ImageMagick policy may be preventing necessary operations (like path operations using the `@` syntax) needed for montage commands."
                    )?;
                    write!(
                        f,
                        "\n\nTo resolve this, modify the system's ImageMagick policy.xml to more closely resemble the policy.xml bundled with this repo"
                    )?;
                }
                Ok(())
            }
            ImageError::ImageMagickNotFound { message } => {
                write!(f, "ImageMagick not found: {}", message)
            }
            ImageError::InvalidOperation { operation } => {
                write!(f, "Invalid image operation: {}", operation)
            }
            ImageError::Io(err) => write!(f, "IO error: {}", err),
        }
    }
}

impl std::error::Error for ImageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ImageError::Io(err) => Some(err),
            _ => None,
        }
    }
}

impl From<std::io::Error> for ImageError {
    fn from(err: std::io::Error) -> Self {
        ImageError::Io(err)
    }
}
