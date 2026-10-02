<?php
if (!defined('_PS_VERSION_')) { exit; }
require_once dirname(__DIR__, 2) . '/classes/Seo404Gateway.php';

class Seo404connectorApiModuleFrontController extends ModuleFrontController
{
    public $ssl = true;
    public $ajax = true;
    public function postProcess()
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
        try {
            if (!Tools::usingSecureMode()) { throw new Seo404Failure(403); }
            $auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] : '');
            if (!is_string($auth) || !preg_match('/^Bearer ([a-f0-9]{64})$/D', $auth, $match)) { throw new Seo404Failure(401); }
            $gateway = new Seo404Gateway(Db::getInstance(), $this->context, $match[1]);
            $raw = file_get_contents('php://input', false, null, 0, 65537);
            if ($raw === false || strlen($raw) > 65536) { throw new Seo404Failure(400); }
            $result = $gateway->dispatch($_SERVER['REQUEST_METHOD'], $_GET, $raw);
            echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        } catch (Throwable $error) {
            http_response_code($error instanceof Seo404Failure ? $error->getCode() : 503);
            echo '{"error":"Requête non confirmée par le connecteur."}';
        }
        exit;
    }
}
