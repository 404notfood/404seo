<?php
if (!defined('_PS_VERSION_')) { exit; }
require_once __DIR__ . '/Seo404Text.php';
class Seo404Failure extends RuntimeException
{
    public function __construct($status) { parent::__construct('Requête non confirmée.', $status); }
}

class Seo404Gateway
{
    private $db; private $context; private $token; private $shop; private $lang; private $kind = 'product';
    public function __construct($db, $context, $token) { $this->db = $db; $this->context = $context; $this->token = $token; }
    private function execute($sql) { if (!$this->db->execute($sql)) { throw new Seo404Failure(503); } }
    private function row($sql)
    {
        // Db::getRow appends LIMIT after FOR UPDATE and also breaks SHOW TABLE STATUS.
        $rows = $this->db->executeS($sql, true, false);
        if (!is_array($rows)) { throw new Seo404Failure(503); }
        return isset($rows[0]) ? $rows[0] : null;
    }
    private function authenticate($scope, $locked = false)
    {
        $row = $this->row('SELECT * FROM `' . _DB_PREFIX_ . 'seo404_settings` WHERE id=1' . ($locked ? ' FOR UPDATE' : ''));
        if (!$row || !hash_equals((string) $row['token_hash'], hash('sha256', $this->token))) { throw new Seo404Failure(401); }
        $this->shop = (int) $row['id_shop']; $this->lang = (int) $row['id_lang'];
        if ($this->shop < 1 || $this->lang < 1 || (int) $this->context->shop->id !== $this->shop ||
            !$this->row('SELECT l.id_lang FROM `' . _DB_PREFIX_ . 'lang` l INNER JOIN `' . _DB_PREFIX_ . 'lang_shop` s ON s.id_lang=l.id_lang WHERE l.active=1 AND l.id_lang=' . $this->lang . ' AND s.id_shop=' . $this->shop)) { throw new Seo404Failure(403); }
        if ($scope !== null && $scope !== $this->scope()) { throw new Seo404Failure(409); }
    }
    private function scope() { return $this->shop . ':' . $this->lang; }
    private function ready()
    {
        // SEO changes must never alter URLs defined by a custom category/product rule.
        if ($this->kind !== 'cms' && Dispatcher::getInstance()->hasKeyword($this->kind . '_rule', $this->lang, 'meta_title', $this->shop)) { throw new Seo404Failure(503); }
        foreach (array($this->kind, $this->kind . '_shop', $this->kind . '_lang', 'seo404_settings', $this->ledgerTable()) as $name) {
            $row = $this->row("SHOW TABLE STATUS WHERE Name='" . pSQL(_DB_PREFIX_ . $name) . "'");
            if (!$row || strtolower($row['Engine']) !== 'innodb') { throw new Seo404Failure(503); }
        }
    }
    private function text($value, $length)
    {
        $text = html_entity_decode(strip_tags(preg_replace('/<(script|style|iframe|object|template)\b[^>]*>.*?<\/\1\s*>/is', '', (string) $value)), ENT_QUOTES, 'UTF-8');
        $text = preg_replace('/[\x00-\x1f\x7f]/u', ' ', $text);
        return preg_match('/^.{0,' . $length . '}/us', $text, $matches) === 1 ? $matches[0] : '';
    }
    private function product($id, $locked = false)
    {
        if ($this->kind !== 'product') {
            // Identifiers come only from dispatch's fixed allowlist; IDs are integers.
            $kind = $this->kind;
            $fields = $kind === 'category'
                ? 'c.id_category, c.active, c.date_upd, c.id_parent, l.name, l.link_rewrite, l.description, l.meta_title, l.meta_description'
                : 'c.id_cms, c.active, c.indexation, l.meta_title AS name, l.meta_title AS page_title, l.link_rewrite, l.content AS description, l.head_seo_title AS meta_title, l.meta_description';
            $row = $this->row('SELECT ' . $fields . ' FROM `' . _DB_PREFIX_ . $kind . '` c
                INNER JOIN `' . _DB_PREFIX_ . $kind . '_shop` s ON s.id_' . $kind . '=c.id_' . $kind . ' AND s.id_shop=' . $this->shop . '
                INNER JOIN `' . _DB_PREFIX_ . $kind . '_lang` l ON l.id_' . $kind . '=c.id_' . $kind . ' AND l.id_shop=' . $this->shop . ' AND l.id_lang=' . $this->lang . '
                WHERE c.id_' . $kind . '=' . (int) $id . ($locked ? ' FOR UPDATE' : ''));
            if (!$row || !(int) $row['active'] || $kind === 'category' && (int) $id === 1) { throw new Seo404Failure(404); }
            $row['description_short'] = '';
            return $row;
        }
        $row = $this->row('SELECT p.id_product, p.date_upd, s.active, s.visibility, l.name, l.link_rewrite, l.description, l.description_short, l.meta_title, l.meta_description
            FROM `' . _DB_PREFIX_ . 'product` p
            INNER JOIN `' . _DB_PREFIX_ . 'product_shop` s ON s.id_product=p.id_product AND s.id_shop=' . $this->shop . '
            INNER JOIN `' . _DB_PREFIX_ . 'product_lang` l ON l.id_product=p.id_product AND l.id_shop=' . $this->shop . ' AND l.id_lang=' . $this->lang . '
            WHERE p.id_product=' . (int) $id . ($locked ? ' FOR UPDATE' : ''));
        if (!$row || !(int) $row['active'] || $row['visibility'] === 'none') { throw new Seo404Failure(404); }
        return $row;
    }
    private function ledger($id, $locked = false)
    {
        $row = $this->row('SELECT operation_id, cancelled FROM `' . _DB_PREFIX_ . $this->ledgerTable() . '` WHERE ' . $this->ledgerWhere($id) . ($locked ? ' FOR UPDATE' : ''));
        if (!$row) { throw new Seo404Failure(503); }
        return $row;
    }
    private function where($id) { return 'id_' . $this->kind . '=' . (int) $id . ' AND id_shop=' . $this->shop . ' AND id_lang=' . $this->lang; }
    private function ledgerTable() { return $this->kind === 'product' ? 'seo404_operations' : 'seo404_content_operations'; }
    private function ledgerWhere($id) {
        return $this->kind === 'product' ? $this->where($id) : 'resource_kind=\'' . $this->kind . '\' AND id_resource=' . (int) $id . ' AND id_shop=' . $this->shop . ' AND id_lang=' . $this->lang;
    }
    private function resource($id)
    {
        $row = $this->product($id);
        $operation = $this->row('SELECT operation_id FROM `' . _DB_PREFIX_ . $this->ledgerTable() . '` WHERE ' . $this->ledgerWhere($id));
        $revision = hash('sha256', json_encode(array($this->scope(), $row), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $url = $this->kind === 'product' ? $this->context->link->getProductLink((int) $id, $row['link_rewrite'], null, null, $this->lang, $this->shop)
            : ($this->kind === 'category' ? $this->context->link->getCategoryLink((int) $id, $row['link_rewrite'], $this->lang, null, $this->shop)
                : $this->context->link->getCMSLink((int) $id, $row['link_rewrite'], true, $this->lang, $this->shop));
        return array('id' => (int) $id, 'kind' => $this->kind, 'url' => $url,
            'title' => $this->text($row['name'], 500), 'content' => $this->text($row['description_short'] . ' ' . $row['description'], 8000),
            'seoTitle' => (string) $row['meta_title'], 'seoDescription' => (string) $row['meta_description'], 'revision' => $revision,
            'scope' => $this->scope(), 'operationId' => $operation ? (string) $operation['operation_id'] : '',
            'segments' => array_merge(Seo404Text::segments($row['description_short'], 'short'), Seo404Text::segments($row['description'], 'description')));
    }
    private function operation($id, $scope, $data, $reconcile)
    {
        $this->ready();
        $this->execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); $this->execute('START TRANSACTION');
        try {
            $this->authenticate($scope, true); $this->product($id, true);
            $columns = $this->kind === 'product' ? 'id_product' : 'resource_kind,id_resource';
            $values = ($this->kind === 'product' ? '' : "'" . $this->kind . "',") . (int) $id;
            $this->execute('INSERT IGNORE INTO `' . _DB_PREFIX_ . $this->ledgerTable() . '` (' . $columns . ',id_shop,id_lang,operation_id,cancelled) VALUES (' . $values . ',' . $this->shop . ',' . $this->lang . ", '', '[]')");
            $ledger = $this->ledger($id, true); $current = $this->resource($id);
            $cancelled = json_decode($ledger['cancelled'], true, 8, JSON_THROW_ON_ERROR);
            if (!is_array($cancelled)) { throw new Seo404Failure(503); }
            $marker = $data['operationId'];
            if ($reconcile) {
                if ($ledger['operation_id'] !== $marker && !in_array($marker, $cancelled, true)) {
                    if (count($cancelled) >= 1000) { throw new Seo404Failure(503); }
                    $cancelled[] = $marker;
                    $this->execute('UPDATE `' . _DB_PREFIX_ . $this->ledgerTable() . '` SET cancelled=\'' . pSQL(json_encode($cancelled, JSON_THROW_ON_ERROR)) . '\' WHERE ' . $this->ledgerWhere($id));
                }
            } else {
                if (in_array($marker, $cancelled, true)) { throw new Seo404Failure(409); }
                if ($ledger['operation_id'] !== $marker) {
                    if (!hash_equals($current['revision'], $data['revision'])) { throw new Seo404Failure(409); }
                    // Update only the two native fields in one language/shop. Never replace the product ObjectModel.
                    $titleField = $this->kind === 'cms' ? 'head_seo_title' : 'meta_title';
                    $this->execute('UPDATE `' . _DB_PREFIX_ . $this->kind . '_lang` SET ' . $titleField . '=\'' . pSQL($data['seoTitle']) . '\', meta_description=\'' . pSQL($data['seoDescription']) . '\' WHERE ' . $this->where($id));
                    if (isset($data['patches'])) {
                        $row = $this->product($id, true);
                        $columns = array('description' => $this->kind === 'cms' ? 'content' : 'description');
                        if ($this->kind === 'product') { $columns['short'] = 'description_short'; }
                        foreach ($columns as $prefix => $column) {
                            $old = $prefix === 'short' ? $row['description_short'] : $row['description'];
                            $new = Seo404Text::apply($old, $prefix, $data['patches']);
                            if ($new !== $old) { $this->execute('UPDATE `' . _DB_PREFIX_ . $this->kind . '_lang` SET `' . $column . '`=\'' . pSQL($new, true) . '\' WHERE ' . $this->where($id)); }
                        }
                    }
                    $this->execute('UPDATE `' . _DB_PREFIX_ . $this->ledgerTable() . '` SET operation_id=\'' . pSQL($marker) . '\' WHERE ' . $this->ledgerWhere($id));
                    $current = $this->resource($id);
                }
            }
            $this->execute('COMMIT');
            $class = $this->kind === 'product' ? 'Product' : ($this->kind === 'category' ? 'Category' : 'CMS');
            Cache::clean('objectmodel_' . $class . '_' . (int) $id . '_*');
            return $current;
        } catch (Throwable $error) { $this->db->execute('ROLLBACK'); throw $error; }
    }
    public function dispatch($method, $query, $raw)
    {
        $action = isset($query['action']) ? $query['action'] : '';
        $scope = isset($query['scope']) ? $query['scope'] : null;
        $kind = isset($query['kind']) ? $query['kind'] : 'product';
        if (!is_string($kind) || !in_array($kind, array('product', 'category', 'cms'), true)) { throw new Seo404Failure(400); }
        $this->kind = $kind;
        if (!is_string($action) || ($scope !== null && !is_string($scope))) { throw new Seo404Failure(400); }
        $this->authenticate($scope); $this->ready();
        if ($action === 'connection' && $method === 'GET') {
            $language = new Language($this->lang);
            return array('version' => 1, 'siteUrl' => $this->context->link->getBaseLink($this->shop, true), 'scope' => $this->scope(),
                'label' => $this->text($this->context->shop->name . ' — ' . $language->name . ' (' . $this->scope() . ')', 200));
        }
        if ($scope !== $this->scope()) { throw new Seo404Failure(409); }
        if ($action === 'resources' && $method === 'GET') {
            $page = isset($query['page']) ? $query['page'] : '1';
            if (!is_string($page) || !ctype_digit($page) || (int) $page < 1 || (int) $page > 1000) { throw new Seo404Failure(400); }
            if ($this->kind === 'product') {
                $sql = 'SELECT l.id_product AS id_resource FROM `' . _DB_PREFIX_ . 'product_lang` l INNER JOIN `' . _DB_PREFIX_ . 'product_shop` s ON s.id_product=l.id_product AND s.id_shop=l.id_shop
                    WHERE l.id_shop=' . $this->shop . ' AND l.id_lang=' . $this->lang . ' AND s.active=1 AND s.visibility<>\'none\'';
            } else {
                $k = $this->kind;
                $sql = 'SELECT l.id_' . $k . ' AS id_resource FROM `' . _DB_PREFIX_ . $k . '_lang` l
                    INNER JOIN `' . _DB_PREFIX_ . $k . '_shop` s ON s.id_' . $k . '=l.id_' . $k . ' AND s.id_shop=l.id_shop
                    INNER JOIN `' . _DB_PREFIX_ . $k . '` c ON c.id_' . $k . '=l.id_' . $k . '
                    WHERE l.id_shop=' . $this->shop . ' AND l.id_lang=' . $this->lang . ' AND c.active=1' . ($k === 'category' ? ' AND c.id_category<>1' : '');
            }
            $rows = $this->db->executeS($sql . ' ORDER BY id_resource LIMIT ' . (((int) $page - 1) * 25) . ',26', true, false);
            if (!is_array($rows)) { throw new Seo404Failure(503); }
            $resources = array(); foreach (array_slice($rows, 0, 25) as $row) { $resources[] = $this->resource((int) $row['id_resource']); }
            return array('resources' => $resources, 'hasMore' => count($rows) > 25);
        }
        $id = isset($query['id']) ? $query['id'] : '';
        if (!is_string($id) || !ctype_digit($id) || (int) $id < 1 || (int) $id > 2147483647) { throw new Seo404Failure(400); }
        if ($action === 'read' && $method === 'GET') { return $this->resource((int) $id); }
        if (!in_array($action, array('write', 'reconcile'), true) || $method !== 'POST') { throw new Seo404Failure(400); }
        $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        if (!is_array($data) || !isset($data['operationId']) || !is_string($data['operationId']) || !preg_match('/^[a-zA-Z0-9-]{1,80}(:restore)?$/D', $data['operationId'])) { throw new Seo404Failure(400); }
        if ($action === 'reconcile') {
            if (count($data) !== 1) { throw new Seo404Failure(400); }
        } else {
            if (count($data) !== (array_key_exists('patches', $data) ? 5 : 4) || !isset($data['revision']) || !is_string($data['revision']) || !preg_match('/^[a-f0-9]{64}$/D', $data['revision'])) { throw new Seo404Failure(400); }
            if (array_key_exists('patches', $data)) {
                try {
                    Seo404Text::patches($data['patches']);
                    foreach ($data['patches'] as $patch) { if (strpos($patch['id'], 'description:') !== 0 && !($this->kind === 'product' && strpos($patch['id'], 'short:') === 0)) { throw new RuntimeException('Invalid field'); } }
                } catch (Throwable $error) { throw new Seo404Failure(400); }
            }
            foreach (array('seoTitle' => 255, 'seoDescription' => 512) as $field => $max) {
                if (!isset($data[$field]) || !is_string($data[$field]) || preg_match('/^.{0,' . $max . '}$/usD', $data[$field]) !== 1 || preg_match('/[<>={}\x00-\x1f\x7f]/u', $data[$field])) { throw new Seo404Failure(400); }
            }
        }
        return $this->operation((int) $id, $scope, $data, $action === 'reconcile');
    }
}
