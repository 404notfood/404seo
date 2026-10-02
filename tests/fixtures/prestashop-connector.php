<?php
// Test only the connector gateway against isolated MySQL, with minimal framework doubles.
$dsn = getenv('TEST_CMS_MYSQL_DSN');
if ($dsn !== 'mysql:host=127.0.0.1;port=55433;dbname=seo_cms_test;charset=utf8mb4') { throw new Exception('Isolated CMS test database required'); }
define('_PS_VERSION_', '9.0.0'); define('_DB_PREFIX_', 'cms_fixture_' . bin2hex(random_bytes(6)) . '_');
$pdo = new PDO($dsn, 'root', '', array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION));
$observer = new PDO($dsn, 'root', '', array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION));
function check($value, $message) { if (!$value) { throw new Exception($message); } }
function pSQL($value) { global $pdo; return substr($pdo->quote((string) $value), 1, -1); }
class Module {
    public static $configure = true;
    public $name, $tab, $version, $author, $bootstrap, $ps_versions_compliancy, $displayName, $description, $context;
    public function __construct() {} public function install() { return true; } public function uninstall() { return true; }
    public function getPermission($action, $employee) { return self::$configure; }
}
class Db {
    public static $instance; public $pdo, $failMarker = false, $lockCheck;
    public function __construct($pdo) { $this->pdo = $pdo; }
    public static function getInstance() { return self::$instance; }
    public function getRow($sql, $cache) { return $this->pdo->query($sql . ' LIMIT 1')->fetch(PDO::FETCH_ASSOC); }
    public function execute($sql) {
        if ($this->failMarker && strpos($sql, ' SET operation_id=') !== false) { $this->failMarker = false; return false; }
        return $this->pdo->exec($sql) !== false;
    }
    public function executeS($sql, $array = true, $cache = true) {
        check($array && !$cache, 'Gateway queries must bypass PrestaShop query cache');
        $rows = $this->pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        if ($this->lockCheck && strpos($sql, 'INNER JOIN `' . _DB_PREFIX_ . 'product_shop`') !== false && str_ends_with($sql, 'FOR UPDATE')) { ($this->lockCheck)(); }
        return $rows;
    }
}
class Language {
    public $name = 'Français'; public function __construct($id) {}
    public static function getLanguages($active, $shop) { return array(array('id_lang'=>1,'name'=>'Français'),array('id_lang'=>2,'name'=>'Anglais')); }
}
class Shop { const CONTEXT_SHOP = 1; public static function getContext() { return 1; } }
class Tools {
    public static $form = array();
    public static function getAdminTokenLite($controller) { return 'fixture-csrf'; }
    public static function isSubmit($name) { return isset(self::$form[$name]); }
    public static function getValue($name) { return isset(self::$form[$name]) ? self::$form[$name] : null; }
}
class Cache { public static function clean($key) {} }
class Dispatcher {
    public static $customSeoUrl = false;
    public static function getInstance() { return new self(); }
    public function hasKeyword(...$args) { return self::$customSeoUrl; }
}
class FixtureLink {
    public function getBaseLink($shop, $ssl) { return 'https://example.com/shop/'; }
    public function getProductLink($id, $alias, $category, $ean, $lang, $shop) { return 'https://example.com/shop/' . $lang . '/product-' . $id; }
}
require dirname(__DIR__, 2) . '/integrations/prestashop/seo404connector/seo404connector.php';
require dirname(__DIR__, 2) . '/integrations/prestashop/seo404connector/classes/Seo404Gateway.php';
$db = Db::$instance = new Db($pdo);
$context = (object) array('shop' => (object) array('id' => 1, 'name' => 'Boutique'), 'link' => new FixtureLink());
$tables = array('product', 'product_shop', 'product_lang', 'lang', 'lang_shop', 'seo404_settings', 'seo404_operations');
try {
    $pdo->exec('CREATE TABLE `' . _DB_PREFIX_ . 'product` (id_product INT PRIMARY KEY, date_upd VARCHAR(30)) ENGINE=InnoDB');
    $pdo->exec('CREATE TABLE `' . _DB_PREFIX_ . 'product_shop` (id_product INT, id_shop INT, active INT, visibility VARCHAR(20), PRIMARY KEY(id_product,id_shop)) ENGINE=InnoDB');
    $pdo->exec('CREATE TABLE `' . _DB_PREFIX_ . 'product_lang` (id_product INT,id_shop INT,id_lang INT,name TEXT,link_rewrite TEXT,description TEXT,description_short TEXT,meta_title VARCHAR(255),meta_description VARCHAR(512),PRIMARY KEY(id_product,id_shop,id_lang)) ENGINE=InnoDB');
    $pdo->exec('CREATE TABLE `' . _DB_PREFIX_ . 'lang` (id_lang INT PRIMARY KEY,active INT) ENGINE=InnoDB');
    $pdo->exec('CREATE TABLE `' . _DB_PREFIX_ . 'lang_shop` (id_lang INT,id_shop INT,PRIMARY KEY(id_lang,id_shop)) ENGINE=InnoDB');
    check((new Seo404connector())->install(), 'Module installation failed');
    $admin = new Seo404connector(); $admin->context = $context;
    check(strpos($admin->getContent(), 'non autorisée') !== false, 'Anonymous configuration rejected');
    $context->employee = (object) array('id'=>1); Module::$configure = false;
    check(strpos($admin->getContent(), 'non autorisée') !== false, 'Missing module permission rejected'); Module::$configure = true;
    Tools::$form = array('seo404_generate'=>1,'seo404_csrf'=>'invalid','seo404_language'=>'1');
    check(strpos($admin->getContent(), 'Demande invalide') !== false, 'Bad CSRF token rejected');
    Tools::$form['seo404_csrf'] = 'fixture-csrf'; Tools::$form['seo404_language'] = '99';
    check(strpos($admin->getContent(), 'Demande invalide') !== false, 'Foreign language rejected');
    Tools::$form['seo404_language'] = '1';
    check(preg_match('/<code>([a-f0-9]{64})<\/code>/', $admin->getContent(), $generated) === 1, 'Key generated only for authorized configuration');
    $stored = $pdo->query('SELECT token_hash FROM `' . _DB_PREFIX_ . 'seo404_settings` WHERE id=1')->fetchColumn();
    check($stored === hash('sha256', $generated[1]), 'Only key hash stored');
    Tools::$form = array(); check(strpos($admin->getContent(), $generated[1]) === false, 'Key not displayed again');
    $token = str_repeat('a', 64);
    $pdo->exec('UPDATE `' . _DB_PREFIX_ . 'seo404_settings` SET id_shop=1,id_lang=1,token_hash=\'' . pSQL(hash('sha256', $token)) . '\' WHERE id=1');
    $pdo->exec('INSERT INTO `' . _DB_PREFIX_ . "product` VALUES (1, '2026-10-02'),(2,'2026-10-02')");
    $pdo->exec('INSERT INTO `' . _DB_PREFIX_ . "product_shop` VALUES (1,1,1,'both'),(1,2,1,'both'),(2,1,0,'both')");
    $pdo->exec('INSERT INTO `' . _DB_PREFIX_ . 'lang` VALUES (1,1),(2,1)');
    $pdo->exec('INSERT INTO `' . _DB_PREFIX_ . 'lang_shop` VALUES (1,1),(2,1),(1,2)');
    foreach (array(array(1,1), array(1,2), array(2,1)) as $scope) {
        $sql = $pdo->prepare('INSERT INTO `' . _DB_PREFIX_ . 'product_lang` VALUES (1,?,?,\'Produit\',\'produit\',\'<p>Description conservée</p>\',\'Résumé conservé\',?,?)');
        $sql->execute(array($scope[0], $scope[1], str_repeat('T', 255), str_repeat('D', 512)));
    }
    $gateway = new Seo404Gateway($db, $context, $token);
    $call = function ($action, $data = null, $scope = '1:1', $id = '1') use ($gateway) {
        return $gateway->dispatch($data === null ? 'GET' : 'POST', array('action' => $action, 'scope' => $scope, 'id' => $id, 'page' => '1'), $data === null ? '' : json_encode($data));
    };
    $refuse = function ($callback, $status) { try { $callback(); } catch (Seo404Failure $e) { check($e->getCode() === $status, 'Unexpected status ' . $e->getCode()); return; } throw new Exception('Expected rejection'); };
    $refuse(function () use ($db, $context) { (new Seo404Gateway($db, $context, str_repeat('b', 64)))->dispatch('GET', array('action'=>'connection'), ''); }, 401);
    check($call('connection')['scope'] === '1:1', 'Connection scope');
    $refuse(function () use ($call) { $call('read', null, '1:2'); }, 409);
    $refuse(function () use ($call) { $call('read', null, '1:1', '2'); }, 404);
    check(count($call('resources')['resources']) === 1, 'Published products only');
    $before = $call('read'); check(strlen($before['seoTitle']) === 255 && strlen($before['seoDescription']) === 512, 'Native SEO fields must not be truncated');
    $locks = 0;
    $db->lockCheck = function () use ($observer, &$locks) {
        $observer->beginTransaction();
        try { $observer->query('SELECT id_product FROM `' . _DB_PREFIX_ . 'product_lang` WHERE id_product=1 AND id_shop=1 AND id_lang=1 FOR UPDATE NOWAIT'); throw new Exception('Native editor row was not locked'); }
        catch (PDOException $error) { check((int) $error->errorInfo[1] === 3572, 'Unexpected lock error'); $locks++; }
        finally { $observer->rollBack(); }
    };
    $write = array('revision'=>$before['revision'],'operationId'=>'approved-1','seoTitle'=>"L’été rouge; DROP TABLE product--",'seoDescription'=>'Description améliorée.');
    $after = $call('write', $write); check($after['seoTitle'] === $write['seoTitle'] && $after['operationId'] === 'approved-1', 'Exact approved write');
    check($locks > 0, 'Real row locks were not verified');
    $db->lockCheck = null;
    check($call('write', $write)['revision'] === $after['revision'], 'Idempotent application');
    $refuse(function () use ($call, $write) { $write['operationId'] = 'stale'; $call('write', $write); }, 409);
    $restore = array('revision'=>$after['revision'],'operationId'=>'restore-1','seoTitle'=>$before['seoTitle'],'seoDescription'=>$before['seoDescription']);
    $restored = $call('write', $restore); check($restored['seoTitle'] === $before['seoTitle'] && $restored['seoDescription'] === $before['seoDescription'], 'Long original values restored');
    $otherRows = $pdo->query('SELECT * FROM `' . _DB_PREFIX_ . 'product_lang`')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($otherRows as $row) { check($row['meta_title'] === $before['seoTitle'] && $row['description'] === '<p>Description conservée</p>' && $row['description_short'] === 'Résumé conservé', 'Other language/shop/body modified'); }
    $db->failMarker = true; $write['revision'] = $restored['revision']; $write['operationId'] = 'rollback';
    $refuse(function () use ($call, $write) { $call('write', $write); }, 503);
    check($call('read')['seoTitle'] === $before['seoTitle'], 'SEO write must roll back when ledger fails');
    $call('reconcile', array('operationId'=>'late'));
    $fresh = new Seo404Gateway($db, $context, $token);
    $write['operationId'] = 'late';
    $refuse(function () use ($fresh, $write) { $fresh->dispatch('POST', array('action'=>'write','scope'=>'1:1','id'=>'1'), json_encode($write)); }, 409);
    Dispatcher::$customSeoUrl = true; $refuse(function () use ($call) { $call('connection'); }, 503); Dispatcher::$customSeoUrl = false;
    $pdo->exec('UPDATE `' . _DB_PREFIX_ . 'seo404_settings` SET id_lang=2 WHERE id=1');
    $refuse(function () use ($call) { $call('read'); }, 409);
    $context->shop->id = 2; $refuse(function () use ($call) { $call('connection', null, '1:2'); }, 403); $context->shop->id = 1;
    $pdo->exec('UPDATE `' . _DB_PREFIX_ . 'seo404_settings` SET token_hash=\'' . pSQL(hash('sha256', str_repeat('b',64))) . '\' WHERE id=1');
    $refuse(function () use ($call) { $call('read'); }, 401);
    $ledgerCount = (int) $pdo->query('SELECT COUNT(*) FROM `' . _DB_PREFIX_ . 'seo404_operations`')->fetchColumn();
    check((new Seo404connector())->uninstall(), 'Uninstall');
    check($pdo->query('SELECT token_hash FROM `' . _DB_PREFIX_ . 'seo404_settings` WHERE id=1')->fetchColumn() === '', 'Uninstall revokes key');
    check((int) $pdo->query('SELECT COUNT(*) FROM `' . _DB_PREFIX_ . 'seo404_operations`')->fetchColumn() === $ledgerCount, 'Uninstall retains cancellation ledger');
    $zip = new ZipArchive(); check($zip->open(dirname(__DIR__,2) . '/site/public/downloads/seo404-prestashop.zip') === true, 'ZIP');
    foreach (array('seo404connector.php','classes/Seo404Gateway.php','controllers/front/api.php') as $path) {
        check($zip->getFromName('seo404connector/' . $path) === file_get_contents(dirname(__DIR__,2) . '/integrations/prestashop/seo404connector/' . $path), 'ZIP source mismatch');
    }
    $zip->close(); echo "InnoDB locks, rollback and scoped cancellation passed\n";
} finally {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    foreach ($tables as $table) { $pdo->exec('DROP TABLE IF EXISTS `' . _DB_PREFIX_ . $table . '`'); }
}
