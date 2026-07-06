use applib::parser::{ParseResult, parse_save_data};
use axum::{
    Json, Router,
    body::Bytes,
    extract::DefaultBodyLimit,
    http::StatusCode,
    routing::{get, post},
};
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_sdk::{Resource, trace::SdkTracerProvider};
use std::io::IsTerminal;
use std::net::SocketAddr;
use tokio::{net::TcpListener, signal};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan, prelude::*};

mod screenshot;

// Avoid musl's default allocator due to lackluster performance
// https://nickb.dev/blog/default-musl-allocator-considered-harmful-to-performance
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[tracing::instrument(name = "eu4.parse", skip(data), fields(request_bytes = data.len()))]
async fn upload(data: Bytes) -> Result<Json<ParseResult>, StatusCode> {
    tracing::info!("received request (bytes: {})", data.len());
    let result = tokio::task::block_in_place(|| parse_save_data(&data));

    match result {
        Ok(parsed) => Ok(Json(parsed)),
        Err(e) => {
            tracing::error!("parsing error: {}", e);
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

// Liveness/readiness probe. This service is stateless (no external deps), so a
// bare 200 is an honest signal that the router is up and serving.
async fn health() -> StatusCode {
    StatusCode::OK
}

// Initialize logging + tracing. Stdout logs are always emitted (Cloud Run's log
// collector ingests these). When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, spans are
// additionally exported over OTLP (e.g. to Grafana Cloud Tempo). Returns the
// tracer provider so `main` can flush it on shutdown; `None` in the stdout-only
// case (local dev, CI).
fn init_tracing() -> Option<SdkTracerProvider> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .with_span_events(FmtSpan::CLOSE)
        .with_ansi(std::io::stdout().is_terminal())
        .compact();

    if std::env::var_os("OTEL_EXPORTER_OTLP_ENDPOINT").is_none() {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt_layer)
            .init();
        return None;
    }

    // Endpoint and auth headers are read from the standard OTEL_* env vars.
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .build()
        .expect("failed to build OTLP span exporter");

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(
            Resource::builder()
                .with_service_name("pdx-tools-api")
                .build(),
        )
        .build();

    let otel_layer = tracing_opentelemetry::layer().with_tracer(provider.tracer("pdx-tools-api"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .with(otel_layer)
        .init();

    Some(provider)
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    let tracer_provider = init_tracing();

    let port = match std::env::var("PORT") {
        Ok(x) => x.parse::<u16>().unwrap(),
        Err(_) => 8080,
    };

    let app = Router::new()
        .route("/", post(upload))
        .route("/healthz", get(health))
        .route("/screenshot", post(screenshot::endpoint))
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        );
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await.expect("to bind to port");
    tracing::info!("listening on {}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("to create axum server");

    // Flush any buffered spans before exit. Important on Cloud Run where the
    // instance can be frozen/scaled to zero, otherwise batched spans are lost.
    if let Some(provider) = tracer_provider
        && let Err(e) = provider.shutdown()
    {
        eprintln!("error shutting down tracer provider: {e}");
    }

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    println!("signal received, starting graceful shutdown");
}
