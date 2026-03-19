use axum::{
    routing::{get, post},
    http::StatusCode,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

#[derive(Serialize)]
struct Message {
    message: String,
}

#[derive(Deserialize)]
struct CreateItem {
    name: String,
    description: String,
}

#[derive(Serialize)]
struct Item {
    id: u64,
    name: String,
    description: String,
}

#[tokio::main]
async fn main() {
    // Initialize the router
    let app = Router::new()
        .route("/", get(health_check))
        .route("/items", post(create_item))
        .route("/items", get(list_items));

    // Run the server
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Server running on http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}

// Health check endpoint
async fn health_check() -> Json<Message> {
    Json(Message {
        message: "API is healthy".to_string(),
    })
}

// Create a new item
async fn create_item(Json(payload): Json<CreateItem>) -> (StatusCode, Json<Item>) {
    // This is a simple example - in a real app, you'd save to a database
    let item = Item {
        id: 1, // In a real app, this would be generated
        name: payload.name,
        description: payload.description,
    };

    (StatusCode::CREATED, Json(item))
}

// List items
async fn list_items() -> Json<Vec<Item>> {
    // This is a simple example - in a real app, you'd fetch from a database
    Json(vec![
        Item {
            id: 1,
            name: "Example Item".to_string(),
            description: "This is an example item".to_string(),
        }
    ])
}