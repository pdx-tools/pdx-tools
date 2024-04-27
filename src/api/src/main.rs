use applib::parser::{parse_save_data, ParseResult};
use axum::{body::Bytes, extract::DefaultBodyLimit, http::StatusCode, routing::post, Json, Router};
use std::net::SocketAddr;
use tokio::signal;
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

async fn upload(data: Bytes) -> Result<Json<ParseResult>, StatusCode> {
    tracing::info!("received request (bytes: {})", data.len());
    let mut inflated = Vec::new();
    let result = tokio::task::block_in_place(|| parse_save_data(&data, &mut inflated));

    match result {
        Ok(parsed) => Ok(Json(parsed)),
        Err(e) => {
            tracing::error!("parsing error: {}", e);
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    let port = match std::env::var("PORT") {
        Ok(x) => x.parse::<u16>().unwrap(),
        Err(_) => 8080,
    };

    let router = Router::new()
        .route("/", post(upload))
        .layer(DefaultBodyLimit::max(15 * 1024 * 1024))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        );
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("listening on {}", addr);

    axum::Server::bind(&addr)
        .serve(router.into_make_service())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
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
