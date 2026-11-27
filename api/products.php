<?php
/**
 * Chuya - Controller de Productos (API REST PHP)
 * Stack: PHP 7.4+ / Vanilla JS PWA
 */

// Cabeceras HTTP para habilitar CORS en desarrollo local y PWA
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Respuesta inmediata para peticiones OPTIONS (Preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'getProducts') {
    $productos = [
        ["id" => "prod-1", "nombre" => "Huevos Campesinos AAA (Docena)", "precio" => 12000, "categoria" => "huevos", "icono" => "🥚"],
        ["id" => "prod-2", "nombre" => "Pollo Orgánico Entero (Kg)", "precio" => 18000, "categoria" => "pollo", "icono" => "🍗"],
        ["id" => "prod-3", "nombre" => "Abono de Cáscara Procesada (500g)", "precio" => 5000, "categoria" => "abono", "icono" => "🌱"]
    ];

    echo json_encode([
        "status" => "success",
        "data" => $productos
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

http_response_code(400);
echo json_encode(["status" => "error", "message" => "Acción inválida o método HTTP no soportado."]);
exit();